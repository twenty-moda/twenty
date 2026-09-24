import type { Metadata } from "next";
import { AdminPage, Card } from "@/components/admin/ui";
import { getDb } from "@/server/db/client";
import { getSiteSettings, listSlidesAdmin } from "@/server/services/content";
import { culqiConfig } from "@/lib/culqi-config";
import { requireAdmin } from "../../_lib/auth";
import { LEGAL_PAGES } from "@/lib/legal-pages";
import {
  AboutForm,
  AnnouncementsForm,
  CompanyForm,
  ContactForm,
  FaqForm,
  LegalForm,
  PaymentsForm,
  ProductInfoForm,
  SeoForm,
  SlideForm,
  SocialsForm,
} from "./content-forms";

// El admin se arma en el servidor en cada visita (lee la sesión): no se exige navegación instantánea.
export const instant = false;
export const metadata: Metadata = { title: "Contenido de la web" };

const SECTIONS = [
  ["#banners", "Banners"],
  ["#cintillo", "Cintillo"],
  ["#contacto", "Contacto"],
  ["#empresa", "Empresa"],
  ["#pagos", "Pagos"],
  ["#ficha", "Ficha de producto"],
  ["#nosotros", "Nosotros"],
  ["#preguntas", "Preguntas frecuentes"],
  ["#legales", "Páginas legales"],
  ["#redes", "Redes"],
  ["#seo", "SEO"],
];

export default async function ContentPage() {
  await requireAdmin();
  const db = getDb();
  const [settings, slides] = await Promise.all([getSiteSettings(db), listSlidesAdmin(db)]);

  return (
    <AdminPage title="Contenido de la web" description="Textos, banners y datos de contacto que se ven en la tienda. Los cambios se ven al instante.">
      <nav aria-label="Secciones" className="no-scrollbar sticky top-14 z-20 -mx-4 mb-4 flex gap-2 overflow-x-auto border-b border-line bg-ink/90 px-4 py-2 backdrop-blur-md lg:top-0">
        {SECTIONS.map(([href, label]) => (
          <a key={href} href={href} className="inline-flex h-9 shrink-0 items-center rounded-full border border-line px-4 text-sm">
            {label}
          </a>
        ))}
      </nav>
      <div className="space-y-4">
        <section id="banners" className="scroll-mt-32 space-y-4">
          {slides.map((s, i) => (
            <Card key={s.id} title={`Banner ${i + 1}${s.isVisible ? "" : " (oculto)"}`}>
              <SlideForm slide={s} />
            </Card>
          ))}
          <Card title="Nuevo banner">
            <SlideForm />
          </Card>
        </section>
        <div id="cintillo" className="scroll-mt-32">
          <Card title="Cintillo (franja superior)">
            <AnnouncementsForm messages={settings.announcements} />
          </Card>
        </div>
        <div id="contacto" className="scroll-mt-32">
          <Card title="Contacto y tienda">
            <ContactForm contact={settings.contact} />
          </Card>
        </div>
        <div id="empresa" className="scroll-mt-32">
          <Card title="Empresa (razón social y RUC)">
            <CompanyForm company={settings.company} />
          </Card>
        </div>
        <div id="pagos" className="scroll-mt-32">
          <Card title="Pagos">
            <PaymentsForm payments={settings.payments} culqiReady={!!culqiConfig()} />
          </Card>
        </div>
        <div id="ficha" className="scroll-mt-32">
          <Card title="Textos de la ficha de producto">
            <ProductInfoForm info={settings.productInfo} />
          </Card>
        </div>
        <div id="nosotros" className="scroll-mt-32">
          <Card title="Página Nosotros">
            <AboutForm about={settings.about} />
          </Card>
        </div>
        <div id="preguntas" className="scroll-mt-32">
          <Card title="Preguntas frecuentes">
            <FaqForm faqs={settings.faqs} />
          </Card>
        </div>
        <section id="legales" className="scroll-mt-32 space-y-4">
          {LEGAL_PAGES.map((p) => (
            <Card key={p.key} title={p.title}>
              <LegalForm page={p.key} title={p.title} href={p.href} body={settings.legal[p.key].body} />
            </Card>
          ))}
        </section>
        <div id="redes" className="scroll-mt-32">
          <Card title="Redes sociales">
            <SocialsForm socials={settings.socials} />
          </Card>
        </div>
        <div id="seo" className="scroll-mt-32">
          <Card title="SEO">
            <SeoForm seo={settings.seo} />
          </Card>
        </div>
      </div>
    </AdminPage>
  );
}
