import { describe, expect, it } from "vitest";
import { formatDay, mergeShifts, normalizeHours, placesPeriodsToHours, shiftsError, WeekHoursSchema } from "./hours";

describe("placesPeriodsToHours", () => {
  it("convierte días normales con el índice de Google (0 = domingo)", () => {
    const h = placesPeriodsToHours([
      { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 18, minute: 30 } },
      { open: { day: 6, hour: 10 }, close: { day: 6, hour: 14 } },
    ]);
    expect(h.lun).toEqual([{ open: "09:00", close: "18:30" }]);
    expect(h.sab).toEqual([{ open: "10:00", close: "14:00" }]);
    expect(h.dom).toEqual([]);
    expect(h.mar).toEqual([]);
  });

  it("soporta varios turnos en un día, ordenados", () => {
    const h = placesPeriodsToHours([
      { open: { day: 2, hour: 15, minute: 0 }, close: { day: 2, hour: 19, minute: 0 } },
      { open: { day: 2, hour: 9, minute: 0 }, close: { day: 2, hour: 13, minute: 0 } },
    ]);
    expect(h.mar).toEqual([
      { open: "09:00", close: "13:00" },
      { open: "15:00", close: "19:00" },
    ]);
  });

  it("abierto 24 horas cuando no hay cierre", () => {
    const h = placesPeriodsToHours([{ open: { day: 0, hour: 0, minute: 0 } }]);
    expect(h.lun).toEqual([{ open: "00:00", close: "23:59" }]);
    expect(h.dom).toEqual([{ open: "00:00", close: "23:59" }]);
  });

  it("parte los turnos que cruzan la medianoche", () => {
    const h = placesPeriodsToHours([{ open: { day: 5, hour: 20, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } }]);
    expect(h.vie).toEqual([{ open: "20:00", close: "23:59" }]);
    expect(h.sab).toEqual([{ open: "00:00", close: "02:00" }]);
  });

  it("cierre a medianoche exacta no agrega turno vacío al día siguiente", () => {
    const h = placesPeriodsToHours([{ open: { day: 6, hour: 18 }, close: { day: 0, hour: 0, minute: 0 } }]);
    expect(h.sab).toEqual([{ open: "18:00", close: "23:59" }]);
    expect(h.dom).toEqual([]);
  });

  it("sin periodos devuelve horario vacío", () => {
    expect(placesPeriodsToHours(undefined)).toEqual({});
    expect(placesPeriodsToHours([])).toEqual({});
  });

  it("el resultado pasa la validación", () => {
    const h = placesPeriodsToHours([
      { open: { day: 5, hour: 20 }, close: { day: 6, hour: 2 } },
      { open: { day: 6, hour: 20 }, close: { day: 0, hour: 2 } },
    ]);
    expect(WeekHoursSchema.safeParse(h).success).toBe(true);
    expect(h.sab).toEqual([
      { open: "00:00", close: "02:00" },
      { open: "20:00", close: "23:59" },
    ]);
  });
});

describe("validación de turnos", () => {
  it("detecta cierre antes de apertura y cruces", () => {
    expect(shiftsError([{ open: "10:00", close: "09:00" }])).toMatch(/cierre/);
    expect(shiftsError([{ open: "09:00", close: "13:00" }, { open: "12:00", close: "15:00" }])).toMatch(/cruzan/);
    expect(shiftsError([{ open: "09:00", close: "13:00" }, { open: "13:00", close: "15:00" }])).toBeNull();
  });

  it("WeekHoursSchema rechaza días desconocidos y horas inválidas", () => {
    expect(WeekHoursSchema.safeParse({ lunes: [] }).success).toBe(false);
    expect(WeekHoursSchema.safeParse({ lun: [{ open: "25:00", close: "26:00" }] }).success).toBe(false);
    expect(WeekHoursSchema.safeParse({ lun: [{ open: "09:00", close: "18:00" }], dom: [] }).success).toBe(true);
  });
});

describe("utilidades", () => {
  it("normalizeHours limpia basura", () => {
    expect(normalizeHours(null)).toEqual({});
    expect(normalizeHours({ lun: [{ open: "09:00", close: "10:00" }, { foo: 1 }], xx: [] })).toEqual({ lun: [{ open: "09:00", close: "10:00" }] });
  });
  it("mergeShifts une solapados", () => {
    expect(mergeShifts([{ open: "00:00", close: "02:00" }, { open: "00:00", close: "23:59" }])).toEqual([{ open: "00:00", close: "23:59" }]);
  });
  it("formatDay", () => {
    expect(formatDay([])).toBe("Cerrado");
    expect(formatDay([{ open: "09:00", close: "13:00" }, { open: "15:00", close: "19:00" }])).toBe("09:00–13:00, 15:00–19:00");
  });
});
