import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Logo oficial. Mínimo 120 px de ancho (horizontal) y 24 px (isotipo).
 * - "auto" (por defecto): versión con texto azul en tema claro y texto blanco en tema oscuro.
 * - "claro" / "oscuro": fuerza la versión para fondo claro u oscuro (p. ej. sidebar azul).
 */
export function Logo({ variant = "auto", className, href = "/" }: { variant?: "auto" | "claro" | "oscuro"; className?: string; href?: string | null }) {
  const cls = cn("h-10 w-auto", className);
  const light = <Image src="/brand/logo-claro.png" alt="Teo" width={600} height={271} priority className={cn(cls, variant === "auto" && "dark:hidden")} />;
  const dark = <Image src="/brand/logo-oscuro.png" alt="Teo" width={600} height={271} priority className={cn(cls, variant === "auto" && "hidden dark:block")} />;
  const img = variant === "claro" ? light : variant === "oscuro" ? dark : (
    <>
      {light}
      {dark}
    </>
  );
  return href ? (
    <Link href={href} aria-label="Teo, inicio" className="inline-flex shrink-0 items-center rounded-md focus-visible:outline-2 focus-visible:outline-ring">
      {img}
    </Link>
  ) : (
    <span className="inline-flex shrink-0 items-center">{img}</span>
  );
}
