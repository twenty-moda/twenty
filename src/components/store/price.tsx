import { cn } from "@/lib/cn";
import { discountPercent, formatPrice } from "@/lib/money";

type PriceProps = {
  priceCents: number;
  compareAtPriceCents?: number | null;
  /** Muestra "Desde" cuando las variantes tienen precios distintos. */
  from?: boolean;
  size?: "sm" | "lg";
  /** Qué es el precio tachado para lectores de pantalla ("Antes"; en un conjunto, "Por separado"). */
  compareLabel?: string;
  className?: string;
};

export function Price({ priceCents, compareAtPriceCents, from, size = "sm", compareLabel = "Antes", className }: PriceProps) {
  const percent = discountPercent(priceCents, compareAtPriceCents);
  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-2", className)}>
      <span className={cn("font-semibold", size === "lg" ? "text-2xl" : "text-sm")}>
        {from ? <span className="font-normal text-muted">Desde </span> : null}
        {formatPrice(priceCents)}
      </span>
      {percent ? (
        <>
          <s className={cn("text-subtle", size === "lg" ? "text-base" : "text-xs")}>
            <span className="sr-only">{compareLabel} </span>
            {formatPrice(compareAtPriceCents!)}
          </s>
          <span className={cn("font-semibold text-danger", size === "lg" ? "text-sm" : "text-xs")}>-{percent}%</span>
        </>
      ) : null}
    </p>
  );
}

export function promotionLabel(promotion: { quantity: number; bundlePriceCents: number }) {
  return `${promotion.quantity} x ${formatPrice(promotion.bundlePriceCents)}`;
}
