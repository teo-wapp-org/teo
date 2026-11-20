import { requireOrg } from "@/lib/auth";
import { normalizeHours } from "@/lib/hours";
import { canEditConfig } from "@/lib/org-editor";
import { createClient } from "@/lib/supabase/server";
import { AgentForm } from "./agent-form";

export const metadata = { title: "Teo" };

export default async function TeoPage({ params }: PageProps<"/app/[org]/configuracion/teo">) {
  const { org: slug } = await params;
  const ctx = await requireOrg(slug);
  const supabase = await createClient();
  const { data: a } = await supabase.from("agent_settings").select("*").eq("org_id", ctx.org.id).maybeSingle();

  return (
    <AgentForm
      slug={ctx.org.slug}
      canEdit={canEditConfig(ctx)}
      initial={{
        enabled: a?.enabled ?? true,
        mode: a?.mode ?? "piloto",
        display_name: a?.display_name ?? "Teo",
        greeting: a?.greeting ?? "",
        out_of_hours_message: a?.out_of_hours_message ?? "",
        business_hours: normalizeHours(a?.business_hours),
        escalation_keywords: a?.escalation_keywords ?? [],
        escalation_amount_usd: a?.escalation_amount_usd != null ? String(a.escalation_amount_usd) : "",
        payment_expiry_hours: a?.payment_expiry_hours ?? 48,
        extra_instructions: a?.extra_instructions ?? "",
      }}
    />
  );
}
