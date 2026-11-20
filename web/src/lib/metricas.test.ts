import { describe, expect, it } from "vitest";
import { computeKpis, dailySeries, median, parseRange, reached, type MetricCase } from "./metricas";

const c = (id: string, p: Partial<MetricCase>): MetricCase => ({ id, type: "venta", status: "nuevo", opened_at: "2026-11-19T15:00:00Z", closed_at: null, ...p });

describe("KPIs", () => {
  it("reached usa historial y estado actual", () => {
    expect(reached("cerrado_perdido", ["esperando_pago"], "esperando_pago")).toBe(true);
    expect(reached("cotizacion", [], "esperando_pago")).toBe(false);
    expect(reached("confirmado", [], "esperando_pago")).toBe(true);
    expect(reached("requiere_atencion", [], "confirmado")).toBe(false);
  });
  it("calcula conversión, llegada a pago, autonomía, ventas y tiempos", () => {
    const k = computeKpis({
      conversaciones: 5,
      cases: [
        c("a", { status: "confirmado" }),
        c("b", { status: "esperando_pago" }),
        c("c", { status: "cotizacion" }),
        c("d", { status: "resuelto", type: "consulta", closed_at: "2026-11-19T16:00:00Z" }),
        c("e", { status: "cerrado_perdido", closed_at: "2026-11-19T16:00:00Z" }),
      ],
      events: [{ case_id: "e", to_status: "esperando_pago" }],
      humanCaseIds: new Set(["e"]),
      payments: [
        { order_id: "o1", status: "confirmado", created_at: "2026-11-19T10:00:00Z", reviewed_at: "2026-11-19T11:00:00Z", total: 25 },
        { order_id: "o1", status: "confirmado", created_at: "2026-11-19T10:00:00Z", reviewed_at: "2026-11-19T11:00:00Z", total: 25 },
        { order_id: "o2", status: "confirmado", created_at: "2026-11-19T10:00:00Z", reviewed_at: "2026-11-19T13:00:00Z", total: 10.5 },
        { order_id: "o3", status: "pendiente", created_at: "2026-11-19T10:00:00Z", reviewed_at: null, total: 99 },
      ],
      suggestions: [{ state: "usada" }, { state: "editada" }, { state: "descartada" }, { state: "nueva" }],
      teoMensajes: 40,
      teoCupo: 100,
    });
    expect(k.casos).toBe(5);
    expect(k.casosPorEstado.confirmado).toBe(1);
    expect(k.conversion).toEqual({ num: 1, den: 4, ratio: 0.25 });
    expect(k.llegadaPago.num).toBe(3); // a, b, e (por historial)
    expect(k.autonomia).toEqual({ num: 1, den: 2, ratio: 0.5 });
    expect(k.ventasConfirmadas).toBe(35.5);
    expect(k.pagosConfirmados).toBe(2);
    expect(k.tiempoConfirmacionMs).toBe(2 * 3600_000);
    expect(k.usoSugerencias.ratio).toBe(0.5);
  });
  it("sin datos devuelve ratios nulos", () => {
    const k = computeKpis({ conversaciones: 0, cases: [], events: [], humanCaseIds: new Set(), payments: [], suggestions: [], teoMensajes: 0, teoCupo: null });
    expect(k.conversion.ratio).toBeNull();
    expect(k.tiempoConfirmacionMs).toBeNull();
  });
  it("mediana, series y rango", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    const s = dailySeries(3, [{ at: "2026-11-20T15:00:00Z" }, { at: "2026-11-20T16:00:00Z", value: 2 }, { at: "2026-10-01T00:00:00Z" }], new Date("2026-11-20T18:00:00Z"));
    expect(s).toHaveLength(3);
    expect(s[2]).toEqual({ day: "2026-11-20", label: "20/11", value: 3 });
    expect(parseRange("7")).toBe(7);
    expect(parseRange("15")).toBe(30);
    expect(parseRange(undefined)).toBe(30);
  });
});
