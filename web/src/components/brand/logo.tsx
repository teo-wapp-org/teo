import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Logo oficial (raster del kit de marca). Mínimo 120 px de ancho para el horizontal y 24 px para el isotipo. */
export function Logo({ variant = "claro", className, href = "/" }: { variant?: "claro" | "oscuro"; className?: string; href?: string | null }) {
  const img =
    variant === "claro" ? (
      <Image src="/brand/logo-claro.png" alt="Teo" width={301} height={135} priority className={cn("h-10 w-auto", className)} />
    ) : (
      <Image src="/brand/logo-oscuro.png" alt="Teo" width={128} height={52} priority className={cn("h-9 w-auto", className)} />
    );
  return href ? (
    <Link href={href} aria-label="Teo, inicio" className="inline-flex shrink-0 items-center rounded-md focus-visible:outline-2 focus-visible:outline-ring">
      {img}
    </Link>
  ) : (
    img
  );
}
