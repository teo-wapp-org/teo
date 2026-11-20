import Image from "next/image";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-full flex-1 lg:grid-cols-2">
      <div className="flex flex-col px-4 py-8 sm:px-10">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
      <aside className="relative hidden flex-col justify-end overflow-hidden bg-primary p-12 text-primary-foreground lg:flex">
        <div aria-hidden className="absolute -right-24 -top-24 size-96 rounded-full bg-cta/20 blur-3xl" />
        <Image src="/brand/personaje.png" alt="" width={152} height={155} className="mb-8 size-24 rounded-3xl" />
        <p className="font-heading text-3xl font-bold leading-tight">
          Tus conversaciones. Tus clientes.
          <br />
          <span className="text-cta">Todo bajo control.</span>
        </p>
        <p className="mt-3 max-w-md text-primary-foreground/70">Asistente inteligente para ventas y gestión de clientes por WhatsApp.</p>
      </aside>
    </div>
  );
}
