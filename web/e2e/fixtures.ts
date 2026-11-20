import { test as base, expect, type Page } from "@playwright/test";
import { createQaUser, type QaUser } from "./supabase-admin";

export async function login(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(user.email);
  await page.getByLabel("Contraseña").fill(user.password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

type Fixtures = {
  owner: QaUser;          // usuario con comercio propio
  ownerPage: Page;        // página ya logueada como owner, en su panel
  superadmin: QaUser;
  adminPage: Page;
};

export const test = base.extend<Fixtures>({
  owner: async ({}, use, info) => {
    await use(await createQaUser({ tag: `owner-${info.workerIndex}`, withOrg: `QA Tienda ${info.workerIndex}-${Date.now()}` }));
  },
  ownerPage: async ({ page, owner }, use) => {
    await login(page, owner);
    await expect(page).toHaveURL(new RegExp(`/app/${owner.orgSlug}$`));
    await use(page);
  },
  superadmin: async ({}, use, info) => {
    await use(await createQaUser({ tag: `admin-${info.workerIndex}`, platformRole: "superadmin" }));
  },
  adminPage: async ({ page, superadmin }, use) => {
    await login(page, superadmin);
    await page.goto("/admin");
    await use(page);
  },
});

export { expect };
