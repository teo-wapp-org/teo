import { requireOrg } from "@/lib/auth";
import { readOnlyReason } from "@/lib/org-editor";
import { ReadOnlyNotice } from "@/components/forms/fields";
import { ConfigTabs } from "./config-tabs";

export default async function ConfigLayout({ children, params }: LayoutProps<"/app/[org]/configuracion">) {
  const { org: slug } = await params;
  const ctx = await requireOrg(slug);
  const reason = readOnlyReason(ctx);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configuración</h1>
        <p className="text-muted-foreground">Todo lo que Teo necesita saber para vender como tú.</p>
      </div>
      <ConfigTabs base={`/app/${ctx.org.slug}/configuracion`} />
      {reason && <ReadOnlyNotice>{reason}</ReadOnlyNotice>}
      {children}
    </div>
  );
}
