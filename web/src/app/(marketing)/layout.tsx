import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { getUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Logo />
          <nav aria-label="Principal" className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <Link href="/#como-funciona" className="hover:text-foreground">Cómo funciona</Link>
            <Link href="/#precios" className="hover:text-foreground">Precios</Link>
            <Link href="/#preguntas" className="hover:text-foreground">Preguntas</Link>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Link href="/app" className={cn(buttonVariants({ variant: "cta", size: "lg" }), "px-4")}>
                Ir a mi panel
              </Link>
            ) : (
              <>
                <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "px-3")}>
                  Iniciar sesión
                </Link>
                <Link href="/registro" className={cn(buttonVariants({ variant: "cta", size: "lg" }), "px-4")}>
                  Crear cuenta
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <Logo />
            <p className="max-w-sm text-sm text-muted-foreground">
              Tus conversaciones. Tus clientes. Todo bajo control.
            </p>
          </div>
          <ThemeToggle className="self-start md:order-last" />
          <nav aria-label="Legal" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link href="/privacidad" className="hover:text-foreground">Política de privacidad</Link>
            <Link href="/terminos" className="hover:text-foreground">Términos de servicio</Link>
            <a href="mailto:teowapp@gmail.com" className="hover:text-foreground">Contacto</a>
          </nav>
        </div>
        <p className="pb-8 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} Teo. Hecho en Ecuador.</p>
      </footer>
    </div>
  );
}
