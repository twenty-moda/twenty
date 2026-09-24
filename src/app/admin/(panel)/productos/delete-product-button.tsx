"use client";

import { Trash2 } from "lucide-react";
import { useTransition } from "react";
import { buttonClass } from "@/components/admin/ui";
import { deleteProductAction } from "./actions";

export function DeleteProductButton({ productId }: { productId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (window.confirm("¿Eliminar este producto? Se quita de la tienda.")) startTransition(() => deleteProductAction(productId));
      }}
      className={buttonClass("danger")}
    >
      <Trash2 className="size-4" aria-hidden /> {pending ? "Eliminando…" : "Eliminar producto"}
    </button>
  );
}
