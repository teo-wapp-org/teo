import type { Page } from "@playwright/test";
import { expect, login, test as base } from "./fixtures";
import { adminClient, createQaUser, seedOperacion, type OperacionSeed } from "./supabase-admin";

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
  // dnd-kit engancha las flechas un instante después de tomar la tarjeta: reintenta hasta que se mueva.
  await expect(async () => {
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("[aria-live]", { hasText: "sobre la columna Cotización" })).toHaveCount(1, { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await page.keyboard.press("Space");
  await expect(page.getByText(`Caso #${seed.conversacion.number} movido a “Cotización”`)).toBeVisible();
  await expect(column(page, "cotizacion").getByTestId(`caso-${seed.conversacion.number}`)).toBeVisible();

  // válida con ratón: nuevo → en conversación
  await dragTo(page, seed.nuevo.number, "en_conversacion");
  await expect(column(page, "en_conversacion").getByTestId(`caso-${seed.nuevo.number}`)).toBeVisible();
  await expect(page.getByText(`Caso #${seed.nuevo.number} movido a “En conversación”`)).toBeVisible();

  await page.reload();
  await expect(column(page, "cotizacion").getByTestId(`caso-${seed.conversacion.number}`)).toBeVisible();
  await expect(column(page, "en_conversacion").getByTestId(`caso-${seed.nuevo.number}`)).toBeVisible();
});

test("un usuario de otro comercio no ve el caso (404)", async ({ ownerPage: page, owner, seed, browser }) => {
  // El dueño sí lo ve; otro comercio (con sus propios casos) no puede abrirlo ni por URL.
  const mine = await page.goto(`/app/${owner.orgSlug}/casos/${seed.nuevo.number}`);
  expect(mine?.status()).toBe(200);
  const other = await createQaUser({ tag: "otro", withOrg: `QA Otro ${Date.now()}` });
  await seedOperacion(other.orgId!);
  const ctx = await browser.newContext();
  const otherPage = await ctx.newPage();
  await login(otherPage, other);
  const res = await otherPage.goto(`/app/${owner.orgSlug}/casos/${seed.nuevo.number}`);
  expect(res?.status()).toBe(404);
  const inexistente = await otherPage.goto(`/app/${other.orgSlug}/casos/99999`);
  expect(inexistente?.status()).toBe(404);
  await ctx.close();
});

test("detalle: chat, enviar mensaje, tomar y devolver a Teo", async ({ ownerPage: page, owner, seed }) => {
  test.setTimeout(90_000); // incluye la llamada real a agent/suggest (Edge Function)
  await page.goto(`/app/${owner.orgSlug}/casos/${seed.atencion.number}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ana León");
  const chat = page.getByRole("log", { name: "Conversación" });
  await expect(chat).toContainText("Quiero hablar con una persona");

  await page.getByRole("button", { name: "Pedir sugerencias" }).click();
  await expect(page.getByText(/Sugerencias no disponibles|Usar sugerencia 1/)).toBeVisible({ timeout: 20_000 });

  // Tomar (humano): se asigna al operador
  await expect(page.getByTestId("atiende")).toContainText("Teo");
  await page.getByRole("button", { name: "Tomar caso" }).click();
  await expect(page.getByTestId("atiende")).toContainText("Humano");
  await expect(page.getByRole("button", { name: "Devolver a Teo" })).toBeVisible();

  // Enviar con Enter (simulador → queda 'sent')
  const composer = page.getByLabel("Escribe una respuesta");
  await composer.fill("Hola Ana, ya reviso tu pedido");
  await composer.press("Enter");
  const sent = chat.getByTestId("mensaje").filter({ hasText: "Hola Ana, ya reviso tu pedido" });
  await expect(sent).toHaveAttribute("data-author", "operador");
  await expect(sent.getByTestId("estado-mensaje")).toHaveAttribute("data-status", "sent");
  await expect(composer).toHaveValue("");

  // Devolver a Teo: sale de "Requiere atención" y vuelve al estado previo
  await page.getByRole("button", { name: "Devolver a Teo" }).click();
  await expect(page.getByTestId("atiende")).toContainText("Teo");
  await expect(page.locator("header").getByText("En conversación")).toBeVisible();
  await page.reload();
  await expect(chat.getByTestId("mensaje").filter({ hasText: "Hola Ana, ya reviso tu pedido" })).toBeVisible();
  await expect(chat.getByTestId("evento-caso").last()).toContainText("“En conversación”");
});

test("pagos: confirmar mueve a Confirmado; rechazar vuelve a Esperando pago", async ({ ownerPage: page, owner, seed }) => {
  await page.goto(`/app/${owner.orgSlug}/casos/${seed.porConfirmar.number}`);
  const pago = page.getByTestId("pago");
  await expect(pago.getByRole("img", { name: "Comprobante de pago" })).toBeVisible();
  await expect(pago).toContainText("Banco Pichincha");
  await expect(page.getByTestId("total-pedido")).toContainText("$30,00");

  // Rechazar con motivo
  await pago.getByRole("button", { name: "Rechazar" }).click();
  await page.getByLabel("Motivo del rechazo").fill("El monto no coincide");
  await page.getByRole("button", { name: "Rechazar pago" }).click();
  await expect(page.getByText("Pago rechazado.")).toBeVisible();
  await expect(page.locator("header").getByText("Esperando pago")).toBeVisible();
  await expect(pago).toContainText("Motivo: El monto no coincide");

  // Nuevo comprobante → pago_por_confirmar → confirmar
  const admin = adminClient();
  const { data: order } = await admin.from("orders").select("id").eq("case_id", seed.porConfirmar.id).single();
  await admin.from("payments").insert({ org_id: owner.orgId!, order_id: order!.id, declared_amount: 30 });
  await admin.rpc("transition_case", { p_case: seed.porConfirmar.id, p_to: "pago_por_confirmar", p_actor: "teo" });
  await page.reload();
  await page.getByRole("button", { name: "Confirmar pago" }).click();
  await expect(page.getByText("Pago confirmado.")).toBeVisible();
  await expect(page.locator("header").getByText("Confirmado", { exact: true })).toBeVisible();

  await page.goto(`/app/${owner.orgSlug}/casos`);
  await expect(column(page, "confirmado").getByTestId(`caso-${seed.porConfirmar.number}`)).toBeVisible();
});

test("conversaciones, clientes, métricas y resumen con datos sembrados", async ({ ownerPage: page, owner, seed }) => {
  const base = `/app/${owner.orgSlug}`;

  // Inicio: resumen real y badge de "Requiere atención" en el menú
  await page.goto(base);
  await expect(page.getByTestId("resumen-esperando-pago")).toHaveText("$42,50");
  await expect(page.getByTestId("resumen-conversaciones-hoy")).toHaveText(/^\d+$/);
  await expect(page.getByRole("navigation", { name: "Panel" }).getByTestId("badge-atencion")).toContainText("1");

  // Conversaciones: bandeja; con caso abierto lleva al caso
  await page.getByRole("navigation", { name: "Panel" }).getByRole("link", { name: "Conversaciones" }).click();
  await expect(page.getByTestId("conversacion")).toHaveCount(5);
  await page.getByTestId("conversacion").filter({ hasText: "Pedro Gómez" }).click();
  await expect(page).toHaveURL(`${base}/casos/${seed.conversacion.number}`);

  // Clientes: lista, etiqueta, búsqueda y ficha con total gastado
  await page.goto(`${base}/clientes`);
  await expect(page.getByTestId("fila-cliente")).toHaveCount(5);
  await page.getByRole("navigation", { name: "Filtrar por etiqueta" }).getByRole("link", { name: "mayorista" }).click();
  await expect(page.getByTestId("fila-cliente")).toHaveCount(1);
  await expect(page.getByTestId("fila-cliente")).toContainText("María Torres");
  await page.goto(`${base}/clientes?q=Luc`);
  const lucia = page.getByTestId("fila-cliente");
  await expect(lucia).toHaveCount(1);
  await expect(lucia).toContainText("$20,00");
  await lucia.getByRole("link", { name: "Lucía Pérez" }).click();
  await expect(page.getByTestId("total-gastado")).toHaveText("$20,00");
  await expect(page.getByRole("link", { name: `#${seed.nuevo.number}` }).first()).toBeVisible();
  await page.getByRole("button", { name: "Editar datos" }).click();
  await page.getByLabel("Correo").fill("lucia@example.com");
  await page.getByRole("button", { name: "Guardar cliente" }).click();
  await expect(page.getByText("Cliente actualizado")).toBeVisible();
  await expect(page.getByText("lucia@example.com")).toBeVisible();

  // Métricas (30 días): 6 casos, 4 de venta (1 confirmado, 3 llegaron a pago), 1 cerrado sin intervención
  await page.goto(`${base}/metricas`);
  await expect(page.getByTestId("kpi-conversaciones")).toHaveText("5");
  await expect(page.getByTestId("kpi-ventas")).toHaveText("$20,00");
  await expect(page.getByTestId("kpi-conversion")).toHaveText("25 %");
  await expect(page.getByTestId("kpi-llegada-pago")).toHaveText("75 %");
  await expect(page.getByTestId("kpi-autonomia")).toHaveText("100 %");
  await expect(page.getByTestId("kpi-confirmacion")).toHaveText("10 min");
  await expect(page.getByTestId("estado-esperando_pago")).toContainText("1");
  await expect(page.getByRole("figure", { name: "Casos nuevos por día" })).toBeVisible();
  await page.getByRole("link", { name: "7 días" }).click();
  await expect(page).toHaveURL(/r=7/);
});
