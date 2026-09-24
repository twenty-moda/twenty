import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminPage, Badge, Card, formatDateTime, formatDay } from "@/components/admin/ui";
import { PrintButton } from "@/components/store/print-button";
import { COMPLAINT_TYPES } from "@/lib/public-forms";
import { getDb } from "@/server/db/client";
import { getComplaintByNumber } from "@/server/services/complaints";
import { getSiteSettings } from "@/server/services/content";
import { complaintRows } from "@/server/services/notifications";
import { requireAdmin } from "../../../_lib/auth";
import { DeadlineBadge } from "../deadline-badge";
import { ResponseForm } from "./response-form";

export const instant = false;
export const metadata: Metadata = { title: "Reclamo" };

const deadlineFormat = new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });

export default async function ComplaintPage({ params }: PageProps<"/admin/reclamos/[number]">) {
  await requireAdmin();
  const { number } = await params;
  const n = Number(number);
  if (!Number.isInteger(n) || n <= 0) notFound();
  const db = getDb();
  const [complaint, settings] = await Promise.all([getComplaintByNumber(db, n), getSiteSettings(db)]);
  if (!complaint) notFound();

  return (
    <AdminPage
      title={
        <span className="flex flex-wrap items-center gap-3">
          {complaint.code} <Badge tone={complaint.type === "reclamo" ? "info" : "neutral"}>{COMPLAINT_TYPES[complaint.type].label}</Badge>
        </span>
      }
      description={`Registrado el ${formatDateTime(complaint.createdAt)} · Plazo para responder: ${deadlineFormat.format(complaint.deadline)}`}
      back={{ href: "/admin/reclamos", label: "Libro de Reclamaciones" }}
      actions={
        <>
          <DeadlineBadge daysLeft={complaint.daysLeft} />
          <PrintButton label="Imprimir hoja" />
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
        <Card title="Hoja de reclamación">
          <dl className="divide-y divide-line text-sm">
            {complaintRows(complaint, settings.company).map(([label, value]) => (
              <div key={label} className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
                <dt className="text-muted">{label}</dt>
                <dd className="break-words whitespace-pre-line">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <div className="space-y-4">
          <Card title="Respuesta del proveedor">
            {complaint.respondedAt ? (
              <p className="mb-4 text-sm text-success">
                Respondido el {formatDay(complaint.respondedAt)}
                {complaint.respondedByName ? ` por ${complaint.respondedByName}` : ""}.
              </p>
            ) : null}
            <ResponseForm number={complaint.number} response={complaint.response} email={complaint.email} />
          </Card>
          <p className="px-1 text-xs leading-relaxed text-muted">
            Las hojas no se pueden borrar: la ley pide conservarlas al menos 2 años. El cliente ve su constancia y la respuesta en el enlace que le llegó por email.
          </p>
        </div>
      </div>
    </AdminPage>
  );
}
