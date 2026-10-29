import { code128Widths } from "@/lib/barcode";

/** Margen en blanco a cada lado: sin él, muchos lectores no encuentran dónde empieza el código. */
const QUIET_ZONE = 10;

/** Code 128 en SVG: nítido en cualquier impresora. El alto y el ancho salen de `className`. */
export function Barcode({ value, className }: { value: string; className?: string }) {
  const widths = code128Widths(value);
  const total = widths.reduce((s, w) => s + w, 0) + QUIET_ZONE * 2;
  const bars: { x: number; w: number }[] = [];
  let x = QUIET_ZONE;
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, w });
    x += w;
  });
  return (
    <svg viewBox={`0 0 ${total} 10`} preserveAspectRatio="none" shapeRendering="crispEdges" role="img" aria-label={`Código ${value}`} className={className}>
      {bars.map((b) => (
        <rect key={b.x} x={b.x} y={0} width={b.w} height={10} fill="#000" />
      ))}
    </svg>
  );
}
