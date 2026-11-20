import Link from "next/link";
import { ChevronLeft, MessageCircle, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DisconnectButton } from "@/components/whatsapp/disconnect-button";
import { EmbeddedSignupButton } from "@/components/whatsapp/embedded-signup-button";
import { ManualConnectForm } from "@/components/whatsapp/manual-connect-form";
import { requireOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { QUALITY_LABEL, STATUS_LABEL, type WaAccountStatus } from "@/lib/whatsapp/constants";

const STATUS_STYLE: Record<WaAccountStatus, string> = {
  conectado: "bg-success/15 text-foreground",
  pendiente: "bg-warning/25 text-foreground",
  desconectado: "bg-muted text-muted-foreground",
  error: "bg-destructive/10 text-destructive",
};

/** Inicio de la ventana de 24 h de Meta (por request). */
function windowStart(now = new Date()) {
  return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Guayaquil" }).format(new Date(iso));
}

export default async function WhatsappSettingsPage({ params }: PageProps<"/app/[org]/configuracion/whatsapp">) {
  const { org: slug } = await params;
  const { org, role, impersonating } = await requireOrg(slug);
  const canManage = !impersonating && (role === "owner" || role === "admin");
  const supabase = await createClient();

  const since = windowStart();
  const [{ data: account }, { count: openWindows }] = await Promise.all([
    supabase
      .from("whatsapp_accounts")
      .select("phone_number_id, waba_id, display_phone_number, verified_name, status, quality_rating, connected_at, updated_at")
      .eq("org_id", org.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id)
      .eq("channel", "whatsapp")
      .gt("last_inbound_at", since),
  ]);

  const status = (account?.status ?? null) as WaAccountStatus | null;
  const active = status === "conectado" || status === "pendiente";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/app/${org.slug}/configuracion`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" aria-hidden /> Configuración
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold">
          <MessageCircle className="size-7" aria-hidden /> WhatsApp
        </h1>
        <p className="text-muted-foreground">Conecta el número de WhatsApp de tu negocio para que Teo atienda a tus clientes.</p>
      </div>

      <section aria-labelledby="estado" className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="estado" className="text-xl font-semibold">Estado de la conexión</h2>
          <Badge className={STATUS_STYLE[status ?? "desconectado"]} data-testid="wa-status">
            {status ? STATUS_LABEL[status] : "Sin conectar"}
          </Badge>
        </div>
        {account && active ? (
          <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Número</dt>
              <dd className="font-medium">{account.display_phone_number ?? "Por verificar"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Nombre verificado</dt>
              <dd className="font-medium">{account.verified_name ?? "Por verificar"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Phone number ID</dt>
              <dd className="font-mono text-xs">{account.phone_number_id}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Calidad del número</dt>
              <dd className="font-medium">{account.quality_rating ? (QUALITY_LABEL[account.quality_rating] ?? account.quality_rating) : "Sin datos"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Conectado desde</dt>
              <dd className="font-medium">{formatDate(account.connected_at)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Ventana de 24 h</dt>
              <dd className="font-medium">
                {openWindows ?? 0} {openWindows === 1 ? "conversación abierta" : "conversaciones abiertas"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Aún no hay un número conectado. Mientras tanto, Teo no responde por WhatsApp.</p>
        )}
        {status === "pendiente" && (
          <p className="mt-4 rounded-lg bg-warning/20 px-3 py-2 text-sm">
            Meta todavía no validó este número. Teo empezará a responder cuando la conexión quede activa.
          </p>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Por reglas de Meta, Teo solo puede escribir libremente hasta 24 horas después del último mensaje de cada cliente. Pasado ese
          plazo, la conversación necesita una plantilla aprobada.
        </p>
        {canManage && active && (
          <div className="mt-4 border-t border-border pt-4">
            <DisconnectButton slug={org.slug} />
          </div>
        )}
      </section>

      {canManage ? (
        <>
          <section aria-labelledby="facebook" className="rounded-2xl border border-border bg-card p-6">
            <h2 id="facebook" className="text-xl font-semibold">Conectar con Facebook</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              La forma recomendada: inicias sesión con Facebook, eliges tu cuenta de WhatsApp Business y tu número queda listo en minutos.
            </p>
            <EmbeddedSignupButton slug={org.slug} appId={process.env.NEXT_PUBLIC_META_APP_ID} configId={process.env.NEXT_PUBLIC_META_ES_CONFIG_ID} />
          </section>

          <section aria-labelledby="manual" className="rounded-2xl border border-border bg-card p-6">
            <h2 id="manual" className="text-xl font-semibold">{active ? "Actualizar conexión manual" : "Conexión manual"}</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Si ya tienes una app en Meta for Developers, copia aquí los datos de WhatsApp → Configuración de la API.
            </p>
            <ManualConnectForm slug={org.slug} defaultPhoneNumberId={active ? (account?.phone_number_id ?? undefined) : undefined} defaultWabaId={active ? (account?.waba_id ?? undefined) : undefined} />
          </section>
        </>
      ) : (
        <p role="note" className="flex items-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0" aria-hidden />
          Solo el dueño o un administrador del comercio puede conectar o cambiar el número de WhatsApp.
        </p>
      )}
    </div>
  );
}
