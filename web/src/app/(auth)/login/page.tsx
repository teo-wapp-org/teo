import type { Metadata } from "next";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bienvenido de nuevo</h1>
        <p className="mt-1 text-muted-foreground">Entra a tu panel de Teo.</p>
      </div>
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">El enlace no es válido o expiró. Inicia sesión de nuevo.</p>}
      <AuthForm action={login} submitLabel="Iniciar sesión">
        <input type="hidden" name="next" value={typeof next === "string" ? next : "/app"} />
        <div className="space-y-2">
          <Label htmlFor="email">Correo</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required className="h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-11" />
        </div>
      </AuthForm>
      <p className="text-center text-sm text-muted-foreground">
        ¿No tienes cuenta?{" "}
        <Link href="/registro" className="font-semibold text-foreground underline-offset-4 hover:underline">Crea una gratis</Link>
      </p>
    </div>
  );
}
