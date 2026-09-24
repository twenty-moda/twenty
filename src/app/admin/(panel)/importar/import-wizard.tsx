"use client";

import { CheckCircle2, CircleAlert, FileSpreadsheet, Upload } from "lucide-react";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { Badge, buttonClass } from "@/components/admin/ui";
import { cn } from "@/lib/cn";
import type { ImportAction } from "@/server/services/product-import";
import { applyImportAction, previewImportAction, type ImportState } from "./actions";

const ACTION_LABEL: Record<ImportAction, { label: string; tone: "success" | "info" | "warning" | "neutral" }> = {
  "crear-producto": { label: "Producto nuevo", tone: "success" },
  "crear-variante": { label: "Variante nueva", tone: "info" },
  actualizar: { label: "Se actualiza", tone: "warning" },
  "sin-cambios": { label: "Sin cambios", tone: "neutral" },
};

export function ImportWizard() {
  const [preview, previewAction, previewing] = useActionState(previewImportAction, { status: "idle" } as ImportState);
  const [applied, applyAction, applying] = useActionState(applyImportAction, { status: "idle" } as ImportState);
  const previewButton = useRef<HTMLButtonElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [showUnchanged, setShowUnchanged] = useState(false);

  if (applied.status === "done") {
    const s = applied.plan.summary;
    return (
      <div className="rounded-2xl border border-success/40 bg-success/10 p-6">
        <CheckCircle2 className="size-8 text-success" aria-hidden />
        <h2 className="mt-3 text-lg font-bold">Carga lista</h2>
        <p className="mt-1 text-sm">
          {s.newProducts} productos nuevos, {s.newVariants} variantes nuevas y {s.updated} actualizadas. La tienda ya muestra los cambios.
          {s.skipped ? ` Se omitieron ${s.skipped} filas con errores.` : ""}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/admin/productos?vista=sin-fotos" className={buttonClass("primary")}>
            Ver productos sin fotos
          </Link>
          <button type="button" onClick={() => window.location.reload()} className={buttonClass("secondary")}>
            Subir otro archivo
          </button>
        </div>
      </div>
    );
  }

  const plan = preview.status === "preview" ? preview.plan : null;
  const visibleRows = plan?.rows.filter((r) => showUnchanged || r.action !== "sin-cambios") ?? [];
  const toApply = plan ? plan.summary.newVariants + plan.summary.updated : 0;

  return (
    // Un solo <form>: el archivo elegido sirve para la vista previa y para importar.
    <form className="space-y-5">
      <label
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-6 py-10 text-center transition hover:border-white/50",
          fileName ? "border-white/50 bg-raised" : "border-line",
        )}
      >
        <FileSpreadsheet className="size-8" aria-hidden />
        <span className="font-semibold">{fileName ?? "Elige tu archivo de Excel"}</span>
        <span className="text-sm text-muted">{fileName ? "Toca para cambiarlo" : "La plantilla nueva o la que usaban antes (.xlsx)"}</span>
        <input
          type="file"
          name="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => {
            setFileName(e.target.files?.[0]?.name ?? null);
            if (e.target.files?.length) e.currentTarget.form?.requestSubmit(previewButton.current);
          }}
        />
        <button ref={previewButton} type="submit" formAction={previewAction} className="sr-only" tabIndex={-1}>
          Ver vista previa
        </button>
      </label>

      {previewing ? <p className="text-sm text-muted">Leyendo el archivo…</p> : null}
      {preview.status === "error" ? (
        <p role="alert" className="flex items-center gap-2 rounded-xl bg-danger/15 px-4 py-3 text-sm text-danger">
          <CircleAlert className="size-4 shrink-0" aria-hidden /> {preview.message}
        </p>
      ) : null}
      {applied.status === "error" ? (
        <p role="alert" className="rounded-xl bg-danger/15 px-4 py-3 text-sm text-danger">
          {applied.message}
        </p>
      ) : null}

      {plan ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryTile label="Productos nuevos" value={plan.summary.newProducts} />
            <SummaryTile label="Variantes nuevas" value={plan.summary.newVariants} />
            <SummaryTile label="Se actualizan" value={plan.summary.updated} />
            <SummaryTile label="Filas con error" value={plan.summary.skipped} danger={plan.summary.skipped > 0} />
          </div>
          <p className="text-xs text-muted">Formato detectado: {plan.format === "legacy" ? "plantilla anterior (con Es Maestro / Atributos)" : "plantilla nueva"}.</p>

          {plan.newColors.length || plan.newSizes.length || plan.newFits.length ? (
            <p className="rounded-xl bg-info/15 px-4 py-3 text-sm">
              Se crearán: {[plan.newColors.length && `colores ${plan.newColors.join(", ")}`, plan.newSizes.length && `tallas ${plan.newSizes.join(", ")}`, plan.newFits.length && `fits ${plan.newFits.join(", ")}`]
                .filter(Boolean)
                .join(" · ")}
              . Revisa que estén bien escritos.
            </p>
          ) : null}

          {plan.issues.length ? (
            <details open className="rounded-xl border border-danger/40">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-danger">
                {plan.issues.length} {plan.issues.length === 1 ? "fila no se puede importar" : "filas no se pueden importar"} (se omitirán)
              </summary>
              <ul className="max-h-60 space-y-1 overflow-y-auto border-t border-danger/30 px-4 py-3 text-sm">
                {plan.issues.map((i) => (
                  <li key={`${i.row}-${i.message}`}>
                    <span className="font-mono text-muted">Fila {i.row}:</span> {i.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-line">
            <div className="flex items-center justify-between border-b border-line px-4 py-2 text-sm">
              <span className="text-muted">Vista previa</span>
              {plan.summary.unchanged ? (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={showUnchanged} onChange={(e) => setShowUnchanged(e.target.checked)} className="accent-white" />
                  Mostrar {plan.summary.unchanged} sin cambios
                </label>
              ) : null}
            </div>
            <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto text-sm">
              {visibleRows.slice(0, 300).map((r) => (
                <li key={r.row} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                  <span className="w-12 font-mono text-xs text-subtle">#{r.row}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{r.product}</span>
                    <span className="block text-xs text-muted">
                      {r.variant}
                      {r.changes.length ? ` · ${r.changes.join(" · ")}` : ""}
                    </span>
                  </span>
                  <Badge tone={ACTION_LABEL[r.action].tone}>{ACTION_LABEL[r.action].label}</Badge>
                </li>
              ))}
              {visibleRows.length === 0 ? <li className="px-4 py-6 text-center text-muted">Nada que cambiar.</li> : null}
            </ul>
          </div>

          <button type="submit" formAction={applyAction} disabled={applying || toApply === 0} className={buttonClass("primary")}>
            <Upload className="size-4" aria-hidden />
            {applying ? "Importando…" : toApply ? `Importar ${toApply} ${toApply === 1 ? "fila" : "filas"}` : "No hay cambios para importar"}
          </button>
        </div>
      ) : null}
    </form>
  );
}

function SummaryTile({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-3", danger ? "border-danger/40 bg-danger/10" : "border-line bg-surface")}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
