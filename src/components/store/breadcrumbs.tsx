import Link from "next/link";

export type Crumb = { href: string; label: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Ruta" className="text-xs text-muted">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((crumb, i) => (
          <li key={crumb.href} className="flex items-center gap-1.5">
            {i > 0 ? <span aria-hidden>/</span> : null}
            <Link href={crumb.href} className="hover:text-white">
              {crumb.label}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
