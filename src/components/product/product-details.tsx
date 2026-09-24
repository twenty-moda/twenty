import { Plus } from "lucide-react";
import type { ReactNode } from "react";

function Item({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group smooth-details border-b border-line">
      <summary className="flex h-14 cursor-pointer list-none items-center justify-between text-sm font-semibold">
        {title}
        <Plus className="size-4 transition duration-300 group-open:rotate-45" aria-hidden />
      </summary>
      <div className="pb-5 text-sm leading-relaxed text-muted">{children}</div>
    </details>
  );
}

type ProductDetailsProps = {
  description: string | null;
  shipping: string[];
  returns: string[];
};

export function ProductDetails({ description, shipping, returns }: ProductDetailsProps) {
  return (
    <div className="border-t border-line">
      {description ? (
        <Item title="Descripción" open>
          <p className="whitespace-pre-line">{description}</p>
        </Item>
      ) : null}
      {shipping.length ? (
        <Item title="Envíos y recojo">
          <ul className="list-disc space-y-1.5 pl-4">
            {shipping.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Item>
      ) : null}
      {returns.length ? (
        <Item title="Cambios">
          <ul className="list-disc space-y-1.5 pl-4">
            {returns.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Item>
      ) : null}
    </div>
  );
}
