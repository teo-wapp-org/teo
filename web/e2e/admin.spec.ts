import { expect, test } from "./fixtures";

test("superadmin ve comercios, suspende/reactiva y queda auditado", async ({ adminPage: page, owner }) => {
  await page.reload(); // el comercio QA se crea en paralelo al login del admin
  await expect(page.getByRole("heading", { name: "Comercios" })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: owner.orgSlug! });
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Suspender" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Suspender" }).click();
  await expect(row.getByText("suspendido")).toBeVisible();
  await row.getByRole("button", { name: "Reactivar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reactivar" }).click();
  await expect(row.getByText("activo", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Auditoría" }).click();
  await expect(page.getByRole("cell", { name: /Cambió el estado del comercio/ }).first()).toBeVisible();
});

test("superadmin puede ver un comercio en modo impersonación", async ({ adminPage: page, owner }) => {
  await page.goto(`/app/${owner.orgSlug}`);
  await expect(page.getByRole("status").filter({ hasText: "como equipo Teo" })).toBeVisible();
});
