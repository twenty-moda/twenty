"use client";

import { ImagePlus } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { FORMAT_HINT, imageWarnings, specLabel, type ImageSpec } from "@/lib/image-specs";
import { readImageSize, resizeForUpload } from "@/lib/resize-image";

type ImageInputProps = {
  name: string;
  label: string;
  current?: string | null;
  /** Medida recomendada (ver IMAGE_SPECS): se muestra debajo y avisa si la foto elegida es chica o de otra forma. */
  spec: ImageSpec;
  /** Ancho máximo al que se achica en el navegador antes de enviar. */
  maxSize?: number;
  aspect?: string;
};

/** Campo de imagen con vista previa. Achica la foto en el navegador y la deja lista en el <form>. */
export function ImageInput({ name, label, current, spec, maxSize = 1600, aspect = "aspect-square" }: ImageInputProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  return (
    <label className="block max-w-56 cursor-pointer">
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
      <span className="mt-1 block text-xs text-subtle">
        Ideal: {specLabel(spec)}. {spec.note ? `${spec.note} ` : ""}
        {FORMAT_HINT}
      </span>
      {warnings.map((w) => (
        <span key={w} role="status" className="mt-1 block text-xs text-warning">
          {w}
        </span>
      ))}
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
          const [size, resized] = await Promise.all([readImageSize(file), resizeForUpload(file, maxSize)]);
          setWarnings(size ? imageWarnings(size, spec) : []);
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
