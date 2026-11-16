// Shared by server and client components. Spanish is the default language.
export type Lang = "es" | "en";
export const LANG_COOKIE = "avalon-lang";

export function normalizeLang(value: unknown): Lang {
  return value === "en" ? "en" : "es";
}

/** Choose the string for the active language. */
export function pick(lang: Lang, es: string, en: string) {
  return lang === "es" ? es : en;
}

/** All owner-facing dates use the agency's Eastern timezone on server and browser. */
export const AVALON_TIME_ZONE = "America/New_York";

export function formatDate(lang: Lang, value: string | Date | null | undefined, withTime = false) {
  if (!value) return "—";
  // A SQL DATE is a calendar day, not an instant: UTC noon keeps that same day in Eastern year-round.
  // For timestamps, the database must provide an offset (Z or +/-hh:mm) to describe the real instant.
  const isDateOnly = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = typeof value === "string" ? new Date(isDateOnly ? `${value}T12:00:00Z` : value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(lang === "es" ? "es-ES" : "en-US", {
    timeZone: AVALON_TIME_ZONE,
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {}),
  }).format(date);
}
