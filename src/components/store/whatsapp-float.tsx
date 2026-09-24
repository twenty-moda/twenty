"use client";

import { whatsappUrl } from "@/lib/links";

/**
 * Botón flotante de WhatsApp (abajo a la derecha). En la ficha de producto el mensaje lleva el enlace del producto
 * con la talla y el color elegidos, para que el equipo sepa de qué prenda le hablan. Se oculta en el checkout y sube
 * por encima de la barra de compra fija del teléfono: ambas cosas por CSS (`.whatsapp-float` en globals.css).
 */
export function WhatsAppFloat({ phone, message }: { phone: string; message: string }) {
  return (
    <a
      href={whatsappUrl(phone, message)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escríbenos por WhatsApp"
      onClick={(e) => {
        if (location.pathname.startsWith("/product/")) {
          e.currentTarget.href = whatsappUrl(phone, `Hola TWENTY, quiero consultar por esta prenda: ${location.href}`);
        }
      }}
      className="whatsapp-float group fixed right-4 z-30 flex items-center gap-2 rounded-full drop-shadow-[0_6px_16px_rgb(0_0_0/0.45)] lg:right-6"
    >
      <span className="hidden rounded-full bg-white px-4 py-2 text-sm font-bold text-black lg:block">¿Dudas? Escríbenos</span>
      <svg viewBox="0 0 100 100" className="size-14 shrink-0 transition-transform duration-200 pointer-fine:group-hover:scale-110" aria-hidden>
        <path fill="#fff" d="m85.28,14.55s0,0,0,0C75.91,5.17,63.45,0,50.18,0,22.84,0,.58,22.25.56,49.6c0,7.87,1.87,15.62,5.42,22.59L.41,92.56c-.55,2.03.01,4.2,1.49,5.69,1.12,1.13,2.63,1.75,4.18,1.75.5,0,1-.06,1.49-.19l21.01-5.51c6.69,3.24,14.1,4.94,21.6,4.95,27.35,0,49.61-22.25,49.62-49.6,0-13.25-5.15-25.71-14.52-35.09Z" />
        <path fill="#25d366" fillRule="evenodd" d="m78.47,21.37c-7.55-7.56-17.6-11.72-28.3-11.73-22.05,0-40,17.94-40.01,39.99,0,7.05,1.84,13.93,5.34,20l-5.68,20.73,21.21-5.56c5.84,3.19,12.42,4.86,19.12,4.87h.02c22.05,0,40-17.94,40-39.99,0-10.69-4.15-20.73-11.71-28.29m-28.3,61.53h-.02c-5.97,0-11.82-1.6-16.92-4.63l-1.21-.72-12.59,3.3,3.36-12.27-.79-1.26c-3.33-5.29-5.09-11.41-5.08-17.69,0-18.33,14.92-33.24,33.27-33.24,8.88,0,17.23,3.46,23.51,9.75,6.28,6.28,9.73,14.63,9.73,23.52,0,18.33-14.92,33.24-33.25,33.24m18.24-24.9c1,.5,1.67.75,1.92,1.17.25.42.25,2.42-.58,4.75-.83,2.33-4.83,4.47-6.75,4.75-1.72.26-3.9.37-6.3-.4-1.45-.46-3.31-1.08-5.7-2.11-10.03-4.33-16.58-14.42-17.08-15.09-.5-.67-4.08-5.42-4.08-10.34s2.58-7.33,3.5-8.33c.92-1,2-1.25,2.67-1.25s1.33,0,1.92.03c.61.03,1.44-.23,2.25,1.72.83,2,2.83,6.92,3.08,7.42.25.5.42,1.09.08,1.75-.33.67-.5,1.08-1,1.67-.5.59-1.05,1.31-1.5,1.75-.5.5-1.02,1.04-.44,2.04.58,1,2.59,4.27,5.56,6.92,3.82,3.4,7.04,4.46,8.04,4.96,1,.5,1.58.42,2.17-.25.58-.67,2.5-2.92,3.17-3.92.67-1,1.33-.83,2.25-.5.92.34,5.83,2.75,6.83,3.25" />
      </svg>
    </a>
  );
}
