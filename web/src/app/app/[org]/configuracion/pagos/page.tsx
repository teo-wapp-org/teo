import { requireOrg } from "@/lib/auth";
import { canEditConfig } from "@/lib/org-editor";
import { createClient } from "@/lib/supabase/server";
import { PaymentMethods, type PaymentMethodRow } from "./payment-methods";

export const metadata = { title: "Formas de pago" };

export default async function PagosPage({ params }: PageProps<"/app/[org]/configuracion/pagos">) {
  const { org: slug } = await params;
  const ctx = await requireOrg(slug);
  const supabase = await createClient();
  const { data } = await supabase
    .from("payment_methods")
    .select("id, type, label, details, instructions, active, sort_order")
    .eq("org_id", ctx.org.id)
    .order("sort_order")
    .order("created_at");

  const rows: PaymentMethodRow[] = (data ?? []).map((r) => ({
    id: r.id,
    type: r.type,
    label: r.label,
    instructions: r.instructions ?? "",
    active: r.active,
    details: (r.details ?? {}) as Record<string, string>,
  }));

  return <PaymentMethods slug={ctx.org.slug} rows={rows} canEdit={canEditConfig(ctx)} />;
}
