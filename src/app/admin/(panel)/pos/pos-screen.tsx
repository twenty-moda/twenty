"use client";

import { Minus, Plus, Printer, ScanBarcode, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Combobox } from "@/components/admin/combobox";
import { FormAlert } from "@/components/admin/form-controls";
import { PrintSheet, usePrintSheet } from "@/components/admin/print-sheet";
import { PosTicket, TICKET_PAGE, type TicketCompany } from "@/components/admin/pos-ticket";
import { Badge, buttonClass } from "@/components/admin/ui";
import { Field, inputCompactClass, selectClass, SelectWrap } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { failure, idle, type ActionState } from "@/lib/action-state";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/money";
import { DOCUMENT_LABEL } from "@/lib/order-status";
import { formatDocNumber, PAYMENT_LABEL, PAYMENT_METHODS, saleTotal, settlePayments, type PaymentMethod } from "@/lib/pos";
import { priceLines } from "@/lib/pricing";
import type { PosSaleDetail, PosVariant } from "@/server/services/pos";
import { findCustomerAction, registerSaleAction } from "./actions";

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
const QUICK_CASH = [2000, 5000, 10000, 20000];

type PosScreenProps = {
  warehouse: { id: string; name: string };
  session: { number: number };
  variants: PosVariant[];
  company: TicketCompany;
  fontClass: string;
};

export function PosScreen({ warehouse, session, variants, company, fontClass }: PosScreenProps) {
  const [lines, setLines] = useState<Line[]>([]);
  const [query, setQuery] = useState("");
  const [chooser, setChooser] = useState<string | null>(null);
  const [customer, setCustomer] = useState<{ documentType: DocType; documentNumber: string; name: string }>({ documentType: "dni", documentNumber: "", name: "" });
  const [discount, setDiscount] = useState("");
  const [shipping, setShipping] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [payments, setPayments] = useState<PaymentDraft[]>([]);
  const [state, setState] = useState<ActionState>(idle);
  const [done, setDone] = useState<PosSaleDetail | null>(null);
  const [pending, startTransition] = useTransition();
  const { printing, print } = usePrintSheet();

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

  const add = (v: PosVariant) => {
    const inCart = lines.find((l) => l.variantId === v.variantId)?.quantity ?? 0;
    if (inCart + 1 > v.stock) {
      setState(failure(v.stock ? `Solo hay ${v.stock} de ${v.sku} en ${warehouse.name}.` : `${v.sku} no tiene stock en ${warehouse.name}.`));
      return;
    }
    setState(idle);
    setLines((ls) => (inCart ? ls.map((l) => (l.variantId === v.variantId ? { ...l, quantity: l.quantity + 1 } : l)) : [...ls, { variantId: v.variantId, quantity: 1 }]));
  };
  // Lector: SKU + Enter suma una. Un producto abre la grilla de colores y tallas (las etiquetas de Insaga no traen la talla).
  const pick = (value: string) => {
    setQuery("");
    const found = byLabel.get(value) ?? bySku.get(value.trim().toUpperCase());
    if (!found) return setState(failure(`No hay una prenda con el código “${value.trim()}”.`));
    if (Array.isArray(found)) return setChooser(found[0].productId);
    setChooser(null);
    add(found);
  };
  const setQuantity = (variantId: string, quantity: number) => {
    const v = byId.get(variantId)!;
    if (quantity > v.stock) return setState(failure(`Solo hay ${v.stock} de ${v.sku} en ${warehouse.name}.`));
    setLines((ls) => (quantity <= 0 ? ls.filter((l) => l.variantId !== variantId) : ls.map((l) => (l.variantId === variantId ? { ...l, quantity } : l))));
  };

  const lookup = () =>
    startTransition(async () => {
      const found = await findCustomerAction(customer.documentNumber);
      if (found?.name) setCustomer((c) => ({ ...c, documentType: found.documentType ?? c.documentType, name: found.name ?? c.name }));
      else setState(failure("No encontramos ese documento en ventas anteriores: escribe el nombre."));
    });

  const openPayment = () => {
    if (!total.ok) return setState(failure(total.message));
    setState(idle);
    setPayments([{ method: "efectivo", amount: soles(totalCents), received: "", reference: "" }]);
    setPayOpen(true);
  };
  const paymentInputs = payments.map((p) => ({ method: p.method, amountCents: cents(p.amount) ?? 0, receivedCents: p.method === "efectivo" ? cents(p.received) : null, reference: p.reference.trim() || null }));
  const paidCents = paymentInputs.reduce((s, p) => s + p.amountCents, 0);
  const settled = settlePayments(totalCents, paymentInputs);
  const updatePayment = (i: number, patch: Partial<PaymentDraft>) => setPayments((ps) => ps.map((p, k) => (k === i ? { ...p, ...patch } : p)));

  const charge = () =>
    startTransition(async () => {
      const result = await registerSaleAction({
        warehouseId: warehouse.id,
        documentType: "nota_venta",
        customer: customer.documentNumber.trim() || customer.name.trim() ? { documentType: customer.documentType, documentNumber: customer.documentNumber.trim() || null, name: customer.name.trim() || null } : null,
        lines,
        manualDiscountCents,
        shippingCents,
        payments: paymentInputs,
        note: null,
      });
      if (!result.ok) return setState(failure(result.message));
      setPayOpen(false);
      setDone(result.sale);
      setState(idle);
    });

  const reset = () => {
    setDone(null);
    setLines([]);
    setCustomer({ documentType: "dni", documentNumber: "", name: "" });
    setDiscount("");
    setShipping("");
    setChooser(null);
  };

  if (done) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto]">
        <div className="space-y-4">
          <p className="text-sm text-muted">Venta registrada</p>
          <h2 className="text-3xl font-extrabold tracking-tight">
            {formatDocNumber(done.series, done.number)} · {formatPrice(done.totalCents)}
          </h2>
          {done.changeCents ? <p className="text-2xl font-bold text-warning">Vuelto: {formatPrice(done.changeCents)}</p> : null}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={print} disabled={printing} className={buttonClass("primary")} autoFocus>
              <Printer className="size-4" aria-hidden /> Imprimir ticket
            </button>
            <button type="button" onClick={reset} className={buttonClass("secondary")}>
              Nueva venta
            </button>
            <Link href={`/admin/ventas-tienda/${done.id}`} className={buttonClass("ghost")}>
              Ver la venta
            </Link>
          </div>
        </div>
        <div className={cn("w-fit rounded-lg bg-white py-2 shadow-lg", fontClass)}>
          <PosTicket sale={done} company={company} />
        </div>
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

  return (
    <div className="grid grid-cols-1 gap-6 pb-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-4">
        <div>
          <Combobox
            options={options}
            value={query}
            onChange={setQuery}
            onPick={pick}
            maxResults={40}
            label="Escanear o buscar prenda"
            placeholder="Escanea el código o busca por nombre, color o SKU"
          />
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
            <ScanBarcode className="size-3.5" aria-hidden /> Cada lectura suma una prenda. Si eliges un producto, eliges el color y la talla.
          </p>
        </div>

        {chosen ? (
          <section aria-label={`Tallas de ${chosen[0].productName}`} className="rounded-2xl border border-line p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-semibold">{chosen[0].productName}</h2>
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
                          className="flex min-h-11 min-w-14 flex-col items-center justify-center rounded-xl border border-line px-3 text-sm font-semibold hover:border-white disabled:opacity-35"
                        >
                          {v.sizeLabel}
                          <span className="text-[11px] font-normal text-muted">{v.stock} en tienda</span>
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {lines.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {lines.map((l) => {
              const v = byId.get(l.variantId)!;
              const priced = pricing.lines.find((p) => p.variantId === l.variantId)!;
              return (
                <li key={l.variantId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="min-w-[10rem] flex-1 text-sm">
                    <span className="font-semibold">{v.productName}</span> · {v.colorName} · Talla {v.sizeLabel}
                    <span className="block font-mono text-xs text-subtle">
                      {v.sku} · {formatPrice(v.priceCents)} c/u · {v.stock} en tienda
                    </span>
                    {priced.discountCents ? <Badge tone="warning">{v.promotion?.name}</Badge> : null}
                  </span>
                  <div className="flex h-10 items-center rounded-xl border border-line bg-raised">
                    <button type="button" aria-label={`Una menos de ${v.sku}`} onClick={() => setQuantity(l.variantId, l.quantity - 1)} className="grid h-full w-9 place-items-center">
                      <Minus className="size-4" aria-hidden />
                    </button>
                    <span className="w-8 text-center tabular-nums">{l.quantity}</span>
                    <button type="button" aria-label={`Una más de ${v.sku}`} onClick={() => setQuantity(l.variantId, l.quantity + 1)} className="grid h-full w-9 place-items-center">
                      <Plus className="size-4" aria-hidden />
                    </button>
                  </div>
                  <span className="w-24 text-right tabular-nums">
                    {priced.discountCents ? <span className="block text-xs text-muted line-through">{formatPrice(priced.subtotalCents)}</span> : null}
                    <span className="font-semibold">{formatPrice(priced.totalCents)}</span>
                  </span>
                  <button type="button" aria-label={`Quitar ${v.sku}`} onClick={() => setQuantity(l.variantId, 0)} className={cn(buttonClass("ghost", "sm"), "hover:text-danger")}>
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-sm text-muted">Escanea una prenda para empezar la venta.</div>
        )}
        {!payOpen ? <FormAlert state={state} /> : null}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <section className="space-y-3 rounded-2xl border border-line p-4">
          <h2 className="text-sm font-semibold">
            Cliente <span className="font-normal text-subtle">(opcional)</span>
          </h2>
          <div className="flex gap-2">
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
            <input
              inputMode="numeric"
              aria-label="Número de documento"
              value={customer.documentNumber}
              onChange={(e) => setCustomer((c) => ({ ...c, documentNumber: e.target.value }))}
              placeholder="Número"
              className={cn(inputCompactClass, "min-w-0 flex-1")}
            />
            <button type="button" aria-label="Buscar el nombre" disabled={pending || customer.documentNumber.trim().length < 8} onClick={lookup} className={buttonClass("secondary", "sm")}>
              <Search className="size-4" aria-hidden />
            </button>
          </div>
          <input aria-label="Nombre del cliente" value={customer.name} onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))} placeholder="Nombre" className={inputCompactClass} />
        </section>

        <section className="space-y-2 rounded-2xl border border-line p-4 text-sm">
          <div className="flex gap-2">
            <label className="flex flex-1 items-center gap-2">
              <span className="text-muted">Descuento S/</span>
              <input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" className={cn(inputCompactClass, "min-w-0 flex-1 tabular-nums")} />
            </label>
            <label className="flex flex-1 items-center gap-2">
              <span className="text-muted">Envío S/</span>
              <input inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="0" className={cn(inputCompactClass, "min-w-0 flex-1 tabular-nums")} />
            </label>
          </div>
          <dl className="space-y-1 pt-2">
            <div className="flex justify-between">
              <dt className="text-muted">
                {units} {units === 1 ? "prenda" : "prendas"}
              </dt>
              <dd className="tabular-nums">{formatPrice(pricing.subtotalCents)}</dd>
            </div>
            {pricing.discountCents ? (
              <div className="flex justify-between text-warning">
                <dt>Promociones</dt>
                <dd className="tabular-nums">−{formatPrice(pricing.discountCents)}</dd>
              </div>
            ) : null}
            {manualDiscountCents ? (
              <div className="flex justify-between">
                <dt className="text-muted">Descuento</dt>
                <dd className="tabular-nums">−{formatPrice(manualDiscountCents)}</dd>
              </div>
            ) : null}
            {shippingCents ? (
              <div className="flex justify-between">
                <dt className="text-muted">Envío</dt>
                <dd className="tabular-nums">{formatPrice(shippingCents)}</dd>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between border-t border-line pt-2">
              <dt className="font-semibold">Total</dt>
              <dd className="text-3xl font-extrabold tabular-nums">{formatPrice(totalCents)}</dd>
            </div>
          </dl>
          {!total.ok ? <p className="text-danger">{total.message}</p> : null}
          <button type="button" onClick={openPayment} disabled={lines.length === 0 || !total.ok} className={cn(buttonClass("primary"), "mt-2 h-14 w-full text-base")}>
            Cobrar {lines.length ? formatPrice(totalCents) : ""}
          </button>
          <p className="text-center text-xs text-subtle">
            {warehouse.name} · Caja #{session.number} ·{" "}
            <Link href="/admin/caja" className="underline hover:text-white">
              ver caja
            </Link>
          </p>
        </section>
      </aside>

      <Sheet
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title={`Cobrar ${formatPrice(totalCents)}`}
        side="bottom"
        footer={
          <div className="space-y-3 pb-3">
            <FormAlert state={state} />
            <button type="button" onClick={charge} disabled={pending || !settled.ok} className={cn(buttonClass("primary"), "h-14 w-full text-base")}>
              {pending ? "Cobrando…" : settled.ok ? `Cobrar ${formatPrice(totalCents)}` : paidCents < totalCents ? `Falta ${formatPrice(totalCents - paidCents)}` : "Revisa los pagos"}
            </button>
          </div>
        }
      >
        <div className="space-y-4 p-4">
          {payments.map((p, i) => (
            <div key={i} className="space-y-3 rounded-2xl border border-line p-4">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Medio de pago">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={p.method === m}
                    onClick={() => updatePayment(i, { method: m })}
                    className={cn("h-10 rounded-full border px-4 text-sm font-semibold", p.method === m ? "border-white bg-white text-black" : "border-line text-muted")}
                  >
                    {PAYMENT_LABEL[m]}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <Field label="Monto S/" className="flex-1">
                  {(a11y) => <input {...a11y} inputMode="decimal" value={p.amount} onChange={(e) => updatePayment(i, { amount: e.target.value })} className={cn(inputCompactClass, "tabular-nums")} />}
                </Field>
                {p.method === "efectivo" ? (
                  <Field label="Recibido S/" className="flex-1">
                    {(a11y) => <input {...a11y} inputMode="decimal" value={p.received} placeholder={p.amount} onChange={(e) => updatePayment(i, { received: e.target.value })} className={cn(inputCompactClass, "tabular-nums")} />}
                  </Field>
                ) : (
                  <Field label="N° de operación" optional className="flex-1">
                    {(a11y) => <input {...a11y} value={p.reference} onChange={(e) => updatePayment(i, { reference: e.target.value })} className={inputCompactClass} />}
                  </Field>
                )}
              </div>
              {p.method === "efectivo" ? (
                <div className="flex flex-wrap gap-2">
                  {QUICK_CASH.filter((c) => c >= (cents(p.amount) ?? 0)).map((c) => (
                    <button key={c} type="button" onClick={() => updatePayment(i, { received: soles(c) })} className={buttonClass("secondary", "sm")}>
                      {formatPrice(c)}
                    </button>
                  ))}
                </div>
              ) : null}
              {payments.length > 1 ? (
                <button type="button" onClick={() => setPayments((ps) => ps.filter((_, k) => k !== i))} className={cn(buttonClass("ghost", "sm"), "hover:text-danger")}>
                  Quitar este pago
                </button>
              ) : null}
            </div>
          ))}
          {paidCents < totalCents ? (
            <button
              type="button"
              onClick={() => setPayments((ps) => [...ps, { method: "yape", amount: soles(totalCents - paidCents), received: "", reference: "" }])}
              className={buttonClass("secondary")}
            >
              <Plus className="size-4" aria-hidden /> Otro medio de pago ({formatPrice(totalCents - paidCents)})
            </button>
          ) : null}
          {settled.ok && settled.changeCents ? <p className="text-2xl font-bold text-warning">Vuelto: {formatPrice(settled.changeCents)}</p> : null}
          {!settled.ok && paidCents >= totalCents ? <p className="text-sm text-danger">{settled.message}</p> : null}
        </div>
      </Sheet>
    </div>
  );
}
