import type { Metadata } from "next";
import Image from "next/image";
import { Logo } from "@/components/brand/logo";
import { requireUser } from "@/lib/auth";
import { OnboardingForm } from "./form";

export const metadata: Metadata = { title: "Crea tu comercio" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const name = (user.user_metadata?.full_name as string | undefined)?.split(" ")[0];
  return (
    <div className="flex min-h-full flex-1 flex-col items-center px-4 py-8">
      <div className="w-full max-w-xl">
        <Logo href="/app" />
        <div className="mt-10 rounded-2xl border border-border bg-card p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-4">
            <Image src="/brand/personaje.png" alt="Teo" width={320} height={327} className="size-14 rounded-2xl" />
            <div>
              <h1 className="text-2xl font-bold">¡Hola{name ? `, ${name}` : ""}! Soy Teo.</h1>
              <p className="text-muted-foreground">Empecemos por lo básico: cuéntame de tu negocio.</p>
            </div>
          </div>
          <OnboardingForm />
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Después cargarás tus productos, tiendas y formas de pago, y conectarás tu WhatsApp.
        </p>
      </div>
    </div>
  );
}
