export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      <p className="mb-2 rounded-lg bg-warning/15 px-3 py-2 text-sm">
        Borrador pendiente de revisión legal. El nombre y los datos de la empresa se completarán al constituirla.
      </p>
      <h1 className="mt-6 text-4xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Última actualización: {updated}</p>
      <div className="mt-8 space-y-6 leading-relaxed [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-foreground/90 [&_ul]:space-y-1">
        {children}
      </div>
    </article>
  );
}
