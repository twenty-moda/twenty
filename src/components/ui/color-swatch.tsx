import { cn } from "@/lib/cn";

/** Punto del color. Sin hex (lavados de jean) va un degradado de denim. */
export function ColorSwatch({ hex, className }: { hex?: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("size-4 shrink-0 rounded-full border border-white/30", className)}
      style={hex ? { backgroundColor: hex } : { background: "linear-gradient(135deg,#9fb4c7,#3d4b5c)" }}
    />
  );
}
