"use client";

import { useId, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATALOGO_BUCKET, MAX_PHOTOS, PHOTO_TYPES, photoError, publicPhotoUrl } from "@/lib/catalogo/formato";
import { parseIntInput, parseMoneyInput, productSchema, type ProductInput } from "@/lib/catalogo/producto";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { createCategory, deleteProduct, discardUploadedPhoto, saveProduct } from "../actions";

export type ProductFormInitial = {
  id: string;
  name: string;
  description: string;
  price: string;
  categoryId: string | null;
  sku: string;
  stock: string;
  trackStock: boolean;
  active: boolean;
  attributes: { key: string; value: string }[];
  variants: { id?: string; name: string; price: string; stock: string; active: boolean }[];
  photos: string[];
};

type Props = {
  slug: string;
  orgId: string;
  mode: "create" | "update";
  initial: ProductFormInitial;
  categories: { id: string; name: string }[];
  readOnly?: boolean;
};

type Errors = Partial<Record<"name" | "price" | "stock" | "sku" | "description" | "variants" | "attributes" | "form", string>>;

const NEW_CATEGORY = "__nueva__";
const selectClass =
  "h-10 w-full rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";
const inputClass = "h-10";

export function ProductForm({ slug, orgId, mode, initial, categories: initialCategories, readOnly = false }: Props) {
  const router = useRouter();
  const uid = useId();
  const listHref = `/app/${slug}/catalogo`;
  // Fijo durante la vida del formulario: una revalidación del servidor (p. ej. al crear una categoría)
  // vuelve a renderizar la página "nuevo" con otro id, pero las fotos ya subidas usan este.
  const [productId] = useState(initial.id);
  const savedPhotos = useRef(new Set(initial.photos));

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [price, setPrice] = useState(initial.price);
  const [categories, setCategories] = useState(initialCategories);
  const [categoryId, setCategoryId] = useState(initial.categoryId ?? "");
  const [newCategory, setNewCategory] = useState("");
  const [sku, setSku] = useState(initial.sku);
  const [trackStock, setTrackStock] = useState(initial.trackStock);
  const [stock, setStock] = useState(initial.stock);
  const [active, setActive] = useState(initial.active);
  const [attributes, setAttributes] = useState(initial.attributes);
  const [variants, setVariants] = useState(initial.variants);
  const [photos, setPhotos] = useState(initial.photos);
  const [uploading, setUploading] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [limitReached, setLimitReached] = useState(false);
  const [saving, startSaving] = useTransition();
  const [creatingCat, startCreatingCat] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Categoría al vuelo ────────────────────────────────────
  function addCategory() {
    startCreatingCat(async () => {
      const res = await createCategory(slug, newCategory);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setCategories((cs) => (cs.some((c) => c.id === res.category.id) ? cs : [...cs, res.category]));
      setCategoryId(res.category.id);
      setNewCategory("");
      toast.success(`Categoría “${res.category.name}” lista`);
    });
  }

  // ── Fotos ─────────────────────────────────────────────────
  async function onFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (fileRef.current) fileRef.current.value = "";
    if (!files.length) return;
    const room = MAX_PHOTOS - photos.length - uploading;
    if (room <= 0) {
      toast.error(`Puedes tener hasta ${MAX_PHOTOS} fotos por producto.`);
      return;
    }
    const valid: File[] = [];
    for (const f of files) {
      const err = photoError(f);
      if (err) toast.error(err);
      else valid.push(f);
    }
    if (valid.length > room) toast.error(`Solo se subirán ${room} foto(s): el máximo es ${MAX_PHOTOS}.`);
    const batch = valid.slice(0, room);
    if (!batch.length) return;

    const supabase = createClient();
    setUploading((n) => n + batch.length);
    await Promise.all(
      batch.map(async (file) => {
        const path = `${orgId}/${productId}/${crypto.randomUUID()}.${PHOTO_TYPES[file.type]}`;
        const { error } = await supabase.storage.from(CATALOGO_BUCKET).upload(path, file, { contentType: file.type, cacheControl: "31536000" });
        setUploading((n) => n - 1);
        if (error) toast.error(`No pudimos subir “${file.name}”. Inténtalo de nuevo.`);
        else setPhotos((ps) => [...ps, path]);
      }),
    );
  }

  function movePhoto(i: number, dir: -1 | 1) {
    setPhotos((ps) => {
      const j = i + dir;
      if (j < 0 || j >= ps.length) return ps;
      const next = [...ps];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function removePhoto(path: string) {
    setPhotos((ps) => ps.filter((p) => p !== path));
    // Si aún no se guardó, se borra ya de Storage; si estaba guardada, se borra al guardar.
    if (!savedPhotos.current.has(path)) void discardUploadedPhoto(slug, productId, path);
  }

  // ── Guardar ───────────────────────────────────────────────
  function buildInput(): { input?: ProductInput; errors: Errors } {
    const errs: Errors = {};
    const priceN = parseMoneyInput(price);
    if (priceN === null || Number.isNaN(priceN)) errs.price = "Ingresa un precio válido, por ejemplo 12,50.";
    const stockN = trackStock ? parseIntInput(stock) : null;
    if (trackStock && (stockN === null || Number.isNaN(stockN))) errs.stock = "Escribe cuántas unidades tienes (número entero).";

    const vs: ProductInput["variants"] = [];
    variants.forEach((v, i) => {
      const vp = parseMoneyInput(v.price);
      const vst = parseIntInput(v.stock);
      if (Number.isNaN(vp)) errs.variants ??= `Revisa el precio de la variante ${i + 1}.`;
      if (Number.isNaN(vst)) errs.variants ??= `Revisa el stock de la variante ${i + 1} (número entero o vacío).`;
      vs.push({ id: v.id, name: v.name, price: Number.isNaN(vp) ? null : vp, stock: Number.isNaN(vst) ? null : vst, active: v.active });
    });

    const input: ProductInput = {
      id: productId,
      name,
      description,
      price: priceN ?? Number.NaN,
      categoryId: categoryId && categoryId !== NEW_CATEGORY ? categoryId : null,
      sku,
      stock: stockN,
      active,
      attributes: attributes.filter((a) => a.key.trim() || a.value.trim()),
      variants: vs,
      photos,
    };
    if (Object.keys(errs).length) return { errors: errs };

    const parsed = productSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const k = String(issue.path[0] ?? "form") as keyof Errors;
        const key: keyof Errors = ["name", "price", "stock", "sku", "description", "variants", "attributes"].includes(k) ? k : "form";
        errs[key] ??= issue.message;
      }
      return { errors: errs };
    }
    return { input, errors: {} };
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    if (uploading > 0) {
      toast.info("Espera a que terminen de subir las fotos.");
      return;
    }
    const { input, errors: errs } = buildInput();
    setErrors(errs);
    if (!input) {
      toast.error("Revisa los campos marcados.");
      return;
    }
    startSaving(async () => {
      const res = await saveProduct(slug, input, mode);
      if (!res.ok) {
        setErrors({ form: res.error });
        setLimitReached(Boolean(res.limit));
        toast.error(res.error);
        if (mode === "create" && res.id) router.push(`${listHref}/${res.id}`);
        return;
      }
      savedPhotos.current = new Set(photos);
      toast.success(mode === "create" ? `¡Listo! “${input.name.trim()}” ya está en tu catálogo.` : "Cambios guardados.");
      router.push(listHref);
      router.refresh();
    });
  }

  function onDelete() {
    startDeleting(async () => {
      const res = await deleteProduct(slug, productId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Eliminaste “${initial.name}”.`);
      router.push(listHref);
      router.refresh();
    });
  }

  const err = (k: keyof Errors) =>
    errors[k] ? (
      <p id={`${uid}-${k}-error`} role="alert" className="text-sm text-destructive">
        {errors[k]}
      </p>
    ) : null;
  const described = (k: keyof Errors) => (errors[k] ? `${uid}-${k}-error` : undefined);

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6" aria-label={mode === "create" ? "Nuevo producto" : "Editar producto"}>
      {readOnly && (
        <p role="status" className="rounded-xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">
          Solo lectura: únicamente el dueño o un administrador pueden editar el catálogo.
        </p>
      )}
      <fieldset disabled={readOnly || saving || deleting} className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {/* Datos básicos */}
          <section aria-labelledby={`${uid}-basicos`} className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <h2 id={`${uid}-basicos`} className="text-lg font-semibold">Datos del producto</h2>
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-name`}>Nombre</Label>
              <Input
                id={`${uid}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={200}
                placeholder="Ej. Torta de chocolate"
                aria-invalid={Boolean(errors.name)}
                aria-describedby={described("name")}
                className={inputClass}
              />
              {err("name")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-description`}>Descripción</Label>
              <textarea
                id={`${uid}-description`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={5000}
                rows={4}
                placeholder="Cuenta lo que Teo debe saber para venderlo: tamaño, ingredientes, materiales…"
                aria-invalid={Boolean(errors.description)}
                aria-describedby={described("description")}
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm"
              />
              {err("description")}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-price`}>Precio (USD)</Label>
                <Input
                  id={`${uid}-price`}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  inputMode="decimal"
                  required
                  placeholder="0,00"
                  aria-invalid={Boolean(errors.price)}
                  aria-describedby={described("price")}
                  className={inputClass}
                />
                {err("price")}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-sku`}>SKU (opcional)</Label>
                <Input
                  id={`${uid}-sku`}
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  maxLength={64}
                  placeholder="Ej. TOR-001"
                  aria-invalid={Boolean(errors.sku)}
                  aria-describedby={described("sku")}
                  className={inputClass}
                />
                {err("sku")}
              </div>
            </div>
          </section>

          {/* Fotos */}
          <section aria-labelledby={`${uid}-fotos`} className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id={`${uid}-fotos`} className="text-lg font-semibold">Fotos</h2>
                <p className="text-sm text-muted-foreground">JPG, PNG o WebP de hasta 5 MB. La primera es la principal.</p>
              </div>
              {!readOnly && (
                <>
                  <input
                    ref={fileRef}
                    id={`${uid}-files`}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => onFiles(e.target.files)}
                  />
                  <Label
                    htmlFor={`${uid}-files`}
                    className={cn(buttonVariants({ variant: "outline" }), "h-9 cursor-pointer px-3", photos.length + uploading >= MAX_PHOTOS && "pointer-events-none opacity-50")}
                  >
                    <ImagePlus aria-hidden /> Subir fotos
                  </Label>
                </>
              )}
            </div>
            {photos.length === 0 && uploading === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Aún no hay fotos. Los productos con foto se venden mejor por WhatsApp.
              </p>
            ) : (
              <ul aria-label="Fotos del producto" className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {photos.map((path, i) => (
                  <li key={path} className="group relative overflow-hidden rounded-xl border border-border bg-muted">
                    <Image src={publicPhotoUrl(path)} alt={`Foto ${i + 1} de ${name || "el producto"}`} width={240} height={240} className="aspect-square w-full object-cover" />
                    {i === 0 && <span className="absolute top-2 left-2 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">Principal</span>}
                    {!readOnly && (
                      <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-gradient-to-t from-black/60 to-transparent p-1.5">
                        <div className="flex gap-1">
                          <Button type="button" size="icon-sm" variant="secondary" aria-label={`Mover foto ${i + 1} antes`} disabled={i === 0} onClick={() => movePhoto(i, -1)}>
                            <ArrowLeft aria-hidden />
                          </Button>
                          <Button type="button" size="icon-sm" variant="secondary" aria-label={`Mover foto ${i + 1} después`} disabled={i === photos.length - 1} onClick={() => movePhoto(i, 1)}>
                            <ArrowRight aria-hidden />
                          </Button>
                        </div>
                        <Button type="button" size="icon-sm" variant="secondary" aria-label={`Quitar foto ${i + 1}`} onClick={() => removePhoto(path)}>
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
                {Array.from({ length: uploading }, (_, i) => (
                  <li key={`up-${i}`} className="grid aspect-square place-items-center rounded-xl border border-dashed border-border bg-muted">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
                    <span className="sr-only">Subiendo foto…</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Variantes */}
          <section aria-labelledby={`${uid}-variantes`} className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <div>
              <h2 id={`${uid}-variantes`} className="text-lg font-semibold">Variantes</h2>
              <p className="text-sm text-muted-foreground">Tallas, colores o tamaños. Si una variante no tiene precio, usa el del producto.</p>
            </div>
            {variants.length > 0 && (
              <ul className="space-y-3" aria-label="Variantes">
                {variants.map((v, i) => {
                  const set = (patch: Partial<typeof v>) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    <li key={v.id ?? `nueva-${i}`} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[1fr_7rem_6rem_auto_auto] sm:items-end">
                      <div className="space-y-1.5">
                        <Label htmlFor={`${uid}-v${i}-name`}>Nombre de la variante {i + 1}</Label>
                        <Input id={`${uid}-v${i}-name`} value={v.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} placeholder="Ej. Grande" className={inputClass} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`${uid}-v${i}-price`}>Precio</Label>
                        <Input id={`${uid}-v${i}-price`} value={v.price} onChange={(e) => set({ price: e.target.value })} inputMode="decimal" placeholder="Igual" className={inputClass} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`${uid}-v${i}-stock`}>Stock</Label>
                        <Input id={`${uid}-v${i}-stock`} value={v.stock} onChange={(e) => set({ stock: e.target.value })} inputMode="numeric" placeholder="—" className={inputClass} />
                      </div>
                      <label className="flex h-10 items-center gap-2 text-sm">
                        <input type="checkbox" checked={v.active} onChange={(e) => set({ active: e.target.checked })} className="size-4 accent-primary" />
                        Activa
                      </label>
                      <Button type="button" variant="ghost" size="icon-lg" aria-label={`Quitar variante ${i + 1}`} onClick={() => setVariants((vs) => vs.filter((_, j) => j !== i))}>
                        <X aria-hidden />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            {err("variants")}
            {!readOnly && (
              <Button type="button" variant="outline" className="h-9 px-3" onClick={() => setVariants((vs) => [...vs, { name: "", price: "", stock: "", active: true }])}>
                <Plus aria-hidden /> Agregar variante
              </Button>
            )}
          </section>

          {/* Atributos */}
          <section aria-labelledby={`${uid}-atributos`} className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <div>
              <h2 id={`${uid}-atributos`} className="text-lg font-semibold">Atributos</h2>
              <p className="text-sm text-muted-foreground">Datos extra que Teo puede responder: material, porciones, garantía…</p>
            </div>
            {attributes.length > 0 && (
              <ul className="space-y-3" aria-label="Atributos">
                {attributes.map((a, i) => {
                  const set = (patch: Partial<typeof a>) => setAttributes((as) => as.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    <li key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor={`${uid}-a${i}-key`}>Atributo {i + 1}</Label>
                        <Input id={`${uid}-a${i}-key`} value={a.key} onChange={(e) => set({ key: e.target.value })} maxLength={60} placeholder="Ej. Porciones" className={inputClass} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`${uid}-a${i}-value`}>Valor {i + 1}</Label>
                        <Input id={`${uid}-a${i}-value`} value={a.value} onChange={(e) => set({ value: e.target.value })} maxLength={300} placeholder="Ej. 12" className={inputClass} />
                      </div>
                      <Button type="button" variant="ghost" size="icon-lg" aria-label={`Quitar atributo ${i + 1}`} onClick={() => setAttributes((as) => as.filter((_, j) => j !== i))}>
                        <X aria-hidden />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            {err("attributes")}
            {!readOnly && (
              <Button type="button" variant="outline" className="h-9 px-3" onClick={() => setAttributes((as) => [...as, { key: "", value: "" }])}>
                <Plus aria-hidden /> Agregar atributo
              </Button>
            )}
          </section>
        </div>

        {/* Columna lateral */}
        <div className="space-y-6">
          <section aria-labelledby={`${uid}-estado`} className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <h2 id={`${uid}-estado`} className="text-lg font-semibold">Organización</h2>
            <label className="flex items-start gap-3">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
              <span>
                <span className="block text-sm font-medium">Producto activo</span>
                <span className="block text-xs text-muted-foreground">Si lo desactivas, Teo no lo ofrecerá.</span>
              </span>
            </label>
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-category`}>Categoría</Label>
              <select id={`${uid}-category`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={selectClass}>
                <option value="">Sin categoría</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
                <option value={NEW_CATEGORY}>+ Nueva categoría…</option>
              </select>
            </div>
            {categoryId === NEW_CATEGORY && (
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-newcat`}>Nombre de la nueva categoría</Label>
                <div className="flex gap-2">
                  <Input
                    id={`${uid}-newcat`}
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCategory();
                      }
                    }}
                    maxLength={80}
                    placeholder="Ej. Tortas"
                    className={inputClass}
                  />
                  <Button type="button" className="h-10 px-3" onClick={addCategory} disabled={creatingCat || !newCategory.trim()}>
                    {creatingCat && <Loader2 className="animate-spin" aria-hidden />}
                    Crear
                  </Button>
                </div>
              </div>
            )}
          </section>

          <section aria-labelledby={`${uid}-inventario`} className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <h2 id={`${uid}-inventario`} className="text-lg font-semibold">Inventario</h2>
            <label className="flex items-start gap-3">
              <input type="checkbox" checked={!trackStock} onChange={(e) => setTrackStock(!e.target.checked)} className="mt-0.5 size-4 accent-primary" />
              <span>
                <span className="block text-sm font-medium">No controlar stock</span>
                <span className="block text-xs text-muted-foreground">Teo lo ofrecerá siempre como disponible.</span>
              </span>
            </label>
            {trackStock && (
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-stock`}>Unidades en stock</Label>
                <Input
                  id={`${uid}-stock`}
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  inputMode="numeric"
                  placeholder="0"
                  aria-invalid={Boolean(errors.stock)}
                  aria-describedby={described("stock")}
                  className={inputClass}
                />
                {err("stock")}
              </div>
            )}
          </section>
        </div>
      </fieldset>

      {errors.form && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
          <span>{errors.form}</span>
          {limitReached && (
            <Link href={`/app/${slug}/configuracion`} className={cn(buttonVariants({ variant: "cta" }), "h-8 px-3")}>
              Ver planes
            </Link>
          )}
        </div>
      )}

      <div className="sticky-actions -mx-4 flex flex-col-reverse gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:rounded-2xl sm:border">
        <div>
          {mode === "update" && !readOnly && (
            <Dialog>
              <DialogTrigger
                disabled={deleting || saving}
                render={<Button type="button" variant="destructive" className="h-10 w-full px-3 sm:w-auto" />}
              >
                <Trash2 aria-hidden /> Eliminar producto
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>¿Eliminar “{initial.name}”?</DialogTitle>
                  <DialogDescription>Se borrarán también sus variantes y fotos. Esta acción no se puede deshacer.</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" className="h-9 px-3" />}>Cancelar</DialogClose>
                  <Button variant="destructive" className="h-9 px-3" onClick={onDelete} disabled={deleting}>
                    {deleting && <Loader2 className="animate-spin" aria-hidden />}
                    Sí, eliminar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Link href={listHref} className={cn(buttonVariants({ variant: "outline" }), "h-10 px-4")}>
            {readOnly ? "Volver" : "Cancelar"}
          </Link>
          {!readOnly && (
            <Button type="submit" variant="cta" className="h-10 px-5" disabled={saving || uploading > 0}>
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              {mode === "create" ? "Guardar producto" : "Guardar cambios"}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
