import type { Metadata } from "next";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPublicConfig } from "@/lib/data/platform-config";
import { signup } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Crear cuenta" };

const SIGNUP_CLOSED_MESSAGE = "El registro está cerrado por ahora";

export default async function RegistroPage() {
  const config = await getPublicConfig();
  if (!config.signup_enabled) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">{SIGNUP_CLOSED_MESSAGE}</h1>
          <p className="mt-2 text-muted-foreground">
            Estamos preparando todo para recibir nuevos comercios. Vuelve pronto
            {config.support_email ? (
              <>
                {" "}o escríbenos a{" "}
                <a href={`mailto:${config.support_email}`} className="font-semibold text-foreground underline-offset-4 hover:underline">
                  {config.support_email}
                </a>
              </>
            ) : null}
            .
          </p>
        </div>
        <p className="text-center text-sm text-muted-foreground">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-semibold text-foreground underline-offset-4 hover:underline">Inicia sesión</Link>
        </p>
      </div>
    );
  }
  const days = config.trial_days;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Crea tu cuenta</h1>
        <p className="mt-1 text-muted-foreground">
          {days > 0 ? `${days === 1 ? "1 día" : `${days} días`} del plan Negocio gratis. Sin tarjeta.` : "Empieza en minutos. Sin tarjeta."}
        </p>
      </div>
      <AuthForm action={signup} submitLabel="Crear cuenta">
        <div className="space-y-2">
          <Label htmlFor="full_name">Tu nombre</Label>
          <Input id="full_name" name="full_name" autoComplete="name" required className="h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Correo</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required className="h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className="h-11" />
          <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
        </div>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-muted-foreground">
          <input type="checkbox" name="terms" className="mt-0.5 size-4 accent-[var(--cta)]" required />
          <span>
            Acepto los <Link href="/terminos" target="_blank" className="underline">términos</Link> y la{" "}
            <Link href="/privacidad" target="_blank" className="underline">política de privacidad</Link>.
          </span>
        </label>
      </AuthForm>
      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-semibold text-foreground underline-offset-4 hover:underline">Inicia sesión</Link>
      </p>
    </div>
  );
}
