import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import { TrackingForm } from "@/components/forms/tracking-form";
import { PageHeader } from "@/components/store/page-header";
import { whatsappUrl } from "@/lib/links";
import { getSiteSettings } from "../_data";

export const metadata: Metadata = {
  title: "Rastrea tu pedido",
  description: "Mira en qué estado está tu pedido de TWENTY con tu número de pedido.",
  alternates: { canonical: "/tracking" },
};

export default async function TrackingPage() {
  const { contact } = await getSiteSettings();
  return (
    <>
      <PageHeader eyebrow="Estado del pedido" title="Rastrea tu pedido" description="Escribe tu número de pedido para ver en qué va." />
      <div className="mx-auto max-w-md px-4">
        <TrackingForm whatsapp={contact.whatsapp} />
        {contact.whatsapp ? (
          <p className="mt-6 text-center text-sm text-muted">
            ¿No tienes el número?{" "}
            <a
              href={whatsappUrl(contact.whatsapp, "Hola TWENTY, quiero saber el estado de mi pedido.")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-white underline underline-offset-4"
            >
              <MessageCircle className="size-4" aria-hidden /> Escríbenos por WhatsApp
            </a>
          </p>
        ) : null}
      </div>
    </>
  );
}
