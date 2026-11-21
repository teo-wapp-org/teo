"use client";

import { useEffect, useState, useTransition } from "react";
import { CircleAlert, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/forms/fields";
import { applyAuthConfig, getAuthConfig, type AuthConfigState } from "./actions";

/** Estado de Supabase Auth leído y aplicado vía admin-ops/auth-config. */
export function AuthConfigPanel({ canEdit, hasToken }: { canEdit: boolean; hasToken: boolean }) {
  const [state, setState] = useState<AuthConfigState | null>(null);
  const [disableSignup, setDisableSignup] = useState(false);
  const [autoconfirm, setAutoconfirm] = useState(false);
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();

  const load = () =>
    startLoad(async () => {
      const s = await getAuthConfig();
      setState(s);
      if (s.ok) {
        setDisableSignup(!!s.disable_signup);
        setAutoconfirm(!!s.mailer_autoconfirm);
      }
    });

  useEffect(() => {
    if (hasToken) load();
  }, [hasToken]);

  if (!hasToken) {
    return <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Guarda el token de administración para ver y cambiar estos ajustes.</p>;
  }

  return (
    <div className="space-y-3" aria-busy={loading}>
      {loading && !state && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Consultando Supabase Auth…
        </p>
      )}
      {state && !state.ok && (
        <div role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>No pudimos leer la configuración de Auth. {state.detail}</span>
        </div>
      )}
      {state?.ok && (
        <fieldset disabled={!canEdit || saving} className="space-y-3">
          <Switch
            id="auth-disable_signup"
            checked={disableSignup}
            onChange={(e) => setDisableSignup(e.target.checked)}
            label="Registro deshabilitado en Auth"
            description="Bloquea la creación de cuentas a nivel de Supabase, incluso fuera de la web de Teo."
          />
          <Switch
            id="auth-mailer_autoconfirm"
            checked={autoconfirm}
            onChange={(e) => setAutoconfirm(e.target.checked)}
            label="Autoconfirmar correos"
            description="Las cuentas nuevas quedan confirmadas sin abrir el correo."
          />
          {canEdit && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={load} disabled={loading}>
                <RefreshCw aria-hidden data-icon="inline-start" /> Volver a leer
              </Button>
              <Button
                type="button"
                onClick={() =>
                  startSave(async () => {
                    const r = await applyAuthConfig({ disable_signup: disableSignup, mailer_autoconfirm: autoconfirm });
                    if (r.ok) {
                      toast.success("Aplicamos los cambios en Supabase Auth.");
                      setState(r);
                    } else toast.error(r.detail ?? "No pudimos aplicar los cambios.");
                  })
                }
              >
                {saving && <Loader2 className="animate-spin" data-icon="inline-start" />}
                Aplicar en Supabase Auth
              </Button>
            </div>
          )}
        </fieldset>
      )}
    </div>
  );
}
