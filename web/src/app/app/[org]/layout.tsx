import Image from "next/image";
import Link from "next/link";
import { Eye } from "lucide-react";
import { ORG_NAV } from "@/components/app/nav";
import { SidebarLink } from "@/components/app/sidebar-link";
import { UserMenu } from "@/components/app/user-menu";
import { getMemberships, getPlatformRole, requireOrg, requireUser } from "@/lib/auth";
import { countAttention } from "@/lib/data/operacion";

export default async function OrgLayout({ children, params }: LayoutProps<"/app/[org]">) {
  const { org: slug } = await params;
  const user = await requireUser();
  const { org, impersonating } = await requireOrg(slug);
  const [memberships, platformRole, attention] = await Promise.all([getMemberships(), getPlatformRole(), countAttention(org.id)]);
  const base = `/app/${org.slug}`;

  return (
    <div className="flex min-h-full flex-1">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 bg-sidebar p-4 text-sidebar-foreground md:flex">
        <Link href={base} className="flex items-center gap-2 px-2 pt-1">
          <Image src="/brand/logo-oscuro.png" alt="Teo" width={128} height={52} className="h-8 w-auto" />
        </Link>
        <div className="rounded-lg bg-sidebar-accent/60 px-3 py-2">
          <p className="text-xs text-sidebar-foreground/60">Comercio</p>
          <p className="truncate text-sm font-semibold text-sidebar-accent-foreground">{org.name}</p>
          {memberships.length > 1 && (
            <details className="mt-1 text-xs">
              <summary className="cursor-pointer text-sidebar-primary">Cambiar</summary>
              <ul className="mt-1 space-y-1">
                {memberships.filter((m) => m.organization.slug !== org.slug).map((m) => (
                  <li key={m.organization.id}><Link className="hover:underline" href={`/app/${m.organization.slug}`}>{m.organization.name}</Link></li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <nav aria-label="Panel" className="flex flex-1 flex-col gap-1">
          {ORG_NAV.map((item) => (
            <SidebarLink key={item.slug} href={item.slug ? `${base}/${item.slug}` : base} label={item.label} icon={<item.icon aria-hidden />} exact={!item.slug} badge={item.slug === "casos" && attention > 0 ? { count: attention, label: "requieren atención" } : undefined} />
          ))}
        </nav>
        <UserMenu email={user.email ?? ""} isPlatformAdmin={Boolean(platformRole)} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {impersonating && (
          <div role="status" className="flex items-center justify-center gap-2 bg-warning px-4 py-2 text-sm font-semibold text-primary">
            <Eye className="size-4" aria-hidden /> Estás viendo “{org.name}” como equipo Teo (solo lectura).
            <Link href="/admin" className="underline">Volver al admin</Link>
          </div>
        )}
        {org.status === "suspendido" && (
          <div role="alert" className="bg-destructive px-4 py-2 text-center text-sm font-semibold text-white">
            Este comercio está suspendido. Teo no responde mensajes. Escríbenos a teowapp@gmail.com.
          </div>
        )}
        <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 md:hidden">
          <Image src="/brand/logo-claro.png" alt="Teo" width={301} height={135} className="h-8 w-auto" />
          <span className="truncate text-sm font-semibold">{org.name}</span>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        <nav aria-label="Panel móvil" className="sticky bottom-0 grid grid-cols-4 border-t border-border bg-card md:hidden">
          {ORG_NAV.slice(0, 4).map((item) => (
            <Link key={item.slug} href={item.slug ? `${base}/${item.slug}` : base} className="flex flex-col items-center gap-1 py-2 text-xs text-muted-foreground">
              <item.icon className="size-5" aria-hidden />
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
