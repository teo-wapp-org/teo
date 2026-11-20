import { requireOrg } from "@/lib/auth";
import { Simulator } from "./simulator";

export default async function SimuladorPage({ params }: PageProps<"/app/[org]/simulador">) {
  const { org: slug } = await params;
  const { org, impersonating } = await requireOrg(slug);
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Simulador</h1>
        <p className="text-muted-foreground">
          Escribe como si fueras un cliente y mira cómo responde Teo con tu catálogo, tus tiendas y tus políticas. Las respuestas del simulador no consumen mensajes de tu plan.
        </p>
      </div>
      {impersonating ? (
        <p role="status" className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
          El simulador solo está disponible para los miembros del comercio.
        </p>
      ) : (
        <Simulator orgId={org.id} orgName={org.name} />
      )}
    </div>
  );
}
