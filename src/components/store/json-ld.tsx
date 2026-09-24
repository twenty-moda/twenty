/** Datos estructurados (schema.org) para Google. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // El JSON se escapa para que un "</script>" en los datos no cierre la etiqueta.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
