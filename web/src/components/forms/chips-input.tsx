"use client";

import { useState } from "react";
import { X } from "lucide-react";

/** Lista de palabras como chips: Enter o coma para agregar, botón para quitar. Controlado por el padre. */
export function ChipsInput({
  id,
  value,
  onChange,
  disabled,
  placeholder,
  max = 30,
  describedBy,
}: {
  id: string;
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  max?: number;
  describedBy?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = (raw = draft) => {
    const w = raw.replace(/,/g, "").trim().toLowerCase().slice(0, 40);
    if (w && !value.includes(w) && value.length < max) onChange([...value, w]);
    setDraft("");
  };
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background p-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
      <ul className="contents" aria-label="Palabras agregadas">
        {value.map((w) => (
          <li key={w} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
            {w}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(value.filter((x) => x !== w))}
              className="rounded-full p-0.5 hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={`Quitar ${w}`}
            >
              <X className="size-3" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <input
        id={id}
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        aria-describedby={describedBy}
        onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => add()}
        className="h-7 min-w-32 flex-1 bg-transparent px-1.5 text-base outline-none placeholder:text-muted-foreground md:text-sm"
      />
    </div>
  );
}
