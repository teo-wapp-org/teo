import Image from "next/image";
import Link from "next/link";
import { Building2, ScrollText } from "lucide-react";
import { SidebarLink } from "@/components/app/sidebar-link";
import { UserMenu } from "@/components/app/user-menu";
import { requirePlatformAdmin, requireUser } from "@/lib/auth";

export const metadata = { title: "Admin" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const role = await requirePlatformAdmin();
  return (
    <div className="flex min-h-full flex-1">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 bg-sidebar p-4 text-sidebar-foreground md:flex">
        <Link href="/admin" className="flex items-center gap-2 px-2 pt-1">
          <Image src="/brand/logo-oscuro.png" alt="Teo" width={128} height={52} className="h-8 w-auto" />
          <span className="rounded bg-sidebar-primary px-1.5 py-0.5 text-[10px] font-bold uppercase text-sidebar-primary-foreground">Admin</span>
        </Link>
        <nav aria-label="Admin" className="flex flex-1 flex-col gap-1">
          <SidebarLink href="/admin" label="Comercios" icon={Building2} exact />
          <SidebarLink href="/admin/auditoria" label="Auditoría" icon={ScrollText} />
        </nav>
        <div className="px-3 text-xs text-sidebar-foreground/60">Rol: {role}</div>
        <UserMenu email={user.email ?? ""} isPlatformAdmin={false} />
      </aside>
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
