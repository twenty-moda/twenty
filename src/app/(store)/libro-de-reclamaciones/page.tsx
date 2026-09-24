import type { Metadata } from "next";
import Image from "next/image";
import { ComplaintForm } from "@/components/forms/complaint-form";
import { PageHeader } from "@/components/store/page-header";
import { COMPLAINT_RESPONSE_DAYS } from "@/lib/business-days";
import { getSiteSettings } from "../_data";

export const metadata: Metadata = {
  title: "Libro de Reclamaciones",
  description: "Registra un reclamo o una queja en el Libro de Reclamaciones virtual de TWENTY. Te respondemos en un máximo de 15 días hábiles.",
  alternates: { canonical: "/libro-de-reclamaciones" },
};

export default async function ComplaintsBookPage() {
  const { company } = await getSiteSettings();
  return (
    <>
      <PageHeader
        eyebrow="Atención al cliente"
        title="Libro de Reclamaciones"
        description={`Conforme al Código de Protección y Defensa del Consumidor, este establecimiento cuenta con un Libro de Reclamaciones virtual. Te respondemos en un máximo de ${COMPLAINT_RESPONSE_DAYS} días hábiles.`}
      >
        <Image src="/libro-reclamaciones.png" alt="Libro de Reclamaciones" width={320} height={330} className="mx-auto mt-6 h-20 w-auto" />
      </PageHeader>

      <div className="mx-auto max-w-2xl px-4">
        <section aria-label="Datos del proveedor" className="rounded-2xl bg-raised p-5 text-sm">
          <p className="text-[11px] font-bold tracking-widest text-muted uppercase">Proveedor</p>
          <p className="mt-2 font-semibold">{company.legalName || "TWENTY"}</p>
          {company.ruc ? <p className="text-muted">RUC {company.ruc}</p> : null}
          {company.address ? <p className="text-muted">{company.address}</p> : null}
        </section>

        <div className="mt-8">
          <ComplaintForm />
        </div>

        <aside className="mt-10 space-y-3 border-t border-line pt-6 text-xs leading-relaxed text-muted">
          <p>
            <strong className="text-white">Reclamo:</strong> disconformidad relacionada con los productos o servicios.{" "}
            <strong className="text-white">Queja:</strong> disconformidad no relacionada con los productos o servicios, o malestar o descontento
            respecto a la atención al público.
          </p>
          <p>La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.</p>
          <p>El proveedor debe dar respuesta al reclamo o queja en un plazo no mayor a quince (15) días hábiles improrrogables.</p>
        </aside>
      </div>
    </>
  );
}
