"use client";

import { ArrowLeft, Check, ChevronDown, CreditCard, MapPin, Package, Smartphone, Store, Truck, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { placeOrderAction } from "@/app/(store)/checkout/actions";
import { getCheckoutAccountAction, type CheckoutAccount } from "@/app/(store)/cuenta/actions";
import { addressSummary } from "@/lib/account-forms";
import { agencyLabel, COURIER_NAME, methodCourier, type Courier } from "@/lib/couriers";
import { cartTotals, lineItem, type CartLine } from "@/lib/cart";
import { checkoutSchema, fieldErrors, normalizePhone, type CheckoutFieldErrors, type CheckoutInput } from "@/lib/checkout-schema";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/money";
import { priceLines, type PricingResult } from "@/lib/pricing";
import type { ShippingKind, ShippingMethodInfo } from "@/lib/shipping";
import { LineOptions } from "../cart/cart-line-item";
import { cartStore, useCartLines, useHydrated } from "../cart/cart-store";
import { promotionLabel } from "../store/price";
import { Field, inputClass, Segmented, SelectWrap, selectClass } from "../ui/form";
import { DistrictSearch, type PickedDistrict } from "./district-search";
import { AgencyPicker } from "./agency-picker";

export type CheckoutFlowProps = {
  methods: ShippingMethodInfo[];
  limaDistricts: { ubigeo: string; name: string; priceCents: number }[];
  store: { address: string; hours: string; mapUrl: string } | null;
  payments: { walletEnabled: boolean; cardEnabled: boolean };
};

type Step = 1 | 2 | 3;
const STEPS: { step: Step; label: string }[] = [
  { step: 1, label: "Entrega" },
  { step: 2, label: "Tus datos" },
  { step: 3, label: "Pago" },
];

type FormState = {
  name: string;
  phone: string;
  email: string;
  documentType: "dni" | "ce" | "pasaporte";
  documentNumber: string;
  address: string;
  addressReference: string;
  agencyName: string;
  /** Agencia elegida de la lista de Shalom u Olva (su id en el courier). */
  agencyId: string;
  invoiceType: "boleta" | "factura";
  ruc: string;
  businessName: string;
  paymentMethod: "tarjeta" | "yape_plin" | "";
  note: string;
};

const INITIAL: FormState = {
  name: "",
  phone: "",
  email: "",
  documentType: "dni",
  documentNumber: "",
  address: "",
  addressReference: "",
  agencyName: "",
  agencyId: "",
  invoiceType: "boleta",
  ruc: "",
  businessName: "",
  paymentMethod: "",
  note: "",
};

const KIND_ICON: Record<ShippingKind, typeof Truck> = { lima_delivery: Truck, agency: Package, store_pickup: Store };
const STEP_FIELDS: Record<Step, (keyof CheckoutFieldErrors)[]> = {
  1: ["shippingMethod"],
  2: ["name", "phone", "email", "documentNumber", "ubigeo", "address", "agencyName"],
  3: ["invoiceType", "ruc", "businessName", "paymentMethod", "note"],
};

export function CheckoutFlow({ methods, limaDistricts, store, payments }: CheckoutFlowProps) {
  const router = useRouter();
  const lines = useCartLines();
  const hydrated = useHydrated();
  const [placed, setPlaced] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [methodSlug, setMethodSlug] = useState<string | null>(null);
  const [limaUbigeo, setLimaUbigeo] = useState("");
  const [agencyDistrict, setAgencyDistrict] = useState<PickedDistrict | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<CheckoutFieldErrors>({});
  const [pending, startTransition] = useTransition();
  // Cuenta abierta (el checkout es estático: se pregunta al cargar). Llena los datos y ofrece las direcciones guardadas.
  const [account, setAccount] = useState<CheckoutAccount>(null);
  const [accountChecked, setAccountChecked] = useState(false);
  const [saveAddress, setSaveAddress] = useState(true);
  // Shalom y Olva: la agencia se elige de la lista real. Si la lista de un courier no carga, se escribe como texto.
  const [listDown, setListDown] = useState<Partial<Record<Courier, boolean>>>({});
  const markListDown = useCallback((c: Courier) => setListDown((d) => ({ ...d, [c]: true })), []);

  useEffect(() => {
    let active = true;
    getCheckoutAccountAction()
      .then((data) => {
        if (!active) return;
        setAccountChecked(true);
        if (!data) return;
        setAccount(data);
        const { profile } = data;
        setForm((f) => ({
          ...f,
          name: f.name || profile.name,
          phone: f.phone || profile.phone,
          email: f.email || profile.email,
          documentType: f.documentNumber ? f.documentType : profile.documentType,
          documentNumber: f.documentNumber || profile.documentNumber,
        }));
      })
      .catch(() => active && setAccountChecked(true));
    return () => {
      active = false;
    };
  }, []);

  const method = methods.find((m) => m.slug === methodSlug) ?? null;
  const limaDistrict = limaDistricts.find((d) => d.ubigeo === limaUbigeo) ?? null;
  const minDelivery = Math.min(...limaDistricts.map((d) => d.priceCents));
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined, form: undefined }));
  };

  const pricing = useMemo(
    () =>
      priceLines(lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPriceCents: l.priceCents, promotion: l.promotion }))),
    [lines],
  );
  const shippingCents = method?.kind === "lima_delivery" ? (limaDistrict?.priceCents ?? 0) : 0;
  const totalCents = pricing.totalCents + shippingCents;
  const { units } = cartTotals(lines);

  const courier = method ? methodCourier(method) : null;
  /** Courier cuya lista de agencias se muestra (null = la agencia se escribe). */
  const agencyPicker = courier && !listDown[courier] ? courier : null;
  type Saved = NonNullable<CheckoutAccount>["addresses"][number];
  const savedFor = (kind: ShippingKind | undefined): Saved[] =>
    !account
      ? []
      : kind === "lima_delivery"
        ? account.addresses.filter((a) => a.kind === "delivery" && limaDistricts.some((d) => d.ubigeo === a.ubigeo))
        : kind === "agency"
          ? // Con la lista del courier solo sirven las agencias guardadas desde esa misma lista.
            account.addresses.filter((a) => a.kind === "agency" && (!agencyPicker || (!!a.agencyId && a.agencyCourier === agencyPicker)))
          : [];
  const same = (a: string | null, b: string) => (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();
  const savedForMethod = savedFor(method?.kind);
  const selectedSaved = savedForMethod.find((a) =>
    a.kind === "delivery"
      ? a.ubigeo === limaUbigeo && same(a.address, form.address)
      : agencyPicker
        ? a.agencyId === form.agencyId
        : a.ubigeo === agencyDistrict?.ubigeo && same(a.agencyName, form.agencyName),
  );
  const applyAddress = (a: Saved) => {
    if (a.kind === "delivery") {
      setLimaUbigeo(a.ubigeo);
      setForm((f) => ({ ...f, address: a.address ?? "", addressReference: a.reference ?? "" }));
    } else {
      setAgencyDistrict({ ubigeo: a.ubigeo, label: `${a.district}, ${a.province} - ${a.department}`, department: a.department });
      setForm((f) => ({ ...f, agencyName: a.agencyName ?? "", agencyId: a.agencyId ?? "" }));
    }
    setErrors((e) => ({ ...e, ubigeo: undefined, address: undefined, agencyName: undefined }));
  };
  const canSaveAddress = !!account && (method?.kind === "lima_delivery" || method?.kind === "agency") && !selectedSaved && account.addresses.length < 10;

  const payload = (): Partial<CheckoutInput> & Record<string, unknown> => ({
    name: form.name,
    phone: form.phone,
    email: form.email,
    documentType: form.documentType,
    documentNumber: form.documentNumber,
    invoiceType: form.invoiceType,
    ruc: form.ruc,
    businessName: form.businessName,
    shippingMethod: methodSlug ?? "",
    ubigeo: method?.kind === "lima_delivery" ? limaUbigeo : method?.kind === "agency" ? agencyDistrict?.ubigeo : undefined,
    address: method?.kind === "lima_delivery" ? form.address : undefined,
    addressReference: method?.kind === "lima_delivery" ? form.addressReference : undefined,
    agencyName: method?.kind === "agency" ? form.agencyName : undefined,
    agencyId: agencyPicker ? form.agencyId || undefined : undefined,
    paymentMethod: form.paymentMethod || undefined,
    note: form.note,
    saveAddress: canSaveAddress && saveAddress,
    items: lines.map(lineItem),
  });

  /** Valida con el mismo esquema del servidor, mostrando solo los errores de los pasos hasta `upTo`. */
  const validate = (upTo: Step): CheckoutFieldErrors => {
    const result = checkoutSchema.safeParse(payload());
    const all: CheckoutFieldErrors = result.success ? {} : fieldErrors(result.error);
    if (method?.kind === "lima_delivery") {
      if (!limaUbigeo) all.ubigeo = "Elige tu distrito";
      if (!form.address.trim()) all.address = "Escribe la dirección de entrega";
    }
    if (method?.kind === "agency") {
      if (agencyPicker) {
        if (!form.agencyId) all.agencyName = "Elige la agencia donde recogerás";
      } else {
        if (!agencyDistrict) all.ubigeo = "Elige la ciudad donde recogerás";
        if (!form.agencyName.trim()) all.agencyName = "Escribe la agencia donde recogerás";
      }
    }
    const visible: CheckoutFieldErrors = {};
    for (let s = 1 as Step; s <= upTo; s = (s + 1) as Step) {
      for (const key of STEP_FIELDS[s]) if (all[key]) visible[key] = all[key];
    }
    return visible;
  };

  const goTo = (next: Step) => {
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const next = () => {
    const found = validate(step);
    setErrors(found);
    const firstStepWithError = ([1, 2, 3] as Step[]).find((s) => STEP_FIELDS[s].some((k) => found[k]));
    if (firstStepWithError) {
      if (firstStepWithError !== step) goTo(firstStepWithError);
      return;
    }
    if (step === 1 && method) {
      // Con la cuenta abierta, la dirección principal (o la última usada) ya aparece elegida.
      const candidates = savedFor(method.kind);
      const empty = method.kind === "lima_delivery" ? !limaUbigeo && !form.address : method.kind === "agency" ? !agencyDistrict && !form.agencyName : false;
      if (empty && candidates.length) applyAddress(candidates.find((a) => a.isDefault) ?? candidates[0]);
    }
    if (step < 3) goTo((step + 1) as Step);
    else submit();
  };

  const submit = () =>
    startTransition(async () => {
      const result = await placeOrderAction(payload());
      if (result.ok) {
        setPlaced(true);
        router.push(`/pedido/${result.orderId}${result.payNow ? "?pagar=1" : ""}`);
        cartStore.replace([]);
        return;
      }
      setErrors(result.errors);
      const errorStep = ([1, 2, 3] as Step[]).find((s) => STEP_FIELDS[s].some((k) => result.errors[k]));
      if (errorStep) goTo(errorStep);
    });

  if (!hydrated || placed) {
    return (
      <p className="px-4 py-24 text-center text-muted" aria-live="polite">
        {placed ? "¡Listo! Abriendo tu pedido…" : "Cargando tu carrito…"}
      </p>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="px-4 py-24 text-center">
        <p className="font-semibold">No hay prendas en tu carrito.</p>
        <Link href="/catalogo" className="mt-6 inline-flex h-12 items-center rounded-full bg-white px-8 text-sm font-semibold text-black uppercase">
          Ver catálogo
        </Link>
      </div>
    );
  }

  const shippingLabel = !method
    ? "Elige cómo recibirlo"
    : method.kind === "lima_delivery"
      ? limaDistrict
        ? formatPrice(limaDistrict.priceCents)
        : "Según tu distrito"
      : method.kind === "agency"
        ? "Pagas al recoger"
        : "Gratis";
  const ctaLabel =
    step < 3 ? "Continuar" : pending ? "Enviando pedido…" : form.paymentMethod === "tarjeta" ? `Ir a pagar · ${formatPrice(totalCents)}` : `Confirmar pedido · ${formatPrice(totalCents)}`;

  return (
    // data-hide-whatsapp: sin el botón flotante de WhatsApp mientras compra (no tapa el formulario ni distrae).
    <div data-hide-whatsapp className="mx-auto max-w-6xl px-4 pt-5 pb-32 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12 lg:px-6 lg:pb-16">
      <div>
        <div className="flex items-center gap-2">
          {step > 1 ? (
            <button type="button" onClick={() => goTo((step - 1) as Step)} aria-label="Volver al paso anterior" className="-ml-2 grid size-10 place-items-center">
              <ArrowLeft className="size-5" aria-hidden />
            </button>
          ) : (
            <Link href="/cart" aria-label="Volver al carrito" className="-ml-2 grid size-10 place-items-center">
              <ArrowLeft className="size-5" aria-hidden />
            </Link>
          )}
          <h1 className="text-xl font-extrabold tracking-tight uppercase">Finalizar compra</h1>
        </div>

        <ol className="mt-4 grid grid-cols-3 gap-2" aria-label="Pasos">
          {STEPS.map((s) => (
            <li key={s.step}>
              <button
                type="button"
                disabled={s.step > step}
                onClick={() => goTo(s.step)}
                aria-current={s.step === step ? "step" : undefined}
                className="min-h-10 w-full text-left disabled:cursor-default"
              >
                <span className={cn("block h-1 rounded-full", s.step <= step ? "bg-white" : "bg-raised")} />
                <span className={cn("mt-2 flex items-center gap-1 text-xs font-semibold", s.step === step ? "text-white" : "text-muted")}>
                  {s.step < step ? <Check className="size-3.5" aria-hidden /> : <span>{s.step}.</span>} {s.label}
                </span>
              </button>
            </li>
          ))}
        </ol>

        <MobileSummary units={units} totalCents={totalCents}>
          <OrderSummary lines={lines} pricing={pricing} shippingLabel={shippingLabel} totalCents={totalCents} />
        </MobileSummary>

        {errors.form ? (
          <p role="alert" className="mt-4 rounded-xl bg-danger/15 px-4 py-3 text-sm text-danger">
            {errors.form}{" "}
            <Link href="/cart" className="underline">
              Ir al carrito
            </Link>
          </p>
        ) : null}

        {/* key={step}: al cambiar de paso el contenido entra con una animación corta. */}
        <div key={step} className="mt-6 animate-fade-up">
          {step === 1 ? (
            <section aria-labelledby="paso-entrega">
              <h2 id="paso-entrega" className="text-lg font-bold">
                ¿Cómo quieres recibir tu pedido?
              </h2>
              <div role="radiogroup" aria-label="Forma de entrega" className="mt-4 space-y-3">
                {methods.map((m) => {
                  const Icon = KIND_ICON[m.kind];
                  const selected = m.slug === methodSlug;
                  const subtitle =
                    m.kind === "lima_delivery"
                      ? `Lima Metropolitana · desde ${formatPrice(minDelivery)}`
                      : m.kind === "agency"
                        ? "A todo el Perú · pagas el envío al recoger"
                        : `Gratis${store ? ` · ${store.address}` : ""}`;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        // Cada courier tiene sus agencias (y sus ids): al cambiar de uno a otro se vuelve a elegir.
                        if (m.slug !== methodSlug && (m.kind === "agency" || method?.kind === "agency")) {
                          setAgencyDistrict(null);
                          setForm((f) => ({ ...f, agencyId: "", agencyName: "" }));
                        }
                        setMethodSlug(m.slug);
                        setErrors({});
                      }}
                      className={cn(
                        "flex w-full gap-4 rounded-2xl border p-4 text-left transition",
                        selected ? "border-white bg-raised" : "border-line hover:border-white/40",
                      )}
                    >
                      <span className={cn("grid size-11 shrink-0 place-items-center rounded-full", selected ? "bg-white text-black" : "bg-raised")}>
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{m.name}</span>
                        <span className="mt-0.5 block text-sm text-muted">{subtitle}</span>
                        {selected && m.details.length ? (
                          <ul className="mt-3 space-y-1 text-sm">
                            {m.details.map((d) => (
                              <li key={d} className="flex gap-2">
                                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {d}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </span>
                      <span
                        aria-hidden
                        className={cn("mt-1 grid size-5 shrink-0 place-items-center rounded-full border-2", selected ? "border-white" : "border-line")}
                      >
                        {selected ? <span className="size-2.5 rounded-full bg-white" /> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
              {errors.shippingMethod ? <p className="mt-3 text-sm text-danger">{errors.shippingMethod}</p> : null}
            </section>
          ) : null}

          {step === 2 && method ? (
            <div className="space-y-8">
              <section aria-labelledby="paso-destino" className="space-y-4">
                <h2 id="paso-destino" className="text-lg font-bold">
                  {method.kind === "lima_delivery" ? "¿A dónde te lo llevamos?" : method.kind === "agency" ? `¿En qué agencia ${method.name.replace(/^Envío /, "")} recoges?` : "Recojo en tienda"}
                </h2>

                {accountChecked && !account ? (
                  <Link
                    href="/ingresar?volver=/checkout"
                    className="flex min-h-12 items-center gap-3 rounded-xl border border-line px-4 py-2 text-sm"
                  >
                    <UserRound className="size-5 shrink-0" aria-hidden />
                    <span>
                      <span className="font-semibold">¿Tienes cuenta?</span> <span className="text-muted">Entra con Google y usa tus datos y direcciones guardadas.</span>
                    </span>
                  </Link>
                ) : null}

                {savedForMethod.length ? (
                  <div role="radiogroup" aria-label="Tus direcciones guardadas" className="space-y-2">
                    <p className="text-sm font-medium">Tus direcciones</p>
                    {savedForMethod.map((a) => {
                      const selected = selectedSaved?.id === a.id;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => applyAddress(a)}
                          className={cn("flex w-full items-start gap-3 rounded-xl border p-3 text-left transition", selected ? "border-white bg-raised" : "border-line")}
                        >
                          <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2", selected ? "border-white" : "border-subtle")} aria-hidden>
                            {selected ? <span className="size-2.5 rounded-full bg-white" /> : null}
                          </span>
                          <span className="min-w-0">
                            <span className="block font-semibold">{a.label}</span>
                            <span className="block text-sm text-muted">{addressSummary(a)}</span>
                          </span>
                        </button>
                      );
                    })}
                    <p className="text-xs text-muted">O escribe otra abajo.</p>
                  </div>
                ) : null}

                {method.kind === "lima_delivery" ? (
                  <>
                    <Field label="Distrito" error={errors.ubigeo}>
                      {(p) => (
                        <SelectWrap>
                          <select {...p} value={limaUbigeo} onChange={(e) => {
                            setLimaUbigeo(e.target.value);
                            setErrors((x) => ({ ...x, ubigeo: undefined }));
                          }} className={selectClass}>
                            <option value="">Elige tu distrito</option>
                            {limaDistricts.map((d) => (
                              <option key={d.ubigeo} value={d.ubigeo}>
                                {d.name} · {formatPrice(d.priceCents)}
                              </option>
                            ))}
                          </select>
                        </SelectWrap>
                      )}
                    </Field>
                    <Field label="Dirección" error={errors.address}>
                      {(p) => (
                        <input
                          {...p}
                          value={form.address}
                          onChange={(e) => set("address", e.target.value)}
                          autoComplete="street-address"
                          placeholder="Av., calle, número, dpto."
                          className={inputClass}
                        />
                      )}
                    </Field>
                    <Field label="Referencia" optional error={errors.addressReference}>
                      {(p) => (
                        <input
                          {...p}
                          value={form.addressReference}
                          onChange={(e) => set("addressReference", e.target.value)}
                          placeholder="Frente al parque, puerta negra…"
                          className={inputClass}
                        />
                      )}
                    </Field>
                    <p className="text-xs text-muted">¿Tu distrito no está? Elige Shalom u Olva o recoge en tienda.</p>
                  </>
                ) : null}


                {method.kind === "agency" && agencyPicker ? (
                  <>
                    <Field label={`Agencia ${COURIER_NAME[agencyPicker]} donde recoges`} error={errors.agencyName ?? errors.ubigeo}>
                      {(p) => (
                        <AgencyPicker
                          key={agencyPicker}
                          courier={agencyPicker}
                          id={p.id}
                          invalid={p["aria-invalid"]}
                          describedBy={p["aria-describedby"]}
                          value={form.agencyId}
                          onUnavailable={markListDown}
                          onChange={(agency) => {
                            setAgencyDistrict({ ubigeo: agency.ubigeo, label: `${agency.district}, ${agency.province} - ${agency.department}`, department: agency.department });
                            setForm((f) => ({ ...f, agencyId: agency.id, agencyName: agencyLabel(agency) }));
                            setErrors((x) => ({ ...x, ubigeo: undefined, agencyName: undefined }));
                          }}
                        />
                      )}
                    </Field>
                    <p className="rounded-xl bg-raised px-4 py-3 text-sm text-muted">
                      El envío se paga al recoger en la agencia. Recoge la persona titular del documento que escribas abajo
                      {agencyPicker === "shalom" ? " (mayor de 20 años)" : ""}.
                    </p>
                  </>
                ) : null}

                {method.kind === "agency" && !agencyPicker ? (
                  <>
                    <Field label="Ciudad o distrito de destino" error={errors.ubigeo}>
                      {(p) => (
                        <DistrictSearch
                          id={p.id}
                          invalid={p["aria-invalid"]}
                          describedBy={p["aria-describedby"]}
                          value={agencyDistrict}
                          onChange={(d) => {
                            setAgencyDistrict(d);
                            setErrors((x) => ({ ...x, ubigeo: undefined }));
                          }}
                        />
                      )}
                    </Field>
                    <Field
                      label={`Agencia ${method.name.replace(/^Envío /, "")} de destino`}
                      error={errors.agencyName}
                      hint="El nombre o la dirección de la agencia donde vas a recoger."
                    >
                      {(p) => (
                        <input
                          {...p}
                          value={form.agencyName}
                          onChange={(e) => set("agencyName", e.target.value)}
                          placeholder="Ej. Agencia Arequipa Centro"
                          className={inputClass}
                        />
                      )}
                    </Field>
                    <p className="rounded-xl bg-raised px-4 py-3 text-sm text-muted">
                      El envío se paga al recoger en la agencia. Recoge la persona titular del documento que escribas abajo
                      {method.slug === "shalom" ? " (mayor de 20 años)" : ""}.
                    </p>
                  </>
                ) : null}

                {canSaveAddress ? (
                  <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm">
                    <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} className="size-5 accent-white" />
                    Guardar {method.kind === "agency" ? "esta agencia" : "esta dirección"} en mi cuenta
                  </label>
                ) : null}

                {method.kind === "store_pickup" && store ? (
                  <div className="rounded-2xl bg-raised p-4 text-sm">
                    <p className="flex gap-2">
                      <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden /> {store.address}
                    </p>
                    {store.hours ? <p className="mt-2 text-muted">{store.hours}</p> : null}
                    <a href={store.mapUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block underline underline-offset-4">
                      Cómo llegar
                    </a>
                  </div>
                ) : null}
              </section>

              <section aria-labelledby="paso-datos" className="space-y-4">
                <h2 id="paso-datos" className="text-lg font-bold">
                  {method.kind === "store_pickup" ? "¿Quién recoge?" : "Tus datos"}
                </h2>
                <Field label="Nombre y apellido" error={errors.name}>
                  {(p) => (
                    <input {...p} value={form.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" className={inputClass} />
                  )}
                </Field>
                <Field label="Celular (WhatsApp)" error={errors.phone} hint="Te escribimos aquí para coordinar tu pedido.">
                  {(p) => (
                    <input
                      {...p}
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      value={form.phone}
                      onChange={(e) => set("phone", e.target.value)}
                      onBlur={() => form.phone && set("phone", normalizePhone(form.phone))}
                      placeholder="9XX XXX XXX"
                      className={inputClass}
                    />
                  )}
                </Field>
                <Field
                  label="Email"
                  error={errors.email}
                  hint={
                    account && !same(account.email, form.email)
                      ? `Con otro email, este pedido no aparecerá en tu cuenta (${account.email}).`
                      : "Para enviarte el resumen de tu compra."
                  }
                >
                  {(p) => (
                    <input
                      {...p}
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={form.email}
                      onChange={(e) => set("email", e.target.value)}
                      className={inputClass}
                    />
                  )}
                </Field>
                <div>
                  <p className="mb-1.5 text-sm font-medium">Documento</p>
                  <Segmented
                    label="Tipo de documento"
                    value={form.documentType}
                    onChange={(v) => set("documentType", v)}
                    options={[
                      { value: "dni", label: "DNI" },
                      { value: "ce", label: "C. Extranjería" },
                      { value: "pasaporte", label: "Pasaporte" },
                    ]}
                  />
                  <Field label={<span className="sr-only">Número de documento</span>} error={errors.documentNumber} className="mt-2">
                    {(p) => (
                      <input
                        {...p}
                        inputMode={form.documentType === "dni" ? "numeric" : "text"}
                        value={form.documentNumber}
                        onChange={(e) => set("documentNumber", e.target.value)}
                        placeholder={form.documentType === "dni" ? "8 dígitos" : "Número de documento"}
                        className={inputClass}
                      />
                    )}
                  </Field>
                </div>
              </section>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-8">
              <section aria-labelledby="paso-pago" className="space-y-3">
                <h2 id="paso-pago" className="text-lg font-bold">
                  ¿Cómo quieres pagar?
                </h2>
                <div role="radiogroup" aria-label="Forma de pago" className="space-y-3">
                  {payments.cardEnabled ? (
                    <PaymentOption
                      selected={form.paymentMethod === "tarjeta"}
                      onSelect={() => set("paymentMethod", "tarjeta")}
                      icon={<CreditCard className="size-5" aria-hidden />}
                      title="Tarjeta o Yape"
                      subtitle="Pagas al instante con Culqi y tu pedido queda confirmado. Visa, Mastercard, Amex o Yape."
                    />
                  ) : null}
                  {payments.walletEnabled ? (
                    <PaymentOption
                      selected={form.paymentMethod === "yape_plin"}
                      onSelect={() => set("paymentMethod", "yape_plin")}
                      icon={<Smartphone className="size-5" aria-hidden />}
                      title={payments.cardEnabled ? "Yape o Plin con QR" : "Yape o Plin"}
                      subtitle="Al confirmar te mostramos el QR; nos envías la captura por WhatsApp."
                    />
                  ) : null}
                  {!payments.cardEnabled && !payments.walletEnabled ? (
                    <p className="rounded-2xl bg-raised p-4 text-sm">Por ahora no podemos recibir pagos en la web. Escríbenos por WhatsApp y te ayudamos a completar tu compra.</p>
                  ) : null}
                </div>
                {errors.paymentMethod ? <p className="text-sm text-danger">{errors.paymentMethod}</p> : null}
              </section>

              <section aria-labelledby="paso-comprobante" className="space-y-3">
                <h2 id="paso-comprobante" className="text-lg font-bold">
                  Comprobante
                </h2>
                <Segmented
                  label="Tipo de comprobante"
                  value={form.invoiceType}
                  onChange={(v) => set("invoiceType", v)}
                  options={[
                    { value: "boleta", label: "Boleta" },
                    { value: "factura", label: "Factura" },
                  ]}
                />
                {form.invoiceType === "factura" ? (
                  <div className="space-y-4 pt-1">
                    <Field label="RUC" error={errors.ruc}>
                      {(p) => (
                        <input {...p} inputMode="numeric" value={form.ruc} onChange={(e) => set("ruc", e.target.value)} placeholder="11 dígitos" className={inputClass} />
                      )}
                    </Field>
                    <Field label="Razón social" error={errors.businessName}>
                      {(p) => <input {...p} value={form.businessName} onChange={(e) => set("businessName", e.target.value)} className={inputClass} />}
                    </Field>
                  </div>
                ) : null}
              </section>

              <Field label="¿Algo que debamos saber?" optional error={errors.note}>
                {(p) => (
                  <textarea
                    {...p}
                    rows={3}
                    value={form.note}
                    onChange={(e) => set("note", e.target.value)}
                    placeholder="Horario para recibir, alguna indicación…"
                    className={cn(inputClass, "h-auto py-3")}
                  />
                )}
              </Field>

              <DeliverySummary
                methodName={method?.name ?? ""}
                detail={
                  method?.kind === "lima_delivery"
                    ? `${limaDistrict?.name ?? ""} · ${form.address}`
                    : method?.kind === "agency"
                      ? `${form.agencyName} · ${agencyDistrict?.label ?? ""}`
                      : (store?.address ?? "")
                }
                who={`${form.name} · ${form.phone}`}
                onEdit={() => goTo(2)}
              />
            </div>
          ) : null}
        </div>

        <div className="mt-8 hidden lg:block">
          <button
            type="button"
            onClick={next}
            disabled={pending}
            className="h-13 w-full rounded-full bg-white text-sm font-bold tracking-wide text-black uppercase disabled:opacity-60"
          >
            {ctaLabel}
          </button>
        </div>
      </div>

      <aside className="hidden lg:block" aria-label="Resumen del pedido">
        <div className="sticky top-20 rounded-2xl bg-raised p-5">
          <h2 className="text-sm font-bold tracking-widest uppercase">Tu pedido</h2>
          <div className="mt-4">
            <OrderSummary lines={lines} pricing={pricing} shippingLabel={shippingLabel} totalCents={totalCents} />
          </div>
        </div>
      </aside>

      <div data-sticky-bar="lg" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink/95 px-4 pt-3 backdrop-blur-md pb-safe lg:hidden">
        <button
          type="button"
          onClick={next}
          disabled={pending}
          className="h-13 w-full rounded-full bg-white text-sm font-bold tracking-wide text-black uppercase disabled:opacity-60"
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}

function OrderSummary({
  lines,
  pricing,
  shippingLabel,
  totalCents,
}: {
  lines: CartLine[];
  pricing: PricingResult;
  shippingLabel: string;
  totalCents: number;
}) {
  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {lines.map((l) => (
          <li key={l.variantId} className="flex gap-3">
            <span className="relative aspect-3/4 w-12 shrink-0 rounded bg-ink">
              {l.image ? <Image src={l.image} alt="" fill sizes="48px" className="rounded object-cover" /> : null}
              <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-white text-[10px] font-bold text-black">
                {l.quantity}
              </span>
            </span>
            <span className="min-w-0 flex-1 text-sm">
              <span className="line-clamp-1">{l.productName}</span>
              <LineOptions line={l} />
            </span>
            <span className="text-sm">{formatPrice(l.priceCents * l.quantity)}</span>
          </li>
        ))}
      </ul>
      <dl className="space-y-2 border-t border-line pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">Subtotal</dt>
          <dd>{formatPrice(pricing.subtotalCents)}</dd>
        </div>
        {pricing.promotions
          .filter((p) => p.discountCents > 0)
          .map((p) => (
            <div key={p.id} className="flex justify-between text-success">
              <dt>Promo {promotionLabel(p)}</dt>
              <dd>-{formatPrice(p.discountCents)}</dd>
            </div>
          ))}
        <div className="flex justify-between">
          <dt className="text-muted">Envío</dt>
          <dd className="text-right">{shippingLabel}</dd>
        </div>
        <div className="flex justify-between border-t border-line pt-3 text-base font-bold">
          <dt>Total</dt>
          <dd>{formatPrice(totalCents)}</dd>
        </div>
      </dl>
    </div>
  );
}

function MobileSummary({ units, totalCents, children }: { units: number; totalCents: number; children: ReactNode }) {
  return (
    <details className="group mt-5 rounded-2xl bg-raised lg:hidden">
      <summary className="flex h-14 cursor-pointer list-none items-center justify-between px-4 text-sm">
        <span>
          Ver resumen · {units} {units === 1 ? "prenda" : "prendas"}
        </span>
        <span className="flex items-center gap-2 font-bold">
          {formatPrice(totalCents)} <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden />
        </span>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

function PaymentOption({
  selected,
  onSelect,
  icon,
  title,
  subtitle,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn("flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition", selected ? "border-white bg-raised" : "border-line")}
    >
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-full", selected ? "bg-white text-black" : "bg-raised")}>{icon}</span>
      <span className="flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-muted">{subtitle}</span>
      </span>
      <span aria-hidden className={cn("grid size-5 place-items-center rounded-full border-2", selected ? "border-white" : "border-line")}>
        {selected ? <span className="size-2.5 rounded-full bg-white" /> : null}
      </span>
    </button>
  );
}

function DeliverySummary({ methodName, detail, who, onEdit }: { methodName: string; detail: string; who: string; onEdit: () => void }) {
  return (
    <section className="rounded-2xl border border-line p-4 text-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{methodName}</h2>
        <button type="button" onClick={onEdit} className="underline underline-offset-4">
          Cambiar
        </button>
      </div>
      <p className="mt-1 text-muted">{detail}</p>
      <p className="mt-1 text-muted">{who}</p>
    </section>
  );
}
