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

export function formatDate(lang: Lang, value: string | Date | null | undefined, withTime = false) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value.length === 10 ? `${value}T00:00:00` : value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(lang === "es" ? "es-ES" : "en-US", {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {}),
  }).format(date);
}
