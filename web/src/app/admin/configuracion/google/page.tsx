import { SecretField } from "@/components/admin/secret-field";
import { TestConnection } from "@/components/admin/test-connection";
import { Section } from "@/components/forms/fields";
import { getPlatformConfig } from "@/lib/admin/server";
import { requirePlatformAdmin } from "@/lib/auth";
import { PlacesForm } from "../forms";

export default async function AdminConfigPlacesPage() {
  const role = await requirePlatformAdmin();
  const canEdit = role === "superadmin";
  const { settings, secrets } = await getPlatformConfig();
  return (
    <div className="space-y-6">
      <PlacesForm initial={settings.places} canEdit={canEdit} />
      <Section title="Credenciales de Google" description="La API key se guarda cifrada en Vault.">
        <SecretField
          name="google_places_api_key"
          label="API key de Google Places"
          description="En console.cloud.google.com → APIs y servicios → Credenciales. Activa Places API (New)."
          meta={secrets.google_places_api_key}
          canEdit={canEdit}
        />
        <TestConnection target="google-places" label="Probar" disabled={!canEdit || !secrets.google_places_api_key} />
      </Section>
    </div>
  );
}
