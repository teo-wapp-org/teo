import type { Metadata } from "next";
import { CasesBoard } from "@/components/operacion/kanban-board";
import { EmptyState } from "@/components/operacion/bits";
import { requireOrg, requireUser } from "@/lib/auth";
import { getBoardCases, getMembers } from "@/lib/data/operacion";

export const metadata: Metadata = { title: "Casos" };

export default async function CasosPage({ params, searchParams }: PageProps<"/app/[org]/casos">) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const { org, impersonating } = await requireOrg(slug);
  const showClosed = sp.cerrados === "1";
  const view = sp.vista === "lista" ? "lista" : "tablero";
  const [cases, members] = await Promise.all([getBoardCases(org.id, { closed: showClosed }), getMembers(org.id)]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Casos</h1>
          <p className="text-sm text-muted-foreground">Arrastra una tarjeta (o usa el teclado) para cambiar su estado. Los cambios se ven en vivo.</p>
        </div>
      </div>
      <CasesBoard
        slug={org.slug}
        orgId={org.id}
        userId={user.id}
        members={members.map(({ id, name, avatar_url }) => ({ id, name, avatar_url }))}
        cases={cases}
        showClosed={showClosed}
        view={view}
        readOnly={impersonating}
      />
      {cases.length === 0 && (
        <EmptyState title="Todavía no hay casos">
          Cuando un cliente escriba a tu WhatsApp (o pruebes en el simulador), Teo abrirá un caso y aparecerá aquí.
        </EmptyState>
      )}
    </div>
  );
}
