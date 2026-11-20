/** Esquemas zod del contexto del comercio (negocio, pagos, Teo, tiendas, equipo). Puros: se prueban con Vitest. */
import { z } from "zod";
import { WeekHoursSchema } from "@/lib/hours";

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .optional()
    .transform((v) => (v ? v : null));

const optUrl = z
  .string()
  .trim()
  .max(300)
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v == null || /^https?:\/\/\S+\.\S+/.test(v), "Ingresa un enlace que empiece con https://");

const bool = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true");

const optCoord = (limit: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v == null || (Number.isFinite(v) && Math.abs(v) <= limit), "Coordenada inválida");

/** Parsea un campo de FormData que trae JSON (listas editadas en el cliente). */
export const jsonField = <T extends z.ZodType>(schema: T) =>
  z
    .string()
    .optional()
    .transform((s, ctx) => {
      try {
        return JSON.parse(s || "null");
      } catch {
        ctx.addIssue({ code: "custom", message: "Datos inválidos" });
        return z.NEVER;
      }
    })
    .pipe(schema);

export const TONES = ["cercano", "formal", "divertido"] as const;

export const FaqSchema = z.object({
  q: z.string().trim().min(1, "Escribe la pregunta").max(300, "La pregunta es muy larga"),
  a: z.string().trim().min(1, "Escribe la respuesta").max(1000, "La respuesta es muy larga"),
});

export const BusinessSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(120, "Máximo 120 caracteres"),
  rubro: opt(60),
  description: opt(2000),
  tone: z.enum(TONES, { message: "Elige un tono" }),
  use_usted: z.enum(["tu", "usted"]).transform((v) => v === "usted"),
  use_emojis: bool,
  envios: opt(2000),
  devoluciones: opt(2000),
  garantia: opt(2000),
  otros: opt(2000),
  website: optUrl,
  instagram: opt(60).transform((v) => (v ? v.replace(/^@/, "") : null)),
  phone: opt(30).refine((v) => v == null || /^[+\d\s()-]{6,30}$/.test(v), "Ingresa un teléfono válido"),
  faqs: jsonField(z.array(FaqSchema).max(50, "Máximo 50 preguntas")),
});

export const PAYMENT_TYPES = ["transferencia", "efectivo", "link"] as const;
export const ACCOUNT_TYPES = ["ahorros", "corriente"] as const;

export const PaymentMethodSchema = z
  .object({
    id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
    type: z.enum(PAYMENT_TYPES, { message: "Elige el tipo" }),
    label: z.string().trim().min(2, "Ponle un nombre (ej. Transferencia Banco Pichincha)").max(80, "Máximo 80 caracteres"),
    instructions: opt(1000),
    active: bool,
    banco: opt(80),
    tipo_cuenta: z.enum(ACCOUNT_TYPES).optional().or(z.literal("").transform(() => undefined)),
    numero: opt(40),
    titular: opt(120),
    identificacion: opt(20),
    email: opt(120).refine((v) => v == null || z.email().safeParse(v).success, "Ingresa un correo válido"),
    notas: opt(500),
    url: optUrl,
  })
  .superRefine((v, ctx) => {
    if (v.type === "transferencia") {
      if (!v.banco) ctx.addIssue({ code: "custom", message: "Indica el banco", path: ["banco"] });
      if (!v.numero) ctx.addIssue({ code: "custom", message: "Indica el número de cuenta", path: ["numero"] });
      if (!v.titular) ctx.addIssue({ code: "custom", message: "Indica el titular", path: ["titular"] });
    }
    if (v.type === "link" && !v.url) ctx.addIssue({ code: "custom", message: "Pega el enlace de pago", path: ["url"] });
  });

/** Arma el jsonb `details` según el tipo (solo guarda lo que aplica). */
export function paymentDetails(v: z.infer<typeof PaymentMethodSchema>): Record<string, string> {
  const pick = (o: Record<string, string | null | undefined>) =>
    Object.fromEntries(Object.entries(o).filter(([, x]) => x != null && x !== "")) as Record<string, string>;
  if (v.type === "transferencia")
    return pick({ banco: v.banco, tipo_cuenta: v.tipo_cuenta, numero: v.numero, titular: v.titular, identificacion: v.identificacion, email: v.email });
  if (v.type === "link") return pick({ url: v.url });
  return pick({ notas: v.notas });
}

export const AgentSchema = z.object({
  enabled: bool,
  mode: z.enum(["piloto", "copiloto"], { message: "Elige un modo" }),
  display_name: z.string().trim().min(1, "Ponle un nombre").max(40, "Máximo 40 caracteres"),
  greeting: opt(500),
  out_of_hours_message: opt(500),
  business_hours: jsonField(WeekHoursSchema),
  escalation_keywords: jsonField(z.array(z.string().trim().min(1).max(40)).max(30, "Máximo 30 palabras")),
  escalation_amount_usd: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v.replace(",", ".")) : null))
    .refine((v) => v == null || (Number.isFinite(v) && v >= 0 && v < 1_000_000), "Ingresa un monto válido"),
  payment_expiry_hours: z.coerce.number({ message: "Ingresa un número" }).int("Usa horas enteras").min(1, "Mínimo 1 hora").max(720, "Máximo 720 horas (30 días)"),
  extra_instructions: opt(2000),
});

export const StoreSchema = z.object({
  id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  name: z.string().trim().min(1, "Ponle un nombre a la tienda").max(120, "Máximo 120 caracteres"),
  address: opt(300),
  city: opt(80),
  phone: opt(30),
  hours: jsonField(WeekHoursSchema),
  delivery_available: bool,
  delivery_notes: opt(1000),
  active: bool,
  lat: optCoord(90),
  lng: optCoord(180),
  google_place_id: opt(300),
});

export const ROLES = ["owner", "admin", "operador"] as const;
export const ROLE_LABELS: Record<(typeof ROLES)[number], string> = { owner: "Dueño", admin: "Administrador", operador: "Operador" };

export const InviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Ingresa un correo válido")),
  role: z.enum(ROLES, { message: "Elige un rol" }),
});

/** Primer mensaje de error legible de un resultado zod. */
export const firstError = (e: z.ZodError) => e.issues[0]?.message ?? "Revisa los datos";
