// Utilidades de texto compartidas por el agente y el FakeProvider.

/** minúsculas, sin tildes ni signos. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set(
  (
    "hola buenas buenos dias tardes noches que tal como estas esta estan saludos gracias porfa por favor " +
    "tienen tiene tienes hay venden vende quiero quisiera queria comprar compro llevo lleva pedir pido me lo la los las " +
    "le les un una unos unas el de del al y o a en con para sin su sus mi mis tu tus es son ser si no ya " +
    "cuanto cuanta cuesta cuestan vale valen precio precios info informacion disponible disponibles algo alguna algun " +
    "ese esa eso este esta esto ahi aqui favor necesito busco buscando ver mas muy bien ok dale listo eso " +
    "quiere quieren deseo desearia podria puedo puede pueden"
  ).split(/\s+/),
);

/** Palabras con contenido (posibles nombres de producto). */
export function keywords(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

export function formatUsd(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return `$${v.toFixed(2)}`;
}

/** Montos de dinero mencionados en un texto, normalizados a 2 decimales ("$18,5" → "18.50"). */
export function moneyAmounts(text: string): string[] {
  const out = new Set<string>();
  const re = /(?:\$|usd\s*|us\$)\s*(\d{1,6}(?:[.,]\d{1,2})?)|(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:usd|dolares|dólares)/gi;
  for (const m of text.matchAll(re)) {
    const raw = (m[1] ?? m[2]).replace(",", ".");
    out.add(Number(raw).toFixed(2));
  }
  return [...out];
}

const PRICE_KEY = /precio|price|total|subtotal|envio|shipping|monto|amount/i;

/**
 * Montos "conocidos" de una fuente: si es JSON (resultado de herramienta), los valores numéricos de
 * claves de dinero (precio, total, subtotal, envío...); si es texto, los montos con $ o "dólares".
 * Así los ids, cantidades o "Caso #1" no cuelan números arbitrarios en la lista blanca.
 */
export function knownAmounts(source: string): Set<string> {
  const out = new Set<string>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    parsed = undefined;
  }
  if (parsed && typeof parsed === "object") {
    const walk = (v: unknown, key = "") => {
      if (typeof v === "number" && PRICE_KEY.test(key)) out.add(v.toFixed(2));
      else if (typeof v === "string") for (const a of moneyAmounts(v)) out.add(a);
      else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
    };
    walk(parsed);
  } else {
    for (const a of moneyAmounts(source)) out.add(a);
  }
  return out;
}

/**
 * Guardrail de precios: devuelve los montos del texto que NO aparecen en ninguna fuente de verdad
 * (contexto del comercio, resultados de herramientas, estado del pedido). Vacío = OK.
 */
export function unknownAmounts(reply: string, knownSources: string[]): string[] {
  const known = new Set<string>();
  for (const s of knownSources) for (const n of knownAmounts(s)) known.add(n);
  return moneyAmounts(reply).filter((a) => !known.has(a));
}

const MAX_REPLY = 1200;

/**
 * Validación de salida (FICHA §7.4): formato WhatsApp (sin markdown pesado), largo máximo y
 * sin URLs fuera de la lista permitida.
 */
export function sanitizeReply(text: string, allowedUrlHosts: string[] = []): string {
  let t = text
    .replace(/^#{1,6}\s*/gm, "") // títulos markdown
    .replace(/\*\*(.+?)\*\*/g, "*$1*") // negrita markdown → negrita WhatsApp
    .replace(/__(.+?)__/g, "_$1_")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1: $2") // links markdown
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  t = t.replace(/https?:\/\/[^\s)]+/g, (url) => {
    try {
      const host = new URL(url).host.replace(/^www\./, "");
      return allowedUrlHosts.some((h) => host === h || host.endsWith(`.${h}`)) ? url : "[enlace removido]";
    } catch {
      return "[enlace removido]";
    }
  });
  if (t.length > MAX_REPLY) t = `${t.slice(0, MAX_REPLY - 1).trimEnd()}…`;
  return t;
}
