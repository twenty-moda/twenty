import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type ChipProps = {
  active?: boolean;
  count?: number;
  swatch?: string | null;
  children: ReactNode;
} & ComponentProps<"button">;

/** Opción seleccionable (filtros, categorías). Mínimo 40 px de alto para tocar cómodo. */
export function Chip({ active, count, swatch, children, className, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm whitespace-nowrap transition-colors",
        active ? "border-white bg-white font-semibold text-black" : "border-line hover:border-white/40",
        className,
      )}
      {...props}
    >
      {swatch !== undefined ? (
        <span
          aria-hidden
          className="size-4 rounded-full border border-white/30"
          style={swatch ? { backgroundColor: swatch } : { background: "linear-gradient(135deg,#9fb4c7,#3d4b5c)" }}
        />
      ) : null}
      {children}
      {count !== undefined ? <span className={cn("text-xs tabular-nums", active ? "text-black/60" : "text-subtle")}>{count}</span> : null}
    </button>
  );
}
