import type { Page } from "@playwright/test";
import { expect, test as base } from "./fixtures";
import { createQaUser, seedOperacion, type OperacionSeed } from "./supabase-admin";

/** Panel operativo (Fase 4) con datos sembrados en el comercio del owner. */
const test = base.extend<{ seed: OperacionSeed }>({
  seed: async ({ owner }, use) => {
    await use(await seedOperacion(owner.orgId!));
  },
});

// Todas las columnas del tablero a la vista (el arrastre con ratón no depende del autoscroll).
test.use({ viewport: { width: 2400, height: 1000 } });

const column = (page: Page, id: string) => page.getByTestId(`columna-${id}`);

async function dragTo(page: Page, number: number, columnId: string) {
  const handle = page.getByRole("button", { name: `Mover caso #${number}` });
  const target = column(page, columnId);
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + 20, hb.y + 20, { steps: 5 });
  const tb = (await target.boundingBox())!;
  await page.mouse.move(tb.x + tb.width / 2, tb.y + 30, { steps: 15 });
  await page.mouse.up();
}

test("kanban: casos en sus columnas, cerrados ocultos y filtro", async ({ ownerPage: page, owner, seed }) => {
  await page.goto(`/app/${owner.orgSlug}/casos`);
  await expect(column(page, "nuevo").getByTestId(`caso-${seed.nuevo.number}`)).toContainText("Lucía Pérez");
  await expect(column(page, "en_conversacion").getByTestId(`caso-${seed.conversacion.number}`)).toContainText("Pedro Gómez");
  await expect(column(page, "esperando_pago").getByTestId(`caso-${seed.esperando.number}`)).toContainText("$42,50");
  await expect(column(page, "pago_por_confirmar").getByTestId(`caso-${seed.porConfirmar.number}`)).toContainText("Recibido, lo estamos verificando.");
  await expect(column(page, "requiere_atencion").getByTestId(`caso-${seed.atencion.number}`)).toContainText("Ana León");
  await expect(page.getByTestId(`caso-${seed.cerrado.number}`)).toHaveCount(0);

  await page.getByRole("link", { name: "Ver cerrados" }).click();
  await expect(column(page, "cerrado").getByTestId(`caso-${seed.cerrado.number}`)).toBeVisible();

  await page.getByLabel("Buscar casos").fill("Pedro");
  await expect(page.getByTestId(`caso-${seed.conversacion.number}`)).toBeVisible();
  await expect(page.getByTestId(`caso-${seed.nuevo.number}`)).toHaveCount(0);

  await page.getByRole("link", { name: "Lista" }).click();
  await expect(page.getByRole("table", { name: "Lista de casos" })).toBeVisible();
});

test("kanban: mover a columna válida persiste; inválida vuelve con aviso", async ({ ownerPage: page, owner, seed }) => {
  await page.goto(`/app/${owner.orgSlug}/casos`);
  await expect(column(page, "nuevo").getByTestId(`caso-${seed.nuevo.number}`)).toBeVisible();

  // inválida: nuevo → confirmado
  await dragTo(page, seed.nuevo.number, "confirmado");
  await expect(page.getByText(`No se puede mover el caso #${seed.nuevo.number}`)).toBeVisible();
  await expect(column(page, "nuevo").getByTestId(`caso-${seed.nuevo.number}`)).toBeVisible();

  // válida con teclado: en_conversacion → (→) cotización
  const handle = page.getByRole("button", { name: `Mover caso #${seed.conversacion.number}` });
  await handle.focus();
  const live = (text: string) => expect(page.locator("[aria-live]", { hasText: text })).toHaveCount(1);
  await page.keyboard.press("Space");
  await live(`Caso #${seed.conversacion.number} sobre la columna En conversación`);
  await page.keyboard.press("ArrowRight");
  await live("sobre la columna Cotización");
  await page.keyboard.press("Space");
  await expect(page.getByText(`Caso #${seed.conversacion.number} movido a “Cotización”`)).toBeVisible();
  await expect(column(page, "cotizacion").getByTestId(`caso-${seed.conversacion.number}`)).toBeVisible();

  // válida con ratón: nuevo → en conversación
  await dragTo(page, seed.nuevo.number, "en_conversacion");
  await expect(column(page, "en_conversacion").getByTestId(`caso-${seed.nuevo.number}`)).toBeVisible();

  await page.reload();
  await expect(column(page, "cotizacion").getByTestId(`caso-${seed.conversacion.number}`)).toBeVisible();
  await expect(column(page, "en_conversacion").getByTestId(`caso-${seed.nuevo.number}`)).toBeVisible();
});

test("un usuario de otro comercio no ve el caso (404)", async ({ ownerPage: page, seed }) => {
  const other = await createQaUser({ tag: "otro", withOrg: `QA Otro ${Date.now()}` });
  const res = await page.goto(`/app/${other.orgSlug}/casos/${seed.nuevo.number}`);
  expect(res?.status()).toBe(404);
});
