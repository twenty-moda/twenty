import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { parseInline, parseRichText, type Inline } from "@/lib/rich-text";

function renderInline(nodes: Inline[], keyPrefix = ""): ReactNode[] {
  return nodes.map((node, i) => {
    const key = `${keyPrefix}${i}`;
    switch (node.type) {
      case "text":
        return node.text;
      case "br":
        return <br key={key} />;
      case "strong":
        return (
          <strong key={key} className="font-semibold text-white">
            {renderInline(node.children, `${key}-`)}
          </strong>
        );
      case "em":
        return <em key={key}>{renderInline(node.children, `${key}-`)}</em>;
      case "link": {
        const children = renderInline(node.children, `${key}-`);
        const className = "font-medium text-white underline underline-offset-4 hover:text-muted";
        return node.href.startsWith("/") || node.href.startsWith("#") ? (
          <Link key={key} href={node.href} className={className}>
            {children}
          </Link>
        ) : (
          <a key={key} href={node.href} className={className} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        );
      }
    }
  });
}

/** Solo el formato de línea (negrita, cursiva, enlaces), para frases sueltas. */
export function RichInline({ source }: { source: string }) {
  return <>{renderInline(parseInline(source))}</>;
}

type RichTextProps = {
  source: string | null | undefined;
  /** Texto gris (respuestas de preguntas frecuentes). */
  muted?: boolean;
  /** Menos espacio entre párrafos. */
  compact?: boolean;
  /** Márgenes y tamaño de letra (el color y el espaciado van por `muted` y `compact`). */
  className?: string;
};

/** Muestra texto con formato simple (src/lib/rich-text.ts) con los estilos de la marca. */
export function RichText({ source, muted, compact, className }: RichTextProps) {
  const blocks = parseRichText(source);
  return (
    <div className={cn("leading-relaxed", compact ? "space-y-3" : "space-y-5", muted ? "text-muted" : "text-white/80", className)}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "h2":
            return (
              <h2 key={i} className="pt-4 text-xl font-extrabold tracking-tight text-white uppercase">
                {renderInline(block.children)}
              </h2>
            );
          case "h3":
            return (
              <h3 key={i} className="pt-2 text-lg font-bold text-white">
                {renderInline(block.children)}
              </h3>
            );
          case "quote":
            return (
              <blockquote key={i} className="border-l-2 border-white py-1 pl-4 text-white italic">
                {renderInline(block.children)}
              </blockquote>
            );
          case "ul":
          case "ol": {
            const List = block.type;
            return (
              <List key={i} className={cn("space-y-2 pl-5", block.type === "ul" ? "list-disc" : "list-decimal")}>
                {block.items.map((item, j) => (
                  <li key={j} className="pl-1 marker:text-subtle">
                    {renderInline(item)}
                  </li>
                ))}
              </List>
            );
          }
          default:
            return <p key={i}>{renderInline(block.children)}</p>;
        }
      })}
    </div>
  );
}
