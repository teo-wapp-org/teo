import { describe, expect, it } from "vitest";
import { buildChecklist, isAgentCustomized } from "./checklist";

const empty = { stores: 0, products: 0, activePaymentMethods: 0, agentCustomized: false, whatsappConnected: false };

describe("buildChecklist", () => {
  it("comercio nuevo: solo el primer paso", () => {
    const steps = buildChecklist(empty);
    expect(steps).toHaveLength(6);
    expect(steps.filter((s) => s.done).map((s) => s.id)).toEqual(["comercio"]);
  });
  it("marca cada paso según los datos", () => {
    const steps = buildChecklist({ stores: 2, products: 1, activePaymentMethods: 1, agentCustomized: true, whatsappConnected: true });
    expect(steps.every((s) => s.done)).toBe(true);
    const parcial = buildChecklist({ ...empty, stores: 1, activePaymentMethods: 0 });
    expect(parcial.find((s) => s.id === "tiendas")?.done).toBe(true);
    expect(parcial.find((s) => s.id === "pagos")?.done).toBe(false);
  });
});

describe("isAgentCustomized", () => {
  const created = "2026-11-20T10:00:00Z";
  it("con saludo", () => expect(isAgentCustomized({ greeting: "Hola", updated_at: created }, created)).toBe(true));
  it("saludo vacío y sin cambios", () => expect(isAgentCustomized({ greeting: "  ", updated_at: "2026-11-20T10:00:01Z" }, created)).toBe(false));
  it("guardado después de crear el comercio", () => expect(isAgentCustomized({ greeting: null, updated_at: "2026-11-20T12:00:00Z" }, created)).toBe(true));
  it("sin fila", () => expect(isAgentCustomized(null, created)).toBe(false));
});
