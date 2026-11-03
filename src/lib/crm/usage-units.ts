/**
 * AI consumption records are entered by hand (no provider API is connected), so the unit must be unambiguous:
 * "credits", "créditos" and "Credits" are one unit, never three parallel series. Unknown units are kept verbatim.
 * Nothing here estimates or converts between units (tokens are never turned into USD).
 */
const UNITS: [RegExp, string][] = [
  [/^tokens?$/, "tokens"],
  [/^(cr[eé]ditos?|credits?)$/, "créditos"],
  [/^(generaci[oó]n(es)?|generations?)$/, "generaciones"],
  [/^(usd|us\$|\$|d[oó]lares?( usd)?|dollars?)$/, "USD"],
  [/^(%|%\s*(de\s*)?cuota|cuota(\s*%)?|quota(\s*%)?|porcentaje.*)$/, "% de cuota"],
  [/^(mensajes?|messages?)$/, "mensajes"],
];
export const COMMON_UNITS = ["tokens", "créditos", "generaciones", "USD", "% de cuota", "mensajes"] as const;

export function canonicalUnit(raw: unknown): string {
  const text = String(raw ?? "").trim().replace(/\s+/g, " ");
  const key = text.toLowerCase();
  for (const [pattern, unit] of UNITS) if (pattern.test(key)) return unit;
  return text;
}

type Dated = { unit?: string; period_end?: string | null; created_at?: string | null };
/** Latest record for each unit: a tool measured in tokens AND credits shows both, never one hiding the other. */
export function latestPerUnit<T extends Dated>(rows: T[], max = 4): T[] {
  const best = new Map<string, T>();
  const stamp = (r: T) => `${r.period_end ?? ""}|${r.created_at ?? ""}`;
  for (const row of rows) {
    const unit = canonicalUnit(row.unit);
    const current = best.get(unit);
    if (!current || stamp(row) > stamp(current)) best.set(unit, row);
  }
  return [...best.values()].sort((a, b) => stamp(b).localeCompare(stamp(a))).slice(0, max);
}
