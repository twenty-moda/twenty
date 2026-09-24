"use client";

import { Bold, Eye, Heading2, Heading3, Italic, Link2, List, ListOrdered, Pencil, Quote } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { inputClass } from "../ui/form";
import { RichText } from "../ui/rich-text";

type Tool = { label: string; icon: typeof Bold; apply: (selected: string) => { text: string; line?: boolean } };

// Cada botón escribe el formato simple de src/lib/rich-text.ts alrededor de lo seleccionado.
const TOOLS: Tool[] = [
  { label: "Título", icon: Heading2, apply: (s) => ({ text: `## ${s || "Título"}`, line: true }) },
  { label: "Subtítulo", icon: Heading3, apply: (s) => ({ text: `### ${s || "Subtítulo"}`, line: true }) },
  { label: "Negrita", icon: Bold, apply: (s) => ({ text: `**${s || "texto"}**` }) },
  { label: "Cursiva", icon: Italic, apply: (s) => ({ text: `*${s || "texto"}*` }) },
  {
    label: "Lista",
    icon: List,
    apply: (s) => ({ text: (s || "Elemento").split("\n").map((l) => `- ${l.replace(/^[-*]\s+/, "")}`).join("\n"), line: true }),
  },
  {
    label: "Lista numerada",
    icon: ListOrdered,
    apply: (s) => ({ text: (s || "Paso").split("\n").map((l, i) => `${i + 1}. ${l.replace(/^\d+\.\s+/, "")}`).join("\n"), line: true }),
  },
  { label: "Cita", icon: Quote, apply: (s) => ({ text: `> ${s || "Frase destacada"}`, line: true }) },
  { label: "Enlace", icon: Link2, apply: (s) => ({ text: `[${s || "texto del enlace"}](/catalogo)` }) },
];

type RichTextEditorProps = { name: string; label: string; defaultValue?: string; rows?: number; hint?: string; error?: string };

/** Área de texto con botones de formato y vista previa. Guarda texto simple (no HTML). */
export function RichTextEditor({ name, label, defaultValue = "", rows = 16, hint, error }: RichTextEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [preview, setPreview] = useState(false);

  const apply = (tool: Tool) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    const { text, line } = tool.apply(value.slice(start, end));
    // Los bloques (títulos, listas, citas) van en su propia línea, separados por una línea en blanco.
    const before = value.slice(0, start);
    const after = value.slice(end);
    const pre = line && before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
    const post = line && after && !after.startsWith("\n") ? "\n\n" : "";
    const next = `${before}${pre}${text}${post}${after}`;
    setValue(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = before.length + pre.length + text.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <div role="tablist" aria-label="Modo" className="flex rounded-full border border-line p-0.5 text-xs">
          {[
            { on: false, label: "Escribir", icon: Pencil },
            { on: true, label: "Vista previa", icon: Eye },
          ].map((m) => (
            <button
              key={m.label}
              type="button"
              role="tab"
              aria-selected={preview === m.on}
              onClick={() => setPreview(m.on)}
              className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3", preview === m.on ? "bg-white font-semibold text-black" : "text-muted")}
            >
              <m.icon className="size-3.5" aria-hidden /> {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("overflow-hidden rounded-xl border bg-raised", error ? "border-danger" : "border-line")}>
        {!preview ? (
          <div role="toolbar" aria-label="Formato" className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line p-1">
            {TOOLS.map((tool) => (
              <button
                key={tool.label}
                type="button"
                title={tool.label}
                aria-label={tool.label}
                onClick={() => apply(tool)}
                className="grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface hover:text-white"
              >
                <tool.icon className="size-4" aria-hidden />
              </button>
            ))}
          </div>
        ) : null}
        <textarea
          ref={ref}
          name={name}
          aria-label={label}
          rows={rows}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          hidden={preview}
          className={cn(inputClass, "h-auto rounded-none border-0 py-3 text-[15px] leading-relaxed focus:border-0")}
        />
        {preview ? (
          <div className="max-h-[32rem] min-h-40 overflow-y-auto bg-ink p-5">
            {value.trim() ? <RichText source={value} /> : <p className="text-sm text-muted">Aún no hay texto.</p>}
          </div>
        ) : null}
      </div>
      {error ? <p className="mt-1.5 text-sm text-danger">{error}</p> : null}
      {hint ? <p className="mt-1.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
