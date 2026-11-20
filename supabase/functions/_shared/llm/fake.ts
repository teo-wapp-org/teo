// FakeProvider: LLM determinista basado en reglas. Sirve para tests y para que el simulador funcione
// de punta a punta sin API key. Imita el contrato de tool use: pide herramientas paso a paso y
// redacta la respuesta final SOLO con datos que devolvieron las herramientas (nunca inventa precios).
import { formatUsd, keywords, normalize } from "../agent/text.ts";
import type { LlmBlock, LlmMessage, LlmProvider, LlmRequest, LlmResponse, LlmToolResultBlock, LlmToolUseBlock } from "./types.ts";

export type FakeIntent = "escalar" | "comprar" | "tiendas" | "politicas" | "producto" | "saludo" | "otro";

export function classify(text: string): FakeIntent {
  const t = normalize(text);
  if (/\b(humano|persona|asesor|asesora|reclamo|queja|operador)\b/.test(t)) return "escalar";
  if (/\b(quiero|comprar|compro|llevo|pedido|pedir|ordenar)\b/.test(t)) return "comprar";
  if (/\b(horario|horarios|abren|cierran|abierto|abierta|direccion|ubicados|ubicacion|donde|tienda|tiendas|local)\b/.test(t)) return "tiendas";
  if (/\b(envio|envios|devolucion|devoluciones|garantia|cambio|cambios|politica)\b/.test(t)) return "politicas";
  if (keywords(text).length > 0) return "producto";
  if (/^(hola|buenas|buenos|hey|saludos)\b/.test(t)) return "saludo";
  return "otro";
}

const textOfContent = (c: LlmMessage["content"]): string =>
  typeof c === "string" ? c : c.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");

const isCustomerMessage = (m: LlmMessage) =>
  m.role === "user" && (typeof m.content === "string" || m.content.some((b) => b.type === "text"));

type Step = { tool: LlmToolUseBlock; result: unknown; isError: boolean };

function parse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function approxTokens(req: LlmRequest): number {
  const chars = JSON.stringify(req.messages).length + req.system.reduce((n, b) => n + b.text.length, 0);
  return Math.ceil(chars / 4);
}

export class FakeProvider implements LlmProvider {
  readonly name = "fake";

  complete(req: LlmRequest): Promise<LlmResponse> {
    const content = req.jsonSchema ? this.suggest(req) : this.agent(req);
    const hasTool = content.some((b) => b.type === "tool_use");
    return Promise.resolve({
      content,
      stopReason: hasTool ? "tool_use" : "end_turn",
      model: "fake-teo-1",
      usage: { inputTokens: approxTokens(req), outputTokens: Math.ceil(JSON.stringify(content).length / 4), cacheReadTokens: 0, cacheWriteTokens: 0 },
    });
  }

  private agent(req: LlmRequest): LlmBlock[] {
    const msgs = req.messages;
    const lastIdx = msgs.findLastIndex(isCustomerMessage);
    const customer = lastIdx >= 0 ? textOfContent(msgs[lastIdx].content) : "";
    const history = msgs.slice(0, Math.max(lastIdx, 0)).filter((m) => m.role === "user").map((m) => textOfContent(m.content)).reverse();

    // herramientas ya usadas en este turno, con su resultado
    const steps: Step[] = [];
    const results = new Map<string, LlmToolResultBlock>();
    for (const m of msgs.slice(lastIdx + 1)) {
      if (m.role === "user" && typeof m.content !== "string") {
        for (const b of m.content) if (b.type === "tool_result") results.set((b as LlmToolResultBlock).tool_use_id, b as LlmToolResultBlock);
      }
    }
    let n = 0;
    for (const m of msgs) {
      if (m.role === "assistant" && typeof m.content !== "string") for (const b of m.content) if (b.type === "tool_use") n++;
    }
    for (const m of msgs.slice(lastIdx + 1)) {
      if (m.role !== "assistant" || typeof m.content === "string") continue;
      for (const b of m.content) {
        if (b.type !== "tool_use") continue;
        const r = results.get((b as LlmToolUseBlock).id);
        steps.push({ tool: b as LlmToolUseBlock, result: r ? parse(r.content) : null, isError: Boolean(r?.is_error) });
      }
    }
    const call = (name: string, input: Record<string, unknown>): LlmBlock[] => [
      { type: "tool_use", id: `toolu_fake_${n + 1}`, name, input },
    ];
    const say = (text: string): LlmBlock[] => [{ type: "text", text }];
    const last = steps.at(-1);

    switch (classify(customer)) {
      case "escalar":
        if (!last) return call("escalar_a_humano", { motivo: "El cliente pidió hablar con una persona" });
        return say("Claro, te comunico con una persona del equipo. En un momento te escriben.");

      case "comprar": {
        const qty = Number(normalize(customer).match(/\b(\d{1,3})\b/)?.[1] ?? 1);
        const kw = keywords(customer).length ? keywords(customer) : (history.map(keywords).find((k) => k.length) ?? []);
        if (!last) {
          if (!kw.length) return say("¡Con gusto! ¿Qué producto te gustaría pedir?");
          return call("buscar_productos", { query: kw.join(" "), categoria: null, precio_max: null });
        }
        if (last.tool.name === "buscar_productos") {
          const prods = (last.result as { productos?: { id: string; nombre: string }[] })?.productos ?? [];
          if (last.isError || !prods.length) return say("No encontré ese producto en el catálogo. ¿Me dices cuál buscas?");
          return call("actualizar_pedido", {
            items: [{ producto_id: prods[0].id, variante_id: null, cantidad: qty }],
            entrega: null,
            notas: null,
          });
        }
        if (last.tool.name === "actualizar_pedido") {
          if (last.isError) return say(`No pude armar tu pedido: ${(last.result as { error?: string })?.error ?? "error"}. ¿Lo revisamos?`);
          return call("confirmar_pedido", {});
        }
        if (last.tool.name === "confirmar_pedido") {
          const r = last.result as {
            error?: string;
            pedido?: { items: { nombre: string; cantidad: number; subtotal: number }[]; total: number };
            metodos_pago?: { nombre: string; instrucciones: string | null; datos: Record<string, unknown> }[];
          };
          if (last.isError || !r?.pedido) return say("Tuve un inconveniente al confirmar tu pedido. Ya le aviso al equipo.");
          const items = r.pedido.items.map((i) => `${i.cantidad} x ${i.nombre} (${formatUsd(i.subtotal)})`).join(", ");
          const pagos = r.metodos_pago?.length
            ? r.metodos_pago.map((p) => `${p.nombre}${p.instrucciones ? `: ${p.instrucciones}` : ""}`).join(" / ")
            : "en un momento te compartimos los datos de pago";
          return say(`¡Listo! Tu pedido: ${items}. Total: ${formatUsd(r.pedido.total)}. Pago: ${pagos}. Cuando pagues, envíanos el comprobante por aquí.`);
        }
        return say("¿Algo más que quieras agregar?");
      }

      case "producto": {
        if (!last) return call("buscar_productos", { query: keywords(customer).join(" "), categoria: null, precio_max: null });
        const prods = (last.result as { productos?: { nombre: string; precio: number; disponible: boolean }[] })?.productos ?? [];
        if (!prods.length) return say("No encontré eso en nuestro catálogo. ¿Buscas algo más?");
        const lista = prods.slice(0, 3).map((p) => `${p.nombre}: ${formatUsd(p.precio)}${p.disponible ? "" : " (agotado)"}`).join("\n");
        return say(`¡Sí, tenemos! \n${lista}\n¿Te gustaría pedir alguno?`);
      }

      case "tiendas": {
        if (!last) return call("consultar_tiendas", { ubicacion: null });
        const tiendas = (last.result as { tiendas?: { nombre: string; direccion: string | null; abierta_ahora: boolean }[] })?.tiendas ?? [];
        if (!tiendas.length) return say("Por ahora no tengo registrada la dirección. Le pido al equipo que te confirme.");
        return say(tiendas.map((t) => `${t.nombre}${t.direccion ? ` (${t.direccion})` : ""}: ${t.abierta_ahora ? "abierta ahora" : "cerrada ahora"}`).join("\n"));
      }

      case "politicas": {
        if (!last) return call("consultar_politicas", { tema: keywords(customer)[0] ?? "envios" });
        const txt = (last.result as { informacion?: string[] })?.informacion ?? [];
        return say(txt.length ? txt.slice(0, 2).join("\n") : "Déjame confirmarlo con el equipo y te aviso.");
      }

      case "saludo":
        return say("¡Hola! ¿En qué te puedo ayudar hoy?");

      default:
        return say("Disculpa, no te entendí bien. ¿Me cuentas qué producto buscas?");
    }
  }

  private suggest(req: LlmRequest): LlmBlock[] {
    const lastIdx = req.messages.findLastIndex(isCustomerMessage);
    const customer = lastIdx >= 0 ? textOfContent(req.messages[lastIdx].content) : "";
    let sugerencias: { texto: string; acciones: { tipo: string; estado: string | null }[] }[];
    switch (classify(customer)) {
      case "escalar":
        sugerencias = [
          { texto: "Hola, soy del equipo. Cuéntame, ¿en qué te ayudo?", acciones: [] },
          { texto: "Gracias por escribirnos. Ya reviso tu caso y te respondo.", acciones: [] },
        ];
        break;
      case "comprar":
        sugerencias = [
          { texto: "¡Perfecto! Te envío los datos de pago para confirmar tu pedido.", acciones: [{ tipo: "mover_estado", estado: "esperando_pago" }] },
          { texto: "¡Genial! ¿Lo retiras en tienda o te lo enviamos?", acciones: [{ tipo: "mover_estado", estado: "cotizacion" }] },
        ];
        break;
      default:
        sugerencias = [
          { texto: "¡Hola! ¿En qué te puedo ayudar hoy?", acciones: [] },
          { texto: "Con gusto te ayudo. ¿Qué producto buscas?", acciones: [{ tipo: "mover_estado", estado: "en_conversacion" }] },
        ];
    }
    return [{ type: "text", text: JSON.stringify({ sugerencias }) }];
  }
}
