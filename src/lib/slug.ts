/** Minúsculas y sin tildes, para comparar textos al buscar ("Ángel" = "angel"). */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** "Baggy Ángel  T-20" → "baggy-angel-t-20" */
export function slugify(value: string): string {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** ¿Todas las palabras de la búsqueda aparecen en el texto? */
export function matchesAllWords(haystack: string, query: string): boolean {
  const text = normalizeText(haystack);
  return normalizeText(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word));
}
