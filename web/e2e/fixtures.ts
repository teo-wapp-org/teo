import { test as base, expect, type Page } from "@playwright/test";
import { createQaUser, type QaUser } from "./supabase-admin";

export async function login(page: Page, user: { email: string; password: string }) {
  // Varias suites (y agentes) comparten la IP contra teo-dev: si Auth responde 429, reintenta con espera.
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.goto("/login");
    await page.getByLabel("Correo").fill(user.email);
    await page.getByLabel("Contraseña").fill(user.password);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    const outcome = await Promise.race([
      page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15_000 }).then(() => "ok" as const),
      page.getByRole("alert").filter({ hasText: "Demasiados intentos" }).waitFor({ timeout: 15_000 }).then(() => "rate" as const),
    ]).catch(() => "timeout" as const);
    if (outcome === "ok") return;
    if (outcome === "rate") await page.waitForTimeout(5_000 * attempt);
  }
  throw new Error(`No se pudo iniciar sesión como ${user.email}`);
}

type Fixtures = {
  owner: QaUser;          // usuario con comercio propio
  ownerPage: Page;        // página ya logueada como owner, en su panel
  superadmin: QaUser;
  adminPage: Page;
};

export const test = base.extend<Fixtures>({
  owner: async ({}, provide, info) => {
    await provide(await createQaUser({ tag: `owner-${info.workerIndex}`, withOrg: `QA Tienda ${info.workerIndex}-${Date.now()}` }));
  },
  ownerPage: async ({ page, owner }, provide) => {
    await login(page, owner);
    await expect(page).toHaveURL(new RegExp(`/app/${owner.orgSlug}$`));
    await provide(page);
  },
  superadmin: async ({}, provide, info) => {
    await provide(await createQaUser({ tag: `admin-${info.workerIndex}`, platformRole: "superadmin" }));
  },
  adminPage: async ({ page, superadmin }, provide) => {
    await login(page, superadmin);
    await page.goto("/admin");
    await provide(page);
  },
});

export { expect };
