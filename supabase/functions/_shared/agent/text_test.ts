import { assertEquals, assertStringIncludes } from "@std/assert";
import { formatUsd, keywords, moneyAmounts, sanitizeReply, unknownAmounts } from "./text.ts";
import { formatHours, isOpenNow } from "./hours.ts";
import { pathTo } from "./cases.ts";
import { buildHistory } from "./prompt.ts";

Deno.test("keywords: quita saludos y verbos de compra", () => {
  assertEquals(keywords("hola, tienen torta?"), ["torta"]);
  assertEquals(keywords("la quiero"), []);
  assertEquals(keywords("Quiero 2 tortas de chocolate"), ["tortas", "chocolate"]);
});

Deno.test("formatUsd y montos", () => {
  assertEquals(formatUsd(18.5), "$18.50");
  assertEquals(moneyAmounts("Total: $18,5 y otro de 3 dólares").sort(), ["18.50", "3.00"]);
});

Deno.test("guardrail de precios: detecta montos que no vienen de una fuente", () => {
  const sources = ['{"precio":18.5,"cantidad":2,"id":"a1b2"}', "Caso #1. Envío a domicilio: $3", "Torta: $20.00 [id 1f2e]"];
  assertEquals(unknownAmounts("Cuesta $18.50 + $3 de envío; la otra $20", sources), []);
  assertEquals(unknownAmounts("Te la dejo en $15", sources), ["15.00"]);
  assertEquals(unknownAmounts("Son $2", sources), ["2.00"]); // cantidad no es precio
  assertEquals(unknownAmounts("Total $1", sources), ["1.00"]); // "Caso #1" no es precio
});

Deno.test("sanitizeReply: formato WhatsApp y URLs permitidas", () => {
  const out = sanitizeReply("## Hola\n**Precio**: [ver](https://evil.com/x) y https://mitienda.ec/p", ["mitienda.ec"]);
  assertStringIncludes(out, "*Precio*");
  assertStringIncludes(out, "[enlace removido]");
  assertStringIncludes(out, "https://mitienda.ec/p");
  assertEquals(out.includes("##"), false);
  assertEquals(sanitizeReply("x".repeat(5000)).length, 1200);
});

Deno.test("horarios en America/Guayaquil", () => {
  const hours = { lun: [{ open: "09:00", close: "18:00" }] };
  // lunes 2026-11-23 15:00 UTC = 10:00 en Guayaquil (UTC-5)
  assertEquals(isOpenNow(hours, new Date("2026-11-23T15:00:00Z")), true);
  // lunes 2026-11-23 13:00 UTC = 08:00 en Guayaquil
  assertEquals(isOpenNow(hours, new Date("2026-11-23T13:00:00Z")), false);
  assertEquals(isOpenNow({}, new Date()), null);
  assertStringIncludes(formatHours(hours), "Lun 09:00-18:00");
});

Deno.test("pathTo: camino válido de estados", () => {
  assertEquals(pathTo("nuevo", "esperando_pago"), ["en_conversacion", "esperando_pago"]);
  assertEquals(pathTo("cotizacion", "esperando_pago"), ["esperando_pago"]);
  assertEquals(pathTo("esperando_pago", "requiere_atencion"), ["requiere_atencion"]);
  assertEquals(pathTo("resuelto", "cotizacion"), null);
});

Deno.test("buildHistory: fusiona roles y empieza con el cliente", () => {
  const h = buildHistory([
    { direction: "out", author: "teo", type: "text", body: "hola", media_path: null },
    { direction: "in", author: "cliente", type: "text", body: "a", media_path: null },
    { direction: "in", author: "cliente", type: "image", body: null, media_path: "x/y.jpg" },
    { direction: "out", author: "user:123", type: "text", body: "listo", media_path: null },
  ]);
  assertEquals(h.length, 2);
  assertEquals(h[0], { role: "user", content: "a\n[imagen adjunta]" });
  assertStringIncludes(String(h[1].content), "persona del equipo");
});
