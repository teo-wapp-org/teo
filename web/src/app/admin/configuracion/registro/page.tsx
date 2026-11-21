import { SecretField } from "@/components/admin/secret-field";
import { Section } from "@/components/forms/fields";
import { getPlatformConfig } from "@/lib/admin/server";
import { requirePlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AuthConfigPanel } from "../auth-config";
import { SignupForm } from "../forms";

export default async function AdminConfigSignupPage() {
  const role = await requirePlatformAdmin();
  const canEdit = role === "superadmin";
  const supabase = await createClient();
  const [{ settings, secrets }, { data: plans }] = await Promise.all([getPlatformConfig(), supabase.from("plans").select("id, name, active").order("sort_order")]);
  return (
    <div className="space-y-6">
      <SignupForm initial={settings.signup} canEdit={canEdit} plans={plans ?? []} />
      <Section title="Supabase Auth" description="Ajustes del servicio de autenticación. Se aplican directamente en Supabase.">
        <SecretField
          name="supabase_management_token"
          label="Token de administración de Supabase"
          description={
            <>
              Créalo en{" "}
              <a className="font-medium underline underline-offset-2" href="https://supabase.com/dashboard/account/tokens" target="_blank" rel="noreferrer">
                supabase.com/dashboard/account/tokens
              </a>{" "}
              con una cuenta que administre el proyecto. Empieza con <code>sbp_</code>.
            </>
          }
          meta={secrets.supabase_management_token}
          canEdit={canEdit}
        />
        <AuthConfigPanel canEdit={canEdit} hasToken={!!secrets.supabase_management_token} />
      </Section>
    </div>
  );
}
