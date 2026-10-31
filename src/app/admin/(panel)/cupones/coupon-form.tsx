"use client";

import { Shuffle } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { FieldError, FormAlert, SubmitButton, Toggle } from "@/components/admin/form-controls";
import { buttonClass } from "@/components/admin/ui";
import { fieldClass, inputClass, Segmented } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { COUPON_CODE_MAX, couponDiscount, type CouponType } from "@/lib/coupons";
import { formatPrice } from "@/lib/money";
import { idle, type ActionState } from "../../_lib/action-state";
import { deleteCouponAction, saveCouponAction } from "./actions";

export type CouponFormValues = {
  code: string;
  description: string;
  type: CouponType;
  /** Porcentaje o soles, como se escribe. */
  value: string;
  maxDiscount: string;
  minSubtotal: string;
  usageLimit: string;
  perCustomerLimit: string;
  firstPurchaseOnly: boolean;
  isActive: boolean;
  startsAt: string;
  endsAt: string;
};

const NEW_COUPON: CouponFormValues = {
  code: "",
  description: "",
  type: "porcentaje",
  value: "",
  maxDiscount: "",
  minSubtotal: "",
  usageLimit: "",
  perCustomerLimit: "1",
  firstPurchaseOnly: false,
  isActive: true,
  startsAt: "",
  endsAt: "",
};

/** Sin letras que se confunden al dictarlas (O/0, I/1). */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const randomCode = () => Array.from(crypto.getRandomValues(new Uint32Array(8)), (n) => CODE_CHARS[n % CODE_CHARS.length]).join("");

const soles = (value: string) => {
  const n = Number(value.replace(",", "."));
  return value.trim() && Number.isFinite(n) ? Math.round(n * 100) : null;
};

export function CouponForm({ id, initial }: { id: string | null; initial?: CouponFormValues }) {
  const [state, action] = useActionState(saveCouponAction.bind(null, id), idle);
  // Todo controlado: así un error al guardar no borra lo escrito.
  const [v, setValues] = useState<CouponFormValues>(initial ?? NEW_COUPON);
  const [deleting, startDelete] = useTransition();
  const set = <K extends keyof CouponFormValues>(key: K, value: CouponFormValues[K]) => setValues((x) => ({ ...x, [key]: value }));
  const isPercent = v.type === "porcentaje";

  // Ejemplo con una compra de S/ 150 (o el mínimo, si es mayor).
  const value = isPercent ? Number(v.value) : soles(v.value);
  const minSubtotalCents = soles(v.minSubtotal) ?? 0;
  const exampleCents = Math.max(15000, minSubtotalCents);
  const exampleDiscount =
    value && value > 0 && (!isPercent || value <= 100)
      ? couponDiscount({ code: v.code, type: v.type, value, maxDiscountCents: isPercent ? soles(v.maxDiscount) : null, minSubtotalCents }, exampleCents)
      : null;

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="type" value={v.type} />

      <div className="space-y-3 rounded-2xl bg-raised p-5">
        <p className="text-sm text-muted">El descuento</p>
        <Segmented
          label="Tipo de descuento"
          value={v.type}
          onChange={(type) => setValues((x) => ({ ...x, type, value: "" }))}
          options={[
            { value: "porcentaje", label: "Porcentaje (%)" },
            { value: "monto", label: "Monto fijo (S/)" },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          {isPercent ? null : "S/"}
          <input
            name="value"
            inputMode={isPercent ? "numeric" : "decimal"}
            value={v.value}
            onChange={(e) => set("value", isPercent ? e.target.value.replace(/\D/g, "") : e.target.value)}
            aria-label={isPercent ? "Porcentaje de descuento" : "Monto de descuento en soles"}
            className={cn(fieldClass, "h-12 w-28 bg-ink px-2 text-center text-lg")}
          />
          {isPercent ? "% de descuento" : "de descuento"}
        </div>
        <FieldError state={state} name="value" />
        <p className="text-sm text-muted">
          {exampleDiscount
            ? `Ejemplo: en una compra de ${formatPrice(exampleCents)} en prendas, descuenta ${formatPrice(exampleDiscount)} y el cliente paga ${formatPrice(exampleCents - exampleDiscount)} (más el envío).`
            : "Se aplica a todas las prendas del carrito, después de las promos “N x S/”. El envío no se descuenta."}
        </p>
      </div>

      <div>
        <label htmlFor="coupon-code" className="mb-1.5 block text-sm font-medium">
          Código que escribe el cliente
        </label>
        <div className="flex gap-2">
          <input
            id="coupon-code"
            name="code"
            value={v.code}
            onChange={(e) => set("code", e.target.value.toUpperCase().replace(/\s/g, ""))}
            maxLength={COUPON_CODE_MAX}
            autoComplete="off"
            spellCheck={false}
            placeholder="Ej. TWENTY10"
            className={cn(inputClass, "min-w-0 font-mono tracking-wide")}
          />
          <button type="button" onClick={() => set("code", randomCode())} className={cn(buttonClass("secondary"), "h-12")}>
            <Shuffle className="size-4" aria-hidden /> Generar
          </button>
        </div>
        <FieldError state={state} name="code" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {isPercent ? (
          <NumberField
            label="Descuento máximo S/"
            name="maxDiscount"
            value={v.maxDiscount}
            onChange={(x) => set("maxDiscount", x)}
            decimal
            hint="Ej. 10% hasta S/ 30. Vacío = sin tope."
            state={state}
            errorName="maxDiscountCents"
          />
        ) : null}
        <NumberField
          label="Compra mínima S/"
          name="minSubtotal"
          value={v.minSubtotal}
          onChange={(x) => set("minSubtotal", x)}
          decimal
          hint="En prendas, después de las promos. Vacío = sin mínimo."
          state={state}
          errorName="minSubtotalCents"
        />
        <NumberField
          label="Usos en total"
          name="usageLimit"
          value={v.usageLimit}
          onChange={(x) => set("usageLimit", x)}
          hint="Cuántos pedidos lo pueden usar. Vacío = sin límite."
          state={state}
          errorName="usageLimit"
        />
        <NumberField
          label="Usos por cliente"
          name="perCustomerLimit"
          value={v.perCustomerLimit}
          onChange={(x) => set("perCustomerLimit", x)}
          hint="Se reconoce por email o documento. Vacío = sin límite."
          state={state}
          errorName="perCustomerLimit"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            Empieza <span className="font-normal text-subtle">(opcional)</span>
          </span>
          <input type="datetime-local" name="startsAt" value={v.startsAt} onChange={(e) => set("startsAt", e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            Vence <span className="font-normal text-subtle">(opcional)</span>
          </span>
          <input type="datetime-local" name="endsAt" value={v.endsAt} onChange={(e) => set("endsAt", e.target.value)} className={inputClass} />
          <FieldError state={state} name="endsAt" />
        </label>
      </div>

      <div className="space-y-4">
        <Toggle
          name="firstPurchaseOnly"
          checked={v.firstPurchaseOnly}
          onChange={(x) => set("firstPurchaseOnly", x)}
          label="Solo primera compra"
          hint="Para clientes sin pedidos pagados antes (por email o documento)."
        />
        <Toggle name="isActive" checked={v.isActive} onChange={(x) => set("isActive", x)} label="Cupón activo" hint="Si lo apagas, el código deja de funcionar." />
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">
          Nota <span className="font-normal text-subtle">(opcional)</span>
        </span>
        <input
          name="description"
          value={v.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Para el equipo: para quién es, dónde se publicó…"
          className={inputClass}
        />
      </label>

      <FormAlert state={state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton>{id ? "Guardar cupón" : "Crear cupón"}</SubmitButton>
        {id ? (
          <button
            type="button"
            disabled={deleting}
            onClick={() => {
              if (window.confirm("¿Eliminar este cupón? Los pedidos que lo usaron conservan su descuento.")) startDelete(() => deleteCouponAction(id));
            }}
            className={buttonClass("danger")}
          >
            Eliminar
          </button>
        ) : null}
      </div>
    </form>
  );
}

function NumberField({
  label,
  name,
  value,
  onChange,
  decimal,
  hint,
  state,
  errorName,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  decimal?: boolean;
  hint: string;
  state: ActionState;
  errorName: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">
        {label} <span className="font-normal text-subtle">(opcional)</span>
      </span>
      <input
        name={name}
        inputMode={decimal ? "decimal" : "numeric"}
        value={value}
        onChange={(e) => onChange(decimal ? e.target.value : e.target.value.replace(/\D/g, ""))}
        placeholder="—"
        className={inputClass}
      />
      <span className="mt-1.5 block text-xs text-muted">{hint}</span>
      <FieldError state={state} name={errorName} />
    </label>
  );
}
