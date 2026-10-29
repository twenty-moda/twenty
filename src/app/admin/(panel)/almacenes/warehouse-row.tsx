"use client";

import { Globe } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { FormAlert, SubmitButton } from "@/components/admin/form-controls";
import { Badge } from "@/components/admin/ui";
import { fieldClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { formatUnits } from "@/lib/inventory";
import { idle } from "../../_lib/action-state";
import { saveWarehouseAction } from "./actions";

type Warehouse = { id: string; name: string; code: string; address: string | null; sellsOnline: boolean; isActive: boolean; units: number; variants: number };

const input = (extra: string) => cn(fieldClass, "h-11 bg-raised px-4 text-base pointer-fine:text-sm", extra);

export function WarehouseRow({ warehouse }: { warehouse: Warehouse }) {
  const [state, action] = useActionState(saveWarehouseAction.bind(null, warehouse.id), idle);
  return (
    <li className={cn("py-4", !warehouse.isActive && "opacity-60")}>
      <form action={action} className="flex flex-wrap items-center gap-3">
        <input name="name" defaultValue={warehouse.name} aria-label="Nombre" className={input("min-w-44 flex-1")} />
        <input name="code" defaultValue={warehouse.code} aria-label="Código" title="Código corto" className={input("w-24 font-mono uppercase")} />
        <input name="address" defaultValue={warehouse.address ?? ""} placeholder="Dirección" aria-label="Dirección" className={input("min-w-56 flex-[2]")} />
        {warehouse.sellsOnline ? (
          <>
            <input type="hidden" name="isActive" value="on" />
            <Badge tone="info">
              <Globe className="mr-1 size-3.5" aria-hidden /> Vende en la web
            </Badge>
          </>
        ) : (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isActive" defaultChecked={warehouse.isActive} className="size-5 accent-white" /> Activo
          </label>
        )}
        <Link href={`/admin/movimientos?vista=kardex&almacen=${warehouse.id}`} className="text-xs text-muted tabular-nums hover:text-white hover:underline">
          {formatUnits(warehouse.units)} · {warehouse.variants} {warehouse.variants === 1 ? "prenda" : "prendas"}
        </Link>
        <SubmitButton variant="secondary" className="h-9 px-4 text-xs">
          Guardar
        </SubmitButton>
      </form>
      <div className="mt-2 empty:hidden">
        <FormAlert state={state} />
      </div>
    </li>
  );
}

export function NewWarehouseForm() {
  const [state, action] = useActionState(saveWarehouseAction.bind(null, null), idle);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input name="name" placeholder="Nombre (ej. Depósito San Juan de Miraflores)" aria-label="Nombre" className={input("min-w-56 flex-1")} />
      <input name="code" placeholder="Código (SJM)" aria-label="Código" className={input("w-32 font-mono uppercase")} />
      <input name="address" placeholder="Dirección" aria-label="Dirección" className={input("min-w-56 flex-[2]")} />
      <SubmitButton variant="primary" className="h-11">
        Agregar
      </SubmitButton>
      <div className="basis-full empty:hidden">
        <FormAlert state={state} />
      </div>
    </form>
  );
}
