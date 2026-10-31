import { Badge } from "@/components/admin/ui";
import type { CouponState } from "@/server/services/coupons";

export function CouponStateBadge({ state }: { state: CouponState }) {
  switch (state) {
    case "apagado":
      return <Badge>Apagado</Badge>;
    case "termino":
      return <Badge tone="danger">Venció</Badge>;
    case "agotado":
      return <Badge tone="warning">Sin usos</Badge>;
    case "programado":
      return <Badge tone="info">Programado</Badge>;
    case "activo":
      return <Badge tone="success">Activo</Badge>;
  }
}
