import { Badge } from "@/components/admin/ui";

/** Plazo legal de respuesta: 15 días hábiles. */
export function DeadlineBadge({ daysLeft }: { daysLeft: number | null }) {
  if (daysLeft === null) return <Badge tone="success">Respondido</Badge>;
  if (daysLeft < 0) return <Badge tone="danger">Vencido hace {-daysLeft} {daysLeft === -1 ? "día hábil" : "días hábiles"}</Badge>;
  if (daysLeft === 0) return <Badge tone="danger">Vence hoy</Badge>;
  return <Badge tone={daysLeft <= 3 ? "warning" : "neutral"}>Quedan {daysLeft} {daysLeft === 1 ? "día hábil" : "días hábiles"}</Badge>;
}
