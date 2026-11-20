import { RouteTabs } from "@/components/app/route-tabs";
import { ReadOnlyNotice } from "@/components/forms/fields";
import { requirePlatformAdmin } from "@/lib/auth";

export const metadata = { title: "Configuración · Admin" };

const BASE = "/admin/configuracion";
const TABS = [
  { href: BASE, label: "Inteligencia artificial" },
  { href: `${BASE}/whatsapp`, label: "WhatsApp / Meta" },
  { href: `${BASE}/google`, label: "Google Places" },
  { href: `${BASE}/registro`, label: "Registro y acceso" },
  { href: `${BASE}/correo`, label: "Correo" },
  { href: `${BASE}/marca`, label: "Marca y soporte" },
];

export default async function AdminConfigLayout({ children }: { children: React.ReactNode }) {
  const role = await requirePlatformAdmin();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configuración</h1>
        <p className="text-muted-foreground">Ajustes globales de Teo. Cada cambio queda registrado en la auditoría.</p>
      </div>
      <RouteTabs tabs={TABS} label="Secciones de configuración" />
      {role !== "superadmin" && <ReadOnlyNotice>Tu rol es de soporte: puedes ver la configuración, pero no cambiarla.</ReadOnlyNotice>}
      {children}
    </div>
  );
}
