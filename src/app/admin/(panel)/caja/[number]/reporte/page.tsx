import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { displayFont, monoFont } from "@/components/home/fonts";
import { AdminPage } from "@/components/admin/ui";
import { getDb } from "@/server/db/client";
import { getCashReport } from "@/server/services/cash-report";
import { getSiteSettings } from "@/server/services/content";
import { requireStaff } from "../../../../_lib/auth";
import { PrintCashReport } from "./print-report";

export async function generateMetadata({ params }: PageProps<"/admin/caja/[number]/reporte">): Promise<Metadata> {
  const { number } = await params;
  return { title: `Reporte de caja #${number}` };
}

// Se arma en el servidor en cada visita (lee la sesión y la hora del reporte).
export const instant = false;

export default async function CashReportPage({ params, searchParams }: PageProps<"/admin/caja/[number]/reporte">) {
  const user = await requireStaff();
  const n = Number((await params).number);
  if (!Number.isInteger(n)) notFound();
  const db = getDb();
  const [report, settings] = await Promise.all([getCashReport(db, n), getSiteSettings(db)]);
  if (!report || (user.role !== "admin" && report.session.openedBy !== user.id)) notFound();
  return (
    <AdminPage
      title={`Reporte de caja #${report.session.number}`}
      back={{ href: `/admin/caja/${report.session.number}`, label: `Caja #${report.session.number}` }}
      description={`${report.session.openedByName ?? "Sin nombre"} · ${report.session.warehouseName} · ${report.session.closedAt ? "cerrada" : "abierta: el reporte muestra lo que va hasta ahora"}`}
    >
      <PrintCashReport
        report={report}
        company={{ legalName: settings.company.legalName, ruc: settings.company.ruc }}
        printedAt={new Date()}
        fontClass={`${displayFont.variable} ${monoFont.variable}`}
        autoPrint={(await searchParams).imprimir === "1"}
      />
    </AdminPage>
  );
}
