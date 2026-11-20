// Herramientas del agente (FICHA §7.4). Guardrails:
// - org_id, caso, contacto y conversación los inyecta el servidor (ToolContext); el modelo nunca los elige.
// - Toda consulta filtra por org_id: un id de otro comercio se comporta como "no encontrado".
// - Entradas validadas con zod en modo estricto (claves extra = error; p. ej. un "precio" inventado).
// - Precios y totales: siempre desde la DB (recalc_order). Estados: transition_case con p_actor='teo'.
import { z } from "zod";
import type { LlmTool } from "../llm/types.ts";
import { escalateCase, getCase, moveCase } from "./cases.ts";
import { loadOpenOrder, type OrderState } from "./context.ts";
import { isOpenNow, formatHours, type Hours } from "./hours.ts";
import { keywords, normalize } from "./text.ts";
import type { ToolContext } from "./types.ts";

type VariantRow = { id: string; name: string; price: number | string | null; stock: number | null; active: boolean };

/** Error con mensaje apto para el modelo (se devuelve como tool_result is_error). */
export class ToolError extends Error {}

type ToolDef<S extends z.ZodType> = LlmTool & { schema: S; run: (ctx: ToolContext, input: z.infer<S>) => Promise<unknown> };

const uuid = z.string().uuid({ message: "id inválido" });
const nullable = (t: string) => ({ type: [t, "null"] });

// deno-lint-ignore no-explicit-any
const must = <R extends { data: any; error: { message: string } | null }>(r: R, what: string): R["data"] => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

function orderView(o: OrderState) {
  return {
    id: o.id,
    estado: o.status,
    items: o.items.map((i) => ({ nombre: i.name, cantidad: i.quantity, precio_unitario: i.unit_price, subtotal: i.subtotal })),
    subtotal: o.subtotal,
    envio: o.shipping,
    total: o.total,
    entrega: o.delivery,
  };
}

// ── buscar_productos ────────────────────────────────────────────
const buscarSchema = z.object({
  query: z.string().min(1).max(200),
  categoria: z.string().max(100).nullable(),
  precio_max: z.number().positive().nullable(),
}).strict();

const buscar_productos: ToolDef<typeof buscarSchema> = {
  name: "buscar_productos",
  description: "Busca productos activos del catálogo del comercio por texto (nombre o descripción). Devuelve id, nombre, precio, disponibilidad y variantes. Úsala antes de mencionar cualquier producto o precio que no esté en el contexto.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Qué busca el cliente, p. ej. 'torta de chocolate'" },
      categoria: { ...nullable("string"), description: "Nombre de categoría para filtrar, o null" },
      precio_max: { ...nullable("number"), description: "Precio máximo en USD, o null" },
    },
    required: ["query", "categoria", "precio_max"],
    additionalProperties: false,
  },
  schema: buscarSchema,
  async run(ctx, input) {
    const words = (keywords(input.query).length ? keywords(input.query) : normalize(input.query).split(" ")).filter(Boolean).slice(0, 6);
    const base = () => {
      let q = ctx.db.from("products")
        .select("id, name, description, price, stock, category_id, variants:product_variants(id, name, price, stock, active)")
        .eq("org_id", ctx.orgId).eq("active", true).limit(8);
      if (input.precio_max != null) q = q.lte("price", input.precio_max);
      return q;
    };
    let categoryId: string | null = null;
    if (input.categoria) {
      const { data } = await ctx.db.from("product_categories").select("id, name").eq("org_id", ctx.orgId);
      categoryId = (data ?? []).find((c) => normalize(c.name).includes(normalize(input.categoria!)))?.id ?? null;
    }
    const withCat = <T extends { eq: (c: string, v: string) => T }>(q: T) => (categoryId ? q.eq("category_id", categoryId) : q);

    // deno-lint-ignore no-explicit-any -- filas de PostgREST con relaciones embebidas
    let rows: any[] = [];
    if (words.length) {
      const fts = await withCat(base()).textSearch("search_tsv", words.map((w) => `${w}:*`).join(" | "), { config: "spanish" });
      rows = fts.error ? [] : (fts.data ?? []);
      if (!rows.length) {
        const like = await withCat(base()).or(words.map((w) => `name.ilike.%${w}%,description.ilike.%${w}%`).join(","));
        rows = must(like, "buscar_productos") ?? [];
      }
    } else {
      rows = must(await withCat(base()), "buscar_productos") ?? [];
    }
    return {
      productos: rows.map((p) => ({
        id: p.id,
        nombre: p.name,
        descripcion: p.description ? String(p.description).slice(0, 160) : null,
        precio: Number(p.price),
        disponible: p.stock === null || p.stock > 0,
        stock: p.stock,
        variantes: ((p.variants ?? []) as VariantRow[]).filter((v) => v.active).map((v) => ({
          id: v.id, nombre: v.name, precio: Number(v.price ?? p.price), disponible: v.stock === null || v.stock > 0,
        })),
      })),
    };
  },
};

// ── ver_producto ────────────────────────────────────────────────
const verSchema = z.object({ producto_id: uuid }).strict();
const ver_producto: ToolDef<typeof verSchema> = {
  name: "ver_producto",
  description: "Detalle de un producto del catálogo: descripción, precio, stock, variantes y cuántas fotos tiene.",
  input_schema: {
    type: "object",
    properties: { producto_id: { type: "string", description: "id del producto (de buscar_productos o del catálogo)" } },
    required: ["producto_id"],
    additionalProperties: false,
  },
  schema: verSchema,
  async run(ctx, input) {
    const { data, error } = await ctx.db.from("products")
      .select("id, name, description, price, stock, attributes, active, variants:product_variants(id, name, price, stock, active), media:product_media(id)")
      .eq("org_id", ctx.orgId).eq("id", input.producto_id).maybeSingle();
    if (error) throw new Error(`ver_producto: ${error.message}`);
    if (!data || !data.active) throw new ToolError("Producto no encontrado en el catálogo de este comercio.");
    return {
      id: data.id,
      nombre: data.name,
      descripcion: data.description,
      precio: Number(data.price),
      stock: data.stock,
      disponible: data.stock === null || data.stock > 0,
      atributos: data.attributes,
      variantes: ((data.variants ?? []) as VariantRow[]).filter((v) => v.active).map((v) => ({
        id: v.id, nombre: v.name, precio: Number(v.price ?? data.price), disponible: v.stock === null || v.stock > 0,
      })),
      fotos: (data.media ?? []).length,
    };
  },
};

// ── enviar_fotos_producto ───────────────────────────────────────
const fotosSchema = z.object({ producto_id: uuid, cantidad: z.number().int().min(1).max(5) }).strict();
const enviar_fotos_producto: ToolDef<typeof fotosSchema> = {
  name: "enviar_fotos_producto",
  description: "Envía al cliente hasta `cantidad` fotos del producto (máximo 5). Las fotos se envían como mensajes aparte.",
  input_schema: {
    type: "object",
    properties: { producto_id: { type: "string" }, cantidad: { type: "integer", description: "1 a 5" } },
    required: ["producto_id", "cantidad"],
    additionalProperties: false,
  },
  schema: fotosSchema,
  async run(ctx, input) {
    const prod = must(await ctx.db.from("products").select("id, name").eq("org_id", ctx.orgId).eq("id", input.producto_id).maybeSingle(), "producto");
    if (!prod) throw new ToolError("Producto no encontrado en el catálogo de este comercio.");
    const media = must(
      await ctx.db.from("product_media").select("storage_path").eq("org_id", ctx.orgId).eq("product_id", input.producto_id).order("sort_order").limit(input.cantidad),
      "product_media",
    ) ?? [];
    for (const m of media) {
      const url = ctx.db.storage.from("catalogo").getPublicUrl(m.storage_path).data.publicUrl;
      ctx.extraReplies.push({ type: "image", body: prod.name, mediaUrl: url });
    }
    return { enviadas: media.length, nota: media.length ? undefined : "Este producto no tiene fotos cargadas." };
  },
};

// ── consultar_tiendas ───────────────────────────────────────────
const tiendasSchema = z.object({ ubicacion: z.string().max(200).nullable() }).strict();
const consultar_tiendas: ToolDef<typeof tiendasSchema> = {
  name: "consultar_tiendas",
  description: "Tiendas del comercio con dirección, horarios, si están abiertas ahora y si hacen envíos. `ubicacion` filtra por ciudad o sector si el cliente la menciona.",
  input_schema: {
    type: "object",
    properties: { ubicacion: { ...nullable("string"), description: "Ciudad o sector del cliente, o null" } },
    required: ["ubicacion"],
    additionalProperties: false,
  },
  schema: tiendasSchema,
  async run(ctx, input) {
    const stores = must(
      await ctx.db.from("stores").select("id, name, address, city, phone, hours, delivery_available, delivery_notes").eq("org_id", ctx.orgId).eq("active", true).order("name"),
      "stores",
    ) ?? [];
    const u = input.ubicacion ? normalize(input.ubicacion) : "";
    const filtered = u ? stores.filter((s) => normalize(`${s.city ?? ""} ${s.address ?? ""} ${s.name}`).includes(u)) : [];
    const list = filtered.length ? filtered : stores;
    return {
      tiendas: list.map((s) => ({
        id: s.id,
        nombre: s.name,
        direccion: [s.address, s.city].filter(Boolean).join(", ") || null,
        telefono: s.phone,
        horario: formatHours(s.hours as Hours),
        abierta_ahora: isOpenNow(s.hours as Hours, ctx.now(), ctx.timezone),
        envios: s.delivery_available,
        notas_envio: s.delivery_notes,
      })),
    };
  },
};

// ── consultar_politicas ─────────────────────────────────────────
const politicasSchema = z.object({ tema: z.string().min(1).max(100) }).strict();
const consultar_politicas: ToolDef<typeof politicasSchema> = {
  name: "consultar_politicas",
  description: "Políticas del comercio (envíos, devoluciones, garantía, otros) y preguntas frecuentes relacionadas con un tema.",
  input_schema: {
    type: "object",
    properties: { tema: { type: "string", description: "p. ej. 'envios', 'devoluciones', 'garantia', 'formas de pago'" } },
    required: ["tema"],
    additionalProperties: false,
  },
  schema: politicasSchema,
  async run(ctx, input) {
    const p = must(await ctx.db.from("business_profiles").select("policies, faqs").eq("org_id", ctx.orgId).maybeSingle(), "business_profiles");
    const policies = Object.entries((p?.policies ?? {}) as Record<string, string>).filter(([, v]) => v);
    const faqs = ((p?.faqs ?? []) as { q: string; a: string }[]);
    const t = normalize(input.tema).replace(/s\b/g, ""); // envios → envio
    const hit = (s: string) => normalize(s).includes(t);
    const pol = policies.filter(([k, v]) => hit(k) || hit(v)).map(([k, v]) => `${k}: ${v}`);
    const fq = faqs.filter((f) => hit(f.q) || hit(f.a)).map((f) => `${f.q} — ${f.a}`);
    const informacion = [...pol, ...fq];
    if (informacion.length) return { informacion };
    return { informacion: policies.map(([k, v]) => `${k}: ${v}`), nota: "No hay información específica sobre ese tema." };
  },
};

// ── actualizar_pedido ───────────────────────────────────────────
const pedidoSchema = z.object({
  items: z.array(z.object({
    producto_id: uuid,
    variante_id: uuid.nullable(),
    cantidad: z.number().int().min(1).max(99),
  }).strict()).min(1).max(20),
  entrega: z.object({
    modo: z.enum(["retiro", "envio"]),
    direccion: z.string().max(300).nullable(),
    tienda_id: uuid.nullable(),
  }).strict().nullable(),
  notas: z.string().max(500).nullable(),
}).strict();

const actualizar_pedido: ToolDef<typeof pedidoSchema> = {
  name: "actualizar_pedido",
  description: "Crea o reemplaza el pedido en borrador del cliente con la lista COMPLETA de ítems (producto, variante y cantidad) y la entrega. El sistema pone los precios del catálogo y calcula el total: no envíes precios. Devuelve el resumen con el total.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        description: "Lista completa de ítems del pedido",
        items: {
          type: "object",
          properties: {
            producto_id: { type: "string" },
            variante_id: { ...nullable("string"), description: "id de la variante elegida, o null" },
            cantidad: { type: "integer", description: "1 a 99" },
          },
          required: ["producto_id", "variante_id", "cantidad"],
          additionalProperties: false,
        },
      },
      entrega: {
        type: ["object", "null"],
        description: "Cómo recibe el pedido, o null si aún no se sabe",
        properties: {
          modo: { type: "string", enum: ["retiro", "envio"] },
          direccion: { ...nullable("string"), description: "Dirección de envío, o null" },
          tienda_id: { ...nullable("string"), description: "Tienda de retiro, o null" },
        },
        required: ["modo", "direccion", "tienda_id"],
        additionalProperties: false,
      },
      notas: { ...nullable("string"), description: "Notas del cliente (dedicatoria, color, etc.), o null" },
    },
    required: ["items", "entrega", "notas"],
    additionalProperties: false,
  },
  schema: pedidoSchema,
  async run(ctx, input) {
    const c = await getCase(ctx.db, ctx.orgId, ctx.caseId);
    if (["pago_por_confirmar", "confirmado", "requiere_atencion"].includes(c.status)) {
      throw new ToolError("El pedido ya no se puede modificar en este estado; una persona del equipo debe ayudar.");
    }
    const ids = [...new Set(input.items.map((i) => i.producto_id))];
    const products = must(
      await ctx.db.from("products").select("id, name, price, stock, active").eq("org_id", ctx.orgId).in("id", ids),
      "products",
    ) ?? [];
    const byId = new Map(products.filter((p) => p.active).map((p) => [p.id, p]));
    const variantIds = input.items.map((i) => i.variante_id).filter((v): v is string => Boolean(v));
    const variants = variantIds.length
      ? must(await ctx.db.from("product_variants").select("id, product_id, name, price, stock, active").eq("org_id", ctx.orgId).in("id", variantIds), "variants") ?? []
      : [];
    const vById = new Map(variants.filter((v) => v.active).map((v) => [v.id, v]));

    const rows = input.items.map((i) => {
      const p = byId.get(i.producto_id);
      if (!p) throw new ToolError(`Producto no disponible en este comercio: ${i.producto_id}`);
      let name = p.name as string;
      let price = Number(p.price);
      let stock = p.stock as number | null;
      if (i.variante_id) {
        const v = vById.get(i.variante_id);
        if (!v || v.product_id !== p.id) throw new ToolError(`Variante no válida para ${p.name}.`);
        name = `${p.name} (${v.name})`;
        if (v.price != null) price = Number(v.price);
        stock = v.stock ?? stock;
      }
      if (stock !== null && stock < i.cantidad) throw new ToolError(`Stock insuficiente de ${name}: quedan ${stock}.`);
      return { org_id: ctx.orgId, product_id: p.id, variant_id: i.variante_id, name, quantity: i.cantidad, unit_price: price };
    });

    let storeId: string | null = null;
    if (input.entrega?.tienda_id) {
      const st = must(await ctx.db.from("stores").select("id").eq("org_id", ctx.orgId).eq("id", input.entrega.tienda_id).maybeSingle(), "store");
      if (!st) throw new ToolError("Tienda no encontrada.");
      storeId = st.id;
    }
    const delivery = input.entrega
      ? { modo: input.entrega.modo, direccion: input.entrega.direccion, tienda_id: input.entrega.tienda_id }
      : {};

    let order = await loadOpenOrder(ctx.db, ctx.orgId, ctx.caseId);
    if (!order) {
      const ins = must(
        await ctx.db.from("orders").insert({
          org_id: ctx.orgId, case_id: ctx.caseId, contact_id: ctx.contactId, status: "borrador",
          delivery, store_id: storeId, notes: input.notas,
        }).select("id").single(),
        "order_create",
      );
      order = { id: ins!.id } as OrderState;
    } else {
      must(await ctx.db.from("orders").update({ status: "borrador", delivery, store_id: storeId, notes: input.notas }).eq("org_id", ctx.orgId).eq("id", order.id).select("id"), "order_update");
      must(await ctx.db.from("order_items").delete().eq("org_id", ctx.orgId).eq("order_id", order.id).select("id"), "order_items_clear");
    }
    must(await ctx.db.from("order_items").insert(rows.map((r) => ({ ...r, order_id: order!.id }))).select("id"), "order_items_insert");
    must(await ctx.db.rpc("recalc_order", { p_order: order.id }), "recalc_order");

    if (["nuevo", "en_conversacion", "esperando_pago"].includes(c.status)) await moveCase(ctx.db, c, "cotizacion", "pedido armado por Teo");
    const fresh = (await loadOpenOrder(ctx.db, ctx.orgId, ctx.caseId))!;
    return { pedido: orderView(fresh) };
  },
};

// ── confirmar_pedido ────────────────────────────────────────────
const vacio = z.object({}).strict();
const confirmar_pedido: ToolDef<typeof vacio> = {
  name: "confirmar_pedido",
  description: "Confirma el pedido en borrador cuando el cliente aceptó el resumen. Pasa el caso a 'Esperando pago' y devuelve el total y los datos de pago para enviar al cliente.",
  input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  schema: vacio,
  async run(ctx) {
    const order = await loadOpenOrder(ctx.db, ctx.orgId, ctx.caseId);
    if (!order || !order.items.length) throw new ToolError("No hay un pedido con productos para confirmar. Usa actualizar_pedido primero.");
    const settings = must(await ctx.db.from("agent_settings").select("escalation_amount_usd").eq("org_id", ctx.orgId).maybeSingle(), "agent_settings");
    const limit = settings?.escalation_amount_usd != null ? Number(settings.escalation_amount_usd) : null;
    if (limit !== null && order.total > limit) {
      await escalateCase(ctx.db, ctx.orgId, ctx.caseId, `pedido de ${order.total} supera el monto de escalamiento`);
      ctx.escalated = true;
      return { escalado: true, motivo: "El pedido supera el monto que revisa una persona. Avisa al cliente que alguien del equipo le escribirá para confirmarlo.", pedido: orderView(order) };
    }
    const c = await getCase(ctx.db, ctx.orgId, ctx.caseId);
    if (c.status !== "esperando_pago") await moveCase(ctx.db, c, "esperando_pago", "pedido confirmado por el cliente");
    must(await ctx.db.from("orders").update({ status: "confirmado" }).eq("org_id", ctx.orgId).eq("id", order.id).select("id"), "order_confirm");
    const pms = must(
      await ctx.db.from("payment_methods").select("type, label, details, instructions").eq("org_id", ctx.orgId).eq("active", true).order("sort_order"),
      "payment_methods",
    ) ?? [];
    return {
      pedido: orderView({ ...order, status: "confirmado" }),
      metodos_pago: pms.map((m) => ({ nombre: m.label, tipo: m.type, datos: m.details, instrucciones: m.instructions })),
      nota: pms.length ? undefined : "El comercio no tiene métodos de pago cargados: di que el equipo enviará los datos de pago.",
    };
  },
};

// ── registrar_comprobante ───────────────────────────────────────
const comprobanteSchema = z.object({ mensaje_id: uuid.nullable() }).strict();
const registrar_comprobante: ToolDef<typeof comprobanteSchema> = {
  name: "registrar_comprobante",
  description: "Adjunta al pedido la imagen o documento que el cliente envió como comprobante de pago y pasa el caso a 'Pago por confirmar'. Solo cuando el caso está Esperando pago. Usa mensaje_id null para tomar el último adjunto del cliente.",
  input_schema: {
    type: "object",
    properties: { mensaje_id: { ...nullable("string"), description: "id del mensaje con el adjunto, o null" } },
    required: ["mensaje_id"],
    additionalProperties: false,
  },
  schema: comprobanteSchema,
  async run(ctx, input) {
    const c = await getCase(ctx.db, ctx.orgId, ctx.caseId);
    if (c.status !== "esperando_pago") throw new ToolError("Solo se registra un comprobante cuando el pedido está esperando pago.");
    let q = ctx.db.from("messages").select("id, media_path").eq("org_id", ctx.orgId).eq("conversation_id", ctx.conversationId)
      .eq("direction", "in").in("type", ["image", "document"]);
    q = input.mensaje_id ? q.eq("id", input.mensaje_id) : q.order("created_at", { ascending: false }).limit(1);
    const msg = (must(await q, "messages") ?? [])[0];
    if (!msg) throw new ToolError("No encontré la imagen del comprobante en este chat.");
    const order = await loadOpenOrder(ctx.db, ctx.orgId, ctx.caseId);
    if (!order || order.status !== "confirmado") throw new ToolError("No hay un pedido confirmado para asociar el comprobante.");
    must(await ctx.db.from("payments").insert({
      org_id: ctx.orgId, order_id: order.id, receipt_path: msg.media_path, receipt_message_id: msg.id, status: "pendiente",
    }).select("id"), "payment_insert");
    await moveCase(ctx.db, c, "pago_por_confirmar", "comprobante recibido");
    return { registrado: true, nota: "Dile al cliente que lo recibimos y lo estamos verificando. No digas que el pago está confirmado." };
  },
};

// ── actualizar_datos_cliente ────────────────────────────────────
const datosSchema = z.object({
  nombre: z.string().min(1).max(120).nullable(),
  direccion: z.string().min(1).max(300).nullable(),
  email: z.string().email().max(200).nullable(),
}).strict();
const actualizar_datos_cliente: ToolDef<typeof datosSchema> = {
  name: "actualizar_datos_cliente",
  description: "Guarda en la ficha del cliente su nombre, dirección o email cuando los comparte. Usa null en los campos que no cambian.",
  input_schema: {
    type: "object",
    properties: { nombre: nullable("string"), direccion: nullable("string"), email: nullable("string") },
    required: ["nombre", "direccion", "email"],
    additionalProperties: false,
  },
  schema: datosSchema,
  async run(ctx, input) {
    const patch: Record<string, string> = {};
    if (input.nombre) patch.name = input.nombre;
    if (input.direccion) patch.address = input.direccion;
    if (input.email) patch.email = input.email;
    if (!Object.keys(patch).length) return { actualizado: false };
    must(await ctx.db.from("contacts").update(patch).eq("org_id", ctx.orgId).eq("id", ctx.contactId).select("id"), "contact_update");
    return { actualizado: true };
  },
};

// ── escalar_a_humano ────────────────────────────────────────────
const escalarSchema = z.object({ motivo: z.string().min(1).max(300) }).strict();
const escalar_a_humano: ToolDef<typeof escalarSchema> = {
  name: "escalar_a_humano",
  description: "Pasa la conversación a una persona del equipo (caso 'Requiere atención'). Después de esto ya no respondes solo en este caso.",
  input_schema: {
    type: "object",
    properties: { motivo: { type: "string", description: "Por qué se escala, breve" } },
    required: ["motivo"],
    additionalProperties: false,
  },
  schema: escalarSchema,
  async run(ctx, input) {
    await escalateCase(ctx.db, ctx.orgId, ctx.caseId, input.motivo);
    ctx.escalated = true;
    return { escalado: true };
  },
};

// ── marcar_consulta_resuelta ────────────────────────────────────
const marcar_consulta_resuelta: ToolDef<typeof vacio> = {
  name: "marcar_consulta_resuelta",
  description: "Cierra el caso como 'Resuelto' cuando era solo una consulta (sin pedido) y el cliente quedó atendido.",
  input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  schema: vacio,
  async run(ctx) {
    const c = await getCase(ctx.db, ctx.orgId, ctx.caseId);
    const order = await loadOpenOrder(ctx.db, ctx.orgId, ctx.caseId);
    if (c.type !== "consulta" || (order && order.items.length)) throw new ToolError("Este caso tiene una venta en curso; no se puede cerrar como consulta.");
    await moveCase(ctx.db, c, "resuelto", "consulta resuelta");
    return { resuelto: true };
  },
};

// Orden fijo (determinista) para no invalidar el cache del prompt.
const ALL = [
  buscar_productos, ver_producto, enviar_fotos_producto, consultar_tiendas, consultar_politicas,
  actualizar_pedido, confirmar_pedido, registrar_comprobante, actualizar_datos_cliente,
  escalar_a_humano, marcar_consulta_resuelta,
] as ToolDef<z.ZodType>[];

export const TOOL_DEFS: LlmTool[] = ALL.map(({ name, description, input_schema }) => ({ name, description, input_schema }));

export type ToolOutcome = { ok: true; result: unknown } | { ok: false; error: string; internal?: boolean; detail?: string };

/** Ejecuta una herramienta: valida la entrada y convierte errores en un resultado para el modelo. */
export async function executeTool(ctx: ToolContext, name: string, input: unknown): Promise<ToolOutcome> {
  const def = ALL.find((t) => t.name === name);
  if (!def) return { ok: false, error: `Herramienta desconocida: ${name}` };
  const parsed = def.schema.safeParse(input ?? {});
  if (!parsed.success) {
    return { ok: false, error: `Entrada inválida: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`).join("; ")}` };
  }
  try {
    return { ok: true, result: await def.run(ctx, parsed.data) };
  } catch (e) {
    if (e instanceof ToolError) return { ok: false, error: e.message };
    return { ok: false, error: "Error interno al ejecutar la herramienta.", internal: true, detail: e instanceof Error ? e.message : String(e) };
  }
}
