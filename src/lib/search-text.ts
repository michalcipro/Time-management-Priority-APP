/**
 * Diacritics-insensitive search helpers. `searchText` columns store a normalized
 * concatenation of the searchable fields; queries are normalized the same way and
 * matched with ILIKE (backed by a pg_trgm GIN index).
 */

export function normalizeForSearch(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function buildSearchText(...parts: (string | null | undefined | string[])[]): string {
  const flat = parts.flatMap((p) => (Array.isArray(p) ? p : [p]));
  return normalizeForSearch(flat.filter(Boolean).join(" ")).slice(0, 20_000);
}

/** Split a user query into normalized terms (max 6, each ≥ 2 chars). */
export function searchTerms(query: string): string[] {
  return normalizeForSearch(query)
    .split(" ")
    .map((t) => t.replace(/[%_\\]/g, ""))
    .filter((t) => t.length >= 2)
    .slice(0, 6);
}
