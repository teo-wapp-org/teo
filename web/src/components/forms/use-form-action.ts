"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import type { ActionState } from "@/lib/action-state";

/**
 * Envuelve una Server Action `(prev, formData) => ActionState`:
 * - envía con onSubmit (sin el reset automático del form de React, así no se pierden datos si hay errores),
 * - muestra un toast con el resultado,
 * - expone helpers para marcar campos con error (aria-invalid / aria-describedby).
 */
export function useFormAction(
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>,
  opts: { onSuccess?: (s: ActionState) => void; idPrefix?: string } = {},
) {
  const [state, dispatch, pending] = useActionState(action, {});
  const onSuccess = useRef(opts.onSuccess);
  useEffect(() => {
    onSuccess.current = opts.onSuccess;
  });

  useEffect(() => {
    if (!state.at) return;
    if (state.ok) {
      if (state.message) toast.success(state.message);
      onSuccess.current?.(state);
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };

  const errors = state.ok ? {} : (state.fieldErrors ?? {});
  const p = opts.idPrefix ?? "";
  const field = (name: string) => ({
    id: `${p}${name}`,
    name,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${p}${name}-error` : undefined,
  });
  const fieldId = (name: string) => `${p}${name}`;

  return { state, pending, onSubmit, errors, field, fieldId };
}
