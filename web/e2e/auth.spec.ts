import { expect, test } from "@playwright/test";
import { login } from "./fixtures";
import { qaEmail } from "./supabase-admin";

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
