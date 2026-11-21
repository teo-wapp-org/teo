"use client";

// Embedded Signup de Meta: carga el SDK de Facebook, abre el popup de alta y envía el `code`
// (más phone_number_id y waba_id recibidos por postMessage) al endpoint del servidor, que lo pasa a la
// Edge Function whatsapp-connect (app secret en Vault).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GRAPH_VERSION } from "@/lib/whatsapp/constants";

type FBLoginResponse = { authResponse?: { code?: string } | null; status?: string };
type FBSDK = {
  init(opts: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }): void;
  login(cb: (r: FBLoginResponse) => void, opts: Record<string, unknown>): void;
};
declare global {
  interface Window {
    FB?: FBSDK;
    fbAsyncInit?: () => void;
  }
}

function loadSdk(appId: string, version: string): Promise<FBSDK> {
  return new Promise((resolve, reject) => {
    if (window.FB) return resolve(window.FB);
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      resolve(window.FB!);
    };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/es_LA/sdk.js";
    s.async = true;
    s.defer = true;
    s.crossOrigin = "anonymous";
    s.onerror = () => reject(new Error("No se pudo cargar el SDK de Facebook"));
    document.body.appendChild(s);
  });
}

export function EmbeddedSignupButton({
  slug,
  appId,
  configId,
  graphVersion = GRAPH_VERSION,
}: {
  slug: string;
  appId?: string | null;
  configId?: string | null;
  graphVersion?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const session = useRef<{ phone_number_id?: string; waba_id?: string; coexistence?: boolean }>({});

  useEffect(() => {
    if (!appId || !configId) return;
    const onMessage = (ev: MessageEvent) => {
      if (!/(^|\.)facebook\.com$/.test(new URL(ev.origin).hostname)) return;
      try {
        const data = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
        if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (data.event === "FINISH" || data.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
          session.current = {
            phone_number_id: data.data?.phone_number_id,
            waba_id: data.data?.waba_id,
            coexistence: data.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
          };
        } else if (data.event === "CANCEL") {
          setMsg({ kind: "error", text: "Cancelaste la conexión antes de terminar." });
        }
      } catch {
        // mensajes ajenos al Embedded Signup
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [appId, configId]);

  if (!appId || !configId) {
    return (
      <div className="space-y-2">
        <Button type="button" disabled>Conectar con Facebook</Button>
        <p className="text-sm text-muted-foreground">Disponible cuando Meta apruebe a Teo como Tech Provider.</p>
      </div>
    );
  }

  async function start() {
    setBusy(true);
    setMsg(null);
    try {
      const FB = await loadSdk(appId!, graphVersion);
      FB.login(
        (r) => {
          const code = r.authResponse?.code;
          if (!code) {
            setBusy(false);
            return;
          }
          // el postMessage con los ids puede llegar un instante después del callback
          setTimeout(async () => {
            const { phone_number_id, waba_id, coexistence } = session.current;
            if (!phone_number_id || !waba_id) {
              setMsg({ kind: "error", text: "Meta no devolvió el número elegido. Inténtalo de nuevo." });
              setBusy(false);
              return;
            }
            const res = await fetch(`/app/${slug}/configuracion/whatsapp/embedded-signup`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code, phone_number_id, waba_id, coexistence }),
            });
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            setMsg(res.ok ? { kind: "ok", text: "¡Listo! Tu WhatsApp quedó conectado." } : { kind: "error", text: body.error ?? "No pudimos conectar tu número." });
            setBusy(false);
            router.refresh();
          }, 500);
        },
        {
          config_id: configId,
          response_type: "code",
          override_default_response_type: true,
          extras: { setup: {}, sessionInfoVersion: "3" },
        },
      );
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="cta" onClick={start} disabled={busy}>
        {busy && <Loader2 className="animate-spin" data-icon="inline-start" />}
        Conectar con Facebook
      </Button>
      {msg && (
        <p role={msg.kind === "error" ? "alert" : "status"} className={msg.kind === "error" ? "text-sm text-destructive" : "text-sm"}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
