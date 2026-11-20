import { expect, login, test } from "./fixtures";
import { addQaMember, createQaUser } from "./supabase-admin";

test("negocio: editar y ver persistido tras recargar", async ({ ownerPage: page, owner }) => {
  await page.goto(`/app/${owner.orgSlug}/configuracion`);
  await expect(page.getByRole("heading", { name: "Configuración" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Negocio" })).toHaveAttribute("aria-current", "page");

  await page.getByLabel("Nombre del comercio").fill("QA Pastelería Renombrada");
  await page.getByLabel("Descripción").fill("Pastelería artesanal en Quito con tortas por encargo.");
  await page.getByText("Formal", { exact: true }).click();
  await page.getByText("De usted", { exact: true }).click();
  await page.getByLabel("Envíos", { exact: true }).fill("Envíos en Quito en 24 horas.");
  await page.getByLabel("Instagram").fill("@qapasteleria");
  await page.getByRole("button", { name: "Agregar pregunta" }).click();
  await page.getByLabel("Pregunta", { exact: true }).fill("¿Hacen tortas sin azúcar?");
  await page.getByLabel("Respuesta", { exact: true }).fill("Sí, por encargo con 48 horas.");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Listo, guardamos los datos de tu negocio.")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Nombre del comercio")).toHaveValue("QA Pastelería Renombrada");
  await expect(page.getByLabel("Descripción")).toHaveValue("Pastelería artesanal en Quito con tortas por encargo.");
  await expect(page.getByRole("radio", { name: "Formal" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "De usted" })).toBeChecked();
  await expect(page.getByLabel("Envíos", { exact: true })).toHaveValue("Envíos en Quito en 24 horas.");
  await expect(page.getByLabel("Instagram")).toHaveValue("qapasteleria");
  await expect(page.getByLabel("Pregunta", { exact: true })).toHaveValue("¿Hacen tortas sin azúcar?");
  // el nombre nuevo se refleja en el panel
  await expect(page.getByRole("complementary").getByText("QA Pastelería Renombrada")).toBeVisible();
});

test("negocio: valida los campos", async ({ ownerPage: page, owner }) => {
  await page.goto(`/app/${owner.orgSlug}/configuracion`);
  await page.getByLabel("Nombre del comercio").fill("X");
  await page.getByLabel("Sitio web").fill("misitio");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "al menos 2 caracteres" })).toBeVisible();
  await expect(page.getByLabel("Nombre del comercio")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Sitio web")).toHaveValue("misitio"); // no se pierde lo escrito
});

test("formas de pago: crear, editar, desactivar y eliminar", async ({ ownerPage: page, owner }) => {
  await page.goto(`/app/${owner.orgSlug}/configuracion/pagos`);
  await expect(page.getByRole("heading", { name: "Aún no tienes formas de pago" })).toBeVisible();
  await page.getByRole("button", { name: "Agregar forma de pago" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombre").fill("Transferencia Pichincha");
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: "Indica el banco" })).toBeVisible();
  await dialog.getByLabel("Banco").fill("Banco Pichincha");
  await dialog.getByLabel("Tipo de cuenta").selectOption("corriente");
  await dialog.getByLabel("Número de cuenta").fill("2200123456");
  await dialog.getByLabel("Titular").fill("Ana Pérez");
  await dialog.getByLabel("Cédula o RUC").fill("1712345678");
  await dialog.getByLabel("Instrucciones para el cliente").fill("Envía la foto del comprobante.");
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Forma de pago agregada.")).toBeVisible();

  const list = page.getByRole("list", { name: "Formas de pago" });
  await expect(list.getByText("Transferencia Pichincha")).toBeVisible();
  await expect(list.getByText(/Banco Pichincha · Cuenta de corriente · N\.º 2200123456 · Ana Pérez/)).toBeVisible();

  // segunda forma de pago: efectivo
  await page.getByRole("button", { name: "Agregar forma de pago" }).click();
  await dialog.getByLabel("Tipo", { exact: true }).selectOption("efectivo");
  await dialog.getByLabel("Nombre").fill("Efectivo contra entrega");
  await dialog.getByLabel("Notas").fill("Solo en Quito");
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await expect(list.getByText("Efectivo contra entrega")).toBeVisible();

  // reordenar
  await page.getByRole("button", { name: "Subir Efectivo contra entrega" }).click();
  await expect(list.getByRole("heading").first()).toHaveText("Efectivo contra entrega");

  // editar
  await page.getByRole("button", { name: "Editar Transferencia Pichincha" }).click();
  await expect(dialog.getByLabel("Banco")).toHaveValue("Banco Pichincha");
  await dialog.getByLabel("Nombre").fill("Transferencia Pichincha Ahorros");
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Forma de pago actualizada.")).toBeVisible();
  await expect(list.getByText("Transferencia Pichincha Ahorros")).toBeVisible();

  // desactivar y verificar tras recargar
  await page.getByRole("switch", { name: "Activa: Transferencia Pichincha Ahorros" }).uncheck();
  await expect(page.getByText("Forma de pago desactivada.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("switch", { name: "Activa: Transferencia Pichincha Ahorros" })).not.toBeChecked();
  await expect(list.getByText("Inactiva")).toBeVisible();

  // eliminar
  await page.getByRole("button", { name: "Eliminar Transferencia Pichincha Ahorros" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();
  await expect(page.getByText("Forma de pago eliminada.")).toBeVisible();
  await expect(list.getByText("Transferencia Pichincha Ahorros")).toHaveCount(0);

  // el checklist marca el paso de pagos (queda el efectivo activo)
  await page.goto(`/app/${owner.orgSlug}`);
  await expect(page.getByRole("link", { name: /Configura tus formas de pago.*\(completado\)/ })).toBeVisible();
});

test("tiendas: crear una tienda con horario y verla en el inicio", async ({ ownerPage: page, owner }) => {
  await expect(page.getByRole("link", { name: /Agrega tus tiendas y horarios.*\(pendiente\)/ })).toBeVisible();
  await page.goto(`/app/${owner.orgSlug}/tiendas`);
  await expect(page.getByRole("heading", { name: "Agrega tu primera tienda" })).toBeVisible();
  await page.getByRole("link", { name: "Nueva tienda" }).click();
  await expect(page).toHaveURL(`/app/${owner.orgSlug}/tiendas/nueva`);

  // Sin GOOGLE_PLACES_API_KEY en E2E el botón queda deshabilitado
  await expect(page.getByRole("button", { name: /Disponible pronto|Buscar en Google/ })).toBeVisible();

  await page.getByLabel("Nombre", { exact: true }).fill("Matriz Norte");
  await page.getByLabel("Dirección").fill("Av. Amazonas N24-03 y Colón");
  await page.getByLabel("Ciudad").fill("Quito");
  await page.getByLabel("Teléfono").fill("+593 99 123 4567");

  // Martes: dos turnos
  const martes = page.getByRole("group", { name: "Martes" });
  await martes.getByLabel("Martes, turno 1: cierra").fill("13:00");
  await martes.getByRole("button", { name: "Agregar turno" }).click();
  await martes.getByLabel("Martes, turno 2: abre").fill("15:00");
  await martes.getByLabel("Martes, turno 2: cierra").fill("19:00");
  // Sábado cerrado
  await page.getByRole("group", { name: "Sábado" }).getByRole("checkbox").uncheck();
  // Turno inválido muestra error en vivo
  const lunes = page.getByRole("group", { name: "Lunes" });
  await lunes.getByLabel("Lunes, turno 1: cierra").fill("08:00");
  await expect(lunes.getByRole("alert")).toContainText("cierre debe ser después");
  await lunes.getByLabel("Lunes, turno 1: cierra").fill("18:00");

  await page.getByRole("switch", { name: /Hace envíos a domicilio/ }).check();
  await page.getByLabel("Detalles del envío").fill("Norte de Quito $2,50");
  await page.getByRole("button", { name: "Guardar tienda" }).click();

  await expect(page).toHaveURL(`/app/${owner.orgSlug}/tiendas`);
  const card = page.getByRole("list", { name: "Tiendas" }).getByRole("listitem").filter({ hasText: "Matriz Norte" });
  await expect(card).toBeVisible();
  await expect(card.getByText("Av. Amazonas N24-03 y Colón, Quito")).toBeVisible();
  await expect(card.getByText("09:00–13:00, 15:00–19:00")).toBeVisible();
  await expect(card.getByText("Envío a domicilio")).toBeVisible();
  await expect(card.getByRole("listitem").filter({ hasText: "Sábado" })).toContainText("Cerrado");

  // editar
  await card.getByRole("link", { name: "Editar Matriz Norte" }).click();
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("Matriz Norte");
  await expect(page.getByRole("group", { name: "Martes" }).getByLabel("Martes, turno 2: abre")).toHaveValue("15:00");
  await page.getByLabel("Nombre", { exact: true }).fill("Matriz Norte 2");
  await page.getByRole("button", { name: "Guardar tienda" }).click();
  await expect(page.getByText("Tienda actualizada.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Matriz Norte 2" })).toBeVisible();

  await page.goto(`/app/${owner.orgSlug}`);
  await expect(page.getByRole("link", { name: /Agrega tus tiendas y horarios.*\(completado\)/ })).toBeVisible();

  // eliminar
  await page.goto(`/app/${owner.orgSlug}/tiendas`);
  await page.getByRole("button", { name: "Eliminar Matriz Norte 2" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();
  await expect(page.getByRole("heading", { name: "Agrega tu primera tienda" })).toBeVisible();
});

test("Teo: configurar modo, saludo, horario y escalamiento", async ({ ownerPage: page, owner }) => {
  await page.goto(`/app/${owner.orgSlug}/configuracion/teo`);
  await page.getByText("Copiloto", { exact: true }).click();
  await page.getByLabel("Nombre visible").fill("Sofi");
  await page.getByLabel("Saludo").fill("¡Hola! Soy Sofi. ¿En qué te ayudo?");
  await page.getByRole("switch", { name: /Atender las 24 horas/ }).uncheck();
  await page.getByRole("group", { name: "Domingo" }).getByRole("checkbox").check();
  await page.getByLabel("Mensaje fuera de horario").fill("Te respondemos mañana desde las 9:00.");
  await page.getByLabel("Palabras clave").fill("factura");
  await page.getByLabel("Palabras clave").press("Enter");
  await page.getByRole("button", { name: "Quitar persona" }).click();
  await page.getByLabel("Pedidos desde (USD)").fill("150");
  await page.getByLabel("Horas para pagar").fill("24");
  await page.getByLabel("Instrucciones", { exact: true }).fill("Ofrece siempre la torta del mes.");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Listo, Teo ya tiene tu configuración.")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("radio", { name: /Copiloto/ })).toBeChecked();
  await expect(page.getByLabel("Nombre visible")).toHaveValue("Sofi");
  await expect(page.getByRole("switch", { name: /Atender las 24 horas/ })).not.toBeChecked();
  await expect(page.getByRole("group", { name: "Domingo" }).getByLabel("Domingo, turno 1: abre")).toHaveValue("09:00");
  const chips = page.getByRole("list", { name: "Palabras agregadas" });
  await expect(chips.getByText("factura")).toBeVisible();
  await expect(chips.getByText("persona", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Pedidos desde (USD)")).toHaveValue("150");
  await expect(page.getByLabel("Horas para pagar")).toHaveValue("24");

  await page.goto(`/app/${owner.orgSlug}`);
  await expect(page.getByRole("link", { name: /Personaliza a Teo.*\(completado\)/ })).toBeVisible();
});

test("equipo: invitar por email (con y sin cuenta)", async ({ ownerPage: page, owner }) => {
  const colega = await createQaUser({ tag: "colega" });
  await page.goto(`/app/${owner.orgSlug}/configuracion/equipo`);
  await expect(page.getByRole("list", { name: "Miembros del equipo" }).getByText(owner.email)).toBeVisible();

  await page.getByLabel("Correo").fill("qa+e2e-no-existe-xyz@teo.test");
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "/registro" }).first()).toBeVisible();

  await page.getByLabel("Correo").fill(colega.email.toUpperCase());
  await page.getByLabel("Rol", { exact: true }).selectOption("admin");
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(page.getByText(`Agregamos a ${colega.email} a tu equipo.`)).toBeVisible();
  const row = page.getByRole("list", { name: "Miembros del equipo" }).getByRole("listitem").filter({ hasText: colega.email });
  await expect(row).toBeVisible();
  await expect(row.getByRole("combobox")).toHaveValue("admin");

  // cambiar rol y quitar
  await row.getByRole("combobox").selectOption("operador");
  await expect(page.getByText("Rol actualizado.")).toBeVisible();
  await row.getByRole("button", { name: `Quitar a ${colega.email}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Quitar" }).click();
  await expect(page.getByText("Quitamos a la persona del equipo.")).toBeVisible();
  await expect(row).toHaveCount(0);

  // el último dueño no se puede quitar ni degradar: se muestra como etiqueta
  const me = page.getByRole("list", { name: "Miembros del equipo" }).getByRole("listitem").filter({ hasText: owner.email });
  await expect(me.getByRole("combobox")).toHaveCount(0);
  await expect(me.getByText("Dueño")).toBeVisible();
});

test("operador: ve la configuración pero no puede editarla", async ({ page, owner }) => {
  const operador = await createQaUser({ tag: "operador" });
  await addQaMember(owner.orgId!, operador.id, "operador");
  await login(page, operador);
  await expect(page).toHaveURL(new RegExp(`/app/${owner.orgSlug}$`));

  for (const path of ["configuracion", "configuracion/pagos", "configuracion/teo"]) {
    await page.goto(`/app/${owner.orgSlug}/${path}`);
    await expect(page.getByText("Solo el dueño o un administrador pueden cambiar la configuración.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Guardar cambios" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Agregar forma de pago" })).toHaveCount(0);
  }
  await page.goto(`/app/${owner.orgSlug}/configuracion`);
  await expect(page.getByLabel("Nombre del comercio")).toBeDisabled();

  await page.goto(`/app/${owner.orgSlug}/configuracion/equipo`);
  await expect(page.getByRole("list", { name: "Miembros del equipo" }).getByText(owner.email)).toBeVisible();
  await expect(page.getByRole("form", { name: "Invitar al equipo" })).toHaveCount(0);

  await page.goto(`/app/${owner.orgSlug}/tiendas`);
  await expect(page.getByRole("link", { name: "Nueva tienda" })).toHaveCount(0);
  const res = await page.goto(`/app/${owner.orgSlug}/tiendas/nueva`);
  expect(res?.status()).toBe(404);
});
