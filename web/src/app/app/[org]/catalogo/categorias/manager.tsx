"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Check, Loader2, Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCategory, deleteCategory, renameCategory, reorderCategories } from "../actions";

type Cat = { id: string; name: string; products: number };

export function CategoryManager({ slug, initial, readOnly }: { slug: string; initial: Cat[]; readOnly: boolean }) {
  const router = useRouter();
  const [cats, setCats] = useState(initial);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [toDelete, setToDelete] = useState<Cat | null>(null);
  const [pending, start] = useTransition();

  function add(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await createCategory(slug, newName);
      if (!res.ok) return void toast.error(res.error);
      setCats((cs) => (cs.some((c) => c.id === res.category.id) ? cs : [...cs, { ...res.category, products: 0 }]));
      setNewName("");
      toast.success(`Categoría “${res.category.name}” creada.`);
      router.refresh();
    });
  }

  function saveRename() {
    if (!editing) return;
    const current = editing;
    start(async () => {
      const res = await renameCategory(slug, current.id, current.name);
      if (!res.ok) return void toast.error(res.error);
      setCats((cs) => cs.map((c) => (c.id === current.id ? { ...c, name: current.name.trim() } : c)));
      setEditing(null);
      toast.success("Categoría renombrada.");
      router.refresh();
    });
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= cats.length) return;
    const next = [...cats];
    [next[i], next[j]] = [next[j], next[i]];
    const prev = cats;
    setCats(next);
    start(async () => {
      const res = await reorderCategories(slug, next.map((c) => c.id));
      if (!res.ok) {
        setCats(prev);
        toast.error(res.error);
      }
    });
  }

  function confirmDelete() {
    if (!toDelete) return;
    const cat = toDelete;
    start(async () => {
      const res = await deleteCategory(slug, cat.id);
      if (!res.ok) return void toast.error(res.error);
      setCats((cs) => cs.filter((c) => c.id !== cat.id));
      setToDelete(null);
      toast.success(`Eliminaste “${cat.name}”.`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {!readOnly && (
        <form onSubmit={add} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="nueva-categoria">Nueva categoría</Label>
            <Input id="nueva-categoria" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} placeholder="Ej. Bebidas" className="h-10" />
          </div>
          <Button type="submit" variant="cta" className="h-10 px-4" disabled={pending || !newName.trim()}>
            <Plus aria-hidden /> Agregar
          </Button>
        </form>
      )}

      {cats.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <Tag className="mx-auto mb-2 size-6 text-muted-foreground" aria-hidden />
          <p className="font-semibold">Aún no tienes categorías</p>
          <p className="text-sm text-muted-foreground">Agrupa tus productos para que Teo los encuentre y los ofrezca más rápido.</p>
        </div>
      ) : (
        <ul aria-label="Categorías" className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {cats.map((c, i) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              {editing?.id === c.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <Label htmlFor={`renombrar-${c.id}`} className="sr-only">Nuevo nombre de {c.name}</Label>
                  <Input
                    id={`renombrar-${c.id}`}
                    value={editing.name}
                    autoFocus
                    maxLength={80}
                    onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveRename();
                      if (e.key === "Escape") setEditing(null);
                    }}
                    className="h-9"
                  />
                  <Button size="icon-lg" aria-label="Guardar nombre" onClick={saveRename} disabled={pending || !editing.name.trim()}>
                    {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
                  </Button>
                  <Button size="icon-lg" variant="ghost" aria-label="Cancelar" onClick={() => setEditing(null)}>
                    <X aria-hidden />
                  </Button>
                </div>
              ) : (
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.products} {c.products === 1 ? "producto" : "productos"}</p>
                </div>
              )}
              {!readOnly && editing?.id !== c.id && (
                <div className="flex gap-1">
                  <Button size="icon-lg" variant="ghost" aria-label={`Subir ${c.name}`} disabled={pending || i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button size="icon-lg" variant="ghost" aria-label={`Bajar ${c.name}`} disabled={pending || i === cats.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button size="icon-lg" variant="ghost" aria-label={`Renombrar ${c.name}`} onClick={() => setEditing({ id: c.id, name: c.name })}>
                    <Pencil aria-hidden />
                  </Button>
                  <Button size="icon-lg" variant="ghost" aria-label={`Eliminar ${c.name}`} onClick={() => setToDelete(c)}>
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={Boolean(toDelete)} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar “{toDelete?.name}”?</DialogTitle>
            <DialogDescription>
              {toDelete?.products
                ? `Sus ${toDelete.products} producto(s) no se borran: quedarán sin categoría.`
                : "No tiene productos. Esta acción no se puede deshacer."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" className="h-9 px-3" />}>Cancelar</DialogClose>
            <Button variant="destructive" className="h-9 px-3" onClick={confirmDelete} disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Sí, eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
