import { describe, expect, it } from "vitest";
import { dayKey, formatDuration, formatMoney, formatPercent, initials, startOfTodayIso, timeAgo, truncate } from "./format";

describe("formatos", () => {
  it("moneda USD es-EC", () => {
    expect(formatMoney(1234.5)).toMatch(/1\.234,50/);
    expect(formatMoney(null)).toMatch(/0,00/);
  });
  it("duraciones y tiempo relativo", () => {
    expect(formatDuration(30_000)).toBe("30 s");
    expect(formatDuration(5 * 60_000)).toBe("5 min");
    expect(formatDuration(3 * 3600_000)).toBe("3 h");
    expect(formatDuration(3 * 86_400_000)).toBe("3 d");
    const now = Date.parse("2026-11-20T12:00:00Z");
    expect(timeAgo("2026-11-20T11:59:50Z", now)).toBe("ahora");
    expect(timeAgo("2026-11-20T11:30:00Z", now)).toBe("hace 30 min");
  });
  it("días en zona Guayaquil", () => {
    expect(dayKey("2026-11-21T03:00:00Z")).toBe("2026-11-20");
    expect(startOfTodayIso(new Date("2026-11-21T03:00:00Z"))).toBe("2026-11-20T05:00:00.000Z");
  });
  it("varios", () => {
    expect(formatPercent(0.256)).toBe("26 %");
    expect(formatPercent(null)).toBe("—");
    expect(truncate("hola   mundo cruel", 10)).toBe("hola mund…");
    expect(initials("ana maría")).toBe("AM");
    expect(initials("")).toBe("?");
  });
});
