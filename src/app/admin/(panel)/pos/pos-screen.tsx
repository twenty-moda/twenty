"use client";

import { Check, Minus, Plus, Printer, ScanBarcode, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { Combobox } from "@/components/admin/combobox";
import { FormAlert } from "@/components/admin/form-controls";
import { PrintSheet, usePrintSheet } from "@/components/admin/print-sheet";
import { PosTicket, TICKET_PAGE, type TicketCompany } from "@/components/admin/pos-ticket";
import { buttonClass } from "@/components/admin/ui";
import { ColorSwatch } from "@/components/ui/color-swatch";
import { Field, fieldClass, inputCompactClass, selectClass, SelectWrap } from "@/components/ui/form";
import { failure, idle, type ActionState } from "@/lib/action-state";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/money";
import { DOCUMENT_LABEL } from "@/lib/order-status";
import { checkCustomer, formatDocNumber, PAYMENT_LABEL, PAYMENT_METHODS, POS_DOCUMENT_LABEL, saleTotal, settlePayments, type PaymentMethod, type PosDocumentType } from "@/lib/pos";
import { priceLines } from "@/lib/pricing";
import type { PosSaleDetail, PosVariant } from "@/server/services/pos";
import { SunatStatus } from "../ventas-tienda/sunat-status";
import { findCustomerAction, lookupRucAction, registerSaleAction } from "./actions";

type Line = { variantId: string; quantity: number };
type PaymentDraft = { method: PaymentMethod; amount: string; received: string; reference: string };
type DocType = keyof typeof DOCUMENT_LABEL;

const variantLabel = (v: PosVariant) => `${v.productName} · ${v.colorName} · ${v.sizeLabel} · ${v.sku}`;
const productLabel = (name: string) => `${name} — elegir color y talla`;
/** "70", "69.90", "S/ 70" → céntimos; vacío o inválido → null. */
const cents = (value: string) => {
  const n = Number(value.replace(/s\/\.?/i, "").replace(/\s/g, "").replace(",", "."));
  return value.trim() && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};
const soles = (c: number) => String(c / 100);
const roundUp = (c: number, step: number) => Math.ceil(c / step) * step;
const DOC_KEY = "twenty-pos-documento";
const subscribeStorage = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};
const readSavedDocType = (): PosDocumentType | null => {
  try {
    const saved = localStorage.getItem(DOC_KEY);
    return saved === "nota_venta" || saved === "boleta" || saved === "factura" ? saved : null;
  } catch {
    return null;
  }
};

const DOC_OPTIONS: { value: PosDocumentType; label: string; hint: string }[] = [
  { value: "boleta", label: "Boleta", hint: "DNI opcional" },
  { value: "factura", label: "Factura", hint: "Con RUC" },
  { value: "nota_venta", label: "Nota de venta", hint: "Sin SUNAT" },
];

/** Botón de una opción elegida o no (comprobante, medio de pago, monto recibido). */
const choiceClass = (selected: boolean) =>
  cn("rounded-xl border font-semibold transition", selected ? "border-white bg-white text-black" : "border-line text-white hover:border-white/60");

function Kbd({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return <kbd className={cn("rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-semibold", dark ? "border-black/30 text-black" : "border-white/25 text-muted")}>{children}</kbd>;
}

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <h2 className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm font-bold">
        <span className="grid size-6 place-items-center rounded-full bg-white text-xs text-black">{n}</span>
        {title}
        {hint ? <span className="font-normal text-subtle">{hint}</span> : null}
      </h2>
      {children}
    </section>
  );
}

type PosScreenProps = {
  warehouse: { id: string; name: string };
  variants: PosVariant[];
  company: TicketCompany;
  fontClass: string;
};

/**
 * Modo caja: escanear, elegir el comprobante, el cliente y cobrar sin salir de la pantalla. Atajos: F2 enfoca el
 * buscador, F8 cobra y, con la venta lista, Enter empieza la siguiente.
 */
export function PosScreen({ warehouse, variants, company, fontClass }: PosScreenProps) {
  const [lines, setLines] = useState<Line[]>([]);
  const [query, setQuery] = useState("");
  const [chooser, setChooser] = useState<string | null>(null);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  // Cada caja recuerda el último documento que usó (preferencia del equipo; sin localStorage, boleta).
  const savedDocType = useSyncExternalStore(subscribeStorage, readSavedDocType, () => null);
  const [pickedDocType, setPickedDocType] = useState<PosDocumentType | null>(null);
  const docType = pickedDocType ?? savedDocType ?? "boleta";
  const [customer, setCustomer] = useState<{ documentType: DocType; documentNumber: string; name: string; address: string }>({ documentType: "dni", documentNumber: "", name: "", address: "" });
  const [discount, setDiscount] = useState("");
  const [shipping, setShipping] = useState("");
  const [extras, setExtras] = useState({ discount: false, shipping: false });
  const [method, setMethod] = useState<PaymentMethod>("efectivo");
  const [received, setReceived] = useState("");
  const [reference, setReference] = useState("");
  const [mixed, setMixed] = useState<PaymentDraft[] | null>(null);
  const [state, setState] = useState<ActionState>(idle);
  const [done, setDone] = useState<PosSaleDetail | null>(null);
  const [pending, startTransition] = useTransition();
  const { printing, print } = usePrintSheet();
  const searchRef = useRef<HTMLDivElement>(null);

  const chooseDocType = (next: PosDocumentType) => {
    setPickedDocType(next);
    try {
      localStorage.setItem(DOC_KEY, next);
    } catch {
      // Sin localStorage (modo privado): solo no se recuerda.
    }
  };

  // Se arman una vez: con el lector cada lectura es una ráfaga de teclas.
  const { byId, byLabel, bySku, products, options } = useMemo(() => {
    const groups = new Map<string, PosVariant[]>();
    for (const v of variants) groups.set(v.productId, [...(groups.get(v.productId) ?? []), v]);
    const productOptions = [...groups.values()].map((vs) => ({ value: productLabel(vs[0].productName) }));
    return {
      byId: new Map(variants.map((v) => [v.variantId, v])),
      byLabel: new Map<string, PosVariant | PosVariant[]>([
        ...[...groups.values()].map((vs) => [productLabel(vs[0].productName), vs] as const),
        ...variants.map((v) => [variantLabel(v), v] as const),
      ]),
      bySku: new Map(variants.map((v) => [v.sku.toUpperCase(), v])),
      products: groups,
      options: [...productOptions, ...variants.map((v) => ({ value: variantLabel(v) }))],
    };
  }, [variants]);

  const pricing = priceLines(lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPriceCents: byId.get(l.variantId)!.priceCents, promotion: byId.get(l.variantId)!.promotion })));
  const manualDiscountCents = cents(discount) ?? 0;
  const shippingCents = cents(shipping) ?? 0;
  const total = saleTotal({ itemsTotalCents: pricing.totalCents, manualDiscountCents, shippingCents });
  const totalCents = total.ok ? total.totalCents : pricing.totalCents;
  const units = lines.reduce((s, l) => s + l.quantity, 0);
  const inCart = (variantId: string) => lines.find((l) => l.variantId === variantId)?.quantity ?? 0;
  // La factura siempre va a un RUC; boleta y nota de venta, al documento elegido.
  const saleCustomer =
    customer.documentNumber.trim() || customer.name.trim()
      ? {
          documentType: docType === "factura" ? ("ruc" as const) : customer.documentType,
          documentNumber: customer.documentNumber.trim() || null,
          name: customer.name.trim() || null,
          address: docType === "factura" ? customer.address.trim() || null : null,
        }
      : null;
  const customerProblem = lines.length ? checkCustomer(docType, totalCents, saleCustomer) : null;

  // Un solo medio de pago (lo común) o varios ("Mixto").
  const receivedCents = cents(received) ?? totalCents;
  const paymentInputs = mixed
    ? mixed.map((p) => ({ method: p.method, amountCents: cents(p.amount) ?? 0, receivedCents: p.method === "efectivo" ? cents(p.received) : null, reference: p.reference.trim() || null }))
    : [{ method, amountCents: totalCents, receivedCents: method === "efectivo" ? receivedCents : null, reference: method === "efectivo" ? null : reference.trim() || null }];
  const paidCents = paymentInputs.reduce((s, p) => s + p.amountCents, 0);
  const settled = settlePayments(totalCents, paymentInputs);
  const cashShort = !mixed && method === "efectivo" ? Math.max(0, totalCents - receivedCents) : 0;
  const canCharge = lines.length > 0 && total.ok && !customerProblem && settled.ok && !pending;
  const cashOptions = [...new Set([totalCents, roundUp(totalCents, 1000), roundUp(totalCents, 5000), roundUp(totalCents, 10000), roundUp(totalCents, 10000) + 10000])].slice(0, 4);

  const add = (v: PosVariant) => {
    if (inCart(v.variantId) + 1 > v.stock) {
      setScanError(v.stock ? `Solo hay ${v.stock} de ${v.sku} en ${warehouse.name}.` : `${v.sku} no tiene stock en ${warehouse.name}.`);
      return;
    }
    setScanError(null);
    setReceived("");
    setLastAdded(v.variantId);
    setLines((ls) => (ls.some((l) => l.variantId === v.variantId) ? ls.map((l) => (l.variantId === v.variantId ? { ...l, quantity: l.quantity + 1 } : l)) : [...ls, { variantId: v.variantId, quantity: 1 }]));
  };
  // Lector: SKU + Enter suma una. Un producto abre la grilla de colores y tallas (las etiquetas de Insaga no traen la talla).
  const pick = (value: string) => {
    setQuery("");
    const found = byLabel.get(value) ?? bySku.get(value.trim().toUpperCase());
    if (!found) return setScanError(`No hay una prenda con el código “${value.trim()}”.`);
    if (Array.isArray(found)) return setChooser(found[0].productId);
    setChooser(null);
    add(found);
  };
  const setQuantity = (variantId: string, quantity: number) => {
    const v = byId.get(variantId)!;
    if (quantity > v.stock) return setScanError(`Solo hay ${v.stock} de ${v.sku} en ${warehouse.name}.`);
    setScanError(null);
    setReceived("");
    setLines((ls) => (quantity <= 0 ? ls.filter((l) => l.variantId !== variantId) : ls.map((l) => (l.variantId === variantId ? { ...l, quantity } : l))));
  };

  const lookup = (documentNumber: string) =>
    startTransition(async () => {
      if (docType === "factura") {
        const found = await lookupRucAction(documentNumber.trim());
        if (found) setCustomer((c) => ({ ...c, name: found.name, address: found.address ?? c.address }));
        else setState(failure("No encontramos ese RUC: escribe la razón social."));
        return;
      }
      const found = await findCustomerAction(documentNumber);
      if (found?.name) setCustomer((c) => ({ ...c, documentType: found.documentType ?? c.documentType, name: found.name ?? c.name }));
    });
  // Con el documento completo (8 dígitos el DNI, 11 el RUC) se busca el nombre solo.
  const typeDocument = (value: string) => {
    const digits = value.trim();
    const documentType = docType !== "factura" && /^\d{11}$/.test(digits) && customer.documentType === "dni" ? "ruc" : customer.documentType;
    setCustomer((c) => ({ ...c, documentNumber: value, documentType }));
    const complete = docType === "factura" || documentType === "ruc" ? /^\d{11}$/.test(digits) : documentType === "dni" && /^\d{8}$/.test(digits);
    if (complete && digits !== customer.documentNumber.trim()) lookup(digits);
  };

  const charge = () => {
    if (!canCharge) return;
    startTransition(async () => {
      const result = await registerSaleAction({
        warehouseId: warehouse.id,
        documentType: docType,
        customer: saleCustomer,
        lines,
        manualDiscountCents,
        shippingCents,
        payments: paymentInputs,
        note: null,
      });
      if (!result.ok) return setState(failure(result.message));
      setDone(result.sale);
      setState(idle);
    });
  };

  const reset = () => {
    setDone(null);
    setLines([]);
    setCustomer({ documentType: "dni", documentNumber: "", name: "", address: "" });
    setDiscount("");
    setShipping("");
    setExtras({ discount: false, shipping: false });
    setMethod("efectivo");
    setReceived("");
    setReference("");
    setMixed(null);
    setChooser(null);
    setLastAdded(null);
  };

  const focusSearch = () => searchRef.current?.querySelector("input")?.focus();
  const onShortcut = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === "F2") {
      e.preventDefault();
      focusSearch();
    } else if (e.key === "F8") {
      e.preventDefault();
      charge();
    } else if (e.key === "Enter" && done && !(e.target instanceof Element && e.target.closest("a, button, input, select, textarea"))) {
      e.preventDefault();
      reset();
    }
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onShortcut(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  // Al empezar una venta, el lector ya escribe en el buscador.
  useEffect(() => {
    if (!done) focusSearch();
  }, [done]);

  if (done) {
    // Boleta o factura: el comprobante que vale es el de SUNAT (PDF de la API, con QR y hash). La nota de venta usa el
    // ticket de TWENTY.
    const electronic = done.documentType !== "nota_venta";
    return (
      <div className={cn("mx-auto grid max-w-5xl grid-cols-1 gap-8 py-6 lg:grid-cols-[minmax(0,1fr)_auto]", fontClass)}>
        <div className="space-y-5">
          <span className="grid size-16 place-items-center rounded-full bg-success text-black">
            <Check className="size-8" strokeWidth={2.6} aria-hidden />
          </span>
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight">Venta lista</h2>
            <p className="mt-1 text-muted">
              {POS_DOCUMENT_LABEL[done.documentType]} {formatDocNumber(done.series, done.number)} · {formatPrice(done.totalCents)}
            </p>
          </div>
          {done.changeCents ? (
            <div className="w-fit rounded-2xl border border-line bg-surface px-6 py-4">
              <p className="text-sm text-muted">Entrega de vuelto</p>
              <p className="font-display text-7xl leading-none font-extrabold tabular-nums">{formatPrice(done.changeCents)}</p>
            </div>
          ) : null}
          {electronic ? <SunatStatus sale={done} onUpdate={setDone} /> : null}
          <div className="flex flex-wrap gap-3">
            {electronic ? null : (
              <button type="button" onClick={print} disabled={printing} className={cn(buttonClass("primary"), "h-14 px-7 text-base")}>
                <Printer className="size-5" aria-hidden /> Imprimir ticket
              </button>
            )}
            <button type="button" onClick={reset} className={cn(buttonClass("secondary"), "h-14 px-7 text-base")}>
              Nueva venta <Kbd>Enter</Kbd>
            </button>
            <Link href={`/admin/ventas-tienda/${done.id}`} className={cn(buttonClass("ghost"), "h-14")}>
              Ver la venta
            </Link>
          </div>
        </div>
        {electronic ? null : (
          <div className="w-fit rounded-lg bg-white py-2 shadow-lg">
            <PosTicket sale={done} company={company} />
          </div>
        )}
        {printing ? (
          <PrintSheet page={TICKET_PAGE} className={fontClass}>
            <PosTicket sale={done} company={company} />
          </PrintSheet>
        ) : null}
      </div>
    );
  }

  const chosen = chooser ? products.get(chooser) : null;
  const colorsOf = chosen ? [...new Set(chosen.map((v) => v.colorName))] : [];
  const last = lastAdded && inCart(lastAdded) ? byId.get(lastAdded) : null;
  const lastLeft = last ? last.stock - inCart(last.variantId) : 0;

  return (
    <div className={cn("grid grid-cols-1 gap-6 pb-10 lg:grid-cols-[minmax(0,1fr)_25rem]", fontClass)}>
      <div className="min-w-0 space-y-4">
        <div ref={searchRef}>
          <div className="relative">
            <ScanBarcode className="pointer-events-none absolute top-1/2 left-5 z-10 size-6 -translate-y-1/2 text-muted" aria-hidden />
            <Combobox
              options={options}
              value={query}
              onChange={setQuery}
              onPick={pick}
              maxResults={40}
              label="Escanear o buscar prenda"
              placeholder="Escanea la etiqueta o escribe nombre, color o código"
              className={cn(fieldClass, "h-16 w-full border-2 border-white bg-surface pr-16 pl-14 text-lg")}
            />
            <span className="pointer-events-none absolute top-1/2 right-12 hidden -translate-y-1/2 sm:block">
              <Kbd>F2</Kbd>
            </span>
          </div>
          {scanError ? (
            <p role="alert" className="mt-2 text-sm font-semibold text-danger">
              {scanError}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted">Cada lectura suma una prenda. Si eliges un producto, eliges el color y la talla.</p>
          )}
        </div>

        {last ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-info/50 bg-info/15 px-4 py-3" aria-live="polite">
            <Check className="size-5 shrink-0" aria-hidden />
            <span className="font-semibold">
              +1 {last.productName} · {last.colorName} · T{last.sizeLabel}
            </span>
            <span className={cn("text-sm", lastLeft <= 2 ? "text-warning" : "text-muted")}>
              {lastLeft === 0 ? "Era la última en la tienda" : `Quedan ${lastLeft} en la tienda`}
            </span>
          </div>
        ) : null}

        {chosen ? (
          <section aria-label={`Tallas de ${chosen[0].productName}`} className="rounded-2xl border border-line bg-surface p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">{chosen[0].productName}</h2>
              <button type="button" aria-label="Cerrar" onClick={() => setChooser(null)} className={buttonClass("ghost", "sm")}>
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="space-y-3">
              {colorsOf.map((color) => (
                <div key={color}>
                  <p className="mb-1.5 text-xs text-muted uppercase">{color}</p>
                  <div className="flex flex-wrap gap-2">
                    {chosen
                      .filter((v) => v.colorName === color)
                      .map((v) => (
                        <button
                          key={v.variantId}
                          type="button"
                          disabled={v.stock === 0}
                          onClick={() => add(v)}
                          className="flex min-h-16 min-w-16 flex-col items-center justify-center rounded-xl border border-line bg-raised px-3 hover:border-white disabled:opacity-35"
                        >
                          <span className="font-display text-2xl leading-none font-extrabold">{v.sizeLabel}</span>
                          <span className="mt-1 text-[11px] text-muted">{v.stock ? `${v.stock} en tienda` : "Agotada"}</span>
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {lines.length ? (
          <ul className="space-y-2.5">
            {lines.map((l) => {
              const v = byId.get(l.variantId)!;
              const priced = pricing.lines.find((p) => p.variantId === l.variantId)!;
              const left = v.stock - l.quantity;
              return (
                <li key={l.variantId} className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-line bg-surface p-3 sm:px-4">
                  <span className={cn("grid size-16 shrink-0 place-items-center rounded-xl bg-white font-display leading-none font-extrabold text-black", v.sizeLabel.length > 3 ? "text-lg" : "text-3xl")}>{v.sizeLabel}</span>
                  <span className="min-w-[12rem] flex-1">
                    <span className="block text-base font-bold">{v.productName}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
                      {v.colorHex ? <ColorSwatch hex={v.colorHex} className="size-3" /> : null}
                      {v.colorName} · Talla {v.sizeLabel}
                      <span className="font-mono text-xs text-subtle">{v.sku}</span>
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-2">
                      {priced.discountCents ? <span className="rounded-full bg-offer px-2 py-0.5 font-mono text-[11px] font-semibold text-black uppercase">{v.promotion?.name}</span> : null}
                      {left <= 2 ? <span className="text-xs text-warning">{left === 0 ? "Era la última en la tienda" : `Quedan ${left} en la tienda`}</span> : null}
                    </span>
                  </span>
                  <div className="flex h-12 items-center rounded-xl border border-line bg-raised">
                    <button type="button" aria-label={`Una menos de ${v.sku}`} onClick={() => setQuantity(l.variantId, l.quantity - 1)} className="grid h-full w-12 place-items-center">
                      <Minus className="size-4" aria-hidden />
                    </button>
                    <span className="w-8 text-center text-lg font-bold tabular-nums">{l.quantity}</span>
                    <button type="button" aria-label={`Una más de ${v.sku}`} onClick={() => setQuantity(l.variantId, l.quantity + 1)} className="grid h-full w-12 place-items-center">
                      <Plus className="size-4" aria-hidden />
                    </button>
                  </div>
                  <span className="w-24 text-right tabular-nums">
                    {priced.discountCents ? <span className="block text-xs text-muted line-through">{formatPrice(priced.subtotalCents)}</span> : null}
                    <span className="block text-lg font-bold">{formatPrice(priced.totalCents)}</span>
                    {l.quantity > 1 && !priced.discountCents ? <span className="block text-xs text-subtle">{formatPrice(v.priceCents)} c/u</span> : null}
                  </span>
                  <button type="button" aria-label={`Quitar ${v.sku}`} onClick={() => setQuantity(l.variantId, 0)} className={cn(buttonClass("ghost", "sm"), "size-11 px-0 hover:text-danger")}>
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-16 text-center text-muted">
            <ScanBarcode className="size-10" aria-hidden />
            Escanea una prenda para empezar la venta
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
          <span>
            {units} {units === 1 ? "prenda" : "prendas"}
          </span>
          <span className="flex-1" />
          <span className="hidden flex-wrap gap-4 text-xs sm:flex">
            <span>
              <Kbd>F2</Kbd> buscar
            </span>
            <span>
              <Kbd>F8</Kbd> cobrar
            </span>
          </span>
        </div>
      </div>

      <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start" aria-label="Cobro">
        <Step n={1} title="Comprobante">
          <div className="grid grid-cols-3 gap-2">
            {DOC_OPTIONS.map((o) => (
              <button key={o.value} type="button" aria-pressed={docType === o.value} onClick={() => chooseDocType(o.value)} className={cn(choiceClass(docType === o.value), "flex flex-col items-start px-3 py-2.5 text-left")}>
                <span className="text-sm">{o.label}</span>
                <span className={cn("text-xs font-normal", docType === o.value ? "text-black/60" : "text-subtle")}>{o.hint}</span>
              </button>
            ))}
          </div>
        </Step>

        <Step n={2} title="Cliente" hint={docType === "factura" ? "obligatorio" : docType === "boleta" ? "opcional hasta S/ 700" : "opcional"}>
          <div className="flex gap-2">
            {docType === "factura" ? null : (
              <SelectWrap>
                <select
                  aria-label="Tipo de documento"
                  value={customer.documentType}
                  onChange={(e) => setCustomer((c) => ({ ...c, documentType: e.target.value as DocType }))}
                  className={cn(selectClass, "h-11 w-28 text-sm")}
                >
                  {Object.entries(DOCUMENT_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </SelectWrap>
            )}
            <input
              inputMode="numeric"
              aria-label={docType === "factura" ? "RUC" : "Número de documento"}
              value={customer.documentNumber}
              onChange={(e) => typeDocument(e.target.value)}
              placeholder={docType === "factura" ? "RUC (11 dígitos)" : "DNI o RUC"}
              className={cn(inputCompactClass, "min-w-0 flex-1")}
            />
            <button type="button" aria-label="Buscar el nombre" disabled={pending || customer.documentNumber.trim().length < 8} onClick={() => lookup(customer.documentNumber)} className={cn(buttonClass("secondary", "sm"), "h-11 w-11 px-0")}>
              <Search className="size-4" aria-hidden />
            </button>
          </div>
          <input
            aria-label={docType === "factura" ? "Razón social" : "Nombre del cliente"}
            value={customer.name}
            onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
            placeholder={docType === "factura" ? "Razón social" : "Nombre"}
            className={inputCompactClass}
          />
          {docType === "factura" ? (
            <input aria-label="Dirección fiscal" value={customer.address} onChange={(e) => setCustomer((c) => ({ ...c, address: e.target.value }))} placeholder="Dirección fiscal" className={inputCompactClass} />
          ) : null}
          <p className="text-xs text-subtle">{docType === "factura" ? "Con el RUC completo aparecen la razón social y la dirección." : "Si ya compró antes, con su documento aparece su nombre."}</p>
        </Step>

        <Step n={3} title="Cobro">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">
                {units} {units === 1 ? "prenda" : "prendas"}
              </dt>
              <dd className="tabular-nums">{formatPrice(pricing.subtotalCents)}</dd>
            </div>
            {pricing.discountCents ? (
              <div className="flex justify-between">
                <dt className="text-muted">Promociones</dt>
                <dd className="text-success tabular-nums">−{formatPrice(pricing.discountCents)}</dd>
              </div>
            ) : null}
          </dl>
          {extras.discount || extras.shipping ? (
            <div className="flex gap-2 text-sm">
              {extras.discount ? (
                <label className="flex flex-1 items-center gap-2">
                  <span className="text-muted">Descuento S/</span>
                  <input inputMode="decimal" autoFocus value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" className={cn(inputCompactClass, "min-w-0 flex-1 tabular-nums")} />
                </label>
              ) : null}
              {extras.shipping ? (
                <label className="flex flex-1 items-center gap-2">
                  <span className="text-muted">Envío S/</span>
                  <input inputMode="decimal" autoFocus value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="0" className={cn(inputCompactClass, "min-w-0 flex-1 tabular-nums")} />
                </label>
              ) : null}
            </div>
          ) : null}
          <div className="flex gap-4 text-sm">
            {extras.discount ? null : (
              <button type="button" onClick={() => setExtras((x) => ({ ...x, discount: true }))} className="underline underline-offset-4 hover:text-muted">
                + Descuento
              </button>
            )}
            {extras.shipping ? null : (
              <button type="button" onClick={() => setExtras((x) => ({ ...x, shipping: true }))} className="underline underline-offset-4 hover:text-muted">
                + Envío
              </button>
            )}
          </div>
          <div className="flex items-baseline justify-between border-t border-line pt-3">
            <span className="font-bold">Total</span>
            <span className="font-display text-5xl leading-none font-extrabold tabular-nums">{formatPrice(totalCents)}</span>
          </div>
          {!total.ok ? <p className="text-sm text-danger">{total.message}</p> : null}
          {customerProblem ? <p className="text-sm text-warning">{customerProblem}</p> : null}

          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Medio de pago">
            {PAYMENT_METHODS.map((m) => {
              const selected = !mixed && method === m;
              return (
                <button key={m} type="button" role="radio" aria-checked={selected} onClick={() => {
                    setMixed(null);
                    setMethod(m);
                  }} className={cn(choiceClass(selected), "h-11 text-sm")}>
                  {PAYMENT_LABEL[m]}
                </button>
              );
            })}
            <button
              type="button"
              role="radio"
              aria-checked={!!mixed}
              onClick={() => setMixed((p) => p ?? [{ method, amount: soles(totalCents), received: "", reference: "" }])}
              className={cn(choiceClass(!!mixed), "h-11 text-sm")}
            >
              Mixto
            </button>
          </div>

          {!mixed && method === "efectivo" && lines.length ? (
            <div className="space-y-2">
              <p className="text-sm text-muted">¿Con cuánto paga?</p>
              <div className="grid grid-cols-4 gap-2">
                {cashOptions.map((c) => (
                  <button key={c} type="button" aria-pressed={receivedCents === c} onClick={() => setReceived(c === totalCents ? "" : soles(c))} className={cn(choiceClass(receivedCents === c), "h-11 text-sm tabular-nums")}>
                    {c === totalCents ? "Exacto" : formatPrice(c)}
                  </button>
                ))}
              </div>
              <input inputMode="decimal" aria-label="Otro monto recibido" value={received} onChange={(e) => setReceived(e.target.value)} placeholder="Otro monto" className={cn(inputCompactClass, "tabular-nums")} />
              <div className="flex items-baseline justify-between rounded-xl bg-raised px-4 py-3">
                <span className="font-semibold">{cashShort ? "Falta" : "Vuelto"}</span>
                <span className={cn("font-display text-4xl leading-none font-extrabold tabular-nums", cashShort ? "text-warning" : "")}>{formatPrice(cashShort || (settled.ok ? settled.changeCents : 0))}</span>
              </div>
            </div>
          ) : null}
          {!mixed && method !== "efectivo" ? (
            <Field label="N° de operación" optional>
              {(a11y) => <input {...a11y} value={reference} onChange={(e) => setReference(e.target.value)} className={inputCompactClass} />}
            </Field>
          ) : null}
          {mixed ? (
            <div className="space-y-3">
              {mixed.map((p, i) => {
                const update = (patch: Partial<PaymentDraft>) => setMixed((ps) => ps!.map((x, k) => (k === i ? { ...x, ...patch } : x)));
                return (
                  <div key={i} className="space-y-2 rounded-xl border border-line p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {PAYMENT_METHODS.map((m) => (
                        <button key={m} type="button" aria-pressed={p.method === m} onClick={() => update({ method: m })} className={cn(choiceClass(p.method === m), "h-9 rounded-full px-3 text-xs")}>
                          {PAYMENT_LABEL[m]}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Field label="Monto S/" className="flex-1">
                        {(a11y) => <input {...a11y} inputMode="decimal" value={p.amount} onChange={(e) => update({ amount: e.target.value })} className={cn(inputCompactClass, "tabular-nums")} />}
                      </Field>
                      {p.method === "efectivo" ? (
                        <Field label="Recibido S/" className="flex-1">
                          {(a11y) => <input {...a11y} inputMode="decimal" value={p.received} placeholder={p.amount} onChange={(e) => update({ received: e.target.value })} className={cn(inputCompactClass, "tabular-nums")} />}
                        </Field>
                      ) : (
                        <Field label="N° de operación" optional className="flex-1">
                          {(a11y) => <input {...a11y} value={p.reference} onChange={(e) => update({ reference: e.target.value })} className={inputCompactClass} />}
                        </Field>
                      )}
                    </div>
                    {mixed.length > 1 ? (
                      <button type="button" onClick={() => setMixed((ps) => ps!.filter((_, k) => k !== i))} className="text-xs text-muted underline hover:text-danger">
                        Quitar este pago
                      </button>
                    ) : null}
                  </div>
                );
              })}
              {paidCents < totalCents ? (
                <button type="button" onClick={() => setMixed((ps) => [...ps!, { method: "yape", amount: soles(totalCents - paidCents), received: "", reference: "" }])} className={cn(buttonClass("secondary", "sm"), "w-full")}>
                  <Plus className="size-4" aria-hidden /> Otro medio ({formatPrice(totalCents - paidCents)})
                </button>
              ) : null}
              {settled.ok && settled.changeCents ? <p className="text-lg font-bold">Vuelto: {formatPrice(settled.changeCents)}</p> : null}
              {!settled.ok && paidCents >= totalCents ? <p className="text-sm text-danger">{settled.message}</p> : null}
            </div>
          ) : null}

          <FormAlert state={state} />
          <button type="button" onClick={charge} disabled={!canCharge} className={cn(buttonClass("primary"), "h-16 w-full text-lg font-extrabold")}>
            {pending ? "Cobrando…" : !lines.length ? "Cobrar" : cashShort ? `Falta ${formatPrice(cashShort)}` : mixed && paidCents < totalCents ? `Falta ${formatPrice(totalCents - paidCents)}` : `Cobrar ${formatPrice(totalCents)}`}
            {lines.length && !pending ? <Kbd dark>F8</Kbd> : null}
          </button>
        </Step>
      </aside>
    </div>
  );
}
