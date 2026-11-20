"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleCheck, Download, FileSpreadsheet, Loader2, RotateCcw, TriangleAlert, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatUSD } from "@/lib/catalogo/formato";
import {
  detectMapping,
  IMPORT_FIELDS,
  mappingErrors,
  MAX_IMPORT_ROWS,
  TEMPLATE_CSV,
  toPayload,
  toTable,
  validateImport,
  type ColumnMapping,
  type ImportField,
  type Table,
} from "@/lib/catalogo/importar";
import { cn } from "@/lib/utils";
import { importProducts, type ImportResult } from "../actions";

const PREVIEW_LIMIT = 200;
const selectClass =
  "h-9 w-full rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

async function readFile(file: File): Promise<unknown[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    return (await readSheet(file)) as unknown[][];
  }
  if (name.endsWith(".csv") || name.endsWith(".txt") || file.type === "text/csv") {
    const Papa = (await import("papaparse")).default;
    return new Promise((resolve, reject) => {
      Papa.parse<string[]>(file, {
        skipEmptyLines: false,
        complete: (res) => resolve(res.data),
        error: (err) => reject(err),
      });
    });
  }
  throw new Error("formato");
}

function downloadTemplate() {
  // BOM para que Excel abra bien las tildes
  const blob = new Blob(["﻿" + TEMPLATE_CSV], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla-catalogo-teo.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function Importer({ slug, remaining }: { slug: string; remaining: number | null }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<Table | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [fileError, setFileError] = useState("");
  const [result, setResult] = useState<Extract<ImportResult, { ok: true }> | null>(null);
  const [serverError, setServerError] = useState("");
  const [reading, setReading] = useState(false);
  const [importing, startImport] = useTransition();

  const rows = useMemo(() => (table ? validateImport(table, mapping) : []), [table, mapping]);
  const mapErrors = useMemo(() => (table ? mappingErrors(mapping) : []), [table, mapping]);
  const valid = rows.filter((r) => r.errors.length === 0);
  const invalid = rows.filter((r) => r.errors.length > 0);
  const shown = (onlyErrors ? invalid : rows).slice(0, PREVIEW_LIMIT);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileError("");
    setServerError("");
    setResult(null);
    setTable(null);
    setFileName(file.name);
    if (file.size > 10 * 1024 * 1024) {
      setFileError("El archivo pesa más de 10 MB. Divídelo en partes más pequeñas.");
      return;
    }
    setReading(true);
    try {
      const t = toTable(await readFile(file));
      if (!t.headers.length) setFileError("El archivo está vacío. Usa la plantilla como guía.");
      else if (!t.rows.length) setFileError("El archivo solo tiene encabezados: agrega al menos un producto.");
      else if (t.rows.length > MAX_IMPORT_ROWS) setFileError(`El archivo tiene ${t.rows.length} filas; el máximo por importación es ${MAX_IMPORT_ROWS}.`);
      else {
        setTable(t);
        setMapping(detectMapping(t.headers));
        setOnlyErrors(false);
      }
    } catch (e) {
      setFileError(
        e instanceof Error && e.message === "formato"
          ? "Formato no soportado. Sube un archivo .csv o .xlsx."
          : "No pudimos leer el archivo. Revisa que no esté dañado o protegido con contraseña.",
      );
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function setField(field: ImportField, value: string) {
    setMapping((m) => {
      const next = { ...m };
      if (value === "") delete next[field];
      else next[field] = Number(value);
      return next;
    });
  }

  function runImport() {
    setServerError("");
    startImport(async () => {
      const res = await importProducts(slug, toPayload(rows));
      if (!res.ok) {
        setServerError(res.error);
        toast.error(res.error);
        return;
      }
      setResult(res);
      toast.success(`Importación lista: ${res.created} creados y ${res.updated} actualizados.`);
      router.refresh();
    });
  }

  function reset() {
    setTable(null);
    setResult(null);
    setFileName("");
    setServerError("");
  }

  // ── Resumen final ─────────────────────────────────────────
  if (result) {
    const errorRows = [...invalid.map((r) => ({ line: r.line, message: r.errors.join(" ") })), ...result.failed].sort((a, b) => a.line - b.line);
    return (
      <section aria-labelledby="resumen" className="space-y-5 rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <CircleCheck className="size-6" aria-hidden />
          <h2 id="resumen" className="text-xl font-semibold">Importación terminada</h2>
        </div>
        <dl className="grid gap-3 sm:grid-cols-3">
          {[
            { k: "Creados", v: result.created },
            { k: "Actualizados", v: result.updated },
            { k: "Con error", v: errorRows.length },
          ].map((s) => (
            <div key={s.k} className="rounded-xl bg-muted p-4">
              <dt className="text-sm text-muted-foreground">{s.k}</dt>
              <dd className="font-heading text-3xl font-bold">{s.v}</dd>
            </div>
          ))}
        </dl>
        {errorRows.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-semibold">Filas que no se importaron</h3>
            <ul className="max-h-64 space-y-1 overflow-auto rounded-xl border border-border p-3 text-sm">
              {errorRows.map((e) => (
                <li key={e.line}>
                  <span className="font-medium">Fila {e.line}:</span> <span className="text-destructive">{e.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Link href={`/app/${slug}/catalogo`} className={cn(buttonVariants({ variant: "cta" }), "h-10 px-4")}>Ver catálogo</Link>
          <Button variant="outline" className="h-10 px-4" onClick={reset}>
            <RotateCcw aria-hidden /> Importar otro archivo
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {/* Paso 1: archivo */}
      <section aria-labelledby="paso-archivo" className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="paso-archivo" className="text-lg font-semibold">1. Elige tu archivo</h2>
            <p className="text-sm text-muted-foreground">
              Columnas sugeridas: nombre, precio, descripción, categoría, sku, stock y activo. Nombre y precio son obligatorios.
            </p>
          </div>
          <Button type="button" variant="outline" className="h-9 shrink-0 px-3" onClick={downloadTemplate}>
            <Download aria-hidden /> Descargar plantilla CSV
          </Button>
        </div>
        <div
          className="rounded-xl border-2 border-dashed border-border p-6 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void onFile(e.dataTransfer.files?.[0]);
          }}
        >
          <FileSpreadsheet className="mx-auto mb-2 size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">Arrastra aquí tu archivo .csv o .xlsx, o</p>
          <input
            ref={fileRef}
            id="archivo-catalogo"
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Label htmlFor="archivo-catalogo" className={cn(buttonVariants({ variant: "default" }), "mt-3 h-9 cursor-pointer px-4")}>
            {reading ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
            Elegir archivo
          </Label>
          {fileName && !fileError && table && (
            <p className="mt-3 text-sm">
              <span className="font-medium">{fileName}</span> · {table.rows.length} {table.rows.length === 1 ? "fila" : "filas"}
            </p>
          )}
        </div>
        {fileError && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {fileError}
          </p>
        )}
      </section>

      {table && (
        <>
          {/* Paso 2: mapeo */}
          <section aria-labelledby="paso-mapeo" className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <div>
              <h2 id="paso-mapeo" className="text-lg font-semibold">2. Relaciona las columnas</h2>
              <p className="text-sm text-muted-foreground">Detectamos las columnas automáticamente. Ajusta lo que haga falta.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {IMPORT_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={`map-${f.key}`}>
                    {f.label}
                    {f.required && <span aria-hidden> *</span>}
                    {f.required && <span className="sr-only"> (obligatorio)</span>}
                  </Label>
                  <select id={`map-${f.key}`} value={mapping[f.key] ?? ""} onChange={(e) => setField(f.key, e.target.value)} className={selectClass}>
                    <option value="">{f.required ? "Elige una columna" : "No importar"}</option>
                    {table.headers.map((h, i) => (
                      <option key={i} value={i}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {mapErrors.length > 0 && (
              <ul role="alert" className="space-y-1 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {mapErrors.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </section>

          {/* Paso 3: vista previa */}
          {mapErrors.length === 0 && (
            <section aria-labelledby="paso-preview" className="space-y-4 rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 id="paso-preview" className="text-lg font-semibold">3. Revisa y confirma</h2>
                  <p className="text-sm" aria-live="polite">
                    <span className="font-semibold">{valid.length} listas para importar</span>
                    {invalid.length > 0 && <span className="text-destructive"> · {invalid.length} con errores (no se importarán)</span>}
                  </p>
                </div>
                {invalid.length > 0 && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} className="size-4 accent-primary" />
                    Ver solo filas con errores
                  </label>
                )}
              </div>

              {invalid.length > 0 && (
                <div role="alert" className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>Corrige las filas marcadas en tu archivo y vuelve a subirlo, o importa ahora solo las filas válidas.</span>
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[40rem] text-sm">
                  <caption className="sr-only">Vista previa de la importación</caption>
                  <thead className="bg-muted text-left text-xs text-muted-foreground uppercase">
                    <tr>
                      <th scope="col" className="px-3 py-2">Fila</th>
                      <th scope="col" className="px-3 py-2">Nombre</th>
                      <th scope="col" className="px-3 py-2 text-right">Precio</th>
                      <th scope="col" className="px-3 py-2">Categoría</th>
                      <th scope="col" className="px-3 py-2">SKU</th>
                      <th scope="col" className="px-3 py-2">Stock</th>
                      <th scope="col" className="px-3 py-2">Activo</th>
                      <th scope="col" className="px-3 py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {shown.map((r) => {
                      const bad = r.errors.length > 0;
                      return (
                        <tr key={r.line} className={bad ? "bg-destructive/5" : undefined}>
                          <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.line}</td>
                          <td className="px-3 py-2 font-medium">{r.data.name ?? "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.data.price != null ? formatUSD(r.data.price) : "—"}</td>
                          <td className="px-3 py-2">{r.data.category ?? "—"}</td>
                          <td className="px-3 py-2">{r.data.sku ?? "—"}</td>
                          <td className="px-3 py-2">{r.data.stock ?? "—"}</td>
                          <td className="px-3 py-2">{r.data.active === false ? "No" : "Sí"}</td>
                          <td className="px-3 py-2">
                            {bad ? <span className="text-destructive">{r.errors.join(" ")}</span> : <span className="text-muted-foreground">Lista</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {(onlyErrors ? invalid : rows).length > PREVIEW_LIMIT && (
                <p className="text-xs text-muted-foreground">Mostramos las primeras {PREVIEW_LIMIT} filas.</p>
              )}

              {remaining !== null && (
                <p className="text-sm text-muted-foreground">Tu plan te permite crear {remaining} productos más (los SKU que ya existen solo se actualizan).</p>
              )}
              {serverError && (
                <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {serverError}
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" className="h-10 px-4" onClick={reset} disabled={importing}>
                  Cancelar
                </Button>
                <Button variant="cta" className="h-10 px-5" onClick={runImport} disabled={importing || valid.length === 0}>
                  {importing && <Loader2 className="animate-spin" aria-hidden />}
                  Importar {valid.length} {valid.length === 1 ? "producto" : "productos"}
                </Button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
