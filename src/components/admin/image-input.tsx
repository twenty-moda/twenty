"use client";

import { ImagePlus } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { resizeForUpload } from "@/lib/resize-image";

type ImageInputProps = {
  name: string;
  label: string;
  current?: string | null;
  /** Ancho máximo al que se achica en el navegador antes de enviar. */
  maxSize?: number;
  aspect?: string;
};

/** Campo de imagen con vista previa. Achica la foto en el navegador y la deja lista en el <form>. */
export function ImageInput({ name, label, current, maxSize = 1600, aspect = "aspect-square" }: ImageInputProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <label className="block cursor-pointer">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <span className={cn("relative grid w-full max-w-48 place-items-center overflow-hidden rounded-xl border border-dashed border-line bg-raised hover:border-white/50", aspect)}>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
          <img src={preview} alt="" className="absolute inset-0 size-full object-cover" />
        ) : current ? (
          <Image src={current} alt="" fill sizes="192px" className="object-cover" />
        ) : (
          <ImagePlus className="size-6 text-muted" aria-hidden />
        )}
        {busy ? <span className="absolute inset-0 grid place-items-center bg-black/60 text-xs">Preparando…</span> : null}
      </span>
      <span className="mt-1 block text-xs text-muted">{current || preview ? "Toca para cambiarla" : "Toca para subir"}</span>
      <input
        type="file"
        name={name}
        accept="image/*"
        className="sr-only"
        onChange={async (e) => {
          const input = e.currentTarget;
          const file = input.files?.[0];
          if (!file) return;
          setBusy(true);
          const resized = await resizeForUpload(file, maxSize);
          const transfer = new DataTransfer();
          transfer.items.add(resized);
          input.files = transfer.files;
          setPreview(URL.createObjectURL(resized));
          setBusy(false);
        }}
      />
    </label>
  );
}
