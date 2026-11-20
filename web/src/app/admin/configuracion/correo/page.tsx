import { SecretField } from "@/components/admin/secret-field";
import { TestConnection } from "@/components/admin/test-connection";
import { Section } from "@/components/forms/fields";
import { getPlatformConfig } from "@/lib/admin/server";
import { requirePlatformAdmin } from "@/lib/auth";
import { EmailForm } from "../forms";

export default async function AdminConfigEmailPage() {
  const role = await requirePlatformAdmin();
  const canEdit = role === "superadmin";
  const { settings, secrets } = await getPlatformConfig();
  return (
    <div className="space-y-6">
      <EmailForm initial={settings.email} canEdit={canEdit} />
      <Section title="Credenciales de Resend" description="Servicio con el que Teo envía correos. La API key se guarda cifrada en Vault.">
        <SecretField
          name="resend_api_key"
          label="API key de Resend"
          description="En resend.com → API Keys. Empieza con re_."
          meta={secrets.resend_api_key}
          canEdit={canEdit}
        />
        <TestConnection target="resend" label="Probar" disabled={!canEdit || !secrets.resend_api_key} />
      </Section>
    </div>
  );
}
