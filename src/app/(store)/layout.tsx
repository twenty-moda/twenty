import { CartProvider } from "@/components/cart/cart-provider";
import { AnnouncementBar } from "@/components/store/announcement-bar";
import { SiteFooter } from "@/components/store/site-footer";
import { SiteHeader } from "@/components/store/site-header";
import { SplashScreen } from "@/components/store/splash-screen";
import { WhatsAppFloat } from "@/components/store/whatsapp-float";
import { promoSections } from "@/lib/promos";
import { getCategoryLinks, getCurrentYear, getProductCards, getSiteSettings } from "./_data";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [categories, products, settings, year] = await Promise.all([getCategoryLinks(), getProductCards(), getSiteSettings(), getCurrentYear()]);
  const promoCount = promoSections(products).productCount;
  return (
    <CartProvider>
      <SplashScreen />
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-black">
        Ir al contenido
      </a>
      <AnnouncementBar messages={settings.announcements} />
      <SiteHeader categories={categories} promoCount={promoCount} contact={settings.contact} socials={settings.socials} store={settings.store} />
      <main id="contenido">{children}</main>
      <SiteFooter categories={categories} showPromos={promoCount > 0} settings={settings} year={year} />
      {settings.contact.whatsapp && settings.contact.whatsappFloat ? (
        <WhatsAppFloat phone={settings.contact.whatsapp} message={settings.contact.whatsappMessage || "Hola TWENTY, tengo una consulta."} />
      ) : null}
    </CartProvider>
  );
}
