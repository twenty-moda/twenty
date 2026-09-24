import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PrintButton } from "@/components/store/print-button";
import { COMPLAINT_TYPES } from "@/lib/public-forms";
import { getDb } from "@/server/db/client";
import { complaintCode, complaintDeadline, getComplaintById } from "@/server/services/complaints";
import { complaintRows } from "@/server/services/notifications";
import { getSiteSettings } from "../../../_data";

export const metadata: Metadata = { title: "Constancia de reclamo", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dayFormat = new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
const dateTimeFormat = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "long", timeStyle: "short" });

export default function ConstanciaPage({ params }: PageProps<"/libro-de-reclamaciones/constancia/[id]">) {
  return (
    <Suspense fallback={<p className="px-4 py-24 text-center text-muted">Cargando constancia…</p>}>
      <Constancia params={params} />
    </Suspense>
  );
}

async function Constancia({ params }: Pick<PageProps<"/libro-de-reclamaciones/constancia/[id]">, "params">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [complaint, settings] = await Promise.all([getComplaintById(getDb(), id), getSiteSettings()]);
  if (!complaint) notFound();
  const code = complaintCode(complaint);
  const label = COMPLAINT_TYPES[complaint.type].label.toLowerCase();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 print:max-w-none print:px-0 print:text-black">
      <div className="text-center print:text-left">
        <CheckCircle2 className="mx-auto size-12 text-success print:hidden" aria-hidden />
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight uppercase">
          Hoja de reclamación <span className="whitespace-nowrap">{code}</span>
        </h1>
        <p className="mt-2 text-muted print:text-black">
          Registramos tu {label}. Te enviamos una copia a <strong className="text-white print:text-black">{complaint.email}</strong>
          {complaint.respondedAt ? "." : ` y te responderemos a más tardar el ${dayFormat.format(complaintDeadline(complaint))}.`}
        </p>
        <div className="mt-6 print:hidden">
          <PrintButton />
        </div>
      </div>

      <dl className="mt-8 divide-y divide-line rounded-2xl border border-line text-sm print:border-black/30">
        {complaintRows(complaint, settings.company).map(([label, value]) => (
          <div key={label} className="grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
            <dt className="text-muted print:text-black/60">{label}</dt>
            <dd className="break-words whitespace-pre-line">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-6 rounded-2xl bg-raised p-5 text-sm print:border print:border-black/30 print:bg-transparent">
        <h2 className="font-bold">Respuesta del proveedor</h2>
        {complaint.response && complaint.respondedAt ? (
          <>
            <p className="mt-1 text-xs text-muted">{dateTimeFormat.format(complaint.respondedAt)}</p>
            <p className="mt-3 whitespace-pre-line">{complaint.response}</p>
          </>
        ) : (
          <p className="mt-1 text-muted">Pendiente. Te llegará al correo que registraste.</p>
        )}
      </section>

      <p className="mt-6 text-xs leading-relaxed text-muted print:text-black/70">
        La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.
      </p>
    </div>
  );
}
