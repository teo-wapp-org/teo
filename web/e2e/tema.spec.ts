import { expect, login, test } from "./fixtures";
import { createQaUser, seedOperacion } from "./supabase-admin";

const SHOTS = process.env.E2E_SHOTS_DIR;
const shot = async (page: import("@playwright/test").Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
};

test("tema oscuro: se activa desde el menú y persiste", async ({ ownerPage: page }, info) => {
  test.skip(info.project.name !== "desktop", "solo escritorio");
  await page.getByRole("radio", { name: "Oscuro" }).first().click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("radio", { name: "Claro" }).first().click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("móvil: los botones de guardar quedan por encima de la barra inferior", async ({ ownerPage: page, owner }, info) => {
  test.skip(info.project.name !== "mobile", "solo móvil");
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of ["tiendas/nueva", "configuracion", "configuracion/teo", "catalogo/nuevo"]) {
    await page.goto(`/app/${owner.orgSlug}/${path}`);
    const save = page.getByRole("button", { name: /^Guardar/ }).last();
    await expect(save).toBeVisible();
    const s = (await save.boundingBox())!;
    const bar = (await page.getByRole("navigation", { name: "Navegación inferior" }).boundingBox())!;
    expect(s.y + s.height, `${path}: el botón no debe quedar bajo la barra`).toBeLessThanOrEqual(bar.y);
    await shot(page, `movil-${path.replace("/", "-")}`);
  }
});

test("capturas en modo oscuro (revisión visual)", async ({ browser }, info) => {
  test.skip(!SHOTS || info.project.name !== "desktop", "solo con E2E_SHOTS_DIR");
  test.setTimeout(180_000);
  const admin = await createQaUser({ tag: "tema", withOrg: `QA Tema ${Date.now()}`, platformRole: "superadmin" });
  const seed = await seedOperacion(admin.orgId!);
  for (const [vp, w, h] of [["d", 1280, 800], ["m", 375, 812]] as const) {
    const ctx = await browser.newContext({ colorScheme: "dark", viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto("/");
    await shot(page, `${vp}-dark-landing`);
    await login(page, admin);
    const base = `/app/${admin.orgSlug}`;
    for (const [name, path] of [
      ["inicio", base], ["casos", `${base}/casos`], ["caso", `${base}/casos/${seed.porConfirmar.number}`],
      ["catalogo-nuevo", `${base}/catalogo/nuevo`], ["config", `${base}/configuracion`], ["simulador", `${base}/simulador`],
      ["metricas", `${base}/metricas`], ["admin", "/admin"], ["admin-config", "/admin/configuracion"],
    ] as const) {
      await page.goto(path);
      await page.waitForLoadState("networkidle").catch(() => {});
      await shot(page, `${vp}-dark-${name}`);
    }
    await ctx.close();
  }
});
