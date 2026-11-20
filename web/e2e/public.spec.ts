import { expect, test } from "@playwright/test";

test.describe("Landing pública", () => {
  test("muestra hero, CTA y los 4 planes desde la base", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Convierte tus conversaciones en");
    await expect(page.getByRole("link", { name: /Crear cuenta gratis/ }).first()).toBeVisible();
    const precios = page.locator("#precios");
    for (const plan of ["Gratis", "Emprende", "Negocio", "Pro"]) {
      await expect(precios.getByRole("heading", { name: plan, exact: true })).toBeVisible();
    }
    await expect(precios.getByText("Más elegido")).toBeVisible();
  });

  test("páginas legales", async ({ page }) => {
    await page.goto("/privacidad");
    await expect(page.getByRole("heading", { name: "Política de privacidad" })).toBeVisible();
    await page.goto("/terminos");
    await expect(page.getByRole("heading", { name: "Términos de servicio" })).toBeVisible();
  });

  test("sin scroll horizontal", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  for (const path of ["/app", "/admin", "/onboarding", "/app/cualquier-cosa/casos"]) {
    test(`ruta protegida ${path} redirige al login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?next=/);
    });
  }
});
