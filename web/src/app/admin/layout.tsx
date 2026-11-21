import Image from "next/image";
import Link from "next/link";
import { Building2, CreditCard, ScrollText, Settings, UsersRound } from "lucide-react";
import { SidebarLink } from "@/components/app/sidebar-link";
import { UserMenu } from "@/components/app/user-menu";
import { requirePlatformAdmin, requireUser } from "@/lib/auth";

export const metadata = { title: "Admin" };

function NavLinks() {
  return (
    <>
      <SidebarLink href="/admin" label="Comercios" icon={<Building2 aria-hidden />} exact also={["/admin/comercios"]} />
      <SidebarLink href="/admin/configuracion" label="Configuración" icon={<Settings aria-hidden />} />
      <SidebarLink href="/admin/planes" label="Planes" icon={<CreditCard aria-hidden />} />
      <SidebarLink href="/admin/equipo" label="Equipo Teo" icon={<UsersRound aria-hidden />} />
      <SidebarLink href="/admin/auditoria" label="Auditoría" icon={<ScrollText aria-hidden />} />
    </>
  );
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const role = await requirePlatformAdmin();
  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 bg-sidebar p-4 text-sidebar-foreground md:flex">
        <Link href="/admin" className="flex items-center gap-2 px-2 pt-1">
          <Image src="/brand/logo-oscuro.png" alt="Teo" width={128} height={52} className="h-8 w-auto" />
          <span className="rounded bg-sidebar-primary px-1.5 py-0.5 text-[10px] font-bold uppercase text-sidebar-primary-foreground">Admin</span>
        </Link>
        <nav aria-label="Admin" className="flex flex-1 flex-col gap-1">
          <NavLinks />
        </nav>
        <div className="px-3 text-xs text-sidebar-foreground/60">Rol: {role === "superadmin" ? "Superadmin" : "Soporte (solo lectura)"}</div>
        <UserMenu email={user.email ?? ""} isPlatformAdmin={false} />
      </aside>
      {/* Móvil: barra superior con navegación desplazable */}
      <header className="sticky top-0 z-20 space-y-2 bg-sidebar px-4 pt-3 pb-2 text-sidebar-foreground md:hidden">
        <div className="flex items-center justify-between gap-2">
          <Link href="/admin" className="flex items-center gap-2">
            <Image src="/brand/logo-oscuro.png" alt="Teo" width={128} height={52} className="h-7 w-auto" />
            <span className="rounded bg-sidebar-primary px-1.5 py-0.5 text-[10px] font-bold uppercase text-sidebar-primary-foreground">Admin</span>
          </Link>
          <span className="text-xs text-sidebar-foreground/60">{role === "superadmin" ? "Superadmin" : "Soporte"}</span>
        </div>
        <nav aria-label="Admin (móvil)" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1">
          <NavLinks />
        </nav>
      </header>
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
