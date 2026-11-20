"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { AlertCircle, Clock, GripVertical, Search } from "lucide-react";
import { transitionCaseAction } from "@/lib/actions/operacion";
import {
  canTransition,
  columnOf,
  filterCases,
  groupByColumn,
  STATUS_LABEL,
  targetStatusForColumn,
  transitionError,
  TYPE_LABEL,
  type BoardCase,
  type CaseType,
  type ColumnId,
} from "@/lib/casos";
import { formatMoney, truncate } from "@/lib/format";
import { useRealtime } from "@/lib/supabase/use-realtime";
import { cn } from "@/lib/utils";
import { HandledIcon, MemberAvatar, StatusDot, TimeAgo, type MemberLite } from "./bits";

/** Flechas ←/→ saltan de columna en columna mientras se arrastra con teclado (Espacio para tomar/soltar). */
const columnKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  if (event.code !== "ArrowRight" && event.code !== "ArrowLeft") return undefined;
  event.preventDefault();
  const rects = [...context.droppableRects.entries()].map(([id, rect]) => ({ id, rect })).sort((a, b) => a.rect.left - b.rect.left);
  if (!rects.length) return undefined;
  const width = context.collisionRect?.width ?? 0;
  const cx = currentCoordinates.x + width / 2;
  let idx = rects.findIndex((r) => cx >= r.rect.left && cx <= r.rect.left + r.rect.width);
  if (idx < 0) idx = rects.reduce((best, r, i) => (Math.abs(r.rect.left - cx) < Math.abs(rects[best].rect.left - cx) ? i : best), 0);
  const next = rects[Math.min(rects.length - 1, Math.max(0, idx + (event.code === "ArrowRight" ? 1 : -1)))];
  return { x: next.rect.left + Math.max(0, (next.rect.width - width) / 2), y: next.rect.top + 56 };
};

const collision: CollisionDetection = (args) => {
  const p = pointerWithin(args);
  return p.length ? p : rectIntersection(args);
};

type Props = {
  slug: string;
  orgId: string;
  userId: string;
  members: MemberLite[];
  cases: BoardCase[];
  showClosed: boolean;
  view: "tablero" | "lista";
  readOnly: boolean;
};

export function CasesBoard(props: Props) {
  const { slug, orgId, userId, members, showClosed, view, readOnly } = props;
  const router = useRouter();
  const [cases, setCases] = useState(props.cases);
  const [source, setSource] = useState(props.cases);
  if (source !== props.cases) {
    setSource(props.cases);
    setCases(props.cases);
  }
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(false);
  const [attention, setAttention] = useState(false);
  const [type, setType] = useState<CaseType | "todos">("todos");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const visible = useMemo(() => filterCases(cases, { q, mine, userId, type, attention }), [cases, q, mine, userId, type, attention]);
  const groups = useMemo(() => groupByColumn(visible, { showClosed }), [visible, showClosed]);
  const byId = useMemo(() => new Map(cases.map((c) => [c.id, c])), [cases]);

  useRealtime(
    `board:${orgId}`,
    [
      { table: "cases", filter: `org_id=eq.${orgId}` },
      { table: "messages", filter: `org_id=eq.${orgId}`, event: "INSERT" },
    ],
    (table, payload) => {
      const row = payload.new as Record<string, unknown>;
      if (table === "cases") {
        if (payload.eventType === "UPDATE" && typeof row.id === "string") {
          let found = false;
          setCases((prev) =>
            prev.map((c) => {
              if (c.id !== row.id) return c;
              found = true;
              return {
                ...c,
                status: (row.status as BoardCase["status"]) ?? c.status,
                type: (row.type as BoardCase["type"]) ?? c.type,
                status_changed_at: (row.status_changed_at as string) ?? c.status_changed_at,
                assignee_id: row.assignee_id === undefined ? c.assignee_id : (row.assignee_id as string | null),
                estimated_amount: row.estimated_amount === undefined || row.estimated_amount === null ? c.estimated_amount : Number(row.estimated_amount),
              };
            }),
          );
          if (!found) router.refresh();
        } else {
          router.refresh();
        }
      } else if (table === "messages" && typeof row.case_id === "string") {
        setCases((prev) =>
          prev.map((c) => (c.id === row.case_id ? { ...c, last_message: (row.body as string) ?? c.last_message, last_message_at: row.created_at as string } : c)),
        );
      }
    },
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnKeyboardCoordinates }),
  );

  function move(c: BoardCase, col: ColumnId) {
    const to = targetStatusForColumn(col);
    if (!to || columnOf(c.status) === col) return;
    if (readOnly) {
      toast.error("Modo solo lectura: no puedes mover casos.");
      return;
    }
    if (!canTransition(c.status, to)) {
      toast.error(`No se puede mover el caso #${c.number}`, { description: transitionError(c.status, to) });
      return;
    }
    const prev = c;
    setCases((list) => list.map((x) => (x.id === c.id ? { ...x, status: to, status_changed_at: new Date().toISOString() } : x)));
    startTransition(async () => {
      const res = await transitionCaseAction(slug, { caseId: c.id, to });
      if (!res.ok) {
        setCases((list) => list.map((x) => (x.id === prev.id ? prev : x)));
        toast.error(`No se pudo mover el caso #${c.number}`, { description: res.error });
      } else {
        toast.success(`Caso #${c.number} movido a “${STATUS_LABEL[to]}”`);
      }
    });
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const c = byId.get(String(e.active.id));
    if (!c || !e.over) return;
    move(c, e.over.id as ColumnId);
  }

  const colLabel = (id: unknown) => groups.find((g) => g.column.id === id)?.column.label ?? "";
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Tomaste el caso #${byId.get(String(active.id))?.number}. Usa las flechas izquierda y derecha para cambiar de columna y Espacio para soltar.`,
    onDragOver: ({ active, over }) => (over ? `Caso #${byId.get(String(active.id))?.number} sobre la columna ${colLabel(over.id)}.` : "Fuera de las columnas."),
    onDragEnd: ({ active, over }) => (over ? `Caso #${byId.get(String(active.id))?.number} soltado en ${colLabel(over.id)}.` : "Movimiento cancelado."),
    onDragCancel: ({ active }) => `Movimiento del caso #${byId.get(String(active.id))?.number} cancelado.`,
  };

  const active = activeId ? byId.get(activeId) : null;
  const base = `/app/${slug}/casos`;
  const qs = (p: { cerrados?: boolean; vista?: string }) => {
    const sp = new URLSearchParams();
    if (p.cerrados) sp.set("cerrados", "1");
    if (p.vista && p.vista !== "tablero") sp.set("vista", p.vista);
    const s = sp.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Filtros del tablero">
        <label className="relative min-w-48 flex-1 sm:max-w-72">
          <span className="sr-only">Buscar casos</span>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, # o mensaje"
            className="h-8 w-full rounded-lg border border-input bg-card pr-2 pl-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
        <ToggleChip pressed={mine} onClick={() => setMine((v) => !v)}>Solo míos</ToggleChip>
        <ToggleChip pressed={attention} onClick={() => setAttention((v) => !v)}>Requiere atención</ToggleChip>
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Tipo</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as CaseType | "todos")}
            className="h-8 cursor-pointer rounded-lg border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="todos">Todos</option>
            {(Object.keys(TYPE_LABEL) as CaseType[]).map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
        </label>
        <Link
          href={qs({ cerrados: !showClosed, vista: view })}
          aria-pressed={showClosed}
          className={chipClass(showClosed)}
          scroll={false}
        >
          Ver cerrados
        </Link>
        <div className="ml-auto inline-flex rounded-lg bg-muted p-0.5" role="group" aria-label="Vista">
          <Link href={qs({ cerrados: showClosed, vista: "tablero" })} aria-current={view === "tablero" ? "page" : undefined} className={viewClass(view === "tablero")} scroll={false}>
            Tablero
          </Link>
          <Link href={qs({ cerrados: showClosed, vista: "lista" })} aria-current={view === "lista" ? "page" : undefined} className={viewClass(view === "lista")} scroll={false}>
            Lista
          </Link>
        </div>
      </div>

      {view === "lista" ? (
        <CasesTable slug={slug} cases={visible.filter((c) => showClosed || columnOf(c.status) !== "cerrado")} memberById={memberById} />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collision}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable: "Para mover un caso, presiona Espacio o Enter. Usa las flechas izquierda y derecha para elegir la columna y presiona Espacio para soltar o Escape para cancelar.",
            },
          }}
        >
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
            {groups.map((g) => (
              <BoardColumn key={g.column.id} id={g.column.id} label={g.column.label} count={g.count} total={g.total} droppable={g.column.id !== "cerrado"}>
                {g.cases.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">Sin casos</p>
                ) : (
                  g.cases.map((c) => <CaseCard key={c.id} c={c} slug={slug} member={c.assignee_id ? memberById.get(c.assignee_id) : null} disabled={readOnly || columnOf(c.status) === "cerrado"} />)
                )}
              </BoardColumn>
            ))}
          </div>
          <DragOverlay dropAnimation={null}>{active ? <CardBody c={active} slug={slug} member={active.assignee_id ? memberById.get(active.assignee_id) : null} overlay /> : null}</DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

function chipClass(on: boolean) {
  return cn(
    "inline-flex h-8 cursor-pointer items-center rounded-lg border px-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
  );
}
function viewClass(on: boolean) {
  return cn(
    "inline-flex h-7 items-center rounded-md px-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
  );
}

function ToggleChip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={chipClass(pressed)}>
      {children}
    </button>
  );
}

function BoardColumn({ id, label, count, total, droppable, children }: { id: ColumnId; label: string; count: number; total: number; droppable: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !droppable });
  const headingId = `col-${id}`;
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      data-column={id}
      className={cn("flex w-72 shrink-0 snap-start flex-col rounded-xl bg-muted/70 p-2 transition-colors", isOver && "bg-secondary/60 ring-2 ring-ring/60")}
    >
      <header className="mb-2 flex items-center gap-2 px-1.5 pt-1">
        <StatusDot status={id === "cerrado" ? "resuelto" : id} className="size-2.5" />
        <h2 id={headingId} className="text-sm font-semibold">{label}</h2>
        <span className="rounded-full bg-card px-1.5 text-xs font-medium tabular-nums" aria-label={`${count} casos`}>{count}</span>
        {total > 0 && <span className="ml-auto text-xs text-muted-foreground tabular-nums">{formatMoney(total)}</span>}
      </header>
      <div className="flex min-h-24 flex-col gap-2" data-testid={`columna-${id}`}>{children}</div>
    </section>
  );
}

function CaseCard({ c, slug, member, disabled }: { c: BoardCase; slug: string; member: MemberLite | null | undefined; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: c.id, disabled });
  return (
    <div ref={setNodeRef} className={cn(isDragging && "opacity-40")}>
      <CardBody
        c={c}
        slug={slug}
        member={member}
        handle={
          disabled ? null : (
            <button
              type="button"
              {...attributes}
              {...listeners}
              aria-label={`Mover caso #${c.number}`}
              aria-roledescription="caso arrastrable"
              className="relative z-10 -ml-1 inline-flex size-6 cursor-grab touch-none items-center justify-center rounded text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/60 active:cursor-grabbing"
            >
              <GripVertical className="size-4" aria-hidden />
            </button>
          )
        }
      />
    </div>
  );
}

function CardBody({ c, slug, member, handle, overlay }: { c: BoardCase; slug: string; member: MemberLite | null | undefined; handle?: React.ReactNode; overlay?: boolean }) {
  return (
    <article
      data-testid={`caso-${c.number}`}
      className={cn(
        "group relative rounded-lg border border-border bg-card p-2.5 text-sm shadow-xs transition-shadow hover:shadow-md",
        overlay && "rotate-1 shadow-lg",
        c.status === "requiere_atencion" && "border-destructive/40",
      )}
    >
      <div className="flex items-center gap-1.5">
        {handle}
        <Link
          href={`/app/${slug}/casos/${c.number}`}
          className="min-w-0 flex-1 truncate font-semibold outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-3 focus-visible:after:ring-ring/60"
        >
          {c.contact_name}
        </Link>
        {c.status === "requiere_atencion" && (
          <span className="relative z-10 inline-flex" title="Requiere atención">
            <span className="size-2 rounded-full bg-destructive" aria-hidden />
            <span className="sr-only">Requiere atención</span>
          </span>
        )}
        <span className="text-xs text-muted-foreground tabular-nums">#{c.number}</span>
      </div>
      {c.last_message ? (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{truncate(c.last_message, 120)}</p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground italic">Sin mensajes</p>
      )}
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        {c.estimated_amount ? <span className="font-semibold text-foreground tabular-nums">{formatMoney(c.estimated_amount)}</span> : null}
        <span className="inline-flex items-center gap-1" title="Tiempo en esta columna">
          <Clock className="size-3" aria-hidden />
          <span className="sr-only">En esta columna hace</span>
          <TimeAgo iso={c.status_changed_at} mode="duration" />
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          <HandledIcon by={c.handled_by} />
          <MemberAvatar member={member} />
        </span>
      </div>
    </article>
  );
}

function CasesTable({ slug, cases, memberById }: { slug: string; cases: BoardCase[]; memberById: Map<string, MemberLite> }) {
  if (!cases.length) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        <AlertCircle className="size-4" aria-hidden /> No hay casos con estos filtros.
      </p>
    );
  }
  const sorted = [...cases].sort((a, b) => (b.last_message_at ?? b.status_changed_at).localeCompare(a.last_message_at ?? a.status_changed_at));
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[720px] text-sm">
        <caption className="sr-only">Lista de casos</caption>
        <thead className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">#</th>
            <th scope="col" className="px-3 py-2 font-medium">Cliente</th>
            <th scope="col" className="px-3 py-2 font-medium">Estado</th>
            <th scope="col" className="px-3 py-2 font-medium">Tipo</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Monto</th>
            <th scope="col" className="px-3 py-2 font-medium">En el estado</th>
            <th scope="col" className="px-3 py-2 font-medium">Atiende</th>
            <th scope="col" className="px-3 py-2 font-medium">Último mensaje</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/40">
              <td className="px-3 py-2 text-muted-foreground tabular-nums">{c.number}</td>
              <td className="px-3 py-2 font-medium">
                <Link href={`/app/${slug}/casos/${c.number}`} className="hover:underline focus-visible:underline">{c.contact_name}</Link>
              </td>
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-1.5"><StatusDot status={c.status} />{STATUS_LABEL[c.status]}</span>
              </td>
              <td className="px-3 py-2">{TYPE_LABEL[c.type]}</td>
              <td className="px-3 py-2 text-right tabular-nums">{c.estimated_amount ? formatMoney(c.estimated_amount) : "—"}</td>
              <td className="px-3 py-2 text-muted-foreground"><TimeAgo iso={c.status_changed_at} mode="duration" /></td>
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-1.5">
                  <HandledIcon by={c.handled_by} />
                  {c.assignee_id ? memberById.get(c.assignee_id)?.name ?? "—" : <span className="text-muted-foreground">Sin asignar</span>}
                </span>
              </td>
              <td className="max-w-72 truncate px-3 py-2 text-muted-foreground">{c.last_message ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
