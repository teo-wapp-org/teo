import { expect, test } from "@playwright/test";
import { login } from "./fixtures";
import type { Json } from "../src/lib/database.types";
import { adminClient, qaEmail } from "./supabase-admin";

// En serie: el test de "registro cerrado" cambia un ajuste global de la plataforma por unos segundos.
test.describe.configure({ mode: "serial" });

test("registro → onboarding → panel del comercio → salir → login", async ({ page }) => {
  const email = qaEmail("signup");
  const password = `Qa-${crypto.randomUUID()}`;

  await page.goto("/registro");
  await page.getByLabel("Tu nombre").fill("María QA");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();

  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByRole("heading", { name: /Hola, María/ })).toBeVisible();
  await page.getByLabel("Nombre de tu negocio").fill(`Café QA ${Date.now()}`);
  await page.getByText("Comida y bebidas").click();
  await page.getByRole("button", { name: "Crear mi comercio" }).click();

  await expect(page).toHaveURL(/\/app\/cafe-qa-\d+/);
  await expect(page.getByRole("heading", { name: /Café QA/ })).toBeVisible();
  await expect(page.getByText(/Plan Negocio · prueba: 14 días/)).toBeVisible();

  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL("/");

  await login(page, { email, password });
  await expect(page).toHaveURL(/\/app\/cafe-qa-\d+/);
});

test("login con contraseña incorrecta muestra error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(qaEmail("nadie"));
  await page.getByLabel("Contraseña").fill("incorrecta-123");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Correo o contraseña incorrectos" })).toBeVisible();
});

test("registro valida términos", async ({ page }) => {
  await page.goto("/registro");
  await page.getByLabel("Tu nombre").fill("Sin Términos");
  await page.getByLabel("Correo").fill(qaEmail("terms"));
  await page.getByLabel("Contraseña").fill("password-seguro-1");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "términos" })).toBeVisible();
});

test("registro cerrado desde /admin: /registro muestra el aviso y no ofrece el formulario", async ({ page }) => {
  const admin = adminClient();
  const { data: row, error } = await admin.from("platform_settings").select("value").eq("key", "signup").single();
  expect(error).toBeNull();
  const original = row!.value as { [key: string]: Json | undefined };
  try {
    const { error: e1 } = await admin.from("platform_settings").update({ value: { ...original, enabled: false } }).eq("key", "signup");
    expect(e1).toBeNull();
    await page.goto("/registro");
    await expect(page.getByRole("heading", { name: "El registro está cerrado por ahora" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Crear cuenta" })).toHaveCount(0);
  } finally {
    await admin.from("platform_settings").update({ value: original }).eq("key", "signup");
  }
  await page.goto("/registro");
  await expect(page.getByRole("button", { name: "Crear cuenta" })).toBeVisible();
});
