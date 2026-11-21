import { expect, login, test } from "./fixtures";
import { createQaUser } from "./supabase-admin";

// Proyecto "mobile" (Chromium táctil) con el ancho más angosto que soportamos.
test.use({ viewport: { width: 375, height: 812 } });

const SHOTS = process.env.E2E_SHOTS_DIR;

test("móvil: barra inferior completa, menú con todas las secciones", async ({ ownerPage: page, owner }) => {
  const bar = page.getByRole("navigation", { name: "Navegación inferior" });
  await expect(bar).toBeVisible();
  const vw = page.viewportSize()!.width;
  for (const name of ["Inicio", "Casos", "Chats", "Clientes", "Más"]) {
    const item = bar.getByText(name, { exact: true });
    await expect(item).toBeVisible();
    const box = (await item.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vw);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/movil-inicio.png` });

  await bar.getByText("Más", { exact: true }).click();
  const menu = page.getByRole("navigation", { name: "Menú" });
  for (const name of ["Catálogo", "Tiendas", "Métricas", "Simulador", "Configuración"]) {
    await expect(menu.getByRole("link", { name })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/movil-menu.png` });
  await menu.getByRole("link", { name: "Configuración" }).click();
  await expect(page).toHaveURL(`/app/${owner.orgSlug}/configuracion`);
});

test("móvil: superadmin entra al admin y cambia de comercio", async ({ page, owner }) => {
  const admin = await createQaUser({ tag: "movil-admin", withOrg: `QA Admin Movil ${Date.now()}`, platformRole: "superadmin" });
  await login(page, admin);
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page.getByRole("link", { name: "Admin Teo" }).click();
  await expect(page).toHaveURL("/admin");
  await expect(page.getByRole("navigation", { name: "Navegación inferior" }).getByText("Comercios")).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/movil-admin.png` });

  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page.getByRole("button", { name: /Ir a un comercio/ }).click();
  await page.getByPlaceholder("Buscar por nombre…").fill(owner.orgSlug!);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/movil-switcher.png` });
  await page.getByRole("link", { name: new RegExp(owner.orgSlug!.replace(/-/g, ".").slice(0, 12), "i") }).first().click();
  await expect(page).toHaveURL(`/app/${owner.orgSlug}`);
  await expect(page.getByRole("status").filter({ hasText: "como equipo Teo" })).toBeVisible();
});
