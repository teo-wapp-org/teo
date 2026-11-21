import { expect, test } from "./fixtures";
import { adminClient } from "./supabase-admin";

// Requiere la Edge Function `agent` desplegada en teo-dev con el ajuste ai.provider = fake (respuestas deterministas).
test("simulador: consulta → esperando pago → requiere atención", async ({ ownerPage: page, owner }) => {
  test.setTimeout(120_000);
  const { error } = await adminClient().from("products").insert({ org_id: owner.orgId!, name: "Torta de chocolate", price: 18.5, description: "Torta húmeda" });
  expect(error).toBeNull();

  await page.getByRole("navigation", { name: "Panel" }).getByRole("link", { name: "Simulador" }).click();
  await expect(page).toHaveURL(`/app/${owner.orgSlug}/simulador`);
  await expect(page.getByRole("heading", { name: "Simulador" })).toBeVisible();

  const input = page.getByLabel("Escribe un mensaje");
  const send = async (text: string) => {
    await expect(input).toBeEnabled();
    await input.fill(text);
    await page.getByRole("button", { name: "Enviar" }).click();
  };
  const teo = page.getByTestId("msg-teo");
  const status = page.getByTestId("case-status");

  await send("hola, tienen torta?");
  await expect(teo.last()).toContainText("Torta de chocolate: $18.50", { timeout: 30_000 });
  await expect(status).toHaveText("En conversación");

  await send("la quiero");
  await expect(status).toHaveText("Esperando pago", { timeout: 30_000 });
  await expect(page.getByTestId("order-total")).toHaveText("$18.50");
  await expect(teo.last()).toContainText("Total: $18.50");

  await send("quiero hablar con una persona");
  await expect(status).toHaveText("Requiere atención", { timeout: 30_000 });
  await expect(page.getByText("La conversación pasó a una persona del equipo")).toBeVisible();

  // Reiniciar deja la conversación limpia
  await page.getByRole("button", { name: "Reiniciar conversación" }).click();
  await expect(teo).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText("Aún no hay un caso")).toBeVisible();
});
