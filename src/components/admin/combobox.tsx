"use client";

import { Check, ChevronDown, Plus } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { ColorSwatch } from "@/components/ui/color-swatch";
import { inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { slugify } from "@/lib/slug";

export type ComboOption = { value: string; hex?: string | null };

type ComboboxProps = {
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  /** Al elegir una opción (o Enter con lo escrito): sirve para agregarlo a una lista y limpiar el campo. */
  onPick?: (value: string) => void;
  label: string;
  placeholder?: string;
  name?: string;
  /** Clases del campo (por defecto `inputClass`): reemplazan a las de siempre, ver `fieldClass`. */
  className?: string;
  /** Muestra el punto de color de cada opción. */
  swatches?: boolean;
  /** Si lo escrito no está en la lista, se ofrece como opción con este texto ("Color nuevo: «X»"). */
  createLabel?: (value: string) => string;
};

type Item = ComboOption & { create?: boolean };

/**
 * Campo de texto con sugerencias, en lugar de <datalist> (que no se puede estilizar, no muestra colores
 * y en cada navegador se ve distinto). La lista va en la capa superior (popover) para que ninguna fila
 * ni tarjeta la tape, y se abre hacia arriba si abajo no hay espacio (el teclado del teléfono).
 */
export function Combobox({ options, value, onChange, onPick, label, placeholder, name, className, swatches, createLabel }: ComboboxProps) {
  const id = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  // null = recién abierta: se ven todas. Al escribir, se filtra.
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(-1);

  const q = query === null ? "" : slugify(query);
  const matches = q
    ? options
        .filter((o) => slugify(o.value).includes(q))
        .sort((a, b) => Number(slugify(b.value).startsWith(q)) - Number(slugify(a.value).startsWith(q)))
    : options;
  const typed = value.trim();
  const known = options.some((o) => slugify(o.value) === slugify(typed));
  const items: Item[] = createLabel && typed && !known ? [...matches, { value: typed, create: true }] : matches;
  const current = slugify(value);
  const chosen = swatches ? options.find((o) => slugify(o.value) === current) : undefined;

  const show = () => {
    setQuery(null);
    setActive(options.findIndex((o) => slugify(o.value) === current));
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setQuery(null);
  };
  const pick = (v: string) => {
    onChange(v);
    onPick?.(v);
    close();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return show();
      const n = items.length;
      if (!n) return;
      const down = e.key === "ArrowDown";
      setActive((a) => (a < 0 ? (down ? 0 : n - 1) : (a + (down ? 1 : n - 1)) % n));
    } else if (e.key === "Enter") {
      const item = open ? items[active] : undefined;
      if (item) {
        e.preventDefault();
        pick(item.value);
      } else if (onPick && typed) {
        e.preventDefault();
        pick(typed);
      } else if (open) {
        e.preventDefault();
        close();
      }
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") {
      close();
    }
  };

  // Se cierra al tocar fuera (no con blur: en el teléfono, tocar una opción puede quitarle el foco al campo).
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!wrapRef.current?.contains(target) && !listRef.current?.contains(target)) close();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  useEffect(() => {
    if (open && active >= 0) listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const count = items.length;
  useLayoutEffect(() => {
    const list = listRef.current;
    const anchor = wrapRef.current;
    if (!list || !anchor) return;
    if (!open) {
      if (list.matches(":popover-open")) list.hidePopover();
      return;
    }
    if (!list.matches(":popover-open")) list.showPopover();
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const vv = window.visualViewport;
      const top = vv?.offsetTop ?? 0;
      const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const below = bottom - r.bottom - 8;
      const above = r.top - top - 8;
      const up = below < 220 && above > below;
      const width = Math.max(r.width, 208);
      list.style.width = `${width}px`;
      list.style.left = `${Math.max(8, Math.min(r.left, document.documentElement.clientWidth - width - 8))}px`;
      list.style.maxHeight = `${Math.min(288, Math.max(120, up ? above : below))}px`;
      list.style.top = `${up ? r.top - 4 - list.offsetHeight : r.bottom + 4}px`;
    };
    place();
    const vv = window.visualViewport;
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    vv?.addEventListener("resize", place);
    vv?.addEventListener("scroll", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      vv?.removeEventListener("resize", place);
      vv?.removeEventListener("scroll", place);
    };
  }, [open, count]);

  return (
    <div ref={wrapRef} className="relative">
      {chosen ? <ColorSwatch hex={chosen.hex} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" /> : null}
      <input
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
        autoComplete="off"
        name={name}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setQuery(e.target.value);
          setActive(e.target.value.trim() ? 0 : -1);
          setOpen(true);
        }}
        onClick={() => (open ? undefined : show())}
        onKeyDown={onKeyDown}
        className={cn(className ?? inputClass, "pr-10", chosen && "pl-9")}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? "Cerrar la lista" : "Ver la lista"}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          wrapRef.current?.querySelector("input")?.focus();
          if (open) close();
          else show();
        }}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted hover:text-white"
      >
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <ul
        ref={listRef}
        id={`${id}-list`}
        role="listbox"
        aria-label={label}
        popover="manual"
        onMouseDown={(e) => e.preventDefault()}
        className="fixed inset-auto m-0 overflow-y-auto overscroll-contain rounded-xl border border-line bg-raised p-1 text-white shadow-2xl shadow-black/60"
      >
        {/* Las opciones se arman solo con la lista abierta: cada fila de variantes tiene dos de estos. */}
        {(open ? items : []).map((item, i) => {
          const selected = !item.create && slugify(item.value) === current;
          return (
            <li
              key={item.create ? "__create" : item.value}
              id={`${id}-${i}`}
              data-index={i}
              role="option"
              aria-selected={selected}
              onPointerEnter={() => setActive(i)}
              onClick={() => pick(item.value)}
              className={cn(
                "flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-3 text-sm",
                i === active && "bg-white/10",
                item.create && "text-muted",
                item.create && i > 0 && "mt-1 border-t border-line pt-px",
              )}
            >
              {item.create ? <Plus className="size-4 shrink-0" aria-hidden /> : swatches ? <ColorSwatch hex={item.hex} /> : null}
              <span className="min-w-0 flex-1 truncate">{item.create && createLabel ? createLabel(item.value) : item.value}</span>
              {selected ? <Check className="size-4 shrink-0 text-muted" aria-hidden /> : null}
            </li>
          );
        })}
        {open && items.length === 0 ? <li className="px-3 py-2.5 text-sm text-muted">Sin coincidencias.</li> : null}
      </ul>
    </div>
  );
}
