// Embedded Signup de Meta (servidor). El popup de Facebook devuelve un `code` y, por postMessage,
// el phone_number_id y el waba_id elegidos. Aquí se intercambia el code por el token del comercio,
// se suscribe la app a la WABA, se registra el número y se guarda todo con connect_whatsapp_account (token → Vault).
//
// Requiere (Vercel): NEXT_PUBLIC_META_APP_ID, NEXT_PUBLIC_META_ES_CONFIG_ID y META_APP_SECRET (= WHATSAPP_APP_SECRET).
// Hasta que Meta apruebe a Teo como Tech Provider responde 503.
import { randomInt } from "node:crypto";
import { z } from "zod";
import { getMemberships, getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { exchangeCode, fetchPhoneNumber, registerPhone, subscribeApp } from "@/lib/whatsapp/graph";

const Body = z.object({
  code: z.string().min(10).max(2048),
  phone_number_id: z.string().regex(/^[0-9]{5,30}$/),
  waba_id: z.string().regex(/^[0-9]{5,30}$/),
  coexistence: z.boolean().optional(),
});

export async function POST(req: Request, ctx: RouteContext<"/app/[org]/configuracion/whatsapp/embedded-signup">) {
  const { org: slug } = await ctx.params;
  const user = await getUser();
  if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });
  const m = (await getMemberships()).find((x) => x.organization.slug === slug);
  if (!m || (m.role !== "owner" && m.role !== "admin")) return Response.json({ error: "Sin permiso" }, { status: 403 });

  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return Response.json({ error: "Embedded Signup aún no está habilitado (falta la app de Meta)." }, { status: 503 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Datos inválidos" }, { status: 400 });
  const { code, phone_number_id, waba_id, coexistence } = parsed.data;

  const tok = await exchangeCode(code, appId, appSecret);
  if (!tok.ok) return Response.json({ error: `Meta rechazó el código: ${tok.reason}` }, { status: 502 });
  const token = tok.data.access_token;

  const sub = await subscribeApp(waba_id, token);
  if (!sub.ok) return Response.json({ error: `No pudimos suscribir los webhooks: ${sub.reason}` }, { status: 502 });

  if (!coexistence) {
    // PIN de verificación en dos pasos del número (Meta lo exige al registrar).
    const reg = await registerPhone(phone_number_id, token, String(randomInt(0, 1_000_000)).padStart(6, "0"));
    if (!reg.ok) return Response.json({ error: `No pudimos registrar el número: ${reg.reason}` }, { status: 502 });
  }

  const info = await fetchPhoneNumber(phone_number_id, token);
  const supabase = await createClient();
  const { error } = await supabase.rpc("connect_whatsapp_account", {
    p_org: m.organization.id,
    p_phone_number_id: phone_number_id,
    p_waba_id: waba_id,
    p_token: token,
    p_display_phone: info.ok ? info.data.display_phone_number : undefined,
    p_verified_name: info.ok ? info.data.verified_name : undefined,
    p_status: "conectado",
    p_quality_rating: info.ok ? info.data.quality_rating : undefined,
  });
  if (error) {
    return Response.json({ error: error.code === "23505" ? "Ese número ya está conectado a otro comercio." : "No pudimos guardar la conexión." }, { status: 409 });
  }
  return Response.json({ ok: true });
}
