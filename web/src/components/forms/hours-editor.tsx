"use client";

import { Copy, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DAY_LABELS, DAYS, shiftsError, type Day, type Shift, type WeekHours } from "@/lib/hours";
import { cn } from "@/lib/utils";

const DEFAULT_SHIFT: Shift = { open: "09:00", close: "18:00" };
const MAX_SHIFTS = 4;

/**
 * Editor de horario semanal: por día, "Abierto/Cerrado" y uno o varios turnos.
 * Controlado: el padre guarda el valor y lo serializa a un input oculto.
 */
export function HoursEditor({ value, onChange, idPrefix, disabled }: { value: WeekHours; onChange: (v: WeekHours) => void; idPrefix: string; disabled?: boolean }) {
  const set = (d: Day, shifts: Shift[]) => onChange({ ...value, [d]: shifts });
  const copyToAll = (from: Day) => {
    const src = value[from] ?? [];
    onChange(Object.fromEntries(DAYS.map((d) => [d, src.map((s) => ({ ...s }))])) as WeekHours);
  };

  return (
    <div className="divide-y divide-border rounded-xl border border-border">
      {DAYS.map((d) => {
        const shifts = value[d] ?? [];
        const open = shifts.length > 0;
        const err = shiftsError(shifts);
        const toggleId = `${idPrefix}-${d}-abierto`;
        return (
          <div key={d} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start" role="group" aria-label={DAY_LABELS[d]}>
            <div className="flex items-center justify-between gap-3 sm:w-44 sm:pt-1.5">
              <span className="text-sm font-medium">{DAY_LABELS[d]}</span>
              <label htmlFor={toggleId} className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input
                  id={toggleId}
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={open}
                  disabled={disabled}
                  onChange={(e) => set(d, e.target.checked ? [{ ...DEFAULT_SHIFT }] : [])}
                />
                {open ? "Abierto" : "Cerrado"}
              </label>
            </div>
            <div className="flex-1 space-y-2">
              {shifts.map((s, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`${idPrefix}-${d}-${i}-open`}>{`${DAY_LABELS[d]}, turno ${i + 1}: abre`}</label>
                  <input
                    id={`${idPrefix}-${d}-${i}-open`}
                    type="time"
                    value={s.open}
                    disabled={disabled}
                    aria-invalid={err ? true : undefined}
                    onChange={(e) => set(d, shifts.map((x, j) => (j === i ? { ...x, open: e.target.value } : x)))}
                    className="h-9 rounded-lg border border-input bg-background px-2 text-sm aria-invalid:border-destructive"
                  />
                  <span className="text-sm text-muted-foreground" aria-hidden>a</span>
                  <label className="sr-only" htmlFor={`${idPrefix}-${d}-${i}-close`}>{`${DAY_LABELS[d]}, turno ${i + 1}: cierra`}</label>
                  <input
                    id={`${idPrefix}-${d}-${i}-close`}
                    type="time"
                    value={s.close}
                    disabled={disabled}
                    aria-invalid={err ? true : undefined}
                    onChange={(e) => set(d, shifts.map((x, j) => (j === i ? { ...x, close: e.target.value } : x)))}
                    className="h-9 rounded-lg border border-input bg-background px-2 text-sm aria-invalid:border-destructive"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={disabled}
                    aria-label={`Quitar turno ${i + 1} del ${DAY_LABELS[d].toLowerCase()}`}
                    onClick={() => set(d, shifts.filter((_, j) => j !== i))}
                  >
                    <X aria-hidden />
                  </Button>
                </div>
              ))}
              {open && (
                <div className={cn("flex flex-wrap gap-1")}>
                  {shifts.length < MAX_SHIFTS && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      onClick={() => {
                        const last = shifts[shifts.length - 1];
                        const next = last && last.close < "20:00" ? { open: bump(last.close, 60), close: bump(last.close, 240) } : { ...DEFAULT_SHIFT };
                        set(d, [...shifts, next]);
                      }}
                    >
                      <Plus aria-hidden data-icon="inline-start" /> Agregar turno
                    </Button>
                  )}
                  {d === "lun" && (
                    <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => copyToAll("lun")}>
                      <Copy aria-hidden data-icon="inline-start" /> Copiar a todos los días
                    </Button>
                  )}
                </div>
              )}
              {err && (
                <p role="alert" className="text-xs font-medium text-destructive">
                  {err.charAt(0).toUpperCase() + err.slice(1)}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function bump(hhmm: string, minutes: number) {
  const [h, m] = hhmm.split(":").map(Number);
  const t = Math.min(23 * 60 + 59, h * 60 + m + minutes);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
