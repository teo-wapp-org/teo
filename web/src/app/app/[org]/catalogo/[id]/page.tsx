import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { attributesToList } from "@/lib/catalogo/producto";
import { getCategories, requireCatalog } from "@/lib/data/catalogo";
import { createClient } from "@/lib/supabase/server";
import { ProductForm } from "../_components/product-form";

export const metadata: Metadata = { title: "Editar producto" };

const money = (n: number | null) => (n == null ? "" : Number(n).toFixed(2).replace(".", ","));

export default async function EditarProductoPage({ params }: PageProps<"/app/[org]/catalogo/[id]">) {
  const { org: slug, id } = await params;
  const { org, canEdit } = await requireCatalog(slug);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [{ data: product }, categories] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, description, price, category_id, sku, stock, active, attributes, product_variants(id, name, price, stock, active, sort_order), product_media(storage_path, sort_order)")
      .eq("id", id)
      .eq("org_id", org.id)
      .order("sort_order", { referencedTable: "product_variants" })
      .order("sort_order", { referencedTable: "product_media" })
      .maybeSingle(),
    getCategories(org.id),
  ]);
  if (!product) notFound();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link href={`/app/${org.slug}/catalogo`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" aria-hidden /> Catálogo
        </Link>
        <h1 className="mt-1 truncate text-3xl font-bold">{product.name}</h1>
      </div>
      <ProductForm
        key={product.id}
        slug={org.slug}
        orgId={org.id}
        mode="update"
        readOnly={!canEdit}
        categories={categories}
        initial={{
          id: product.id,
          name: product.name,
          description: product.description ?? "",
          price: money(product.price),
          categoryId: product.category_id,
          sku: product.sku ?? "",
          stock: product.stock == null ? "" : String(product.stock),
          trackStock: product.stock != null,
          active: product.active,
          attributes: attributesToList(product.attributes),
          variants: product.product_variants.map((v) => ({
            id: v.id,
            name: v.name,
            price: money(v.price),
            stock: v.stock == null ? "" : String(v.stock),
            active: v.active,
          })),
          photos: product.product_media.map((m) => m.storage_path),
        }}
      />
    </div>
  );
}
