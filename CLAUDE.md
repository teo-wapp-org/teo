# Teo — guía para agentes

- La fuente de verdad del producto es `FICHA_TECNICA.md`. Léela antes de cualquier tarea. Si una decisión cambia, actualiza ahí la sección 18 (Decisiones) y la 20 (Registro de cambios).
- La marca está en `TEO_Brand_Kit_v1.0/`. Solo se lee, no se modifica. Para diseño, la precedencia es: manual de marca > `design-system/teo/MASTER.md` > skill ui-ux-pro-max.
- Idioma del producto y de la documentación: español (Ecuador). Zona horaria `America/Guayaquil`, moneda USD.
- Estado actual: planificación. No hay código todavía; el plan de arranque está en la sección 19 de la ficha.
- `.ref/` contiene los repos de referencia `context-gpt/supabase` y `context-gpt/dashboard`. Son solo referencia (manejo de contexto y conexión con WhatsApp): Teo se escribe de cero y no se copia código de ahí. Se leen, nunca se modifican ni se versionan. Ver la sección 10.1 de la ficha.
- Reglas de seguridad que no se negocian (vienen de los errores de context-gpt): RLS por membresía, sin políticas `USING (true)`; secretos solo en Vault o env; cada Server Action valida sesión, membresía y `org_id`; idempotencia por `wamid`.
- **Supabase CLI:** para cualquier comando contra la nube (link, db push, functions deploy, secrets) usa siempre `./scripts/supa <comando>`, nunca `supabase` directo. El wrapper toma el token de la cuenta de Teo del Llavero de macOS, porque el login global apunta a otra cuenta. Para guardar o rotar el token: `./scripts/supa-set-token sbp_xxx`. Los comandos locales (`supabase start`, `supabase db reset`) funcionan con cualquiera de los dos.
- **Vercel CLI:** usa siempre `./scripts/vc <comando>` (token de Teo en el Llavero, servicio `teo-vercel-token`). Para guardar o rotar el token: `./scripts/vc-set-token <token>`. El proyecto de Vercel tiene Root Directory `web`.
