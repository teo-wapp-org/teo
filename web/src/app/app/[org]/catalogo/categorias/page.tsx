import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getCategories, requireCatalog } from "@/lib/data/catalogo";
import { createClient } from "@/lib/supabase/server";
import { CategoryManager } from "./manager";

export const metadata: Metadata = { title: "Categorías" };

export default async function CategoriasPage({ params }: PageProps<"/app/[org]/catalogo/categorias">) {
  const { org: slug } = await params;
  const { org, canEdit } = await requireCatalog(slug);
  const supabase = await createClient();
  const [categories, { data: counts }] = await Promise.all([
    getCategories(org.id),
    supabase.from("products").select("category_id").eq("org_id", org.id).not("category_id", "is", null),
  ]);
  const byCategory = new Map<string, number>();
  for (const p of counts ?? []) if (p.category_id) byCategory.set(p.category_id, (byCategory.get(p.category_id) ?? 0) + 1);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/app/${org.slug}/catalogo`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" aria-hidden /> Catálogo
        </Link>
        <h1 className="mt-1 text-3xl font-bold">Categorías</h1>
        <p className="text-muted-foreground">Ordénalas como quieres que Teo las presente a tus clientes.</p>
      </div>
      <CategoryManager
        slug={org.slug}
        readOnly={!canEdit}
        initial={categories.map((c) => ({ id: c.id, name: c.name, products: byCategory.get(c.id) ?? 0 }))}
      />
    </div>
  );
}
