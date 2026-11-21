import Image from "next/image";
import Link from "next/link";
import { Eye } from "lucide-react";
import { MobileShell, type ShellItem } from "@/components/app/mobile-shell";
import { ORG_NAV } from "@/components/app/nav";
import { OrgSwitcher } from "@/components/app/org-switcher";
import { SidebarLink } from "@/components/app/sidebar-link";
import { UserMenu } from "@/components/app/user-menu";
import { getPlatformRole, requireOrg, requireUser } from "@/lib/auth";
import { getSwitchableOrgs } from "@/lib/data/orgs";
import { countAttention } from "@/lib/data/operacion";

export default async function OrgLayout({ children, params }: LayoutProps<"/app/[org]">) {
  const { org: slug } = await params;
  const user = await requireUser();
  const { org, impersonating } = await requireOrg(slug);
  const [orgs, platformRole, attention] = await Promise.all([getSwitchableOrgs(), getPlatformRole(), countAttention(org.id)]);
  const base = `/app/${org.slug}`;

  const items: ShellItem[] = ORG_NAV.map((item) => ({
    href: item.slug ? `${base}/${item.slug}` : base,
    label: item.label,
    shortLabel: "shortLabel" in item ? item.shortLabel : undefined,
    icon: <item.icon aria-hidden />,
    exact: !item.slug,
    badge: item.slug === "casos" && attention > 0 ? { count: attention, label: "requieren atención" } : undefined,
  }));
  const switcher = <OrgSwitcher orgs={orgs} currentSlug={org.slug} />;
  const userMenu = <UserMenu email={user.email ?? ""} isPlatformAdmin={Boolean(platformRole)} />;

  return (
    <div className="flex min-h-full flex-1">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 overflow-y-auto bg-sidebar p-4 text-sidebar-foreground md:flex">
        <Link href={base} className="flex items-center gap-2 px-2 pt-1">
          <Image src="/brand/logo-oscuro.png" alt="Teo" width={600} height={271} className="h-8 w-auto" />
        </Link>
        {switcher}
        <nav aria-label="Panel" className="flex flex-1 flex-col gap-1">
          {items.map((it) => (
            <SidebarLink key={it.href} href={it.href} label={it.label} icon={it.icon} exact={it.exact} badge={it.badge} />
          ))}
        </nav>
        {userMenu}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileShell homeHref={base} title={org.name} items={items} top={switcher} footer={userMenu} />
        {impersonating && (
          <div role="status" className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 bg-warning px-4 py-2 text-center text-sm font-semibold text-primary">
            <Eye className="size-4" aria-hidden /> Estás viendo “{org.name}” como equipo Teo (solo lectura).
            <Link href="/admin" className="underline">Volver al admin</Link>
          </div>
        )}
        {org.status === "suspendido" && (
          <div role="alert" className="bg-destructive px-4 py-2 text-center text-sm font-semibold text-white">
            Este comercio está suspendido. Teo no responde mensajes. Escríbenos a teowapp@gmail.com.
          </div>
        )}
        <main className="flex-1 p-4 pb-28 sm:p-6 sm:pb-28 md:pb-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
