# Teo — guía para agentes

- La fuente de verdad del producto es `FICHA_TECNICA.md`. Léela antes de cualquier tarea. Si una decisión cambia, actualiza ahí la sección 18 (Decisiones) y la 20 (Registro de cambios).
- La marca está en `TEO_Brand_Kit_v1.0/`. Solo se lee, no se modifica. Para diseño, la precedencia es: manual de marca > `design-system/teo/MASTER.md` > skill ui-ux-pro-max.
- Idioma del producto y de la documentación: español (Ecuador). Zona horaria `America/Guayaquil`, moneda USD.
- Estado actual: planificación. No hay código todavía; el plan de arranque está en la sección 19 de la ficha.
- `.ref/` contiene los repos de referencia `context-gpt/supabase` y `context-gpt/dashboard`. Son solo referencia (manejo de contexto y conexión con WhatsApp): Teo se escribe de cero y no se copia código de ahí. Se leen, nunca se modifican ni se versionan. Ver la sección 10.1 de la ficha.
- Reglas de seguridad que no se negocian (vienen de los errores de context-gpt): RLS por membresía, sin políticas `USING (true)`; secretos solo en Vault o env; cada Server Action valida sesión, membresía y `org_id`; idempotencia por `wamid`.
- **Supabase CLI:** para cualquier comando contra la nube (link, db push, functions deploy, secrets) usa siempre `./scripts/supa <comando>`, nunca `supabase` directo. El wrapper toma el token de la cuenta de Teo del Llavero de macOS, porque el login global apunta a otra cuenta. Para guardar o rotar el token: `./scripts/supa-set-token sbp_xxx`. Los comandos locales (`supabase start`, `supabase db reset`) funcionan con cualquiera de los dos.
- **Vercel CLI:** usa siempre `./scripts/vc <comando>` (token de Teo en el Llavero, servicio `teo-vercel-token`). Para guardar o rotar el token: `./scripts/vc-set-token <token>`. El proyecto de Vercel tiene Root Directory `web`.

## Flujo de trabajo (fase a fase)
1. Migración nueva en `supabase/migrations/` → `./scripts/supa db push` (teo-dev).
2. Tests SQL de RLS/dominio en `supabase/tests/*.sql` → `./scripts/test-db` (todo se revierte).
3. Tipos: `./scripts/supa gen types typescript --linked --schema public > web/src/lib/database.types.ts`.
4. `cd web && npm run lint && npm run typecheck`.
5. E2E: `./scripts/e2e` (build + start local) o `./scripts/e2e https://teo-lac-phi.vercel.app` (producción). Los usuarios QA (`qa+e2e-*@teo.test`) se borran solos.
6. Solo con todo en verde: commit y push a `main` (Vercel despliega solo) y `./scripts/smoke` contra producción.
- Next 16: `cacheComponents` está desactivado. Nunca pasar componentes/funciones (p. ej. íconos de Lucide) de un Server Component a un Client Component: pasar el elemento ya renderizado.
