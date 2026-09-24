import { compareSizes } from "./sizes";
import { slugify } from "./slug";

export type SizeGuideTable = {
  title: string | null;
  notes: string[];
  columns: { key: string; label: string }[];
  rows: { size: string; label: string; values: Record<string, string> }[];
};

const SIZE_HEADER = /^talla\s+([a-z0-9]+)(.*)$/i;
const MEASURE = /^([a-záéíóúñ][a-záéíóúñ\s-]*?)\s*(?::\s*|\s+(?=\d))(.+)$/i;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

function normalizeValue(raw: string): string {
  const value = raw.replace(/\*/g, "").trim();
  if (/^\d+([.,]\d+)?$/.test(value)) return `${value} cm`;
  return value.replace(/(\d)\s*cm\b/gi, "$1 cm").replace(/^el[aá]stico$/i, "Elástico");
}

/**
 * Convierte el texto libre de medidas ("TALLA 28 / Cintura: 80 cm / …") en una tabla.
 * Devuelve null si no reconoce al menos una talla con medidas: en ese caso se muestra el texto tal cual.
 */
export function parseSizeGuide(text: string | null | undefined): SizeGuideTable | null {
  if (!text) return null;
  const table: SizeGuideTable = { title: null, notes: [], columns: [], rows: [] };
  let current: SizeGuideTable["rows"][number] | null = null;

  const addMeasure = (line: string) => {
    const match = line.match(MEASURE);
    if (!match || !current) return false;
    const label = capitalize(match[1].replace(/\s*-\s*/g, "-").trim());
    const key = slugify(label);
    if (!table.columns.some((c) => c.key === key)) table.columns.push({ key, label });
    current.values[key] = normalizeValue(match[2]);
    return true;
  };

  // "CAMISA BOXY BASICO: TALLA S" → título + encabezado de talla en líneas separadas.
  const lines = text.split("\n").flatMap((raw) => {
    const line = raw.trim();
    const at = line.search(/\btalla\s+[a-z0-9]/i);
    return at > 0 ? [line.slice(0, at).replace(/[:\s]+$/, ""), line.slice(at)] : [line];
  });

  for (const line of lines) {
    if (!line) continue;
    // "TALLA M: Largo: 69 cm" → encabezado "TALLA M" + primera medida "Largo: 69 cm".
    const colon = line.indexOf(":");
    const head = colon >= 0 ? line.slice(0, colon) : line;
    const rest = colon >= 0 ? line.slice(colon + 1).trim() : "";
    const header = head.match(SIZE_HEADER);
    if (header) {
      const [, size, extra] = header;
      current = { size: size.toUpperCase(), label: `${size.toUpperCase()}${extra.trim() ? ` ${extra.trim()}` : ""}`, values: {} };
      table.rows.push(current);
      if (rest) addMeasure(rest);
      continue;
    }
    if (current) {
      addMeasure(line);
    } else if (!table.title) {
      table.title = line.replace(/:$/, "");
    } else {
      table.notes.push(line.replace(/\*/g, "").replace(/^ojo:\s*/i, ""));
    }
  }

  table.rows = table.rows.filter((r) => Object.keys(r.values).length > 0).sort((a, b) => compareSizes(a.size, b.size));
  return table.rows.length ? table : null;
}
