/**
 * Lectura de la planilla de carga masiva de productos. Acepta:
 * - la plantilla nueva (una fila por variante: Producto, Categoría, Fit, Color, Talla, SKU, Precio…), y
 * - la plantilla de la plataforma anterior (con "Es Maestro", "Agrupador", "Atributos" / "Valores").
 * Solo interpreta y valida filas: qué se crea o actualiza lo decide el servidor contra la BD.
 */
import { compareSizes } from "./sizes";
import { normalizeText } from "./slug";

export const TEMPLATE_COLUMNS = [
  "Producto",
  "Categoría",
  "Fit",
  "Color",
  "Talla",
  "SKU",
  "Precio",
  "Precio antes",
  "Stock",
  "Descripción",
  "Visible",
] as const;

export type ImportRow = {
  /** Número de fila en Excel (la cabecera es la 1). */
  row: number;
  product: string;
  category: string;
  fit: string | null;
  color: string;
  size: string;
  /** Vacío = se genera uno nuevo al importar. */
  sku: string;
  priceCents: number;
  compareAtCents: number | null;
  stock: number;
  description: string | null;
  visible: boolean;
};

export type ImportIssue = { row: number; message: string };
export type ParsedSheet = { format: "twenty" | "legacy"; rows: ImportRow[]; issues: ImportIssue[] };

type Cell = unknown;

const key = (v: Cell) => normalizeText(String(v ?? "")).replace(/[^a-z0-9]+/g, " ").trim();
const text = (v: Cell) => (v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").trim());
const capitalize = (s: string) => s.replace(/\s+/g, " ").trim().replace(/(^|[\s/-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase("es"));

/** "S/ 70", "70,50", 70 → céntimos. null si está vacío o no es un número. */
export function parseMoney(v: Cell): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) : null;
  const cleaned = String(v).replace(/s\/\.?/i, "").replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function parseInteger(v: Cell): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, ""));
  return Number.isInteger(n) ? n : null;
}

/** "sí", "si", "x", "1", true → true; "no", "0", false → false; vacío → valor por defecto. */
function parseBool(v: Cell, fallback: boolean): boolean {
  if (v === null || v === undefined || v === "") return fallback;
  if (typeof v === "boolean") return v;
  const k = key(v);
  if (["si", "s", "yes", "true", "1", "x", "visible"].includes(k)) return true;
  if (["no", "n", "false", "0", "oculto"].includes(k)) return false;
  return fallback;
}

function columnIndex(header: readonly Cell[], ...names: string[]): number {
  const keys = header.map(key);
  for (const name of names) {
    const i = keys.indexOf(key(name));
    if (i >= 0) return i;
  }
  return -1;
}

export function parseProductSheet(sheet: readonly (readonly Cell[])[]): ParsedSheet {
  const headerIndex = sheet.findIndex((r) => r.some((c) => text(c)));
  if (headerIndex < 0) return { format: "twenty", rows: [], issues: [{ row: 1, message: "La hoja está vacía." }] };
  const header = sheet[headerIndex];
  const legacy = columnIndex(header, "Es Maestro", "Atributos") >= 0;
  return legacy ? parseLegacy(sheet, headerIndex) : parseTwenty(sheet, headerIndex);
}

function finalizeRow(draft: Omit<ImportRow, "priceCents" | "compareAtCents"> & { price: number | null; compareAt: number | null }, issues: ImportIssue[]): ImportRow | null {
  const missing = [
    !draft.product && "Producto",
    !draft.category && "Categoría",
    !draft.color && "Color",
    !draft.size && "Talla",
    draft.price === null && "Precio",
  ].filter(Boolean);
  if (missing.length) {
    issues.push({ row: draft.row, message: `Falta: ${missing.join(", ")}.` });
    return null;
  }
  if (draft.price! <= 0) {
    issues.push({ row: draft.row, message: "El precio debe ser mayor que 0." });
    return null;
  }
  if (draft.stock < 0) {
    issues.push({ row: draft.row, message: "El stock no puede ser negativo." });
    return null;
  }
  const { price, compareAt, ...rest } = draft;
  return { ...rest, priceCents: price!, compareAtCents: compareAt !== null && compareAt > price! ? compareAt : null };
}

function parseTwenty(sheet: readonly (readonly Cell[])[], headerIndex: number): ParsedSheet {
  const header = sheet[headerIndex];
  const col = {
    product: columnIndex(header, "Producto", "Nombre del producto", "Nombre"),
    category: columnIndex(header, "Categoría", "Categoria"),
    fit: columnIndex(header, "Fit", "Corte", "Subcategoría"),
    color: columnIndex(header, "Color"),
    size: columnIndex(header, "Talla"),
    sku: columnIndex(header, "SKU", "Código"),
    price: columnIndex(header, "Precio"),
    compareAt: columnIndex(header, "Precio antes", "Precio anterior", "Precio tachado"),
    stock: columnIndex(header, "Stock", "Cantidad"),
    description: columnIndex(header, "Descripción", "Descripcion"),
    visible: columnIndex(header, "Visible", "Publicado"),
  };
  const issues: ImportIssue[] = [];
  const missingColumns = (["product", "category", "color", "size", "price"] as const).filter((k) => col[k] < 0);
  if (missingColumns.length) {
    const names = { product: "Producto", category: "Categoría", color: "Color", size: "Talla", price: "Precio" };
    return { format: "twenty", rows: [], issues: [{ row: headerIndex + 1, message: `Faltan columnas: ${missingColumns.map((k) => names[k]).join(", ")}.` }] };
  }
  const get = (r: readonly Cell[], i: number) => (i >= 0 ? r[i] : null);
  const rows: ImportRow[] = [];
  sheet.slice(headerIndex + 1).forEach((r, i) => {
    if (!r.some((c) => text(c))) return;
    const rowNumber = headerIndex + 2 + i;
    const row = finalizeRow(
      {
        row: rowNumber,
        product: text(get(r, col.product)),
        category: text(get(r, col.category)),
        fit: text(get(r, col.fit)) || null,
        color: capitalize(text(get(r, col.color))),
        size: text(get(r, col.size)).toUpperCase(),
        sku: text(get(r, col.sku)).toUpperCase(),
        price: parseMoney(get(r, col.price)),
        compareAt: parseMoney(get(r, col.compareAt)),
        stock: parseInteger(get(r, col.stock)) ?? 0,
        description: text(get(r, col.description)) || null,
        visible: parseBool(get(r, col.visible), true),
      },
      issues,
    );
    if (row) rows.push(row);
  });
  return { format: "twenty", rows: dedupe(rows, issues), issues };
}

/** Plantilla anterior: filas "maestro" (ficha del producto) + filas de variante con Atributos/Valores. */
function parseLegacy(sheet: readonly (readonly Cell[])[], headerIndex: number): ParsedSheet {
  const header = sheet[headerIndex];
  const col = {
    sku: columnIndex(header, "SKU"),
    name: columnIndex(header, "Nombre del producto"),
    category: columnIndex(header, "Categoría", "Categoria"),
    fit: columnIndex(header, "Subcategoría", "Subcategoria"),
    price: columnIndex(header, "Precio"),
    discount: columnIndex(header, "Precio Descuento"),
    description: columnIndex(header, "Descripción", "Descripcion"),
    stock: columnIndex(header, "Stock"),
    visible: columnIndex(header, "Visible"),
    master: columnIndex(header, "Es Maestro"),
    attributes: columnIndex(header, "Atributos"),
    values: columnIndex(header, "Valores"),
  };
  const get = (r: readonly Cell[], i: number) => (i >= 0 ? r[i] : null);
  const issues: ImportIssue[] = [];
  const descriptions = new Map<string, string>();
  const drafts: ImportRow[] = [];

  sheet.slice(headerIndex + 1).forEach((r, i) => {
    if (!r.some((c) => text(c))) return;
    const rowNumber = headerIndex + 2 + i;
    const name = text(get(r, col.name));
    const [base, nameColor, nameSize] = name.split(/\s+-\s+/);
    const product = text(base);
    const description = text(get(r, col.description)) || null;
    if (parseBool(get(r, col.master), false)) {
      if (description) descriptions.set(key(product), description);
      return;
    }
    const attrNames = text(get(r, col.attributes)).split(",").map(key);
    const attrValues = text(get(r, col.values)).split(",").map((v) => v.trim());
    const attr = (n: string) => attrValues[attrNames.indexOf(n)] ?? "";
    const list = parseMoney(get(r, col.price));
    const discounted = parseMoney(get(r, col.discount));
    const useDiscount = discounted !== null && list !== null && discounted > 0 && discounted < list;
    const row = finalizeRow(
      {
        row: rowNumber,
        product,
        category: text(get(r, col.category)),
        fit: text(get(r, col.fit)) || null,
        color: capitalize(attr("color") || text(nameColor)),
        size: (attr("talla") || text(nameSize)).toUpperCase(),
        sku: text(get(r, col.sku)).toUpperCase(),
        price: useDiscount ? discounted : list,
        compareAt: useDiscount ? list : null,
        stock: parseInteger(get(r, col.stock)) ?? 0,
        description,
        visible: parseBool(get(r, col.visible), true),
      },
      issues,
    );
    if (row) drafts.push(row);
  });

  for (const row of drafts) row.description ??= descriptions.get(key(row.product)) ?? null;
  return { format: "legacy", rows: dedupe(drafts, issues), issues };
}

/** Un SKU o una combinación producto + color + talla solo puede aparecer una vez. */
function dedupe(rows: ImportRow[], issues: ImportIssue[]): ImportRow[] {
  const skus = new Map<string, number>();
  const options = new Map<string, number>();
  const out: ImportRow[] = [];
  for (const row of rows) {
    const optionKey = `${key(row.product)}|${key(row.color)}|${row.size}`;
    if (row.sku && skus.has(row.sku)) {
      issues.push({ row: row.row, message: `El SKU ${row.sku} ya está en la fila ${skus.get(row.sku)}.` });
      continue;
    }
    if (options.has(optionKey)) {
      issues.push({ row: row.row, message: `${row.product} ${row.color} talla ${row.size} ya está en la fila ${options.get(optionKey)}.` });
      continue;
    }
    if (row.sku) skus.set(row.sku, row.row);
    options.set(optionKey, row.row);
    out.push(row);
  }
  return out.sort((a, b) => a.row - b.row || compareSizes(a.size, b.size));
}

/** "TMW-0001.webp" → foto 0 del SKU TMW-0001; "TMW-0001_02.jpg" → foto 2. */
export function parsePhotoName(filename: string): { sku: string; position: number } | null {
  const match = filename.trim().match(/^([a-z]+-\d+)(?:[_\s-](\d{1,2}))?(?:\s*\(\d+\))?\.(webp|jpe?g|png|avif)$/i);
  if (!match) return null;
  return { sku: match[1].toUpperCase(), position: match[2] ? Number(match[2]) : 0 };
}

/** Filas de ejemplo para la plantilla que se descarga desde el admin. */
export const TEMPLATE_EXAMPLE: (string | number)[][] = [
  ["Baggy Ángel", "Pantalones", "Baggy Jean", "Celeste", "28", "TMW-0001", 99, "", 5, "Material: Jean Rígido", "sí"],
  ["Baggy Ángel", "Pantalones", "Baggy Jean", "Celeste", "30", "TMW-0002", 99, "", 3, "", "sí"],
  ["Polo Slim Fit", "Polos", "Slim Fit", "Negro", "M", "", 30, 40, 10, "Algodón", "sí"],
];
