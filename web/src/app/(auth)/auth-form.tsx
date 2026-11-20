"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AuthState } from "./actions";

export function AuthForm({
  action,
  submitLabel,
  children,
}: {
  action: (s: AuthState, f: FormData) => Promise<AuthState>;
  submitLabel: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4" noValidate>
      {children}
      {state.error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
      )}
      {state.message && (
        <p role="status" className="rounded-lg bg-cta/15 px-3 py-2 text-sm">{state.message}</p>
      )}
      <Button type="submit" variant="cta" className="h-11 w-full text-base" disabled={pending}>
        {pending && <Loader2 className="animate-spin" data-icon="inline-start" />}
        {submitLabel}
      </Button>
    </form>
  );
}
