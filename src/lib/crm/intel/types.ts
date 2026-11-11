// Avalon CRM Intelligence — shared types. Pure module: no network, no database, no secrets.

export type L = { es: string; en: string };
export type QuestionType = "text" | "long" | "number" | "money" | "percent" | "rating" | "yesno" | "choice" | "multi";

/** Show a question only when an earlier answer matches (evaluated on the server and in the browser). */
export type Condition =
  | { q: string; eq: string | boolean }
  | { q: string; in: string[] }
  | { q: string; includesAny: string[] };

export type Question = {
  id: string;
  type: QuestionType;
  label: L;
  help?: L;
  options?: { value: string; label: L }[];
  /** Needed to call the diagnosis complete (never needed to SAVE a partial diagnosis). */
  required?: boolean;
  /** Offer "No aplica". "No sé" (unknown) is always offered. */
  allowNA?: boolean;
  when?: Condition;
  max?: number;
};

export type Section = { id: string; title: L; intro?: L; questions: Question[] };

export type Template = {
  industry: string;
  version: string;
  /** false = generic template: industry-specific questions still pending specialization. */
  specialized: boolean;
  sections: Section[];
};

export type AnswerState = "answered" | "unknown" | "na";
export type Answer = { v?: unknown; s: AnswerState; at?: string; by?: string };
export type Answers = Record<string, Answer>;

export type Lang = "es" | "en";
