import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { remainingProducts } from "@/lib/catalogo/formato";
import { getCategories, getPlanQuota, requireCatalog } from "@/lib/data/catalogo";
import { PlanAviso } from "../_components/plan-aviso";
import { ProductForm } from "../_components/product-form";

export const metadata: Metadata = { title: "Nuevo producto" };

export default async function NuevoProductoPage({ params }: PageProps<"/app/[org]/catalogo/nuevo">) {
  const { org: slug } = await params;
  const { org, canEdit } = await requireCatalog(slug);
  if (!canEdit) notFound();
  const [categories, quota] = await Promise.all([getCategories(org.id), getPlanQuota(org.id)]);
  const full = remainingProducts(quota) <= 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link href={`/app/${org.slug}/catalogo`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" aria-hidden /> Catálogo
        </Link>
        <h1 className="mt-1 text-3xl font-bold">Nuevo producto</h1>
      </div>
      <PlanAviso quota={quota} slug={org.slug} />
      {!full && (
        <ProductForm
          slug={org.slug}
          orgId={org.id}
          mode="create"
          categories={categories}
          initial={{
            id: crypto.randomUUID(),
            name: "",
            description: "",
            price: "",
            categoryId: null,
            sku: "",
            stock: "",
            trackStock: false,
            active: true,
            attributes: [],
            variants: [],
            photos: [],
          }}
        />
      )}
    </div>
  );
}
