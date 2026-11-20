import { EmptyState } from "@/components/forms/fields";
import { requireOrg } from "@/lib/auth";

export const metadata = { title: "WhatsApp" };

export default async function WhatsappPage({ params }: PageProps<"/app/[org]/configuracion/whatsapp">) {
  const { org: slug } = await params;
  await requireOrg(slug);
  return (
    <EmptyState title="Próximamente">
      Muy pronto podrás conectar el WhatsApp de tu negocio desde aquí, en pocos pasos y sin complicaciones.
    </EmptyState>
  );
}
