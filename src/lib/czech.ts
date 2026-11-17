/** Czech language helpers. */

/** Czech vocative of a first name (good enough for common names). */
export function vocative(firstName: string): string {
  const n = firstName.trim();
  if (!n) return n;
  const lower = n.toLowerCase();
  if (/(a)$/.test(lower)) return n.slice(0, -1) + "o";
  if (/(e|i|y|o|u|í|é|ě)$/.test(lower)) return n;
  if (/el$/.test(lower)) return n.slice(0, -2) + "le";
  if (/[^aeiouyáéíóúůý]r$/.test(lower)) return n.slice(0, -1) + "ře";
  if (/ek$/.test(lower)) return n.slice(0, -2) + "ku";
  if (/k$/.test(lower)) return n + "u";
  if (/(š|ž|č|ř|j|c|x)$/.test(lower)) return n + "i";
  return n + "e";
}
