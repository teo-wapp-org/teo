import Image from "next/image";
import { notFound } from "next/navigation";
import { ORG_NAV, PLACEHOLDER_SECTIONS } from "@/components/app/nav";
import { requireOrg } from "@/lib/auth";

export default async function SectionPlaceholder({ params }: PageProps<"/app/[org]/[section]">) {
  const { org: slug, section } = await params;
  if (!PLACEHOLDER_SECTIONS.has(section)) notFound();
  await requireOrg(slug);
  const item = ORG_NAV.find((n) => n.slug === section)!;
  return (
    <div className="mx-auto grid max-w-lg place-items-center gap-4 py-24 text-center">
      <Image src="/brand/personaje.png" alt="" width={320} height={327} className="size-20 rounded-3xl" />
      <h1 className="text-2xl font-bold">{item.label}</h1>
      <p className="text-muted-foreground">Estamos construyendo esta sección. Muy pronto podrás gestionarla desde aquí.</p>
    </div>
  );
}
