"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser, requireOrg } from "@/lib/auth";
import { dbErrorMessage, outboundStatus, suggestionOutcome } from "@/lib/casos";
import { createClient } from "@/lib/supabase/server";

/**
 * Server Actions del panel operativo. Cada una: valida sesión + membresía (requireOrg), bloquea la
 * impersonación (solo lectura), valida la entrada con zod y comprueba que la fila sea del comercio.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

const STATUS = z.enum([
  "nuevo", "en_conversacion", "cotizacion", "esperando_pago", "pago_por_confirmar",
  "confirmado", "requiere_atencion", "cerrado_ganado", "cerrado_perdido", "resuelto",
]);
const Slug = z.string().min(1).max(80);

async function guard(slug: string) {
  const ctx = await requireOrg(Slug.parse(slug));
  if (ctx.impersonating) return { error: "Modo solo lectura: no puedes hacer cambios como equipo Teo." } as const;
  const user = await getUser();
  if (!user) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." } as const;
  return { org: ctx.org, user, supabase: await createClient() } as const;
}

function done(slug: string): ActionResult {
  revalidatePath(`/app/${slug}`, "layout");
  return { ok: true };
}

function fail(e: unknown): ActionResult {
  if (e instanceof z.ZodError) return { ok: false, error: "Datos inválidos." };
  const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "";
  return { ok: false, error: dbErrorMessage(msg) };
}

async function caseOfOrg(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, caseId: string) {
  const { data } = await supabase
    .from("cases")
    .select("id, status, assignee_id, conversation_id, conversation:conversations!cases_conversation_id_org_id_fkey(id, channel, handled_by)")
    .eq("org_id", orgId)
    .eq("id", caseId)
    .maybeSingle();
  return data as unknown as
    | { id: string; status: string; assignee_id: string | null; conversation_id: string; conversation: { id: string; channel: string; handled_by: string } }
    | null;
}

const TransitionInput = z.object({ caseId: z.uuid(), to: STATUS.nullable(), reason: z.string().trim().max(500).optional() });

/** Cambia el estado con `transition_case` (única puerta). `to = null` desde requiere_atencion vuelve al previo. */
export async function transitionCaseAction(slug: string, input: z.input<typeof TransitionInput>): Promise<ActionResult> {
  try {
    const g = await guard(slug);
    if ("error" in g) return { ok: false, error: g.error! };
    const { caseId, to, reason } = TransitionInput.parse(input);
    if (!(await caseOfOrg(g.supabase, g.org.id, caseId))) return { ok: false, error: "No encontramos el caso." };
    const { error } = await g.supabase.rpc("transition_case", { p_case: caseId, p_to: to as never, p_reason: reason || undefined });
    if (error) return fail(error);
    return done(slug);
  } catch (e) {
    return fail(e);
  }
}

const SendInput = z.object({
  caseId: z.uuid(),
  body: z.string().trim().min(1).max(4096),
  suggestion: z.object({ id: z.uuid(), text: z.string() }).optional(),
});

/** Mensaje del operador: se inserta en `messages` (queued en WhatsApp, sent en simulador). Otro proceso lo envía. */
export async function sendMessageAction(slug: string, input: z.input<typeof SendInput>): Promise<ActionResult & { id?: string }> {
  try {
    const g = await guard(slug);
    if ("error" in g) return { ok: false, error: g.error! };
    const { caseId, body, suggestion } = SendInput.parse(input);
    const c = await caseOfOrg(g.supabase, g.org.id, caseId);
    if (!c) return { ok: false, error: "No encontramos el caso." };
    const { data, error } = await g.supabase
      .from("messages")
      .insert({
        org_id: g.org.id,
        conversation_id: c.conversation_id,
        case_id: c.id,
        direction: "out",
        author: `user:${g.user.id}`,
        type: "text",
        body,
        status: outboundStatus(c.conversation.channel),
      })
      .select("id")
      .single();
    if (error) return fail(error);
    await g.supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("org_id", g.org.id).eq("id", c.conversation_id);
    if (suggestion) {
      await g.supabase
        .from("ai_suggestions")
        .update({ state: suggestionOutcome(suggestion.text, body), message_id: data.id })
        .eq("org_id", g.org.id)
        .eq("id", suggestion.id);
    }
    revalidatePath(`/app/${slug}`, "layout");
    return { ok: true, id: data.id as string };
  } catch (e) {
    return fail(e);
  }
}

const HandledInput = z.object({ caseId: z.uuid(), to: z.enum(["teo", "humano"]) });

/**
 * Tomar (humano) / devolver a Teo. Tomar asigna el caso al operador si no tenía responsable.
 * Devolver a Teo saca el caso de "Requiere atención" (vuelve al estado previo con transition_case).
 */
export async function setHandledByAction(slug: string, input: z.input<typeof HandledInput>): Promise<ActionResult> {
  try {
    const g = await guard(slug);
    if ("error" in g) return { ok: false, error: g.error! };
    const { caseId, to } = HandledInput.parse(input);
    const c = await caseOfOrg(g.supabase, g.org.id, caseId);
    if (!c) return { ok: false, error: "No encontramos el caso." };
    const { error } = await g.supabase.from("conversations").update({ handled_by: to }).eq("org_id", g.org.id).eq("id", c.conversation_id);
    if (error) return fail(error);
    if (to === "humano" && !c.assignee_id) {
      await g.supabase.from("cases").update({ assignee_id: g.user.id }).eq("org_id", g.org.id).eq("id", c.id);
    }
    if (to === "teo" && c.status === "requiere_atencion") {
      const { error: e2 } = await g.supabase.rpc("transition_case", { p_case: c.id, p_to: null as never, p_reason: "devuelto a Teo" });
      if (e2) return fail(e2);
    }
    return done(slug);
  } catch (e) {
    return fail(e);
  }
}

const AssignInput = z.object({ caseId: z.uuid(), userId: z.uuid().nullable() });

export async function assignCaseAction(slug: string, input: z.input<typeof AssignInput>): Promise<ActionResult> {
  try {
    const g = await guard(slug);
    if ("error" in g) return { ok: false, error: g.error! };
    const { caseId, userId } = AssignInput.parse(input);
    if (userId) {
      const { data: m } = await g.supabase.from("memberships").select("user_id").eq("org_id", g.org.id).eq("user_id", userId).maybeSingle();
      if (!m) return { ok: false, error: "Esa persona no es parte del equipo." };
    }
    const { data, error } = await g.supabase.from("cases").update({ assignee_id: userId }).eq("org_id", g.org.id).eq("id", caseId).select("id");
    if (error) return fail(error);
    if (!data?.length) return { ok: false, error: "No encontramos el caso." };
    return done(slug);
  } catch (e) {
    return fail(e);
  }
}

const ReviewInput = z
  .object({ paymentId: z.uuid(), approve: z.boolean(), reason: z.string().trim().max(500).optional() })
  .refine((v) => v.approve || (v.reason && v.reason.length >= 3), { message: "reason_required" });

/** Confirmar / rechazar un comprobante con `review_payment` (mueve el caso y deja traza). */
export async function reviewPaymentAction(slug: string, input: z.input<typeof ReviewInput>): Promise<ActionResult> {
  try {
    const g = await guard(slug);
    if ("error" in g) return { ok: false, error: g.error! };
    const parsed = ReviewInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Escribe el motivo del rechazo (mínimo 3 caracteres)." };
    const { paymentId, approve, reason } = parsed.data;
    const { data: p } = await g.supabase.from("payments").select("id").eq("org_id", g.org.id).eq("id", paymentId).maybeSingle();
    if (!p) return { ok: false, error: "No encontramos el pago." };
    const { error } = await g.supabase.rpc("review_payment", { p_payment: paymentId, p_approve: approve, p_reason: approve ? undefined : reason });
    if (error) return fail(error);
    return done(slug);
  } catch (e) {
    return fail(e);
  }
}

const ContactInput = z.object({
  contactId: z.uuid(),
  name: z.string().trim().max(120).optional().transform((v) => v || null),
  email: z.union([z.literal(""), z.email().max(200)]).optional().transform((v) => v || null),
  address: z.string().trim().max(500).optional().transform((v) => v || null),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  notes: z.string().trim().max(2000).optional().transform((v) => v || null),
});

export async function updateContactAction(slug: string, input: z.input<typeof ContactInput>): Promise<ActionResult> {
  try {
    const g = await guard(slug);
    if ("error" in g) return { ok: false, error: g.error! };
    const parsed = ContactInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Revisa los datos (¿el correo es válido?)." };
    const { contactId, ...fields } = parsed.data;
    const tags = [...new Set(fields.tags.map((t) => t.toLowerCase()))];
    const { data, error } = await g.supabase.from("contacts").update({ ...fields, tags }).eq("org_id", g.org.id).eq("id", contactId).select("id");
    if (error) return fail(error);
    if (!data?.length) return { ok: false, error: "No encontramos el cliente." };
    return done(slug);
  } catch (e) {
    return fail(e);
  }
}

const SuggestionInput = z.object({ id: z.uuid(), state: z.enum(["usada", "editada", "descartada"]) });

export async function setSuggestionStateAction(slug: string, input: z.input<typeof SuggestionInput>): Promise<ActionResult> {
  try {
    const g = await guard(slug);
    if ("error" in g) return { ok: false, error: g.error! };
    const { id, state } = SuggestionInput.parse(input);
    const { error } = await g.supabase.from("ai_suggestions").update({ state }).eq("org_id", g.org.id).eq("id", id);
    if (error) return fail(error);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
