"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { FormAlert } from "@/components/admin/form-controls";
import { buttonClass } from "@/components/admin/ui";
import { idle, type ActionState } from "../../_lib/action-state";
import { deleteProductAction } from "./actions";

export function DeleteProductButton({ productId }: { productId: string }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActionState>(idle);
  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (window.confirm("¿Eliminar este producto? Se quita de la tienda.")) startTransition(async () => setState(await deleteProductAction(productId)));
        }}
        className={buttonClass("danger")}
      >
        <Trash2 className="size-4" aria-hidden /> {pending ? "Eliminando…" : "Eliminar producto"}
      </button>
      <FormAlert state={state} />
    </div>
  );
}
