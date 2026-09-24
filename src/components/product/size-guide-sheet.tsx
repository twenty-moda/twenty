"use client";

import { cn } from "@/lib/cn";
import { parseSizeGuide } from "@/lib/size-guide";
import { Sheet } from "../ui/sheet";

type SizeGuideSheetProps = {
  open: boolean;
  onClose: () => void;
  text: string;
  /** Talla elegida, para resaltar su fila. */
  selectedSize?: string | null;
};

export function SizeGuideSheet({ open, onClose, text, selectedSize }: SizeGuideSheetProps) {
  const table = parseSizeGuide(text);
  return (
    <Sheet open={open} onClose={onClose} side="bottom" title="Guía de tallas">
      <div className="px-4 py-5">
        {table ? (
          <>
            {table.title ? <p className="text-sm font-semibold">{table.title}</p> : null}
            {table.notes.map((note) => (
              <p key={note} className="mt-2 rounded-lg bg-warning/15 px-3 py-2 text-sm text-warning">
                {note}
              </p>
            ))}
            <p className="mt-2 text-xs text-muted">Medidas de la prenda, en centímetros.</p>
            <div className="-mx-4 mt-4 overflow-x-auto px-4">
              <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="text-left text-xs tracking-wide text-muted uppercase">
                    <th scope="col" className="sticky left-0 bg-surface py-2 pr-4 font-semibold">
                      Talla
                    </th>
                    {table.columns.map((c) => (
                      <th key={c.key} scope="col" className="px-3 py-2 font-semibold">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, i) => {
                    const selected = row.size === selectedSize;
                    return (
                      <tr key={`${row.size}-${i}`} className={cn(selected && "bg-white text-black")}>
                        <th scope="row" className={cn("sticky left-0 border-t border-line py-3 pr-4 text-left font-semibold", selected ? "bg-white" : "bg-surface")}>
                          {row.label}
                        </th>
                        {table.columns.map((c) => (
                          <td key={c.key} className="border-t border-line px-3 py-3 tabular-nums">
                            {row.values[c.key] ?? "—"}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-sm whitespace-pre-line">{text}</p>
        )}
      </div>
    </Sheet>
  );
}
