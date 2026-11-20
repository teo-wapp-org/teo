import { LogOut, Shield } from "lucide-react";
import Link from "next/link";

export function UserMenu({ email, isPlatformAdmin }: { email: string; isPlatformAdmin: boolean }) {
  return (
    <div className="space-y-1 border-t border-sidebar-border pt-3">
      {isPlatformAdmin && (
        <Link href="/admin" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground">
          <Shield className="size-4 text-sidebar-primary" aria-hidden /> Admin Teo
        </Link>
      )}
      <p className="truncate px-3 text-xs text-sidebar-foreground/60" title={email}>{email}</p>
      <form action="/auth/salir" method="post">
        <button type="submit" className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground">
          <LogOut className="size-4" aria-hidden /> Cerrar sesión
        </button>
      </form>
    </div>
  );
}
