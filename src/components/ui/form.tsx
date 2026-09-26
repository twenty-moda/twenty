import { ChevronDown } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Borde, texto y foco de un campo, sin medidas ni fondo. `cn` no fusiona clases de Tailwind y en el CSS
 * `h-12` gana a `h-11`, `w-full` a `w-20` y `bg-raised` a `bg-ink`: para otra medida o fondo se arma desde
 * aquí, no sumándole clases a `inputClass` (no se aplicarían).
 */
export const fieldClass =
  "rounded-xl border border-line text-white outline-none transition placeholder:text-subtle focus:border-white aria-invalid:border-danger";
export const inputClass = cn(fieldClass, "h-12 w-full bg-raised px-4 text-base");
/** 44 px de alto, para filas y tablas del admin. Letra de 16 px en pantallas táctiles: con menos, el iPhone hace zoom al tocar el campo. */
export const inputCompactClass = cn(fieldClass, "h-11 w-full bg-raised px-3 text-base pointer-fine:text-sm");
export const selectClass = cn(inputClass, "appearance-none pr-10");

/** <select> nativo (en móvil abre el selector del sistema) con su flecha. */
export function SelectWrap({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted" />
    </div>
  );
}

type FieldProps = {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  className?: string;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
};

/** Etiqueta + control + ayuda o error, con los ids de accesibilidad conectados. */
export function Field({ label, error, hint, optional, className, children }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
        {optional ? <span className="font-normal text-subtle"> (opcional)</span> : null}
      </label>
      {children({ id, "aria-invalid": !!error, "aria-describedby": describedBy })}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type SegmentedProps<T extends string> = {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
};

/** Selector de pocas opciones (DNI/CE, Boleta/Factura) como botones grandes. */
export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl border border-line bg-raised p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("h-10 flex-1 rounded-lg text-sm font-semibold transition", value === o.value ? "bg-white text-black" : "text-muted")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
