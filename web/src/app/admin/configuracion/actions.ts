"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { done, fail, zodFail, type ActionState } from "@/lib/action-state";
import { translateAdminError } from "@/lib/admin/labels";
import { invokeAdminOps, READ_ONLY_ERROR, requireSuperadmin, type AdminOpsResult } from "@/lib/admin/server";
import { requirePlatformAdmin } from "@/lib/auth";
import { SECRET_NAMES, SecretValueSchema, SETTING_KEYS, SETTING_SCHEMAS } from "@/lib/schemas/admin";
import type { Json } from "@/lib/database.types";

const revalidate = () => {
  revalidatePath("/admin/configuracion", "layout");
  revalidatePath("/");
};

/** Guarda un grupo de ajustes (campo oculto `key`). La base hace merge y audita. */
export async function saveSetting(_: ActionState, fd: FormData): Promise<ActionState> {
  const sa = await requireSuperadmin();
  if (sa.error) return fail(sa.error);
  const key = z.enum(SETTING_KEYS).safeParse(fd.get("key"));
  if (!key.success) return fail("Ajuste desconocido");
  const input = Object.fromEntries([...fd.entries()].filter(([k]) => k !== "key"));
  const parsed = SETTING_SCHEMAS[key.data].safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const { error } = await sa.supabase.rpc("admin_set_setting", { p_key: key.data, p_value: parsed.data as Json });
  if (error) return fail(translateAdminError(error));
  revalidate();
  return done("Listo, guardamos los cambios.");
}

export async function saveSecret(name: string, value: string): Promise<ActionState> {
  const sa = await requireSuperadmin();
  if (sa.error) return fail(sa.error);
  const parsed = SecretValueSchema.safeParse({ name, value });
  if (!parsed.success) return zodFail(parsed.error);
  const { error } = await sa.supabase.rpc("admin_set_secret", { p_name: parsed.data.name, p_value: parsed.data.value });
  if (error) return fail(translateAdminError(error));
  revalidate();
  return done("Secreto guardado de forma segura.");
}

export async function deleteSecret(name: string): Promise<ActionState> {
  const sa = await requireSuperadmin();
  if (sa.error) return fail(sa.error);
  const n = z.enum(SECRET_NAMES).safeParse(name);
  if (!n.success) return fail("Secreto desconocido");
  const { error } = await sa.supabase.rpc("admin_delete_secret", { p_name: n.data });
  if (error) return fail(translateAdminError(error, "No pudimos eliminar el secreto."));
  revalidate();
  return done("Secreto eliminado.");
}

const TARGETS = ["anthropic", "google-places", "meta", "resend"] as const;

/** Prueba la conexión con un proveedor externo vía admin-ops. */
export async function testIntegration(target: string): Promise<AdminOpsResult> {
  const role = await requirePlatformAdmin();
  if (role !== "superadmin") return { ok: false, detail: READ_ONLY_ERROR };
  const t = z.enum(TARGETS).safeParse(target);
  if (!t.success) return { ok: false, detail: "Integración desconocida." };
  return invokeAdminOps(`test/${t.data}`);
}

export type AuthConfigState = { ok: boolean; detail?: string; disable_signup?: boolean; mailer_autoconfirm?: boolean };

const toAuthState = (r: AdminOpsResult): AuthConfigState => {
  if (!r.ok && !(r.data && typeof r.data.disable_signup === "boolean")) return { ok: false, detail: r.detail };
  const d = r.data ?? {};
  return {
    ok: true,
    detail: typeof d.detail === "string" ? d.detail : undefined,
    disable_signup: typeof d.disable_signup === "boolean" ? d.disable_signup : undefined,
    mailer_autoconfirm: typeof d.mailer_autoconfirm === "boolean" ? d.mailer_autoconfirm : undefined,
  };
};

/** Lee la configuración de Supabase Auth (requiere el token de administración guardado). */
export async function getAuthConfig(): Promise<AuthConfigState> {
  await requirePlatformAdmin();
  return toAuthState(await invokeAdminOps("auth-config", { method: "GET" }));
}

const AuthConfigSchema = z.object({ disable_signup: z.boolean().optional(), mailer_autoconfirm: z.boolean().optional() });

export async function applyAuthConfig(input: { disable_signup?: boolean; mailer_autoconfirm?: boolean }): Promise<AuthConfigState> {
  const role = await requirePlatformAdmin();
  if (role !== "superadmin") return { ok: false, detail: READ_ONLY_ERROR };
  const parsed = AuthConfigSchema.safeParse(input);
  if (!parsed.success) return { ok: false, detail: "Datos inválidos." };
  return toAuthState(await invokeAdminOps("auth-config", { method: "POST", body: parsed.data }));
}
