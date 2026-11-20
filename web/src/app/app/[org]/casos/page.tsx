import { Layers } from "lucide-react";
import { requireOrg } from "@/lib/auth";

const COLUMNAS = [
  { id: "nuevo", label: "Nuevo", dot: "bg-cta" },
  { id: "en_conversacion", label: "En conversación", dot: "bg-secondary" },
  { id: "cotizacion", label: "Cotización", dot: "bg-warning/60" },
  { id: "esperando_pago", label: "Esperando pago", dot: "bg-warning" },
  { id: "pago_por_confirmar", label: "Pago por confirmar", dot: "bg-info" },
  { id: "confirmado", label: "Confirmado", dot: "bg-cta" },
  { id: "requiere_atencion", label: "Requiere atención", dot: "bg-destructive" },
];

export default async function CasosPage({ params }: PageProps<"/app/[org]/casos">) {
  const { org: slug } = await params;
  await requireOrg(slug);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Casos</h1>
        <p className="text-muted-foreground">Cada conversación avanza por estas columnas. Cuando conectes WhatsApp, aparecerán aquí.</p>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNAS.map((c) => (
          <section key={c.id} aria-label={c.label} className="flex w-72 shrink-0 flex-col rounded-2xl bg-muted/60 p-3">
            <header className="mb-3 flex items-center gap-2 px-1">
              <span className={`size-2.5 rounded-full ${c.dot}`} aria-hidden />
              <h2 className="text-sm font-semibold">{c.label}</h2>
              <span className="ml-auto text-xs text-muted-foreground">0</span>
            </header>
            <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              <div>
                <Layers className="mx-auto mb-2 size-5" aria-hidden />
                Sin casos
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
