import type { Metadata } from "next";
import Link from "next/link";
import { Search, Tag } from "lucide-react";
import { EmptyState, TimeAgo } from "@/components/operacion/bits";
import { buttonVariants } from "@/components/ui/button";
import { requireOrg } from "@/lib/auth";
import { contactDisplayName, formatPhone } from "@/lib/casos";
import { cleanSearch, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Clientes" };
const PAGE = 50;

type ContactRow = { id: string; name: string | null; profile_name: string | null; wa_id: string; email: string | null; tags: string[]; last_message_at: string | null };

export default async function ClientesPage({ params, searchParams }: PageProps<"/app/[org]/clientes">) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const { org } = await requireOrg(slug);
  const supabase = await createClient();
  const q = cleanSearch(sp.q);
  const tag = typeof sp.tag === "string" ? sp.tag.slice(0, 40) : "";
  const page = Math.max(1, Math.min(1000, Number(sp.page) || 1));
  const base = `/app/${org.slug}/clientes`;

  let query = supabase
    .from("contacts")
    .select("id, name, profile_name, wa_id, email, tags, last_message_at", { count: "exact" })
    .eq("org_id", org.id)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (q) query = query.or(`name.ilike.%${q}%,profile_name.ilike.%${q}%,wa_id.ilike.%${q}%,email.ilike.%${q}%`);
  if (tag) query = query.contains("tags", [tag]);

  const [{ data, count, error }, tagRows] = await Promise.all([
    query,
    supabase.from("contacts").select("tags").eq("org_id", org.id).not("tags", "eq", "{}").limit(1000),
  ]);
  if (error) throw error;
  const contacts = (data ?? []) as ContactRow[];
  const allTags = [...new Set((tagRows.data ?? []).flatMap((r) => (r.tags as string[]) ?? []))].sort();

  const ids = contacts.map((c) => c.id);
  const [cases, orders] = ids.length
    ? await Promise.all([
        supabase.from("cases").select("contact_id").eq("org_id", org.id).in("contact_id", ids),
        supabase.from("orders").select("contact_id, total").eq("org_id", org.id).eq("status", "pagado").in("contact_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const caseCount = new Map<string, number>();
  for (const c of cases.data ?? []) caseCount.set(c.contact_id as string, (caseCount.get(c.contact_id as string) ?? 0) + 1);
  const spent = new Map<string, number>();
  for (const o of orders.data ?? []) spent.set(o.contact_id as string, (spent.get(o.contact_id as string) ?? 0) + Number(o.total));

  const total = count ?? contacts.length;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (p: { q?: string; tag?: string; page?: number }) => {
    const s = new URLSearchParams();
    if (p.q) s.set("q", p.q);
    if (p.tag) s.set("tag", p.tag);
    if (p.page && p.page > 1) s.set("page", String(p.page));
    const str = s.toString();
    return str ? `${base}?${str}` : base;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-muted-foreground">{total.toLocaleString("es-EC")} {total === 1 ? "cliente" : "clientes"}{q || tag ? " con estos filtros" : ""}</p>
        </div>
        <form role="search" className="flex w-full gap-2 sm:w-auto">
          {tag && <input type="hidden" name="tag" value={tag} />}
          <label className="relative flex-1 sm:w-72">
            <span className="sr-only">Buscar clientes</span>
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input name="q" type="search" defaultValue={q} placeholder="Nombre, teléfono o correo" className="h-8 w-full rounded-lg border border-input bg-card pr-2 pl-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
          </label>
          <button type="submit" className={buttonVariants({ variant: "outline" })}>Buscar</button>
        </form>
      </div>

      {allTags.length > 0 && (
        <nav aria-label="Filtrar por etiqueta" className="flex flex-wrap gap-1.5">
          <Link href={href({ q })} aria-current={!tag ? "page" : undefined} className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", !tag ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted")}>
            Todas
          </Link>
          {allTags.map((t) => (
            <Link key={t} href={href({ q, tag: t })} aria-current={tag === t ? "page" : undefined} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", tag === t ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted")}>
              <Tag className="size-3" aria-hidden />{t}
            </Link>
          ))}
        </nav>
      )}

      {contacts.length === 0 ? (
        <EmptyState title={q || tag ? "Sin resultados" : "Aún no tienes clientes"}>
          {q || tag ? "Prueba con otra búsqueda o etiqueta." : "Cada persona que escriba a tu WhatsApp aparecerá aquí con sus casos y compras."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">Lista de clientes</caption>
            <thead className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Cliente</th>
                <th scope="col" className="px-3 py-2 font-medium">Teléfono</th>
                <th scope="col" className="px-3 py-2 font-medium">Etiquetas</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Casos</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Total gastado</th>
                <th scope="col" className="px-3 py-2 font-medium">Último mensaje</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/40" data-testid="fila-cliente">
                  <td className="px-3 py-2 font-medium">
                    <Link href={`${base}/${c.id}`} className="hover:underline">{contactDisplayName(c)}</Link>
                    {c.email && <span className="block text-xs font-normal text-muted-foreground">{c.email}</span>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">{formatPhone(c.wa_id)}</td>
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap gap-1">
                      {(c.tags ?? []).map((t) => <span key={t} className="rounded-full bg-secondary px-2 py-px text-xs text-secondary-foreground">{t}</span>)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{caseCount.get(c.id) ?? 0}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{formatMoney(spent.get(c.id) ?? 0)}</td>
                  <td className="px-3 py-2 text-muted-foreground"><TimeAgo iso={c.last_message_at} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Paginación" className="flex items-center justify-center gap-2 text-sm">
          {page > 1 && <Link href={href({ q, tag, page: page - 1 })} className={buttonVariants({ variant: "outline", size: "sm" })}>Anterior</Link>}
          <span className="text-muted-foreground">Página {page} de {pages}</span>
          {page < pages && <Link href={href({ q, tag, page: page + 1 })} className={buttonVariants({ variant: "outline", size: "sm" })}>Siguiente</Link>}
        </nav>
      )}
    </div>
  );
}
