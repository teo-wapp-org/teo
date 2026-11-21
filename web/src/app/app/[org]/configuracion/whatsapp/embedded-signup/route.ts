// Embedded Signup de Meta (servidor). El popup de Facebook devuelve un `code` y, por postMessage,
// el phone_number_id y el waba_id elegidos. Esta ruta valida sesión y rol, y delega en la Edge Function
// `whatsapp-connect` (con el JWT del usuario), que intercambia el code con el app secret guardado en
// Vault, suscribe la app a la WABA, registra el número y guarda todo con connect_whatsapp_account.
// El App ID y el config ID vienen de la config de la plataforma (/admin); Next no necesita secretos de Meta.
import { FunctionsHttpError } from "@supabase/supabase-js";
import { z } from "zod";
import { getMemberships, getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Datos inválidos" }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.functions.invoke("whatsapp-connect", { body: { ...parsed.data, org_id: m.organization.id } });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const res = error.context as Response;
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return Response.json({ error: body.error ?? "No pudimos conectar tu número." }, { status: res.status });
    }
    return Response.json({ error: "No pudimos conectar tu número." }, { status: 502 });
  }
  return Response.json({ ok: true });
}
