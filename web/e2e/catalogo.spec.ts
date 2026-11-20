import { expect, test } from "./fixtures";
import { adminClient } from "./supabase-admin";

// PNG 1×1 válido generado en memoria
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function storageFiles(orgId: string, productId: string) {
  const { data } = await adminClient().storage.from("catalogo").list(`${orgId}/${productId}`);
  return (data ?? []).map((f) => f.name);
}

test("catálogo: crear con variante y foto, editar, buscar y eliminar", async ({ ownerPage: page, owner }) => {
  const base = `/app/${owner.orgSlug}/catalogo`;
  await page.getByRole("navigation", { name: "Panel" }).getByRole("link", { name: "Catálogo" }).click();
  await expect(page).toHaveURL(base);
  await expect(page.getByRole("heading", { name: "Tu catálogo está vacío" })).toBeVisible();
  await page.getByRole("link", { name: "Agregar producto" }).click();
  await expect(page).toHaveURL(`${base}/nuevo`);

  await page.getByLabel("Nombre", { exact: true }).fill("Torta QA de chocolate");
  await page.getByLabel("Descripción").fill("Bizcocho húmedo con ganache");
  await page.getByLabel("Precio (USD)").fill("18,50");
  await page.getByLabel("SKU (opcional)").fill("QA-TOR-1");

  // Categoría creada al vuelo
  await page.getByLabel("Categoría", { exact: true }).selectOption({ label: "+ Nueva categoría…" });
  await page.getByLabel("Nombre de la nueva categoría").fill("Tortas QA");
  await page.getByRole("button", { name: "Crear", exact: true }).click();
  await expect(page.getByLabel("Categoría", { exact: true })).toHaveValue(/^[0-9a-f-]{36}$/);

  // Stock controlado
  await page.getByLabel("No controlar stock").uncheck();
  await page.getByLabel("Unidades en stock").fill("5");

  // Variante
  await page.getByRole("button", { name: "Agregar variante" }).click();
  await page.getByLabel("Nombre de la variante 1").fill("Grande");
  await page.getByLabel("Precio", { exact: true }).fill("25");
  await page.getByLabel("Stock", { exact: true }).fill("2");

  // Atributo
  await page.getByRole("button", { name: "Agregar atributo" }).click();
  await page.getByLabel("Atributo 1", { exact: true }).fill("Porciones");
  await page.getByLabel("Valor 1", { exact: true }).fill("12");

  // Foto: archivo inválido se rechaza en el cliente; el PNG se sube a Storage
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({ name: "nota.txt", mimeType: "text/plain", buffer: Buffer.from("hola") });
  await expect(page.getByText("“nota.txt” no es JPG, PNG ni WebP.")).toBeVisible();
  await fileInput.setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("img", { name: "Foto 1 de Torta QA de chocolate" })).toBeVisible();
  await expect(page.getByText("Principal", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Guardar producto" }).click();
  await expect(page).toHaveURL(base);
  const link = page.getByRole("link", { name: /Torta QA de chocolate/ });
  await expect(link).toBeVisible();
  await expect(link).toContainText("18,50");
  await expect(link).toContainText("5 en stock");
  await expect(link).toContainText("Tortas QA");
  await expect(link).toContainText("1 variante");

  // Se guardó en la DB con su variante, foto y archivo en Storage
  const admin = adminClient();
  const { data: prod } = await admin
    .from("products")
    .select("id, price, stock, sku, attributes, product_variants(name, price, stock), product_media(storage_path)")
    .eq("org_id", owner.orgId!)
    .single();
  expect(prod).toMatchObject({ price: 18.5, stock: 5, sku: "QA-TOR-1", attributes: { Porciones: "12" } });
  expect(prod!.product_variants).toEqual([{ name: "Grande", price: 25, stock: 2 }]);
  expect(prod!.product_media).toHaveLength(1);
  expect(prod!.product_media[0].storage_path).toMatch(new RegExp(`^${owner.orgId}/${prod!.id}/[0-9a-f-]{36}\\.png$`));
  expect(await storageFiles(owner.orgId!, prod!.id)).toHaveLength(1);

  // Editar
  await link.click();
  await expect(page).toHaveURL(`${base}/${prod!.id}`);
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("Torta QA de chocolate");
  await page.getByLabel("Nombre", { exact: true }).fill("Torta QA de chocolate y fresa");
  await page.getByLabel("Precio (USD)").fill("20");
  await page.getByLabel("Producto activo").uncheck();
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page).toHaveURL(base);
  const edited = page.getByRole("link", { name: /Torta QA de chocolate y fresa/ });
  await expect(edited).toContainText("20,00");
  await expect(edited).toContainText("Inactivo");

  // Buscar por SKU y por nombre; filtro de estado
  await page.getByLabel("Buscar").fill("qa-tor");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page).toHaveURL(/q=qa-tor/);
  await expect(edited).toBeVisible();
  await page.getByLabel("Buscar").fill("fresa");
  await page.getByLabel("Estado").selectOption("activos");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByText("No encontramos productos con esos filtros.")).toBeVisible();
  await page.getByLabel("Estado").selectOption("inactivos");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(edited).toBeVisible();

  // Eliminar (con confirmación) borra también los archivos
  await edited.click();
  await page.getByRole("button", { name: "Eliminar producto" }).click();
  await expect(page.getByRole("dialog")).toContainText("Se borrarán también sus variantes y fotos");
  await page.getByRole("button", { name: "Sí, eliminar" }).click();
  await expect(page).toHaveURL(base);
  await expect(page.getByRole("heading", { name: "Tu catálogo está vacío" })).toBeVisible();
  await expect.poll(() => storageFiles(owner.orgId!, prod!.id)).toHaveLength(0);
});

test("catálogo: importar CSV con vista previa, errores por fila y upsert por SKU", async ({ ownerPage: page, owner }) => {
  const base = `/app/${owner.orgSlug}/catalogo`;
  await page.goto(`${base}/importar`);
  await expect(page.getByRole("heading", { name: "Importar catálogo" })).toBeVisible();

  const csv = [
    "Nombre,Precio,Categoría,SKU,Stock,Activo",
    "Café QA americano,1.75,Bebidas QA,QA-CAF-1,,sí",
    "Pan QA de yuca,\"0,50\",Panadería QA,QA-PAN-1,30,sí",
    "Producto sin precio,abc,Bebidas QA,QA-ERR-1,,sí",
  ].join("\n");
  await page.locator('input[type="file"]').setInputFiles({ name: "catalogo.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });

  await expect(page.getByLabel(/^Nombre/)).toHaveValue("0");
  await expect(page.getByText("2 listas para importar")).toBeVisible();
  await expect(page.getByText("1 con errores (no se importarán)")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Precio no válido: “abc”." })).toBeVisible();

  await page.getByRole("button", { name: "Importar 2 productos" }).click();
  const resumen = page.getByRole("region", { name: "Importación terminada" });
  await expect(resumen).toBeVisible();
  await expect(resumen.getByText("Creados").locator("..")).toContainText("2");
  await expect(resumen.getByText("Actualizados").locator("..")).toContainText("0");
  await expect(resumen.getByText("Con error").locator("..")).toContainText("1");
  await expect(resumen).toContainText("Fila 4:");

  // Segunda importación: el SKU existente se actualiza, no se duplica
  await page.getByRole("button", { name: "Importar otro archivo" }).click();
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "precios.csv", mimeType: "text/csv", buffer: Buffer.from("sku,precio,nombre\nQA-CAF-1,2.25,Café QA americano grande") });
  await page.getByRole("button", { name: "Importar 1 producto" }).click();
  await expect(resumen.getByText("Actualizados").locator("..")).toContainText("1");

  const { data } = await adminClient().from("products").select("name, price, sku, stock, category:product_categories(name)").eq("org_id", owner.orgId!).order("sku");
  expect(data).toEqual([
    { name: "Café QA americano grande", price: 2.25, sku: "QA-CAF-1", stock: null, category: { name: "Bebidas QA" } },
    { name: "Pan QA de yuca", price: 0.5, sku: "QA-PAN-1", stock: 30, category: { name: "Panadería QA" } },
  ]);

  await page.getByRole("link", { name: "Ver catálogo" }).click();
  await expect(page).toHaveURL(base);
  await expect(page.getByRole("link", { name: /Pan QA de yuca/ })).toContainText("0,50");

  // Categorías: renombrar y eliminar
  await page.getByRole("link", { name: "Categorías" }).click();
  await page.getByRole("button", { name: "Renombrar Bebidas QA" }).click();
  await page.getByLabel("Nuevo nombre de Bebidas QA").fill("Cafetería QA");
  await page.getByRole("button", { name: "Guardar nombre" }).click();
  await expect(page.getByRole("list", { name: "Categorías" })).toContainText("Cafetería QA");
  await page.getByRole("button", { name: "Subir Panadería QA" }).click();
  await expect(page.getByRole("list", { name: "Categorías" }).getByRole("listitem").first()).toContainText("Panadería QA");
  await page.getByRole("button", { name: "Eliminar Cafetería QA" }).click();
  await expect(page.getByRole("dialog")).toContainText("quedarán sin categoría");
  await page.getByRole("button", { name: "Sí, eliminar" }).click();
  await expect(page.getByRole("list", { name: "Categorías" })).not.toContainText("Cafetería QA");
});

test("catálogo: el plan Gratis limita a 30 productos y no permite importar", async ({ ownerPage: page, owner }) => {
  const admin = adminClient();
  await admin.from("subscriptions").update({ plan_id: "gratis", status: "active" }).eq("org_id", owner.orgId!);
  const rows = Array.from({ length: 30 }, (_, i) => ({ org_id: owner.orgId!, name: `Relleno QA ${i + 1}`, price: 1 }));
  const { error } = await admin.from("products").insert(rows);
  expect(error).toBeNull();

  const base = `/app/${owner.orgSlug}/catalogo`;
  await page.goto(base);
  await expect(page.getByText("30 productos de 30 en tu plan Gratis")).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Llegaste al límite de 30 productos de tu plan Gratis" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver planes" })).toHaveAttribute("href", `/app/${owner.orgSlug}/configuracion`);

  // Paginación (24 por página)
  await expect(page.getByText("Página 1 de 2")).toBeVisible();
  await page.getByRole("link", { name: "Siguiente" }).click();
  await expect(page).toHaveURL(/pagina=2/);
  await expect(page.getByRole("region", { name: "Productos" }).getByRole("listitem")).toHaveCount(6);

  // Crear: no muestra el formulario
  await page.goto(`${base}/nuevo`);
  await expect(page.getByRole("alert").filter({ hasText: "Llegaste al límite" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar producto" })).toHaveCount(0);

  // Importar: función no incluida en Gratis
  await page.goto(`${base}/importar`);
  await expect(page.getByRole("alert").filter({ hasText: "no incluye importar catálogo" })).toBeVisible();
});
