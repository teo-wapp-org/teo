import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CircleCheck,
  Clock,
  Layers,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  Zap,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getPlans } from "@/lib/data/plans";
import { getPublicConfig } from "@/lib/data/public-config";
import { PlanCard } from "@/components/plan-card";

const PASOS = [
  { icon: Store, title: "Carga tu negocio", text: "Productos, fotos, tiendas, horarios y formas de pago. Importa tu perfil de Google en un clic." },
  { icon: MessageCircle, title: "Conecta tu WhatsApp", text: "Inicia sesión con Facebook, verifica tu número y listo. Puedes seguir usando tu app." },
  { icon: Sparkles, title: "Teo atiende y vende", text: "Responde al instante, recomienda productos, arma el pedido y envía los datos de pago." },
  { icon: CircleCheck, title: "Tú confirmas el pago", text: "Revisas el comprobante desde tu panel, confirmas y Teo le avisa a tu cliente." },
];

const ESTADOS = [
  { label: "Nuevo", cls: "bg-cta/20 text-foreground" },
  { label: "En conversación", cls: "bg-secondary text-secondary-foreground" },
  { label: "Cotización", cls: "bg-warning/20 text-foreground" },
  { label: "Esperando pago", cls: "bg-warning/35 text-foreground" },
  { label: "Venta cerrada", cls: "bg-cta text-cta-foreground" },
];

const BENEFICIOS = [
  { icon: Clock, title: "Responde en segundos, 24/7", text: "Ningún cliente se queda esperando, ni de madrugada ni en hora pico." },
  { icon: Layers, title: "Clientes por estado", text: "Un tablero tipo Kanban: ves quién está cotizando, quién debe pagar y quién necesita ayuda." },
  { icon: Users, title: "Tu equipo, siempre al mando", text: "Toma cualquier conversación cuando quieras. Teo te sugiere qué responder." },
  { icon: ShieldCheck, title: "Nunca inventa", text: "Precios, stock y horarios salen solo de lo que tú cargas. Si no sabe, te lo pasa." },
  { icon: Zap, title: "Listo en minutos", text: "Sin instalaciones ni técnicos. Te registras, cargas tu negocio y Teo empieza." },
  { icon: BarChart3, title: "Mide tus ventas", text: "Conversaciones, ventas cerradas y tiempo de respuesta en un solo lugar." },
];

const PREGUNTAS = [
  { q: "¿Necesito un número nuevo?", a: "No necesariamente. Puedes conectar el número de tu negocio y seguir usando la app de WhatsApp Business en tu teléfono." },
  { q: "¿Teo escribe a mis clientes sin que me pregunten?", a: "No. Teo solo responde cuando un cliente te escribe. Las campañas llegarán más adelante y siempre con tu aprobación." },
  { q: "¿Qué pasa si Teo no sabe algo?", a: "Te pasa la conversación a ti o a tu equipo y te sugiere una respuesta. Nunca inventa precios ni productos." },
  { q: "¿Qué cuenta como mensaje?", a: "Solo las respuestas que escribe Teo. Los mensajes de tus clientes y los que envía tu equipo no cuentan." },
  { q: "¿Qué pasa si se me acaban los mensajes?", a: "Tu WhatsApp nunca se corta: Teo pasa a modo copiloto (sugiere y tú envías) hasta que subas de plan o compres un paquete extra." },
];

export default async function LandingPage() {
  const [plans, pub] = await Promise.all([getPlans().catch(() => []), getPublicConfig()]);
  const trialDays = pub.trial_days;

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-primary text-primary-foreground">
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 size-96 rounded-full bg-cta/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 right-0 size-[28rem] rounded-full bg-secondary/20 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 md:grid-cols-[1.1fr_0.9fr] md:py-28">
          <div className="space-y-6">
            <Badge className="bg-cta/15 text-cta">Asistente inteligente para ventas por WhatsApp</Badge>
            <h1 className="text-4xl font-extrabold leading-[1.05] sm:text-5xl md:text-6xl">
              Convierte tus conversaciones en <span className="text-cta">ventas</span>.
            </h1>
            <p className="max-w-xl text-lg text-primary-foreground/80">
              Teo atiende el WhatsApp de tu negocio, responde al instante, arma el pedido y lo deja listo para el pago.
              Tú solo confirmas.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/registro" className={cn(buttonVariants({ variant: "cta" }), "h-12 px-6 text-base")}>
                Crear cuenta gratis <ArrowRight data-icon="inline-end" />
              </Link>
              <Link
                href="/login"
                className={cn(buttonVariants({ variant: "outline" }), "h-12 border-primary-foreground/30 bg-transparent px-6 text-base text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground")}
              >
                Ya tengo cuenta
              </Link>
            </div>
            <p className="text-sm text-primary-foreground/60">{trialDays > 0 ? `${trialDays} días gratis · Sin tarjeta` : "Sin tarjeta"}</p>
          </div>

          {/* Mock del chat */}
          <div className="relative mx-auto w-full max-w-sm">
            <div className="rounded-3xl border border-primary-foreground/10 bg-[#0E2747] p-4 shadow-2xl">
              <div className="mb-4 flex items-center gap-3 border-b border-primary-foreground/10 pb-3">
                <Image src="/brand/personaje.png" alt="" width={152} height={155} className="size-10 rounded-full" />
                <div>
                  <p className="text-sm font-semibold">Café Ñandú</p>
                  <p className="text-xs text-cta">en línea · atendido por Teo</p>
                </div>
              </div>
              <div className="space-y-3 text-sm">
                <p className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-sm bg-[#1F5C4B] px-3 py-2">Hola! tienen torta de chocolate para hoy?</p>
                <p className="w-fit max-w-[85%] rounded-2xl rounded-bl-sm bg-primary-foreground/10 px-3 py-2">
                  ¡Hola! Sí 🎂 Tenemos la torta de chocolate entera a $18 o por porción a $3,50. ¿Para retirar o te la enviamos?
                </p>
                <p className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-sm bg-[#1F5C4B] px-3 py-2">Entera, para envío a La Carolina</p>
                <p className="w-fit max-w-[85%] rounded-2xl rounded-bl-sm bg-primary-foreground/10 px-3 py-2">
                  Perfecto: torta entera $18 + envío $2,50 = <strong>$20,50</strong>. Te paso los datos para la transferencia 👇
                </p>
              </div>
            </div>
            <div className="absolute -bottom-5 -left-6 rounded-xl bg-card px-3 py-2 text-xs font-semibold text-card-foreground shadow-lg">
              <span className="mr-2 inline-block size-2 rounded-full bg-warning" /> Esperando pago · $20,50
            </div>
          </div>
        </div>
      </section>

      {/* CÓMO FUNCIONA */}
      <section id="como-funciona" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">Así de simple</h2>
          <p className="mt-3 text-muted-foreground">De cero a vender por WhatsApp en minutos.</p>
        </div>
        <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PASOS.map((p, i) => (
            <li key={p.title} className="rounded-2xl border border-border bg-card p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                  <p.icon className="size-5" aria-hidden />
                </span>
                <span className="text-sm font-semibold text-muted-foreground">Paso {i + 1}</span>
              </div>
              <h3 className="text-lg font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{p.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* PANEL */}
      <section className="bg-card">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 md:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-3xl font-bold sm:text-4xl">Organiza tus clientes, vende más.</h2>
            <p className="text-muted-foreground">
              Cada conversación es un caso que avanza solo por tu tablero. Sabes en todo momento quién está cotizando,
              quién debe pagar y quién necesita tu atención. Respondes desde el panel y el mensaje llega a WhatsApp.
            </p>
            <div className="flex flex-wrap gap-2" aria-label="Estados de un caso">
              {ESTADOS.map((e) => (
                <span key={e.label} className={cn("rounded-full px-3 py-1 text-xs font-semibold", e.cls)}>{e.label}</span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 rounded-2xl border border-border bg-background p-4" aria-hidden>
            {[
              { t: "En conversación", c: "bg-secondary", n: ["María P.", "Jorge L."] },
              { t: "Esperando pago", c: "bg-warning/35", n: ["Ana R. · $20,50", "Luis M. · $42"] },
              { t: "Venta cerrada", c: "bg-cta", n: ["Carla V. · $15", "Pedro S. · $60", "Sofía T. · $9"] },
            ].map((col) => (
              <div key={col.t} className="space-y-2">
                <p className="truncate text-xs font-semibold text-muted-foreground">{col.t}</p>
                {col.n.map((n) => (
                  <div key={n} className="rounded-lg border border-border bg-card p-2 shadow-xs">
                    <span className={cn("mb-1 block h-1.5 w-8 rounded-full", col.c)} />
                    <p className="truncate text-xs font-medium">{n}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BENEFICIOS */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFICIOS.map((b) => (
            <div key={b.title} className="flex gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-cta">
                <b.icon className="size-5" aria-hidden />
              </span>
              <div>
                <h3 className="font-semibold">{b.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{b.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* PRECIOS */}
      <section id="precios" className="scroll-mt-20 bg-card">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold sm:text-4xl">Planes que crecen contigo</h2>
            <p className="mt-3 text-muted-foreground">
              Pagas por las respuestas de Teo. Los mensajes de tus clientes y de tu equipo no cuentan.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((p) => (
              <PlanCard key={p.id} plan={p} trialDays={trialDays} />
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Precios en USD. Pago anual: 2 meses gratis. ¿Necesitas más? Paquetes de mensajes extra en cualquier plan.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="preguntas" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20">
        <h2 className="text-center text-3xl font-bold sm:text-4xl">Preguntas frecuentes</h2>
        <div className="mt-10 divide-y divide-border rounded-2xl border border-border bg-card">
          {PREGUNTAS.map((f) => (
            <details key={f.q} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {f.q}
                <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="px-4 pb-20">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground">
          <Image src="/brand/personaje.png" alt="Teo, el asistente" width={152} height={155} className="size-20 rounded-2xl" />
          <h2 className="text-3xl font-bold sm:text-4xl">¡Hola! Soy Teo. ¿Vendemos?</h2>
          <p className="max-w-xl text-primary-foreground/80">Crea tu cuenta, carga tu negocio y deja que tu WhatsApp trabaje por ti.</p>
          <Link href="/registro" className={cn(buttonVariants({ variant: "cta" }), "h-12 px-8 text-base")}>
            Crear cuenta gratis <ArrowRight data-icon="inline-end" />
          </Link>
        </div>
      </section>
    </>
  );
}
