import { describe, expect, it } from "vitest";
import {
  allowedTargets, canTransition, contactDisplayName, filterCases, formatPhone, groupByColumn, outboundStatus,
  suggestionOutcome, sumAmounts, transitionError, windowState, authorKind, type BoardCase,
} from "./casos";

const mk = (p: Partial<BoardCase>): BoardCase => ({
  id: crypto.randomUUID(), number: 1, status: "nuevo", type: "consulta", estimated_amount: null,
  status_changed_at: "2026-11-20T10:00:00Z", assignee_id: null, handled_by: "teo", contact_name: "Ana",
  last_message: null, last_message_at: null, ...p,
});

describe("transiciones (réplica de case_transition_allowed)", () => {
  it("permite el camino feliz", () => {
    expect(canTransition("nuevo", "en_conversacion")).toBe(true);
    expect(canTransition("cotizacion", "esperando_pago")).toBe(true);
    expect(canTransition("pago_por_confirmar", "confirmado")).toBe(true);
    expect(canTransition("confirmado", "cerrado_ganado")).toBe(true);
  });
  it("rechaza saltos inválidos y desde cerrados", () => {
    expect(canTransition("nuevo", "confirmado")).toBe(false);
    expect(canTransition("esperando_pago", "confirmado")).toBe(false);
    expect(canTransition("cerrado_ganado", "requiere_atencion")).toBe(false);
    expect(canTransition("nuevo", "nuevo")).toBe(false);
  });
  it("requiere_atencion es alcanzable desde cualquier abierto y vuelve a todo menos nuevo", () => {
    expect(canTransition("cotizacion", "requiere_atencion")).toBe(true);
    expect(canTransition("requiere_atencion", "confirmado")).toBe(true);
    expect(canTransition("requiere_atencion", "nuevo")).toBe(false);
  });
  it("lista destinos y explica errores", () => {
    expect(allowedTargets("confirmado")).toEqual(["requiere_atencion", "cerrado_ganado"]);
    expect(transitionError("nuevo", "confirmado")).toContain("no se puede pasar a “Confirmado”");
    expect(transitionError("cerrado_ganado", "nuevo")).toMatch(/cerrado/);
  });
});

describe("tablero", () => {
  it("agrupa por columna, oculta cerrados y suma montos", () => {
    const cases = [
      mk({ status: "nuevo" }),
      mk({ status: "esperando_pago", estimated_amount: 10.5 }),
      mk({ status: "esperando_pago", estimated_amount: 20.25 }),
      mk({ status: "resuelto" }),
    ];
    const g = groupByColumn(cases);
    expect(g.map((x) => x.column.id)).not.toContain("cerrado");
    const ep = g.find((x) => x.column.id === "esperando_pago")!;
    expect(ep.count).toBe(2);
    expect(ep.total).toBe(30.75);
    const withClosed = groupByColumn(cases, { showClosed: true });
    expect(withClosed.find((x) => x.column.id === "cerrado")!.count).toBe(1);
  });
  it("ordena por tiempo en columna (más antiguo primero)", () => {
    const a = mk({ number: 1, status_changed_at: "2026-11-20T12:00:00Z" });
    const b = mk({ number: 2, status_changed_at: "2026-11-20T08:00:00Z" });
    expect(groupByColumn([a, b])[0].cases.map((c) => c.number)).toEqual([2, 1]);
  });
  it("filtra por míos, tipo y búsqueda", () => {
    const cases = [mk({ number: 7, assignee_id: "u1", type: "venta", contact_name: "Lucía" }), mk({ number: 8, contact_name: "Pedro" })];
    expect(filterCases(cases, { mine: true, userId: "u1" })).toHaveLength(1);
    expect(filterCases(cases, { type: "venta" })).toHaveLength(1);
    expect(filterCases(cases, { q: "#8" })[0].contact_name).toBe("Pedro");
    expect(filterCases(cases, { q: "lucí" })).toHaveLength(1);
  });
  it("suma montos con nulos", () => {
    expect(sumAmounts([{ estimated_amount: null }, { estimated_amount: 1.1 }, { estimated_amount: 2.2 }])).toBe(3.3);
  });
});

describe("chat", () => {
  it("nombre visible del contacto", () => {
    expect(contactDisplayName({ name: " ", profile_name: "Ana WA", wa_id: "593991234567" })).toBe("Ana WA");
    expect(contactDisplayName({ wa_id: "593991234567" })).toBe("+593 99 123 4567");
    expect(formatPhone("15551234")).toBe("+15551234");
  });
  it("ventana de 24 h", () => {
    const now = Date.parse("2026-11-20T12:00:00Z");
    expect(windowState("2026-11-20T10:00:00Z", "whatsapp", now)).toEqual({ open: true, hoursLeft: 22 });
    expect(windowState("2026-11-19T10:00:00Z", "whatsapp", now).open).toBe(false);
    expect(windowState(null, "simulador", now).open).toBe(true);
  });
  it("estado inicial del mensaje del operador por canal", () => {
    expect(outboundStatus("whatsapp")).toBe("queued");
    expect(outboundStatus("simulador")).toBe("sent");
  });
  it("autor y uso de sugerencias", () => {
    expect(authorKind("user:abc")).toBe("operador");
    expect(authorKind("teo")).toBe("teo");
    expect(suggestionOutcome("Hola ", "Hola")).toBe("usada");
    expect(suggestionOutcome("Hola", "Hola, ¿cómo estás?")).toBe("editada");
  });
});
