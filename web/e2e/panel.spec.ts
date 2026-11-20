import { expect, test } from "./fixtures";

test("panel del comercio: navegación y tablero de casos", async ({ ownerPage: page, owner }) => {
  await expect(page.getByRole("heading", { name: "Deja a Teo listo para vender" })).toBeVisible();
  await page.getByRole("navigation", { name: "Panel" }).getByRole("link", { name: "Casos" }).click();
  await expect(page).toHaveURL(`/app/${owner.orgSlug}/casos`);
  for (const col of ["Nuevo", "Esperando pago", "Pago por confirmar", "Requiere atención"]) {
    await expect(page.getByRole("heading", { name: col, exact: true })).toBeVisible();
  }
});

test("un comercio no puede ver otro comercio", async ({ ownerPage: page }) => {
  const res = await page.goto("/app/comercio-que-no-es-mio-xyz");
  expect(res?.status()).toBe(404);
});

test("un usuario normal no entra a /admin", async ({ ownerPage: page }) => {
  const res = await page.goto("/admin");
  expect(res?.status()).toBe(404);
});
