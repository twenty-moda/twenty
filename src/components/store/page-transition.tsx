import { ViewTransition, type ReactNode } from "react";

/**
 * Transición entre páginas (View Transitions): la página que sale se desvanece y la que entra sube un poco.
 * Solo en navegaciones (enter/exit), nunca al actualizar algo dentro de la misma página (default="none").
 * Los estilos están en globals.css (.page-enter / .page-exit). Se usa desde los template.tsx de la tienda.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
