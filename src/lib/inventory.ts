/** Nombres de las operaciones y movimientos del inventario (los usan el panel y los reportes). */

export const OPERATION_KINDS = ["ingreso", "traslado", "salida"] as const;
export type OperationKind = (typeof OPERATION_KINDS)[number];

export const OPERATION_LABEL: Record<OperationKind, string> = {
  ingreso: "Ingreso de mercadería",
  traslado: "Traslado",
  salida: "Salida",
};

/** Por qué sale mercadería sin venderse. */
export const EXIT_REASONS = ["devolucion_proveedor", "ajuste"] as const;
export type ExitReason = (typeof EXIT_REASONS)[number];

export const EXIT_REASON_LABEL: Record<ExitReason, string> = {
  devolucion_proveedor: "Devolución a proveedor o taller",
  ajuste: "Merma, pérdida o ajuste",
};

export const MOVEMENT_TYPES = [
  "inicial",
  "ingreso",
  "venta_web",
  "anulacion_web",
  "venta_tienda",
  "anulacion_tienda",
  "traslado_salida",
  "traslado_entrada",
  "ajuste",
  "conteo",
  "devolucion_proveedor",
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  inicial: "Stock inicial",
  ingreso: "Ingreso",
  venta_web: "Venta web",
  anulacion_web: "Anulación web",
  venta_tienda: "Venta en tienda",
  anulacion_tienda: "Anulación en tienda",
  traslado_salida: "Traslado (sale)",
  traslado_entrada: "Traslado (entra)",
  ajuste: "Ajuste",
  conteo: "Conteo",
  devolucion_proveedor: "Devolución a proveedor",
};

export const formatUnits = (n: number) => `${n} ${Math.abs(n) === 1 ? "unidad" : "unidades"}`;
