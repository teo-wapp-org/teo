import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ImageOff, Plus, Search, Tag, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatUSD, publicPhotoUrl, sanitizeSearch } from "@/lib/catalogo/formato";
import { getCategories, getPlanQuota, requireCatalog } from "@/lib/data/catalogo";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { PlanAviso } from "./_components/plan-aviso";

export const metadata: Metadata = { title: "Catálogo" };

const PAGE_SIZE = 24;
const selectClass =
  "h-9 w-full rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type Row = {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  stock: number | null;
  active: boolean;
  category: { name: string } | null;
  product_media: { storage_path: string; sort_order: number }[];
  product_variants: { count: number }[];
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function CatalogoPage({ params, searchParams }: PageProps<"/app/[org]/catalogo">) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const { org, canEdit } = await requireCatalog(slug);
  const base = `/app/${org.slug}/catalogo`;

  const q = sanitizeSearch(one(sp.q));
  const cat = one(sp.categoria);
  const estado = one(sp.estado);
  const page = Math.max(1, Number.parseInt(one(sp.pagina) || "1", 10) || 1);
  const filtering = Boolean(q || cat || estado);

  const supabase = await createClient();
  let query = supabase
    .from("products")
    .select(
      "id, name, sku, price, stock, active, category:product_categories(name), product_media(storage_path, sort_order), product_variants(count)",
      { count: "exact" },
    )
    .eq("org_id", org.id);
  if (q) query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%`);
  if (cat === "sin") query = query.is("category_id", null);
  else if (/^[0-9a-f-]{36}$/i.test(cat)) query = query.eq("category_id", cat);
  if (estado === "activos") query = query.eq("active", true);
  if (estado === "inactivos") query = query.eq("active", false);
  query = query
    .order("name")
    .order("sort_order", { referencedTable: "product_media" })
    .limit(1, { referencedTable: "product_media" })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const [{ data, count, error }, categories, quota] = await Promise.all([query, getCategories(org.id), getPlanQuota(org.id)]);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Row[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageHref = (n: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (cat) u.set("categoria", cat);
    if (estado) u.set("estado", estado);
    if (n > 1) u.set("pagina", String(n));
    const s = u.toString();
    return s ? `${base}?${s}` : base;
  };

  const emptyCatalog = quota.used === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Catálogo</h1>
          <p className="text-muted-foreground">
            {quota.used.toLocaleString("es-EC")} {quota.used === 1 ? "producto" : "productos"}
            {quota.maxProducts != null && ` de ${quota.maxProducts.toLocaleString("es-EC")} en tu plan ${quota.planName}`}
          </p>
        </div>
        {canEdit && !emptyCatalog && (
          <div className="flex flex-wrap gap-2">
            <Link href={`${base}/categorias`} className={cn(buttonVariants({ variant: "outline" }), "h-9 px-3")}>
              <Tag aria-hidden /> Categorías
            </Link>
            <Link href={`${base}/importar`} className={cn(buttonVariants({ variant: "outline" }), "h-9 px-3")}>
              <Upload aria-hidden /> Importar
            </Link>
            <Link href={`${base}/nuevo`} className={cn(buttonVariants({ variant: "cta" }), "h-9 px-4")}>
              <Plus aria-hidden /> Agregar producto
            </Link>
          </div>
        )}
      </div>

      {canEdit && <PlanAviso quota={quota} slug={org.slug} />}

      {emptyCatalog ? (
        <section className="mx-auto grid max-w-lg place-items-center gap-4 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <Image src="/brand/personaje.png" alt="" width={152} height={155} className="size-20 rounded-3xl" />
          <h2 className="text-2xl font-bold">Tu catálogo está vacío</h2>
          <p className="text-muted-foreground">
            Carga tus productos con precio y fotos. Teo los usará para responder a tus clientes y cerrar ventas por WhatsApp.
          </p>
          {canEdit ? (
            <div className="flex flex-wrap justify-center gap-2">
              <Link href={`${base}/nuevo`} className={cn(buttonVariants({ variant: "cta" }), "h-10 px-4")}>
                <Plus aria-hidden /> Agregar producto
              </Link>
              <Link href={`${base}/importar`} className={cn(buttonVariants({ variant: "outline" }), "h-10 px-4")}>
                <Upload aria-hidden /> Importar
              </Link>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Pide al dueño del comercio que cargue el catálogo.</p>
          )}
        </section>
      ) : (
        <>
          <form role="search" action={base} className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[1fr_12rem_10rem_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="q">Buscar</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input id="q" name="q" type="search" defaultValue={q} placeholder="Nombre o SKU" className="h-9 pl-8" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="categoria">Categoría</Label>
              <select id="categoria" name="categoria" defaultValue={cat} className={selectClass}>
                <option value="">Todas</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
                <option value="sin">Sin categoría</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="estado">Estado</Label>
              <select id="estado" name="estado" defaultValue={estado} className={selectClass}>
                <option value="">Todos</option>
                <option value="activos">Activos</option>
                <option value="inactivos">Inactivos</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="h-9 flex-1 px-4 sm:flex-none">Buscar</Button>
              {filtering && (
                <Link href={base} className={cn(buttonVariants({ variant: "ghost" }), "h-9 px-3")}>Limpiar</Link>
              )}
            </div>
          </form>

          {rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
              <p className="font-semibold">No encontramos productos con esos filtros.</p>
              <Link href={base} className="mt-2 inline-block text-sm font-medium underline underline-offset-4">Ver todo el catálogo</Link>
            </div>
          ) : (
            <section aria-label="Productos" className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="hidden grid-cols-[3.5rem_1fr_8rem_8rem_6.5rem] gap-4 border-b border-border px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase md:grid" aria-hidden>
                <span>Foto</span><span>Producto</span><span className="text-right">Precio</span><span>Stock</span><span>Estado</span>
              </div>
              <ul className="divide-y divide-border">
                {rows.map((p) => {
                  const photo = p.product_media[0]?.storage_path;
                  const variants = p.product_variants[0]?.count ?? 0;
                  return (
                    <li key={p.id}>
                      <Link
                        href={`${base}/${p.id}`}
                        className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none md:grid-cols-[3.5rem_1fr_8rem_8rem_6.5rem]"
                      >
                        <span className="row-span-2 grid size-14 place-items-center overflow-hidden rounded-xl bg-muted md:row-span-1">
                          {photo ? (
                            <Image src={publicPhotoUrl(photo)} alt="" width={112} height={112} className="size-14 object-cover" />
                          ) : (
                            <ImageOff className="size-5 text-muted-foreground" aria-hidden />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{p.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {[p.category?.name ?? "Sin categoría", p.sku && `SKU ${p.sku}`, variants > 0 && `${variants} ${variants === 1 ? "variante" : "variantes"}`]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        <span className="text-right font-semibold tabular-nums">{formatUSD(p.price)}</span>
                        <span className="col-start-2 text-sm md:col-start-auto">
                          {p.stock == null ? (
                            <span className="text-muted-foreground">Sin control</span>
                          ) : p.stock === 0 ? (
                            <span className="font-medium text-destructive">Agotado</span>
                          ) : (
                            <span className="tabular-nums">{p.stock.toLocaleString("es-EC")} en stock</span>
                          )}
                        </span>
                        <span className="justify-self-end md:justify-self-start">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                              p.active ? "bg-cta text-cta-foreground" : "bg-muted text-muted-foreground",
                            )}
                          >
                            {p.active ? "Activo" : "Inactivo"}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {pages > 1 && (
            <nav aria-label="Paginación" className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Página {page} de {pages} · {total.toLocaleString("es-EC")} resultados
              </p>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link href={pageHref(page - 1)} className={cn(buttonVariants({ variant: "outline" }), "h-9 px-3")}>
                    <ChevronLeft aria-hidden /> Anterior
                  </Link>
                ) : null}
                {page < pages ? (
                  <Link href={pageHref(page + 1)} className={cn(buttonVariants({ variant: "outline" }), "h-9 px-3")}>
                    Siguiente <ChevronRight aria-hidden />
                  </Link>
                ) : null}
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
