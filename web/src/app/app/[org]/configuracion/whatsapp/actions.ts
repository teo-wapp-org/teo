"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { getPublicConfig } from "@/lib/data/platform-config";
import { createClient } from "@/lib/supabase/server";
import { fetchPhoneNumber } from "@/lib/whatsapp/graph";

export type WaActionState = { ok?: boolean; error?: string; warning?: string };

const digits = (label: string) =>
  z.string().trim().regex(/^[0-9]{5,30}$/, `${label}: solo números (lo copias desde Meta, en WhatsApp → Configuración de la API)`);

const ConnectSchema = z.object({
  slug: z.string().min(1).max(80),
  phone_number_id: digits("Phone number ID"),
  waba_id: digits("WhatsApp Business Account ID"),
  access_token: z.string().trim().min(20, "El token de acceso no es válido").max(2048, "El token de acceso es demasiado largo"),
});

/** Solo owner/admin del comercio (no la impersonación del equipo Teo, que es de solo lectura). */
async function requireManager(slug: string) {
  const ctx = await requireOrg(slug);
  if (ctx.impersonating || (ctx.role !== "owner" && ctx.role !== "admin")) return null;
  return ctx;
}

function rpcError(e: { code?: string; message?: string }): string {
  if (e.code === "23505") return "Ese número ya está conectado a otro comercio en Teo.";
  if (e.code === "42501") return "Solo el dueño o un administrador puede conectar WhatsApp.";
  if (e.code === "22023") return "Revisa los datos: alguno no tiene el formato esperado.";
  return "No pudimos guardar la conexión. Inténtalo de nuevo.";
}

export async function connectWhatsappManual(_: WaActionState, formData: FormData): Promise<WaActionState> {
  const parsed = ConnectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { slug, phone_number_id, waba_id, access_token } = parsed.data;

  const ctx = await requireManager(slug);
  if (!ctx) return { error: "Solo el dueño o un administrador puede conectar WhatsApp." };
  if (!(await getPublicConfig()).whatsapp_manual_connection) {
    return { error: "La conexión manual no está disponible. Usa «Conectar con Facebook»." };
  }

  // Validamos el token contra Meta desde el servidor. Si Meta no lo acepta (p. ej. aún no hay app aprobada),
  // se guarda como "pendiente": el webhook solo atiende números conectados.
  const check = await fetchPhoneNumber(phone_number_id, access_token);
  const supabase = await createClient();
  const { error } = await supabase.rpc("connect_whatsapp_account", {
    p_org: ctx.org.id,
    p_phone_number_id: phone_number_id,
    p_waba_id: waba_id,
    p_token: access_token,
    p_display_phone: check.ok ? check.data.display_phone_number : undefined,
    p_verified_name: check.ok ? check.data.verified_name : undefined,
    p_status: check.ok ? "conectado" : "pendiente",
    p_quality_rating: check.ok ? check.data.quality_rating : undefined,
  });
  if (error) return { error: rpcError(error) };

  revalidatePath(`/app/${slug}/configuracion/whatsapp`);
  if (!check.ok) {
    return {
      ok: true,
      warning: `Guardamos tu número como pendiente: Meta no validó el token (${check.reason}). Cuando el token sea válido, vuelve a conectarlo.`,
    };
  }
  return { ok: true };
}

const DisconnectSchema = z.object({ slug: z.string().min(1).max(80) });

export async function disconnectWhatsapp(_: WaActionState, formData: FormData): Promise<WaActionState> {
  const parsed = DisconnectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Solicitud inválida." };
  const ctx = await requireManager(parsed.data.slug);
  if (!ctx) return { error: "Solo el dueño o un administrador puede desconectar WhatsApp." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("disconnect_whatsapp_account", { p_org: ctx.org.id });
  if (error) return { error: rpcError(error) };
  revalidatePath(`/app/${parsed.data.slug}/configuracion/whatsapp`);
  return { ok: true };
}
