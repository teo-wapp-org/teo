import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../src/lib/database.types";
import { expect, login, test } from "./fixtures";
import { adminClient, createQaUser, qaEmail, type QaUser } from "./supabase-admin";

/** Cliente con la sesión de un usuario QA (para leer/restaurar la config con las mismas RPC del panel). */
async function asUser(u: QaUser): Promise<SupabaseClient<Database>> {
  const c = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  for (let i = 1; i <= 4; i++) {
    const { error } = await c.auth.signInWithPassword({ email: u.email, password: u.password });
    if (!error) return c;
    await new Promise((r) => setTimeout(r, 3000 * i));
  }
  throw new Error(`No se pudo iniciar sesión como ${u.email}`);
}

type Config = { settings: Record<string, Record<string, unknown>>; secrets: Record<string, { last4: string } | null> };
async function readConfig(c: SupabaseClient<Database>): Promise<Config> {
  const { data, error } = await c.rpc("admin_get_platform_config");
  if (error) throw error;
  return data as unknown as Config;
}

test("superadmin edita un ajuste de IA y persiste tras recargar", async ({ adminPage: page, superadmin }) => {
  const sb = await asUser(superadmin);
  const original = (await readConfig(sb)).settings.ai;
  const next = Number(original.max_tool_iterations) === 7 ? 8 : 7;
  try {
    await page.goto("/admin/configuracion");
    await expect(page.getByRole("heading", { name: "Configuración", level: 1 })).toBeVisible();
    const form = page.getByRole("form", { name: "Ajustes de inteligencia artificial" });
    await form.getByLabel("Máx. iteraciones de herramientas").fill(String(next));
    await form.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Listo, guardamos los cambios.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Máx. iteraciones de herramientas")).toHaveValue(String(next));
    expect((await readConfig(sb)).settings.ai.max_tool_iterations).toBe(next);

    // Validación: fuera de rango no se guarda
    await page.getByLabel("Máx. iteraciones de herramientas").fill("99");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "entre 1 y 20" }).first()).toBeVisible();
  } finally {
    const { error } = await sb.rpc("admin_set_setting", { p_key: "ai", p_value: original as Json });
    expect(error).toBeNull();
  }
});

test("superadmin guarda y borra un secreto sin ver nunca su valor", async ({ adminPage: page, superadmin }) => {
  const sb = await asUser(superadmin);
  const before = (await readConfig(sb)).secrets.resend_api_key;
  test.skip(before != null, "resend_api_key ya está configurado: no se toca un secreto real");
  const secret = `re_qa_${Date.now()}_Zx9q`;
  try {
    await page.goto("/admin/configuracion/correo");
    const box = page.getByTestId("secret-resend_api_key");
    await expect(box.getByText("No configurado")).toBeVisible();
    await box.getByLabel("Valor", { exact: true }).fill(secret);
    await box.getByRole("button", { name: "Guardar" }).click();
    await expect(box.getByText("••••Zx9q")).toBeVisible();
    await expect(box.getByLabel("Reemplazar valor")).toHaveValue("");

    await page.reload();
    await expect(box.getByText("••••Zx9q")).toBeVisible();
    expect(await page.content()).not.toContain(secret);
    const values = await page.locator("input").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    expect(values).not.toContain(secret);

    await box.getByRole("button", { name: "Eliminar" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();
    await expect(box.getByText("No configurado")).toBeVisible();
  } finally {
    if ((await readConfig(sb)).secrets.resend_api_key) await sb.rpc("admin_delete_secret", { p_name: "resend_api_key" });
  }
});

test("superadmin edita el precio de un plan y se ve en la landing", async ({ adminPage: page }) => {
  const admin = adminClient();
  const { data: plan } = await admin.from("plans").select("price_usd_month").eq("id", "pro").single();
  const original = Number(plan!.price_usd_month);
  const next = original === 123 ? 124 : 123;
  try {
    await page.goto("/admin/planes");
    await page.getByRole("link", { name: "Editar plan Pro" }).click();
    await page.getByLabel("Precio mensual (USD)").fill(String(next));
    await expect(page.getByRole("complementary", { name: "Vista previa" }).getByText(`$${next}`)).toBeVisible();
    await page.getByRole("button", { name: "Guardar plan" }).click();
    await expect(page.getByText(/Plan actualizado/)).toBeVisible();

    await page.goto("/");
    await expect(page.locator("#precios").getByText(`$${next}`, { exact: true })).toBeVisible();
  } finally {
    await admin.from("plans").update({ price_usd_month: original }).eq("id", "pro");
  }
});

test("superadmin cambia el plan de un comercio y reinicia su uso", async ({ adminPage: page, owner }) => {
  const admin = adminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await admin.from("usage_counters").upsert({ org_id: owner.orgId!, period_start: today, teo_messages: 37 });
  expect(error).toBeNull();

  await page.goto(`/admin/comercios/${owner.orgId}`);
  await expect(page.getByTestId("usage-text")).toContainText("37");

  const form = page.getByRole("form", { name: "Suscripción" });
  await form.getByLabel("Plan").selectOption("pro");
  await form.getByLabel("Estado").selectOption("active");
  await form.getByRole("button", { name: "Guardar suscripción" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Suscripción actualizada.")).toBeVisible();
  await expect(page.getByText("Plan Pro · Activa")).toBeVisible();
  const { data: sub } = await admin.from("subscriptions").select("plan_id, status").eq("org_id", owner.orgId!).single();
  expect(sub).toEqual({ plan_id: "pro", status: "active" });

  await page.getByRole("button", { name: "Reiniciar uso" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reiniciar uso" }).click();
  await expect(page.getByText("Uso del mes reiniciado.")).toBeVisible();
  await expect(page.getByTestId("usage-text")).toContainText(/^0 de/);
});

test("superadmin agrega y quita a alguien del equipo Teo", async ({ adminPage: page }) => {
  const nuevo = await createQaUser({ tag: "equipo" });
  await page.goto("/admin/equipo");

  // Correo sin cuenta: se explica que primero debe registrarse
  await page.getByLabel("Correo").fill(qaEmail("noexiste"));
  await page.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No hay una cuenta con ese correo" })).toBeVisible();

  await page.getByLabel("Correo").fill(nuevo.email);
  await page.getByLabel("Rol", { exact: true }).selectOption("soporte");
  await page.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByText(`${nuevo.email} ya es parte del equipo Teo`)).toBeVisible();
  const row = page.getByTestId("team-row").filter({ hasText: nuevo.email });
  await expect(row).toBeVisible();
  await expect(row.getByLabel(`Rol de ${nuevo.email}`)).toHaveValue("soporte");

  await row.getByRole("button", { name: `Quitar a ${nuevo.email}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Quitar" }).click();
  await expect(row).toHaveCount(0);
  const { data } = await adminClient().from("platform_admins").select("user_id").eq("user_id", nuevo.id);
  expect(data).toEqual([]);
});

test("un usuario de soporte ve todo en solo lectura", async ({ page }) => {
  const soporte = await createQaUser({ tag: "soporte", platformRole: "soporte" });
  await login(page, soporte);

  await page.goto("/admin/configuracion");
  await expect(page.getByText("Tu rol es de soporte")).toBeVisible();
  await expect(page.getByLabel("Máx. iteraciones de herramientas")).toBeDisabled();
  await expect(page.getByRole("switch", { name: /Teo responde/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Guardar cambios" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Probar conexión" })).toBeDisabled();

  await page.goto("/admin/configuracion/correo");
  await expect(page.getByLabel("Nombre del remitente")).toBeDisabled();
  await expect(page.getByTestId("secret-resend_api_key").getByRole("button", { name: "Guardar" })).toHaveCount(0);

  await page.goto("/admin/planes/pro");
  await expect(page.getByLabel("Precio mensual (USD)")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Guardar plan" })).toHaveCount(0);

  await page.goto("/admin/equipo");
  await expect(page.getByRole("button", { name: "Agregar" })).toHaveCount(0);

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Comercios" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Suspender" })).toHaveCount(0);
});

test("un owner normal recibe 404 en /admin/configuracion", async ({ ownerPage: page }) => {
  const res = await page.goto("/admin/configuracion");
  expect(res?.status()).toBe(404);
});
