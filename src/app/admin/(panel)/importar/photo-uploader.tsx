"use client";

import { CheckCircle2, CircleAlert, Images, Loader2 } from "lucide-react";
import { useState } from "react";
import { parsePhotoName } from "@/lib/product-import";
import { resizeForUpload } from "@/lib/resize-image";
import { uploadSkuPhotoAction } from "./actions";

type Item = { name: string; state: "pending" | "uploading" | "ok" | "error"; message?: string };

/** Varias fotos nombradas con su SKU: se suben una por una y se asignan solas a su producto y color. */
export function SkuPhotoUploader() {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);

  const start = async (files: File[]) => {
    const list: Item[] = files.map((f) =>
      parsePhotoName(f.name) ? { name: f.name, state: "pending" } : { name: f.name, state: "error", message: "El nombre no empieza con un SKU" },
    );
    setItems(list);
    setBusy(true);
    for (const [i, file] of files.entries()) {
      if (list[i].state === "error") continue;
      setItems((xs) => xs.map((x, j) => (j === i ? { ...x, state: "uploading" } : x)));
      const fd = new FormData();
      fd.set("file", await resizeForUpload(file));
      fd.set("name", file.name);
      const result = await uploadSkuPhotoAction(fd).catch(() => ({ ok: false as const, message: "Error de conexión" }));
      setItems((xs) => xs.map((x, j) => (j === i ? { ...x, state: result.ok ? "ok" : "error", message: result.message } : x)));
    }
    setBusy(false);
  };

  const done = items.filter((i) => i.state === "ok").length;
  const failed = items.filter((i) => i.state === "error").length;

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line px-6 py-10 text-center hover:border-white/50">
        <Images className="size-8" aria-hidden />
        <span className="font-semibold">{busy ? "Subiendo fotos…" : "Elige las fotos (puedes elegir muchas)"}</span>
        <span className="text-sm text-muted">Nombradas con el SKU: TMW-0001.jpg, TMW-0001_02.jpg, TMW-0001_03.jpg…</span>
        <input type="file" accept="image/*" multiple disabled={busy} className="sr-only" onChange={(e) => e.target.files?.length && start([...e.target.files])} />
      </label>

      {items.length ? (
        <div className="rounded-xl border border-line">
          <p className="border-b border-line px-4 py-2 text-sm">
            {done} de {items.length} asignadas{failed ? <span className="text-danger"> · {failed} con problema</span> : null}
          </p>
          <ul className="max-h-80 divide-y divide-line overflow-y-auto text-sm">
            {items.map((item) => (
              <li key={item.name} className="flex items-center gap-3 px-4 py-2">
                {item.state === "ok" ? (
                  <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
                ) : item.state === "error" ? (
                  <CircleAlert className="size-4 shrink-0 text-danger" aria-hidden />
                ) : (
                  <Loader2 className={`size-4 shrink-0 text-muted ${item.state === "uploading" ? "animate-spin" : ""}`} aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{item.name}</span>
                <span className={`truncate text-xs ${item.state === "error" ? "text-danger" : "text-muted"}`}>{item.message ?? (item.state === "uploading" ? "Subiendo…" : "")}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
