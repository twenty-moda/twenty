/** Gastos de la tienda: motivos y comprobantes (listas fijas; en la BD van como texto). */

export const EXPENSE_CATEGORIES = {
  varios: "Varios",
  planilla: "Planilla / sueldo",
  adelanto: "Adelanto de sueldo",
  movilidad: "Movilidad",
  produccion: "Producción (estampado, confección)",
  mercaderia: "Mercadería",
  materiales: "Bolsas y materiales",
  envios: "Envíos y courier",
  servicios: "Servicios (luz, agua, internet)",
  alquiler: "Alquiler",
  publicidad: "Publicidad",
  limpieza: "Limpieza",
} as const;
export type ExpenseCategory = keyof typeof EXPENSE_CATEGORIES;
export const EXPENSE_CATEGORY_KEYS = Object.keys(EXPENSE_CATEGORIES) as [ExpenseCategory, ...ExpenseCategory[]];

export const EXPENSE_DOCUMENTS = {
  ninguno: "Sin comprobante",
  planilla: "Planilla",
  boleta: "Boleta",
  factura: "Factura",
  recibo: "Recibo por honorarios",
  ticket: "Ticket",
} as const;
export type ExpenseDocument = keyof typeof EXPENSE_DOCUMENTS;
export const EXPENSE_DOCUMENT_KEYS = Object.keys(EXPENSE_DOCUMENTS) as [ExpenseDocument, ...ExpenseDocument[]];

export const expenseCategoryLabel = (key: string) => EXPENSE_CATEGORIES[key as ExpenseCategory] ?? key;
export const expenseDocumentLabel = (key: string) => EXPENSE_DOCUMENTS[key as ExpenseDocument] ?? key;

/** Los gastos de siempre en la caja: un toque llena el motivo y el detalle. */
export const QUICK_EXPENSES: { label: string; category: ExpenseCategory; description: string }[] = [
  { label: "Movilidad", category: "movilidad", description: "Movilidad" },
  { label: "Adelanto", category: "adelanto", description: "Adelanto de " },
  { label: "Bolsas", category: "materiales", description: "Bolsas" },
  { label: "Envío", category: "envios", description: "Envío" },
];

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const limaMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit" });

/** "2026-11" de la URL o el mes de hoy en Lima; con su primer y último día ("2026-11-01" … "2026-11-30"). */
export function expenseMonth(value: unknown, now = new Date()) {
  const month = typeof value === "string" && MONTH.test(value) ? value : limaMonth.format(now).slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { month, from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/** Mes anterior o siguiente: "2026-01" − 1 = "2025-12". */
export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const monthName = new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", month: "long", year: "numeric" });
/** "noviembre de 2026". */
export const monthLabel = (month: string) => monthName.format(new Date(`${month}-15T12:00:00Z`));
