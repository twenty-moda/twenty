"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition, type ReactNode } from "react";
import { FieldError, FormAlert, SubmitButton, Toggle } from "@/components/admin/form-controls";
import { ImageInput } from "@/components/admin/image-input";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { buttonClass } from "@/components/admin/ui";
import { inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import type { LegalKey, SettingKey, SiteSettings } from "@/server/services/content";
import { idle } from "../../_lib/action-state";
import { deleteSlideAction, saveSettingAction, saveSlideAction } from "./actions";

function SettingForm({ settingKey, children, submitLabel = "Guardar" }: { settingKey: SettingKey; children: ReactNode; submitLabel?: string }) {
  const [state, action] = useActionState(saveSettingAction.bind(null, settingKey), idle);
  return (
    <form action={action} className="space-y-4">
      {children}
      <FormAlert state={state} />
      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}

function Text({ label, name, defaultValue, hint, placeholder, type = "text" }: { label: string; name: string; defaultValue?: string; hint?: string; placeholder?: string; type?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input type={type} name={name} defaultValue={defaultValue} placeholder={placeholder} className={inputClass} />
      {hint ? <span className="mt-1.5 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

function Lines({ label, name, defaultValue, hint, rows = 4 }: { label: string; name: string; defaultValue: string; hint?: string; rows?: number }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <textarea name={name} rows={rows} defaultValue={defaultValue} className={cn(inputClass, "h-auto py-3")} />
      {hint ? <span className="mt-1.5 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function AnnouncementsForm({ messages }: { messages: string[] }) {
  return (
    <SettingForm settingKey="announcements">
      <Lines label="Mensajes" name="messages" defaultValue={messages.join("\n")} rows={3} hint="Uno por línea. Se muestra el primero en la franja blanca de arriba. Déjalo vacío para ocultarla." />
    </SettingForm>
  );
}

export function ContactForm({ contact }: { contact: SiteSettings["contact"] }) {
  return (
    <SettingForm settingKey="contact">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Text label="WhatsApp" name="whatsapp" defaultValue={contact.whatsapp} hint="Con código de país: +51 9XX XXX XXX" />
        <Text label="Teléfono visible" name="phone" defaultValue={contact.phone} />
      </div>
      <Text label="Mensaje inicial de WhatsApp" name="whatsappMessage" defaultValue={contact.whatsappMessage} />
      <Toggle
        name="whatsappFloat"
        defaultChecked={contact.whatsappFloat}
        label="Botón flotante de WhatsApp"
        hint="El círculo verde abajo a la derecha, en toda la tienda menos el checkout. Desde una prenda, el mensaje lleva el enlace de esa prenda."
      />
      <Text label="Email" name="email" type="email" defaultValue={contact.email} />
      <Text label="Dirección" name="address" defaultValue={contact.address} />
      <Text label="Horario" name="openingHours" defaultValue={contact.openingHours} />
    </SettingForm>
  );
}

export function SocialsForm({ socials }: { socials: SiteSettings["socials"] }) {
  return (
    <SettingForm settingKey="socials">
      <Lines label="Redes" name="socials" defaultValue={socials.map((s) => `${s.name} | ${s.url}`).join("\n")} rows={3} hint="Una por línea: Nombre | https://…" />
    </SettingForm>
  );
}

export function SeoForm({ seo }: { seo: SiteSettings["seo"] }) {
  return (
    <SettingForm settingKey="seo">
      <Text label="Nombre de la tienda" name="title" defaultValue={seo.title} />
      <Lines label="Descripción (Google y pie de página)" name="description" defaultValue={seo.description} rows={3} />
    </SettingForm>
  );
}

export function ProductInfoForm({ info }: { info: SiteSettings["productInfo"] }) {
  return (
    <SettingForm settingKey="productInfo">
      <Lines label="Envíos y recojo" name="shipping" defaultValue={info.shipping.join("\n")} hint="Una idea por línea. Se muestra en cada ficha de producto." />
      <Lines label="Cambios" name="returns" defaultValue={info.returns.join("\n")} rows={3} />
    </SettingForm>
  );
}

export function PaymentsForm({ payments, culqiReady }: { payments: SiteSettings["payments"]; culqiReady: boolean }) {
  return (
    <SettingForm settingKey="payments">
      <Toggle
        name="culqiEnabled"
        defaultChecked={payments.culqiEnabled}
        label="Ofrecer tarjeta y Yape con Culqi"
        hint={culqiReady ? "Las llaves de Culqi están configuradas." : "Faltan las llaves de Culqi en las variables de entorno: mientras tanto no se muestra en el checkout."}
      />
      <Toggle name="walletEnabled" defaultChecked={payments.walletEnabled} label="Ofrecer pago con Yape / Plin (QR)" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[192px_1fr]">
        <ImageInput name="qr" label="Código QR" current={payments.walletQr} maxSize={800} />
        <div className="space-y-4">
          <Text label="A nombre de" name="walletName" defaultValue={payments.walletName} />
          <Text label="Texto de ayuda" name="walletDescription" defaultValue={payments.walletDescription} />
        </div>
      </div>
    </SettingForm>
  );
}

type Slide = {
  id: string;
  title: string;
  description: string | null;
  image: string;
  imageMobile: string | null;
  href: string | null;
  ctaLabel: string | null;
  seoHeading: string | null;
  isVisible: boolean;
  position: number;
};

export function SlideForm({ slide }: { slide?: Slide }) {
  const [state, action] = useActionState(saveSlideAction.bind(null, slide?.id ?? null), idle);
  const [deleting, startDelete] = useTransition();
  return (
    <form action={action} className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <ImageInput name="image" label="Imagen (computadora)" current={slide?.image} maxSize={1800} />
        <ImageInput name="imageMobile" label="Imagen (celular)" current={slide?.imageMobile} maxSize={1200} />
      </div>
      <FieldError state={state} name="image" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Text label="Título corto" name="title" defaultValue={slide?.title} placeholder="Tendencia juvenil" />
        <Text label="Titular grande (H1)" name="seoHeading" defaultValue={slide?.seoHeading ?? ""} placeholder="Moda joven en TWENTY" />
      </div>
      <Text label="Texto" name="description" defaultValue={slide?.description ?? ""} placeholder="Opcional" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_100px]">
        <Text label="Botón" name="ctaLabel" defaultValue={slide?.ctaLabel ?? ""} placeholder="Ver catálogo" />
        <Text label="Enlace" name="href" defaultValue={slide?.href ?? ""} placeholder="/catalogo?categoria=jacket" hint="Una página de la tienda, p. ej. /catalogo?promo=…" />
        <Text label="Orden" name="position" type="number" defaultValue={String(slide?.position ?? 0)} />
      </div>
      <FieldError state={state} name="href" />
      <Toggle name="isVisible" defaultChecked={slide?.isVisible ?? true} label="Visible en el inicio" hint="Se muestra el primero visible según el orden." />
      <FormAlert state={state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton>{slide ? "Guardar banner" : "Crear banner"}</SubmitButton>
        {slide ? (
          <button
            type="button"
            disabled={deleting}
            onClick={() => {
              if (window.confirm("¿Eliminar este banner?")) startDelete(() => deleteSlideAction(slide.id));
            }}
            className={buttonClass("danger")}
          >
            <Trash2 className="size-4" aria-hidden /> Eliminar
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function CompanyForm({ company }: { company: SiteSettings["company"] }) {
  return (
    <SettingForm settingKey="company">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Text label="Razón social" name="legalName" defaultValue={company.legalName} placeholder="Multiventa Peruano S.A.C." />
        <Text label="RUC" name="ruc" defaultValue={company.ruc} />
      </div>
      <Text label="Domicilio" name="address" defaultValue={company.address} hint="Sale en el Libro de Reclamaciones y en las páginas legales." />
      <Text
        label="Email para avisos"
        name="notificationEmail"
        type="email"
        defaultValue={company.notificationEmail}
        hint="Aquí llegan los avisos de pedidos nuevos y anulados, los reclamos y los mensajes de contacto. Los admins del panel también reciben los de pedidos."
      />
    </SettingForm>
  );
}

export function AboutForm({ about }: { about: SiteSettings["about"] }) {
  return (
    <SettingForm settingKey="about">
      <Text label="Título" name="title" defaultValue={about.title} />
      <ImageInput name="image" label="Foto principal" current={about.image} maxSize={1600} aspect="aspect-video" />
      <RichTextEditor name="body" label="Historia" defaultValue={about.body} rows={12} />
      <Text label="Frase destacada" name="quote" defaultValue={about.quote} hint="Se muestra grande al final de la historia. Usa **así** para resaltar." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Lines label="Misión" name="mission" defaultValue={about.mission} rows={4} />
        <Lines label="Visión" name="vision" defaultValue={about.vision} rows={4} />
      </div>
      <Text label="Título de las fortalezas" name="strengthsTitle" defaultValue={about.strengthsTitle} />
      <Lines
        label="Fortalezas"
        name="strengths"
        defaultValue={about.strengths.map((s) => `${s.title} | ${s.description}`).join("\n")}
        rows={5}
        hint="Una por línea: Título | Descripción. Los íconos se conservan si no cambias el título."
      />
    </SettingForm>
  );
}

export function FaqForm({ faqs }: { faqs: SiteSettings["faqs"] }) {
  const [items, setItems] = useState(() => faqs.map((f, i) => ({ ...f, key: i })));
  const [nextKey, setNextKey] = useState(faqs.length);
  // Controlados: al guardar, React limpia los campos no controlados y volverían al texto anterior.
  const update = (key: number, patch: Partial<{ question: string; answer: string }>) =>
    setItems((list) => list.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  const move = (i: number, dir: -1 | 1) =>
    setItems((list) => {
      const next = [...list];
      const j = i + dir;
      if (j < 0 || j >= next.length) return list;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  return (
    <SettingForm settingKey="faqs">
      <ol className="space-y-3">
        {items.map((faq, i) => (
          <li key={faq.key} className="space-y-3 rounded-xl border border-line p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted">Pregunta {i + 1}</span>
              <div className="flex shrink-0">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="grid size-10 place-items-center rounded-full text-muted hover:bg-raised hover:text-white disabled:opacity-30" aria-label="Subir">
                  <ArrowUp className="size-4" aria-hidden />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="grid size-10 place-items-center rounded-full text-muted hover:bg-raised hover:text-white disabled:opacity-30" aria-label="Bajar">
                  <ArrowDown className="size-4" aria-hidden />
                </button>
                <button type="button" onClick={() => setItems((list) => list.filter((f) => f.key !== faq.key))} className="grid size-10 place-items-center rounded-full text-muted hover:bg-raised hover:text-danger" aria-label="Quitar pregunta">
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            </div>
            <input
              name="question"
              value={faq.question}
              onChange={(e) => update(faq.key, { question: e.target.value })}
              placeholder="¿Cuánto cuesta el envío?"
              aria-label={`Pregunta ${i + 1}`}
              className={inputClass}
            />
            <textarea
              name="answer"
              value={faq.answer}
              onChange={(e) => update(faq.key, { answer: e.target.value })}
              rows={4}
              placeholder="Respuesta. Usa - al inicio de la línea para hacer una lista."
              aria-label={`Respuesta ${i + 1}`}
              className={cn(inputClass, "h-auto py-3")}
            />
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={() => {
          setItems((list) => [...list, { question: "", answer: "", key: nextKey }]);
          setNextKey((k) => k + 1);
        }}
        className={buttonClass("secondary")}
      >
        <Plus className="size-4" aria-hidden /> Agregar pregunta
      </button>
      <p className="text-xs text-muted">Se muestran en Contacto y Google las puede mostrar en sus resultados.</p>
    </SettingForm>
  );
}

export function LegalForm({ page, title, href, body }: { page: LegalKey; title: string; href: string; body: string }) {
  return (
    <SettingForm settingKey="legal" submitLabel={`Guardar ${title.toLowerCase()}`}>
      <input type="hidden" name="page" value={page} />
      <RichTextEditor name="body" label={title} defaultValue={body} rows={14} hint={`Se publica en twentymoda.com${href} con la fecha de hoy como última actualización.`} />
    </SettingForm>
  );
}
