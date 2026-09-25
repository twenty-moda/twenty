"use client";

import { MapPin, Package, Plus, Star, Trash2 } from "lucide-react";
import { useActionState, useCallback, useState, useTransition } from "react";
import { deleteAddressAction, saveAddressAction, setDefaultAddressAction } from "@/app/(store)/cuenta/actions";
import { ADDRESS_KINDS, addressSummary, type AddressKind } from "@/lib/account-forms";
import type { ActionState } from "@/lib/action-state";
import type { SavedAddress } from "@/server/services/accounts";
import { agencyLabel, COURIER_NAME, COURIERS, type Courier } from "@/lib/couriers";
import { AgencyPicker } from "../checkout/agency-picker";
import { DistrictSearch, type PickedDistrict } from "../checkout/district-search";
import { Field, inputClass, Segmented, SelectWrap, selectClass } from "../ui/form";
import { FormMessage, SubmitButton, TextField } from "../ui/form-feedback";
import { Sheet } from "../ui/sheet";

type LimaDistrict = { ubigeo: string; name: string };

export function AddressBook({ addresses, limaDistricts, max }: { addresses: SavedAddress[]; limaDistricts: LimaDistrict[]; max: number }) {
  const [editing, setEditing] = useState<SavedAddress | "new" | null>(null);
  const full = addresses.length >= max;

  return (
    <>
      {addresses.length ? (
        <ul className="space-y-3">
          {addresses.map((a) => (
            <AddressCard key={a.id} address={a} onEdit={() => setEditing(a)} />
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-line p-8 text-center">
          <MapPin className="mx-auto size-10 text-muted" aria-hidden />
          <h2 className="mt-4 text-lg font-bold">Sin direcciones guardadas</h2>
          <p className="mt-1 text-sm text-muted">Guarda tu casa, tu trabajo o la agencia donde recoges y elígelas con un toque al comprar.</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setEditing("new")}
        disabled={full}
        className="mt-4 flex h-13 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-bold tracking-wide text-black uppercase disabled:opacity-50"
      >
        <Plus className="size-4" aria-hidden /> Agregar dirección
      </button>
      {full ? <p className="mt-2 text-center text-xs text-muted">Puedes guardar hasta {max} direcciones.</p> : null}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Nueva dirección" : "Editar dirección"} side="bottom">
        {editing ? (
          <AddressForm key={editing === "new" ? "new" : editing.id} address={editing === "new" ? null : editing} limaDistricts={limaDistricts} onSaved={() => setEditing(null)} />
        ) : null}
      </Sheet>
    </>
  );
}

function AddressCard({ address, onEdit }: { address: SavedAddress; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const Icon = address.kind === "delivery" ? MapPin : Package;
  return (
    <li className="rounded-2xl border border-line p-4" aria-busy={pending}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-raised">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-bold">
            {address.label}
            {address.isDefault ? <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold tracking-wide text-black uppercase">Principal</span> : null}
          </p>
          <p className="mt-0.5 text-xs text-subtle">{ADDRESS_KINDS[address.kind].label}</p>
          <p className="mt-1 text-sm text-muted">{addressSummary(address)}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onEdit} className="min-h-10 rounded-full border border-line px-4 text-sm font-semibold">
          Editar
        </button>
        {!address.isDefault ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => setDefaultAddressAction(address.id))}
            className="flex min-h-10 items-center gap-1.5 rounded-full border border-line px-4 text-sm font-semibold"
          >
            <Star className="size-4" aria-hidden /> Usar como principal
          </button>
        ) : null}
        {confirming ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => deleteAddressAction(address.id))}
            className="flex min-h-10 items-center gap-1.5 rounded-full bg-danger/15 px-4 text-sm font-semibold text-danger"
          >
            <Trash2 className="size-4" aria-hidden /> Sí, borrar
          </button>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} aria-label={`Borrar ${address.label}`} className="grid size-10 place-items-center rounded-full border border-line text-muted">
            <Trash2 className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </li>
  );
}

const LABELS = ["Casa", "Trabajo", "Casa de mis papás"];

function AddressForm({ address, limaDistricts, onSaved }: { address: SavedAddress | null; limaDistricts: LimaDistrict[]; onSaved: () => void }) {
  const initial: ActionState = {
    status: "idle",
    values: { address: address?.address ?? "", reference: address?.reference ?? "", agencyName: address?.agencyName ?? "" },
  };
  const [state, action] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await saveAddressAction(address?.id ?? null, prev, fd);
    if (result.status === "success") onSaved();
    return result;
  }, initial);
  const [kind, setKind] = useState<AddressKind>(address?.kind ?? "delivery");
  const [label, setLabel] = useState(address?.label ?? "");
  const [limaUbigeo, setLimaUbigeo] = useState(address?.kind === "delivery" ? address.ubigeo : "");
  const [agencyDistrict, setAgencyDistrict] = useState<PickedDistrict | null>(
    address?.kind === "agency" ? { ubigeo: address.ubigeo, label: `${address.district}, ${address.province} - ${address.department}`, department: address.department } : null,
  );
  const errors = state.fieldErrors ?? {};
  // Agencia de Shalom u Olva: de la lista del courier (con su id). Sin lista, o una guardada antes a mano: se escribe.
  const [courier, setCourier] = useState<Courier>(address?.agencyCourier ?? "shalom");
  const [picked, setPicked] = useState({ id: address?.agencyId ?? "", name: address?.agencyName ?? "" });
  const [manualAgency, setManualAgency] = useState(address?.kind === "agency" && !address.agencyId);
  const [listDown, setListDown] = useState<Partial<Record<Courier, boolean>>>({});
  const markUnavailable = useCallback((c: Courier) => setListDown((d) => ({ ...d, [c]: true })), []);
  const useList = !listDown[courier] && !manualAgency;

  return (
    <form action={action} className="space-y-4 p-4" noValidate>
      <Segmented
        label="Tipo de dirección"
        value={kind}
        options={[
          { value: "delivery", label: ADDRESS_KINDS.delivery.short + " en Lima" },
          { value: "agency", label: "Agencia (provincia)" },
        ]}
        onChange={setKind}
      />
      <input type="hidden" name="kind" value={kind} />

      <Field label="Nombre" error={errors.label}>
        {(a11y) => <input {...a11y} name="label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder="Casa" className={inputClass} />}
      </Field>
      <div className="-mt-2 flex flex-wrap gap-2">
        {LABELS.map((l) => (
          <button key={l} type="button" onClick={() => setLabel(l)} className="min-h-9 rounded-full border border-line px-3 text-xs font-semibold text-muted">
            {l}
          </button>
        ))}
      </div>

      {kind === "delivery" ? (
        <>
          <Field label="Distrito" error={errors.ubigeo} hint="El delivery llega a Lima Metropolitana y Callao.">
            {(a11y) => (
              <SelectWrap>
                <select {...a11y} name="ubigeo" value={limaUbigeo} onChange={(e) => setLimaUbigeo(e.target.value)} className={selectClass}>
                  <option value="">Elige tu distrito</option>
                  {limaDistricts.map((d) => (
                    <option key={d.ubigeo} value={d.ubigeo}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </SelectWrap>
            )}
          </Field>
          <TextField label="Dirección" name="address" state={state} autoComplete="street-address" placeholder="Av. Larco 123, dpto 402" required />
          <TextField label="Referencia" name="reference" state={state} placeholder="Frente al parque" optional />
        </>
      ) : (
        <>
          <Segmented
            label="Courier"
            value={courier}
            options={COURIERS.map((c) => ({ value: c, label: COURIER_NAME[c] }))}
            onChange={(c) => {
              if (c === courier) return;
              setCourier(c);
              setPicked({ id: "", name: "" });
            }}
          />
          {useList ? (
            <>
              <Field label={`Agencia ${COURIER_NAME[courier]}`} error={errors.agencyName ?? errors.ubigeo}>
                {(a11y) => (
                  <AgencyPicker
                    key={courier}
                    courier={courier}
                    id={a11y.id}
                    invalid={a11y["aria-invalid"]}
                    describedBy={a11y["aria-describedby"]}
                    value={picked.id}
                    onUnavailable={markUnavailable}
                    onChange={(agency) => {
                      setPicked({ id: agency.id, name: agencyLabel(agency) });
                      setAgencyDistrict({ ubigeo: agency.ubigeo, label: `${agency.district}, ${agency.province} - ${agency.department}`, department: agency.department });
                      if (!label) setLabel(`${COURIER_NAME[courier]} ${agency.name}`.slice(0, 40));
                    }}
                  />
                )}
              </Field>
              <input type="hidden" name="ubigeo" value={picked.id ? (agencyDistrict?.ubigeo ?? "") : ""} />
              <input type="hidden" name="agencyName" value={picked.name} />
              <input type="hidden" name="agencyId" value={picked.id} />
              <input type="hidden" name="agencyCourier" value={picked.id ? courier : ""} />
            </>
          ) : (
            <>
              <Field label="Ciudad o distrito" error={errors.ubigeo}>
                {(a11y) => <DistrictSearch id={a11y.id} value={agencyDistrict} onChange={setAgencyDistrict} invalid={a11y["aria-invalid"]} describedBy={a11y["aria-describedby"]} />}
              </Field>
              <input type="hidden" name="ubigeo" value={agencyDistrict?.ubigeo ?? ""} />
              <TextField
                label={`Agencia ${COURIER_NAME[courier]} donde recoges`}
                name="agencyName"
                state={state}
                placeholder={`${COURIER_NAME[courier]} Av. Ejército`}
                hint="La agencia y su sede."
                required
              />
              {!listDown[courier] ? (
                <button type="button" onClick={() => setManualAgency(false)} className="min-h-10 text-sm font-semibold text-muted underline underline-offset-4">
                  Elegir la agencia de la lista de {COURIER_NAME[courier]}
                </button>
              ) : null}
            </>
          )}
        </>
      )}

      {!address?.isDefault ? (
        <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" name="isDefault" className="size-5 accent-white" /> Usar como principal
        </label>
      ) : null}

      <FormMessage state={state} />
      <SubmitButton pendingLabel="Guardando…">Guardar dirección</SubmitButton>
    </form>
  );
}
