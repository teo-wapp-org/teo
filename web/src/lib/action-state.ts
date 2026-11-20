import type { z } from "zod";

/** Resultado de las Server Actions de formularios. `at` cambia en cada respuesta para disparar toasts. */
export type ActionState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  at?: number;
  id?: string;
};

export const fail = (error: string, fieldErrors?: Record<string, string>): ActionState => ({ ok: false, error, fieldErrors, at: Date.now() });
export const done = (message: string, extra?: Partial<ActionState>): ActionState => ({ ok: true, message, at: Date.now(), ...extra });

/** Convierte errores de zod en { campo: mensaje } (primer error por campo). */
export function zodFail(e: z.ZodError, general = "Revisa los campos marcados"): ActionState {
  const fieldErrors: Record<string, string> = {};
  for (const i of e.issues) {
    const k = String(i.path[0] ?? "_");
    if (!fieldErrors[k]) fieldErrors[k] = i.message;
  }
  const first = e.issues[0]?.message;
  return fail(e.issues.length === 1 && first ? first : general, fieldErrors);
}
