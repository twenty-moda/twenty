import type { CSSProperties } from "react";
import { Barcode } from "@/components/admin/barcode";
import { discountPercent, formatPrice } from "@/lib/money";
import type { PickerVariant } from "@/server/services/inventory";

/**
 * Etiquetas TWENTY (lienzo "Etiquetas TWENTY", dibujado a 8 px = 1 mm): solo negro, porque las térmicas no imprimen
 * color ni grises. El código de barras va siempre a todo el ancho: en 203 dpi cada barra necesita unos 0,25 mm.
 * Las medidas se escriben en px del lienzo y `mm()` las pasa a milímetros con la escala del formato.
 */
export const LABEL_FORMATS = {
  "50x25": { label: "Rollo 50 × 25 mm", width: 50, height: 25, perSheet: 1, columns: 1, design: "urbana" },
  "40x30": { label: "Rollo 40 × 30 mm", width: 40, height: 30, perSheet: 1, columns: 1, design: "colgante" },
  a4: { label: "Hoja A4 · 24 etiquetas de 70 × 37 mm", width: 70, height: 37.125, perSheet: 24, columns: 3, design: "urbana" },
} as const;
export type LabelFormat = keyof typeof LABEL_FORMATS;

const DESIGN_WIDTH = { urbana: 400, colgante: 320 } as const;
const display: CSSProperties = { fontFamily: "var(--font-big-shoulders), Impact, 'Arial Narrow', sans-serif" };

/** La talla llena su bloque: "28" o "M" en grande, "XXL" o "ÚNICA" un poco más chicas. */
const sizeFontPx = (label: string, base: number) => (label.length <= 2 ? base : label.length === 3 ? base * 0.72 : base * 0.5);
/** Los nombres largos bajan de tamaño antes de cortarse. */
const nameFontPx = (name: string, base: number) => (name.length <= 14 ? base : name.length <= 19 ? base * 0.8 : base * 0.68);
/** El nombre se corta con "…" (overflow oculto): con menos alto de línea que esto, la tilde de "ÁNGEL" queda afuera. */
const nameStyle = (name: string, base: number, mm: (px: number) => string): CSSProperties => {
  const size = nameFontPx(name, base);
  return { ...display, fontWeight: 800, fontSize: mm(size), lineHeight: mm(size * 1.2) };
};

type LabelProps = { variant: PickerVariant; showPrice: boolean; format: LabelFormat };

export function LabelView({ variant, showPrice, format }: LabelProps) {
  const f = LABEL_FORMATS[format];
  const u = f.width / DESIGN_WIDTH[f.design];
  const mm = (px: number) => `${(px * u).toFixed(3)}mm`;
  const sale = discountPercent(variant.priceCents, variant.compareAtPriceCents);
  const props = { variant, showPrice, mm, sale };
  return (
    <div
      className="flex flex-col overflow-hidden bg-white text-black"
      style={{ width: `${f.width}mm`, height: `${f.height}mm`, breakInside: "avoid", fontFamily: "var(--font-plex-mono), ui-monospace, monospace" }}
    >
      {f.design === "colgante" ? <Colgante {...props} /> : sale ? <Rebaja {...props} sale={sale} /> : <Urbana {...props} />}
    </div>
  );
}

type DesignProps = { variant: PickerVariant; showPrice: boolean; mm: (px: number) => string; sale: number | null };

function Code({ variant, mm }: Pick<DesignProps, "variant" | "mm">) {
  return (
    <>
      <div className="min-h-0 flex-1">
        <Barcode value={variant.sku} className="block h-full w-full" />
      </div>
      <span className="text-center font-semibold" style={{ fontSize: mm(14), lineHeight: mm(16), letterSpacing: "0.3em", paddingLeft: "0.3em" }}>
        {variant.sku}
      </span>
    </>
  );
}

/** La de siempre: la talla en un bloque negro para encontrarla de un vistazo en el colgador. */
function Urbana({ variant, showPrice, mm }: DesignProps) {
  return (
    <div className="flex h-full flex-col" style={{ padding: `${mm(10)} ${mm(14)} ${mm(8)}`, gap: mm(6) }}>
      <div className="flex shrink-0" style={{ height: mm(82), gap: mm(12) }}>
        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <span style={{ ...display, fontWeight: 900, fontSize: mm(16), lineHeight: mm(16), letterSpacing: "0.32em" }}>TWENTY</span>
          <span className="truncate uppercase" style={nameStyle(variant.productName, 36, mm)}>
            {variant.productName}
          </span>
          <span className="truncate font-semibold uppercase" style={{ fontSize: mm(14), lineHeight: mm(16), letterSpacing: "0.12em" }}>
            {variant.colorName}
          </span>
        </div>
        <SizeBlock label={variant.sizeLabel} mm={mm} width={82} tag={12} size={60} />
      </div>
      <div className="min-h-0 flex-1">
        <Barcode value={variant.sku} className="block h-full w-full" />
      </div>
      <div className="flex shrink-0 items-center justify-between" style={{ height: mm(26) }}>
        <span className="font-semibold" style={{ fontSize: mm(14), letterSpacing: "0.24em" }}>
          {variant.sku}
        </span>
        {showPrice ? <span style={{ ...display, fontWeight: 800, fontSize: mm(28), lineHeight: mm(26) }}>{formatPrice(variant.priceCents)}</span> : null}
      </div>
    </div>
  );
}

/** Prenda con precio anterior: banda invertida con el descuento y el precio tachado. */
function Rebaja({ variant, showPrice, mm, sale }: DesignProps & { sale: number }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between bg-black text-white" style={{ height: mm(34), padding: `0 ${mm(14)}` }}>
        <span style={{ ...display, fontWeight: 900, fontSize: mm(24), lineHeight: mm(24), letterSpacing: "0.3em" }}>REBAJA</span>
        <span style={{ ...display, fontWeight: 900, fontSize: mm(28), lineHeight: mm(24) }}>−{sale}%</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col" style={{ padding: `${mm(8)} ${mm(14)}`, gap: mm(5) }}>
        <div className="flex shrink-0 items-end justify-between" style={{ gap: mm(10) }}>
          <div className="flex min-w-0 flex-col" style={{ gap: mm(2) }}>
            <span className="truncate uppercase" style={nameStyle(variant.productName, 30, mm)}>
              {variant.productName}
            </span>
            <span className="truncate font-semibold uppercase" style={{ fontSize: mm(14), lineHeight: mm(16), letterSpacing: "0.1em" }}>
              {variant.colorName} · Talla {variant.sizeLabel}
            </span>
          </div>
          {showPrice ? (
            <div className="flex shrink-0 flex-col items-end">
              <span className="font-medium line-through" style={{ fontSize: mm(14), lineHeight: mm(16), textDecorationThickness: mm(2) }}>
                {formatPrice(variant.compareAtPriceCents!)}
              </span>
              <span style={{ ...display, fontWeight: 900, fontSize: mm(36), lineHeight: mm(30) }}>{formatPrice(variant.priceCents)}</span>
            </div>
          ) : null}
        </div>
        <Code variant={variant} mm={mm} />
      </div>
    </div>
  );
}

/** Rollo de 40 × 30: más alto, con la marca arriba y la talla al lado del nombre. */
function Colgante({ variant, showPrice, mm, sale }: DesignProps) {
  return (
    <div className="flex h-full flex-col" style={{ padding: `${mm(10)} ${mm(12)} ${mm(8)}`, gap: mm(6) }}>
      <div className="flex shrink-0 items-center justify-between" style={{ height: mm(26) }}>
        <span style={{ ...display, fontWeight: 900, fontSize: mm(20), letterSpacing: "0.36em" }}>TWENTY</span>
        {showPrice ? (
          <span className="flex items-baseline" style={{ gap: mm(6) }}>
            {sale ? (
              <span className="font-medium line-through" style={{ fontSize: mm(13), textDecorationThickness: mm(2) }}>
                {formatPrice(variant.compareAtPriceCents!)}
              </span>
            ) : null}
            <span style={{ ...display, fontWeight: 800, fontSize: mm(28), lineHeight: mm(26) }}>{formatPrice(variant.priceCents)}</span>
          </span>
        ) : null}
      </div>
      <div className="shrink-0 bg-black" style={{ height: mm(2) }} />
      <div className="flex shrink-0" style={{ height: mm(66), gap: mm(10) }}>
        <div className="flex min-w-0 flex-1 flex-col justify-end" style={{ gap: mm(2) }}>
          <span className="truncate uppercase" style={nameStyle(variant.productName, 30, mm)}>
            {variant.productName}
          </span>
          <span className="truncate font-semibold uppercase" style={{ fontSize: mm(14), lineHeight: mm(16), letterSpacing: "0.12em" }}>
            {sale ? `−${sale}% · ` : ""}
            {variant.colorName}
          </span>
        </div>
        <SizeBlock label={variant.sizeLabel} mm={mm} width={66} tag={11} size={46} />
      </div>
      <Code variant={variant} mm={mm} />
    </div>
  );
}

function SizeBlock({ label, mm, width, tag, size }: { label: string; mm: (px: number) => string; width: number; tag: number; size: number }) {
  return (
    <div className="flex shrink-0 flex-col items-center justify-between bg-black text-white" style={{ width: mm(width), padding: `${mm(5)} 0 ${mm(3)}` }}>
      <span className="font-semibold" style={{ fontSize: mm(tag), lineHeight: mm(tag), letterSpacing: "0.22em", paddingLeft: "0.22em" }}>
        TALLA
      </span>
      <span className="uppercase" style={{ ...display, fontWeight: 900, fontSize: mm(sizeFontPx(label, size)), lineHeight: mm(size * 0.86) }}>
        {label}
      </span>
    </div>
  );
}
