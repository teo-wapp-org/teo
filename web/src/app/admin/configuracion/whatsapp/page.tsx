import { CopyField } from "@/components/admin/copy-field";
import { SecretField } from "@/components/admin/secret-field";
import { TestConnection } from "@/components/admin/test-connection";
import { Section } from "@/components/forms/fields";
import { getPlatformConfig } from "@/lib/admin/server";
import { requirePlatformAdmin } from "@/lib/auth";
import { MetaForm } from "../forms";

export default async function AdminConfigMetaPage() {
  const role = await requirePlatformAdmin();
  const canEdit = role === "superadmin";
  const { settings, secrets } = await getPlatformConfig();
  const webhookUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/whatsapp-webhook`;
  return (
    <div className="space-y-6">
      <MetaForm initial={settings.meta} canEdit={canEdit} />
      <Section title="Webhook y credenciales" description="Meta envía los mensajes de WhatsApp a esta URL. Los secretos se guardan cifrados en Vault.">
        <CopyField id="webhook-url" label="URL del webhook" value={webhookUrl} hint="Pégala en Meta → WhatsApp → Configuración → Webhook." />
        <SecretField
          name="meta_app_secret"
          label="App Secret de Meta"
          description="Sirve para verificar que los avisos del webhook vienen de Meta (firma X-Hub-Signature-256)."
          meta={secrets.meta_app_secret}
          canEdit={canEdit}
        />
        <SecretField
          name="whatsapp_verify_token"
          label="Verify token del webhook"
          description="Una clave que inventas tú y pegas también en Meta al registrar el webhook. Usa “Generar” para crear una segura."
          meta={secrets.whatsapp_verify_token}
          canEdit={canEdit}
          generate
        />
        <TestConnection target="meta" label="Probar" disabled={!canEdit} />
      </Section>
      <Section title="Pasos en Meta" description="Para conectar Teo con la plataforma de WhatsApp Business.">
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            En developers.facebook.com crea una app de tipo <strong>Empresa</strong> y agrega el producto <strong>WhatsApp</strong>.
          </li>
          <li>
            Copia el <strong>App ID</strong> y el <strong>App Secret</strong> (Configuración → Básica) y guárdalos aquí.
          </li>
          <li>
            En WhatsApp → Configuración registra la URL del webhook con tu <strong>verify token</strong> y suscríbete al campo <code>messages</code>.
          </li>
          <li>
            En Facebook Login para empresas crea una configuración de <strong>Embedded Signup</strong> y pega aquí su Config ID.
          </li>
          <li>Usa “Probar” para confirmar que todo responde.</li>
        </ol>
      </Section>
    </div>
  );
}
