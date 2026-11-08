"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Combobox } from "@/components/admin/combobox";
import { Toggle } from "@/components/admin/form-controls";
import { buttonClass } from "@/components/admin/ui";
import { Field, inputClass, selectClass, SelectWrap } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { DOCUMENT_LABEL } from "@/lib/order-status";
import { ineiDistricts, ineiLabel } from "@/lib/ubigeo-inei";
import { createGuideAction } from "./actions";

type DocType = keyof typeof DOCUMENT_LABEL;
export type GuideDefaults = {
  saleId: string;
  saleLabel: string;
  today: string;
  recipient: { documentType: DocType; documentNumber: string; name: string };
  origin: { ubigeo: string | null; address: string };
  destination: { ubigeo: string | null; address: string };
  carrier: { ruc: string; name: string } | null;
  weightKg: number;
  items: { sku: string; description: string; quantity: number }[];
};

/** Un distrito del INEI: se busca por nombre ("La Victoria", "Arequipa") y se guarda su ubigeo. */
function DistrictPicker({ label, value, onChange }: { label: string; value: string | null; onChange: (ubigeo: string | null) => void }) {
  const { options, byLabel, byUbigeo } = useMemo(() => {
    const all = ineiDistricts();
    return { options: all.map((d) => ({ value: ineiLabel(d) })), byLabel: new Map(all.map((d) => [ineiLabel(d), d.ubigeo])), byUbigeo: new Map(all.map((d) => [d.ubigeo, ineiLabel(d)])) };
  }, []);
  const [text, setText] = useState(value ? (byUbigeo.get(value) ?? "") : "");
  return (
    <Combobox
      label={label}
      options={options}
      value={text}
      maxResults={30}
      onChange={(v) => {
        setText(v);
        onChange(byLabel.get(v) ?? null);
      }}
      onPick={(v) => {
        setText(v);
        onChange(byLabel.get(v) ?? null);
      }}
      placeholder="Distrito · provincia · departamento"
      className={inputClass}
    />
  );
}

/**
 * Guía de remisión de una boleta o factura: destinatario, de dónde a dónde, cómo va (agencia o empresa de transporte,
 * o transporte propio) y el peso. Las prendas son las de la venta (menos las devueltas).
 */
export function GuideForm({ defaults }: { defaults: GuideDefaults }) {
  const router = useRouter();
  const [recipient, setRecipient] = useState(defaults.recipient);
  const [origin, setOrigin] = useState(defaults.origin);
  const [destination, setDestination] = useState(defaults.destination);
  const [transferDate, setTransferDate] = useState(defaults.today);
  const [mode, setMode] = useState<"01" | "02">("01");
  const [carrier, setCarrier] = useState(defaults.carrier ?? { ruc: "", name: "" });
  const [m1l, setM1l] = useState(true);
  const [plate, setPlate] = useState("");
  const [driver, setDriver] = useState({ documentNumber: "", firstName: "", lastName: "", license: "" });
  const [weight, setWeight] = useState(String(defaults.weightKg));
  const [packages, setPackages] = useState("1");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      setError(null);
      const result = await createGuideAction({
        saleId: defaults.saleId,
        transferDate,
        recipient,
        origin: { ubigeo: origin.ubigeo ?? "", address: origin.address },
        destination: { ubigeo: destination.ubigeo ?? "", address: destination.address },
        transportMode: mode,
        carrier: mode === "01" ? carrier : null,
        vehicleM1L: mode === "02" && m1l,
        vehiclePlate: mode === "02" && !m1l ? plate : null,
        driver: mode === "02" && !m1l ? driver : null,
        weightKg: Number(weight.replace(",", ".")) || 0,
        packages: Math.floor(Number(packages) || 0),
        note,
      });
      if (!result.ok) return setError(result.message);
      router.push(`/admin/ventas-tienda/${defaults.saleId}#guias`);
    });

  const section = "space-y-4 rounded-2xl border border-line bg-surface p-4";
  return (
    <div className="max-w-3xl space-y-4">
      <section className={section}>
        <h2 className="font-semibold">Destinatario</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1.5fr)]">
          <SelectWrap>
            <select aria-label="Tipo de documento" value={recipient.documentType} onChange={(e) => setRecipient((r) => ({ ...r, documentType: e.target.value as DocType }))} className={selectClass}>
              {Object.entries(DOCUMENT_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </SelectWrap>
          <input aria-label="Número de documento" inputMode="numeric" value={recipient.documentNumber} onChange={(e) => setRecipient((r) => ({ ...r, documentNumber: e.target.value }))} placeholder="Número" className={inputClass} />
          <input aria-label="Nombre o razón social" value={recipient.name} onChange={(e) => setRecipient((r) => ({ ...r, name: e.target.value }))} placeholder="Nombre o razón social" className={inputClass} />
        </div>
      </section>

      <section className={section}>
        <h2 className="font-semibold">Traslado</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">Punto de partida</p>
            <DistrictPicker label="Distrito de partida" value={origin.ubigeo} onChange={(ubigeo) => setOrigin((o) => ({ ...o, ubigeo }))} />
            <input aria-label="Dirección de partida" value={origin.address} onChange={(e) => setOrigin((o) => ({ ...o, address: e.target.value }))} placeholder="Dirección" className={inputClass} />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Punto de llegada</p>
            <DistrictPicker label="Distrito de llegada" value={destination.ubigeo} onChange={(ubigeo) => setDestination((d) => ({ ...d, ubigeo }))} />
            <input aria-label="Dirección de llegada" value={destination.address} onChange={(e) => setDestination((d) => ({ ...d, address: e.target.value }))} placeholder="Dirección o agencia de destino" className={inputClass} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Fecha de traslado">{(a11y) => <input {...a11y} type="date" value={transferDate} min={defaults.today} onChange={(e) => setTransferDate(e.target.value)} className={cn(inputClass, "[color-scheme:dark]")} />}</Field>
          <Field label="Peso total (kg)" hint="Unos 0.5 kg por prenda.">
            {(a11y) => <input {...a11y} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} className={cn(inputClass, "tabular-nums")} />}
          </Field>
          <Field label="Bultos">{(a11y) => <input {...a11y} inputMode="numeric" value={packages} onChange={(e) => setPackages(e.target.value.replace(/\D/g, ""))} className={cn(inputClass, "tabular-nums")} />}</Field>
        </div>
      </section>

      <section className={section}>
        <h2 className="font-semibold">Cómo va</h2>
        <div role="radiogroup" className="flex flex-wrap gap-2">
          {(
            [
              ["01", "Agencia o empresa de transporte", "Shalom, Olva, una empresa con RUC (transporte público)."],
              ["02", "Transporte propio", "Lo lleva TWENTY: moto, auto o un vehículo con placa (privado)."],
            ] as const
          ).map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => setMode(value)}
              className={cn("min-w-[14rem] flex-1 rounded-xl border px-4 py-3 text-left text-sm", mode === value ? "border-white bg-white text-black" : "border-line hover:border-white/50")}
            >
              <span className="block font-semibold">{label}</span>
              <span className={cn("block text-xs", mode === value ? "text-black/60" : "text-muted")}>{hint}</span>
            </button>
          ))}
        </div>
        {mode === "01" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <input aria-label="RUC de la empresa de transporte" inputMode="numeric" value={carrier.ruc} onChange={(e) => setCarrier((c) => ({ ...c, ruc: e.target.value.replace(/\D/g, "") }))} placeholder="RUC (11 dígitos)" className={inputClass} />
            <input aria-label="Razón social de la empresa de transporte" value={carrier.name} onChange={(e) => setCarrier((c) => ({ ...c, name: e.target.value }))} placeholder="Razón social" className={inputClass} />
          </div>
        ) : (
          <div className="space-y-3">
            <Toggle name="m1l" checked={m1l} onChange={setM1l} label="Va en moto o auto (categoría L o M1)" hint="SUNAT no pide placa ni conductor." />
            {m1l ? null : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input aria-label="Placa" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="Placa (ABC123)" className={inputClass} />
                <input aria-label="DNI del conductor" inputMode="numeric" value={driver.documentNumber} onChange={(e) => setDriver((d) => ({ ...d, documentNumber: e.target.value.replace(/\D/g, "") }))} placeholder="DNI del conductor" className={inputClass} />
                <input aria-label="Nombres del conductor" value={driver.firstName} onChange={(e) => setDriver((d) => ({ ...d, firstName: e.target.value }))} placeholder="Nombres" className={inputClass} />
                <input aria-label="Apellidos del conductor" value={driver.lastName} onChange={(e) => setDriver((d) => ({ ...d, lastName: e.target.value }))} placeholder="Apellidos" className={inputClass} />
                <input aria-label="Licencia de conducir" value={driver.license} onChange={(e) => setDriver((d) => ({ ...d, license: e.target.value.toUpperCase() }))} placeholder="Licencia (Q12345678)" className={inputClass} />
              </div>
            )}
          </div>
        )}
      </section>

      <section className={section}>
        <h2 className="font-semibold">Prendas ({defaults.saleLabel})</h2>
        <ul className="divide-y divide-line text-sm">
          {defaults.items.map((i) => (
            <li key={i.sku} className="flex justify-between gap-3 py-2">
              <span>
                {i.description} <span className="font-mono text-xs text-subtle">{i.sku}</span>
              </span>
              <span className="tabular-nums">{i.quantity}</span>
            </li>
          ))}
        </ul>
        <Field label="Observaciones" optional>
          {(a11y) => <input {...a11y} value={note} onChange={(e) => setNote(e.target.value)} maxLength={250} className={inputClass} />}
        </Field>
      </section>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger/15 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <button type="button" onClick={submit} disabled={pending} className={cn(buttonClass("primary"), "h-12 px-6")}>
        {pending ? "Emitiendo…" : "Emitir guía de remisión"}
      </button>
    </div>
  );
}
