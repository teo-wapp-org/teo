import Image from "next/image";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/** Etiqueta + control + ayuda + error accesible. `htmlFor` debe coincidir con el id del control. */
export function Field({
  htmlFor,
  label,
  hint,
  error,
  children,
  className,
}: {
  htmlFor: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

const controlBase =
  "w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm";

export function TextInput({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(controlBase, "h-10 py-1", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(controlBase, "min-h-20 py-2 leading-relaxed", className)} {...props} />;
}

export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(controlBase, "h-10 py-1 pr-8", className)} {...props} />;
}

/** Interruptor accesible basado en checkbox nativo (funciona con FormData: "on" cuando está activo). */
export function Switch({ label, description, className, id, ...props }: Omit<React.ComponentProps<"input">, "type"> & { label: React.ReactNode; description?: React.ReactNode }) {
  return (
    <label htmlFor={id} className={cn("flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border bg-card p-3 has-disabled:cursor-not-allowed", className)}>
      <span className="space-y-0.5">
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-xs text-muted-foreground">{description}</span>}
      </span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="relative mt-0.5 h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-muted-foreground/30 transition-colors outline-none before:absolute before:top-0.5 before:left-0.5 before:size-5 before:rounded-full before:bg-white before:shadow before:transition-transform checked:bg-primary checked:before:translate-x-5 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
        {...props}
      />
    </label>
  );
}

/** Opciones tipo "chip" con radio nativo. */
export function ChoiceChips({
  name,
  options,
  defaultValue,
  legend,
  disabled,
}: {
  name: string;
  options: { value: string; label: string; hint?: string }[];
  defaultValue?: string;
  legend: string;
  disabled?: boolean;
}) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input type="radio" name={name} value={o.value} defaultChecked={defaultValue === o.value} className="peer sr-only" />
            <span className="inline-flex flex-col rounded-xl border border-border px-3 py-1.5 text-sm transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 hover:bg-muted peer-checked:hover:bg-primary">
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ReadOnlyNotice({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="flex items-center gap-2 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
      <Lock className="size-4 shrink-0" aria-hidden />
      {children}
    </div>
  );
}

export function FormError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {error}
    </p>
  );
}

/** Estado vacío con el personaje de Teo (FICHA §2.5). */
export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="grid place-items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
      <Image src="/brand/personaje.png" alt="" width={320} height={327} className="size-20 rounded-3xl" />
      <h2 className="text-lg font-semibold">{title}</h2>
      {children && <div className="max-w-md text-sm text-muted-foreground">{children}</div>}
      {action}
    </div>
  );
}

export function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}
