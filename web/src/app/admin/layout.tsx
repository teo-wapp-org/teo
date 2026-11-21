import Image from "next/image";
import Link from "next/link";
import { Building2, CreditCard, ScrollText, Settings, UsersRound } from "lucide-react";
import { MobileShell, type ShellItem } from "@/components/app/mobile-shell";
import { OrgSwitcher } from "@/components/app/org-switcher";
import { SidebarLink } from "@/components/app/sidebar-link";
import { UserMenu } from "@/components/app/user-menu";
import { requirePlatformAdmin, requireUser } from "@/lib/auth";
import { getSwitchableOrgs } from "@/lib/data/orgs";

export const metadata = { title: "Admin" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const role = await requirePlatformAdmin();
  const orgs = await getSwitchableOrgs();

  const items: ShellItem[] = [
    { href: "/admin", label: "Comercios", icon: <Building2 aria-hidden />, exact: true, also: ["/admin/comercios"] },
    { href: "/admin/configuracion", label: "Configuración", shortLabel: "Config.", icon: <Settings aria-hidden /> },
    { href: "/admin/planes", label: "Planes", icon: <CreditCard aria-hidden /> },
    { href: "/admin/equipo", label: "Equipo Teo", shortLabel: "Equipo", icon: <UsersRound aria-hidden /> },
    { href: "/admin/auditoria", label: "Auditoría", icon: <ScrollText aria-hidden /> },
  ];
  const switcher = <OrgSwitcher orgs={orgs} label="Ir a un comercio" placeholder="Elegir comercio…" />;
  const footer = (
    <div className="space-y-2">
      <p className="px-3 text-xs text-sidebar-foreground/60">Rol: {role === "superadmin" ? "Superadmin" : "Soporte (solo lectura)"}</p>
      <UserMenu email={user.email ?? ""} isPlatformAdmin={false} />
    </div>
  );

  return (
    <div className="flex min-h-full flex-1">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 overflow-y-auto bg-sidebar p-4 text-sidebar-foreground md:flex">
        <Link href="/admin" className="flex items-center gap-2 px-2 pt-1">
          <Image src="/brand/logo-oscuro.png" alt="Teo" width={600} height={271} className="h-8 w-auto" />
          <span className="rounded bg-sidebar-primary px-1.5 py-0.5 text-[10px] font-bold uppercase text-sidebar-primary-foreground">Admin</span>
        </Link>
        {switcher}
        <nav aria-label="Admin" className="flex flex-1 flex-col gap-1">
          {items.map((it) => (
            <SidebarLink key={it.href} href={it.href} label={it.label} icon={it.icon} exact={it.exact} also={it.also} />
          ))}
        </nav>
        {footer}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileShell homeHref="/admin" title={role === "superadmin" ? "Superadmin" : "Soporte"} badgeLabel="Admin" items={items} top={switcher} footer={footer} />
        <main className="min-w-0 flex-1 p-4 pb-28 sm:p-6 sm:pb-28 md:pb-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
