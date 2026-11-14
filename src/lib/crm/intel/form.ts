import type { Answer, Answers, Condition, Question, Template } from "./types";

/** Is a condition met by the current answers? Unknown / N/A answers never satisfy a condition. */
export function conditionMet(c: Condition | undefined, answers: Answers): boolean {
  if (!c) return true;
  const a = answers[c.q];
  if (!a || a.s !== "answered") return false;
  if ("eq" in c) return a.v === c.eq;
  if ("in" in c) return typeof a.v === "string" && c.in.includes(a.v);
  return Array.isArray(a.v) && a.v.some(x => c.includesAny.includes(String(x)));
}

export const visibleQuestions = (t: Template, answers: Answers) =>
  t.sections.map(s => ({ ...s, questions: s.questions.filter(q => conditionMet(q.when, answers)) }));

/** Real completeness: share of VISIBLE questions with any recorded state (answered, unknown or N/A). */
export function progress(t: Template, answers: Answers) {
  const visible = visibleQuestions(t, answers).flatMap(s => s.questions);
  const done = visible.filter(q => answers[q.id]).length;
  const required = visible.filter(q => q.required);
  const missingRequired = required.filter(q => !answers[q.id] || answers[q.id].s === "unknown").map(q => q.id);
  return {
    total: visible.length, done,
    pct: visible.length ? Math.round((done / visible.length) * 100) : 0,
    missingRequired,
    canComplete: missingRequired.length === 0,
  };
}

/** Validate one raw form value for a question. Returns the stored value or an error code. Never invents a value. */
export function parseAnswer(q: Question, raw: string | string[] | undefined): { ok: true; value: unknown } | { ok: false; error: string } {
  const one = Array.isArray(raw) ? raw[0] : raw;
  const text = (one ?? "").trim();
  switch (q.type) {
    case "text": case "long": {
      const max = q.max ?? (q.type === "long" ? 2000 : 200);
      if (!text) return { ok: false, error: "empty" };
      return text.length > max ? { ok: false, error: "too_long" } : { ok: true, value: text };
    }
    case "number": case "money": case "percent": case "rating": {
      if (!text) return { ok: false, error: "empty" };
      // Never strip arbitrary commas, currency symbols or whitespace: "1,2" must not become 12.
      // Accept plain dot-decimal numbers and correctly grouped thousands (e.g. 1,234.50).
      // A leading $ is allowed only for money fields.
      const numericText = q.type === "money" ? text.replace(/^\$\s*/, "") : text;
      if (!/^(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)$/.test(numericText)) {
        return { ok: false, error: "out_of_range" };
      }
      const n = Number(numericText.replace(/,/g, ""));
      const max = q.type === "percent" ? 100 : q.type === "rating" ? 5 : q.type === "number" ? 1_000_000 : 100_000_000;
      if (!Number.isFinite(n) || n < 0 || n > max) return { ok: false, error: "out_of_range" };
      if (q.type === "number" && !Number.isInteger(n)) return { ok: false, error: "integer" };
      return { ok: true, value: q.type === "money" ? Math.round(n * 100) / 100 : n };
    }
    case "yesno":
      if (text === "yes") return { ok: true, value: true };
      if (text === "no") return { ok: true, value: false };
      return { ok: false, error: "empty" };
    case "choice":
      if (!text) return { ok: false, error: "empty" };
      return q.options?.some(o => o.value === text) ? { ok: true, value: text } : { ok: false, error: "invalid_option" };
    case "multi": {
      const vals = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(v => v.trim()).filter(Boolean);
      if (!vals.length) return { ok: false, error: "empty" };
      const allowed = new Set(q.options?.map(o => o.value));
      if (!vals.every(v => allowed.has(v))) return { ok: false, error: "invalid_option" };
      return { ok: true, value: [...new Set(vals)] };
    }
  }
}

/** Numeric value of an answered question, else undefined (unknown/N/A/absent never become 0). */
export function num(answers: Answers, id: string): number | undefined {
  const a: Answer | undefined = answers[id];
  return a?.s === "answered" && typeof a.v === "number" && Number.isFinite(a.v) ? a.v : undefined;
}
export function bool(answers: Answers, id: string): boolean | undefined {
  const a = answers[id];
  return a?.s === "answered" && typeof a.v === "boolean" ? a.v : undefined;
}
export function str(answers: Answers, id: string): string | undefined {
  const a = answers[id];
  return a?.s === "answered" && typeof a.v === "string" ? a.v : undefined;
}
export function list(answers: Answers, id: string): string[] | undefined {
  const a = answers[id];
  return a?.s === "answered" && Array.isArray(a.v) ? a.v.map(String) : undefined;
}
