import { Section } from "@/components/forms/fields";
import { SecretField } from "@/components/admin/secret-field";
import { TestConnection } from "@/components/admin/test-connection";
import { getPlatformConfig } from "@/lib/admin/server";
import { requirePlatformAdmin } from "@/lib/auth";
import { AiForm } from "./forms";

export default async function AdminConfigIaPage() {
  const role = await requirePlatformAdmin();
  const canEdit = role === "superadmin";
  const { settings, secrets } = await getPlatformConfig();
  return (
    <div className="space-y-6">
      <AiForm initial={settings.ai} canEdit={canEdit} hasKey={!!secrets.anthropic_api_key} />
      <Section title="Credenciales de Anthropic" description="La API key se guarda cifrada en Vault. Nadie puede volver a verla, solo reemplazarla.">
        <SecretField
          name="anthropic_api_key"
          label="API key de Anthropic"
          description={
            <>
              Créala en console.anthropic.com → API keys. Empieza con <code>sk-ant-</code>.
            </>
          }
          meta={secrets.anthropic_api_key}
          canEdit={canEdit}
        />
        <TestConnection target="anthropic" disabled={!canEdit || !secrets.anthropic_api_key} />
      </Section>
    </div>
  );
}
