# Teo

Asistente de IA que atiende el WhatsApp de cada comercio, vende y organiza a los clientes por estado.

- Producto, arquitectura y plan: [`FICHA_TECNICA.md`](FICHA_TECNICA.md)
- Marca: [`TEO_Brand_Kit_v1.0/`](TEO_Brand_Kit_v1.0/)
- `web/`: Next.js 16 (landing, panel del comercio y panel superadmin)
- `supabase/`: migraciones y Edge Functions

## Desarrollo local

```bash
supabase start            # Postgres + Auth + Storage locales
cd web && npm install && npm run dev
```
