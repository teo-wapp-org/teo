import { createClient } from "@supabase/supabase-js";
import { expect, login, test } from "./fixtures";
import { adminClient, createQaUser } from "./supabase-admin";
import type { Database } from "../src/lib/database.types";

const digits = (n: number) => Array.from({ length: n }, (_, i) => (i === 0 ? 9 : Math.floor(Math.random() * 10))).join("");

test("owner conecta manualmente un número ficticio (pendiente), ve el estado y desconecta", async ({ ownerPage: page, owner }) => {
  await page.goto(`/app/${owner.orgSlug}/configuracion/whatsapp`);
  await expect(page.getByRole("heading", { name: "WhatsApp", level: 1 })).toBeVisible();
  await expect(page.getByTestId("wa-status")).toHaveText("Sin conectar");
  await expect(page.getByRole("button", { name: "Conectar con Facebook" })).toBeVisible();

  const phoneId = digits(15);
  await page.getByLabel("Phone number ID").fill(phoneId);
  await page.getByLabel("WhatsApp Business Account ID").fill(digits(15));
  const token = `EAAG${crypto.randomUUID().replace(/-/g, "")}QA`;
  await page.getByLabel("Token de acceso").fill(token);
  await page.getByRole("button", { name: "Guardar conexión" }).click();

  await expect(page.getByRole("status").filter({ hasText: "Guardamos tu número como pendiente" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("wa-status")).toHaveText("Pendiente de verificación");
  await expect(page.getByText(phoneId)).toBeVisible();
  await expect(page.getByText(/conversaciones abiertas/)).toBeVisible();

  // el token nunca vuelve al navegador
  const { data } = await adminClient().from("whatsapp_accounts").select("token_secret_id, status").eq("org_id", owner.orgId!).single();
  expect(data?.status).toBe("pendiente");
  expect(data?.token_secret_id).toBeTruthy();
  expect(await page.content()).not.toContain(token);

  await page.getByRole("button", { name: "Desconectar" }).click();
  await page.getByRole("button", { name: "Sí, desconectar" }).click();
  await expect(page.getByTestId("wa-status")).toHaveText("Desconectado");
  const after = await adminClient().from("whatsapp_accounts").select("token_secret_id, status").eq("org_id", owner.orgId!).single();
  expect(after.data).toEqual({ token_secret_id: null, status: "desconectado" });
});

test("un operador ve el estado pero no puede conectar WhatsApp", async ({ page, owner }) => {
  const operador = await createQaUser({ tag: "operador-wa" });
  const { error } = await adminClient().from("memberships").insert({ org_id: owner.orgId!, user_id: operador.id, role: "operador" });
  expect(error).toBeNull();

  await login(page, operador);
  await page.goto(`/app/${owner.orgSlug}/configuracion/whatsapp`);
  await expect(page.getByRole("heading", { name: "WhatsApp", level: 1 })).toBeVisible();
  await expect(page.getByTestId("wa-status")).toBeVisible();
  await expect(page.getByRole("note")).toContainText("Solo el dueño o un administrador");
  await expect(page.getByRole("button", { name: "Guardar conexión" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Desconectar" })).toHaveCount(0);

  // tampoco por la API (la función SQL valida el rol)
  const anon = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  await anon.auth.signInWithPassword({ email: operador.email, password: operador.password });
  const rpc = await anon.rpc("connect_whatsapp_account", {
    p_org: owner.orgId!,
    p_phone_number_id: digits(15),
    p_waba_id: digits(15),
    p_token: "EAAG-token-de-operador-no-permitido",
  });
  expect(rpc.error?.code).toBe("42501");
});
