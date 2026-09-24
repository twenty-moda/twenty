"use client";

import { MessageSquareWarning, PackageCheck, Send, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { useActionState, useId, useState, type ReactNode } from "react";
import { submitComplaintAction } from "@/app/(store)/libro-de-reclamaciones/actions";
import { idle } from "@/lib/action-state";
import { cn } from "@/lib/cn";
import { COMPLAINT_TYPES } from "@/lib/public-forms";
import { DistrictSearch, type PickedDistrict } from "../checkout/district-search";
import { Field, SelectWrap, selectClass } from "../ui/form";
import { FormMessage, Honeypot, SubmitButton, TextField } from "../ui/form-feedback";

function Step({ n, icon: Icon, title, children }: { n: number; icon: typeof UserRound; title: string; children: ReactNode }) {
  const id = useId();
  return (
    <fieldset aria-labelledby={id} className="min-w-0 space-y-4">
      <legend id={id} className="mb-4 flex items-center gap-3 text-lg font-extrabold tracking-tight uppercase">
        <span className="grid size-9 place-items-center rounded-full bg-white text-sm text-black">{n}</span>
        <Icon className="size-5 text-muted" aria-hidden /> {title}
      </legend>
      {children}
    </fieldset>
  );
}

function Choice<T extends string>({ name, value, current, onChange, title, help }: { name: string; value: T; current: T; onChange: (v: T) => void; title: string; help?: string }) {
  return (
    <label className={cn("flex cursor-pointer gap-3 rounded-xl border p-4 transition", current === value ? "border-white bg-raised" : "border-line")}>
      <input type="radio" name={name} value={value} checked={current === value} onChange={() => onChange(value)} className="mt-1 size-4 accent-white" />
      <span>
        <span className="block font-semibold">{title}</span>
        {help ? <span className="block text-sm text-muted">{help}</span> : null}
      </span>
    </label>
  );
}

export function ComplaintForm() {
  const [state, action] = useActionState(submitComplaintAction, idle);
  const values = state.values ?? {};
  const errors = state.fieldErrors ?? {};
  const [type, setType] = useState<"reclamo" | "queja">("reclamo");
  const [itemType, setItemType] = useState<"producto" | "servicio">("producto");
  const [minor, setMinor] = useState(false);
  const [district, setDistrict] = useState<PickedDistrict | null>(null);

  return (
    <form action={action} className="relative space-y-10" noValidate>
      <Honeypot />

      <Step n={1} icon={MessageSquareWarning} title="¿Qué quieres registrar?">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(["reclamo", "queja"] as const).map((t) => (
            <Choice key={t} name="type" value={t} current={type} onChange={setType} title={COMPLAINT_TYPES[t].label} help={COMPLAINT_TYPES[t].help} />
          ))}
        </div>
      </Step>

      <Step n={2} icon={UserRound} title="Tus datos">
        <TextField label="Nombre completo" name="name" state={state} autoComplete="name" required />
        <div className="grid grid-cols-[8rem_1fr] gap-3">
          <Field label="Documento">
            {(a11y) => (
              <SelectWrap>
                <select {...a11y} name="documentType" defaultValue={values.documentType ?? "dni"} className={selectClass}>
                  <option value="dni">DNI</option>
                  <option value="ce">C.E.</option>
                  <option value="pasaporte">Pasaporte</option>
                  <option value="ruc">RUC</option>
                </select>
              </SelectWrap>
            )}
          </Field>
          <TextField label="Número" name="documentNumber" state={state} inputMode="numeric" autoComplete="off" required />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Celular" name="phone" type="tel" state={state} autoComplete="tel" inputMode="tel" required />
          <TextField label="Email" name="email" type="email" state={state} autoComplete="email" inputMode="email" hint="Aquí te enviamos la constancia y la respuesta." required />
        </div>
        <Field label="Distrito" error={errors.ubigeo}>
          {(a11y) => (
            <>
              <DistrictSearch id={a11y.id} value={district} onChange={setDistrict} invalid={a11y["aria-invalid"]} describedBy={a11y["aria-describedby"]} />
              <input type="hidden" name="ubigeo" value={district?.ubigeo ?? ""} />
            </>
          )}
        </Field>
        <TextField label="Dirección" name="address" state={state} autoComplete="street-address" placeholder="Av. / Jr. / Calle, número, dpto." required />
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" name="isMinor" checked={minor} onChange={(e) => setMinor(e.target.checked)} className="size-5 accent-white" />
          Soy menor de edad
        </label>
        {minor ? (
          <div className="grid grid-cols-1 gap-4 rounded-xl bg-raised p-4 sm:grid-cols-2">
            <TextField label="Nombre del padre, madre o apoderado" name="guardianName" state={state} required />
            <TextField label="DNI del padre, madre o apoderado" name="guardianDocument" state={state} inputMode="numeric" required />
          </div>
        ) : null}
      </Step>

      <Step n={3} icon={PackageCheck} title="Producto o servicio">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Choice name="itemType" value="producto" current={itemType} onChange={setItemType} title="Producto" help="Una prenda que compraste" />
          <Choice name="itemType" value="servicio" current={itemType} onChange={setItemType} title="Servicio" help="Envío, atención, pago…" />
        </div>
        <TextField label="¿Qué compraste o contrataste?" name="itemDescription" state={state} placeholder="Ej: Baggy jean negro talla 30" required />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TextField label="Monto (S/)" name="amount" state={state} inputMode="decimal" placeholder="0.00" optional />
          <TextField label="N° de pedido" name="orderNumber" state={state} placeholder="#1024" optional />
          <TextField label="Fecha del hecho" name="incidentDate" type="date" state={state} optional />
        </div>
      </Step>

      <Step n={4} icon={MessageSquareWarning} title={`Detalle ${type === "reclamo" ? "del reclamo" : "de la queja"}`}>
        <TextField label="¿Qué pasó?" name="detail" state={state} rows={5} maxLength={3000} placeholder="Cuéntanos con detalle qué ocurrió." required />
        <TextField label="¿Qué solución pides?" name="request" state={state} rows={3} maxLength={1000} placeholder="Ej: el cambio de la prenda por otra talla." required />
      </Step>

      <Step n={5} icon={ShieldCheck} title="Confirmación">
        <label className={cn("flex cursor-pointer gap-3 rounded-xl border p-4 text-sm", errors.accepted ? "border-danger" : "border-line")}>
          <input type="checkbox" name="accepted" defaultChecked={values.accepted === "on"} className="mt-0.5 size-5 shrink-0 accent-white" />
          <span>
            Declaro que la información es verdadera y acepto la{" "}
            <Link href="/politica-de-privacidad" className="underline underline-offset-4">
              política de privacidad
            </Link>{" "}
            para la atención de mi {type}.
          </span>
        </label>
        {errors.accepted ? <p className="text-sm text-danger">{errors.accepted}</p> : null}
        <FormMessage state={state} />
        <SubmitButton pendingLabel="Registrando…">
          <Send className="size-4" aria-hidden /> Enviar {type}
        </SubmitButton>
      </Step>
    </form>
  );
}
