"use client";

import { ArrowLeft, ArrowRight, ChevronDown, ImagePlus, Trash2 } from "lucide-react";
import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { buttonClass } from "@/components/admin/ui";
import { cn } from "@/lib/cn";
import { FORMAT_HINT, IMAGE_SPECS, imageWarnings, specLabel } from "@/lib/image-specs";
import { readImageSize, resizeForUpload } from "@/lib/resize-image";
import { deletePhotoAction, movePhotoAction, setPhotoColorAction, uploadProductPhotoAction } from "./actions";

type Photo = { id: string; path: string; colorId: string | null };
type Color = { id: string; name: string };

/** `outfit`: fotos de un conjunto (sin colores: todas juntas, la primera es la principal). */
export function PhotoManager({ productId, photos, colors, outfit = false }: { productId: string; photos: Photo[]; colors: Color[]; outfit?: boolean }) {
  const knownColor = new Set(colors.map((c) => c.id));
  const groups: { color: Color | null; photos: Photo[] }[] = [
    ...colors.map((c) => ({ color: c, photos: photos.filter((p) => p.colorId === c.id) })),
    { color: null, photos: photos.filter((p) => !p.colorId || !knownColor.has(p.colorId)) },
  ];

  if (outfit) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-muted">
          Fotos del conjunto puesto (la primera es la principal). Las de cada prenda se toman de su ficha al elegir color. Tamaño ideal:{" "}
          {specLabel(IMAGE_SPECS.product)}. {FORMAT_HINT}
        </p>
        <PhotoGroup productId={productId} color={null} photos={photos} colors={[]} title="Fotos del conjunto" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Las fotos van por color: en la tienda, al elegir un color se muestran sus fotos. La primera de cada color es la principal. Tamaño ideal:{" "}
        {specLabel(IMAGE_SPECS.product)}. {FORMAT_HINT}
      </p>
      {groups.map((g) =>
        g.color || g.photos.length ? (
          <PhotoGroup key={g.color?.id ?? "general"} productId={productId} color={g.color} photos={g.photos} colors={colors} />
        ) : null,
      )}
    </div>
  );
}

function PhotoGroup({ productId, color, photos, colors, title }: { productId: string; color: Color | null; photos: Photo[]; colors: Color[]; title?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const upload = async (files: FileList) => {
    setError(null);
    setWarnings([]);
    const list = [...files];
    for (const [i, file] of list.entries()) {
      setProgress(`Subiendo ${i + 1} de ${list.length}…`);
      const fd = new FormData();
      const [size, resized] = await Promise.all([readImageSize(file), resizeForUpload(file)]);
      const fileWarnings = size ? imageWarnings(size, IMAGE_SPECS.product) : [];
      if (fileWarnings.length) setWarnings((ws) => [...ws, `${file.name}: ${fileWarnings.join(" ")}`]);
      fd.set("file", resized);
      const result = await uploadProductPhotoAction(productId, color?.id ?? null, fd);
      if (result.status === "error") setError(`${file.name}: ${result.message}`);
    }
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-semibold">
          {title ?? (color ? color.name : "Sin color asignado")} <span className="text-sm font-normal text-muted">· {photos.length} {photos.length === 1 ? "foto" : "fotos"}</span>
        </h3>
        <input ref={inputRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => e.target.files?.length && upload(e.target.files)} id={`upload-${color?.id ?? "general"}`} />
        <label htmlFor={`upload-${color?.id ?? "general"}`} className={cn(buttonClass("secondary", "sm"), "cursor-pointer", progress && "pointer-events-none opacity-60")}>
          <ImagePlus className="size-4" aria-hidden /> {progress ?? "Subir fotos"}
        </label>
      </div>
      {error ? <p className="mb-2 text-sm text-danger">{error}</p> : null}
      {warnings.map((w) => (
        <p key={w} role="status" className="mb-2 text-xs text-warning">
          {w}
        </p>
      ))}
      {photos.length ? (
        <ul className={cn("grid grid-cols-2 gap-2 min-[400px]:grid-cols-3 sm:grid-cols-4 lg:grid-cols-6", pending && "opacity-60")}>
          {photos.map((p, i) => (
            <li key={p.id} className="group relative overflow-hidden rounded-lg border border-line bg-raised">
              <div className="relative aspect-3/4">
                <Image src={p.path} alt="" fill sizes="160px" className="object-cover" />
                {i === 0 && (color || title) ? <span className="absolute top-1 left-1 rounded bg-white px-1.5 py-0.5 text-[11px] font-bold text-black">Principal</span> : null}
              </div>
              <div className="flex items-center gap-0.5 p-1">
                <button type="button" aria-label="Mover antes" disabled={i === 0} onClick={() => startTransition(() => movePhotoAction(p.id, -1))} className="grid h-10 min-w-0 flex-1 place-items-center rounded-md hover:bg-surface disabled:opacity-30">
                  <ArrowLeft className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Mover después"
                  disabled={i === photos.length - 1}
                  onClick={() => startTransition(() => movePhotoAction(p.id, 1))}
                  className="grid h-10 min-w-0 flex-1 place-items-center rounded-md hover:bg-surface disabled:opacity-30"
                >
                  <ArrowRight className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Eliminar foto"
                  onClick={() => {
                    if (window.confirm("¿Eliminar esta foto?")) startTransition(() => deletePhotoAction(p.id));
                  }}
                  className="grid h-10 min-w-0 flex-1 place-items-center rounded-md hover:bg-surface text-subtle hover:text-danger"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
              {colors.length ? (
                <div className="relative border-t border-line">
                  <select
                    aria-label="Color de la foto"
                    value={p.colorId ?? ""}
                    onChange={(e) => startTransition(() => setPhotoColorAction(p.id, e.target.value || null))}
                    className="h-10 w-full appearance-none bg-surface pr-7 pl-2.5 text-xs outline-none focus-visible:bg-raised"
                  >
                    <option value="">Sin color</option>
                    {colors.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted" />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line py-8 text-sm text-muted hover:border-white/40"
        >
          <ImagePlus className="size-6" aria-hidden />
          Sube las fotos de {color?.name ?? (title ? "este conjunto" : "este producto")}
        </button>
      )}
    </section>
  );
}
