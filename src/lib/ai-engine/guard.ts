// Avalon AI Engine — guards that run BEFORE any byte leaves Avalon.
// 1. Zero-cost: a request is only allowed to a model that is verifiably free; any reported cost > 0 blocks the provider.
// 2. Data protection: only synthetic, public-repository or aggregated internal data may be sent. Client personal data,
//    secrets and private keys are refused (there is no authorization flow for sending them today).
import type { ProviderId } from "./catalog";

export type DataClass = "synthetic" | "public_repo" | "internal_aggregate" | "client_personal";
export const ALLOWED_DATA: DataClass[] = ["synthetic", "public_repo", "internal_aggregate"];

export type OpenRouterModel = { id: string; pricing?: Record<string, string | number | undefined> };

/** OpenRouter: free only if the id ends in ":free" AND every live price field is exactly zero. */
export function openRouterIsFree(m: OpenRouterModel): boolean {
  if (!m.id.endsWith(":free") || !m.pricing) return false;
  const prices = Object.values(m.pricing).filter(v => v !== undefined && v !== null && v !== "");
  return prices.length > 0 && prices.every(v => Number(v) === 0);
}

export function assertProviderAllowed(provider: ProviderId, env: Record<string, string | undefined>): void {
  if (provider === "oracle" && env.ORACLE_AI_VERIFIED !== "true") throw new GuardError("provider_not_verified");
  for (const k of Object.keys(env)) {
    if (k.startsWith("NEXT_PUBLIC_") && /GROQ|OPENROUTER|CLOUDFLARE_API|ORACLE_AI|AI_API_KEY/i.test(k) && env[k]) throw new GuardError("secret_in_public_env");
  }
}

export class GuardError extends Error {
  constructor(public code: string, public detail = "") { super(code + (detail ? ": " + detail : "")); }
}

// Reserved example domains are allowed so synthetic fixtures can contain addresses.
const EMAIL = /[A-Z0-9._%+-]+@([A-Z0-9-]+\.)+[A-Z]{2,}/gi;
const RESERVED = /@(example\.(com|org|net)|[a-z0-9-]+\.(invalid|test|example))$/i;
const SECRET_PATTERNS: [string, RegExp][] = [
  ["private_key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["jwt", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ["api_key", /\b(sk-[A-Za-z0-9_-]{16,}|sk-or-v1-[a-f0-9]{20,}|gsk_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})\b/],
  ["supabase_secret", /\b(sb_secret_[A-Za-z0-9_-]{10,}|service[_]role\s*[:=]\s*\S{12,})/i],
];
// Phone: groups separated by spaces/dots (or an international "+" prefix). Plain hyphenated digit runs are UUIDs/dates.
const PHONE = /(?<![\w.-])(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)[ .]?)?\d{2,4}(?:[ .]\d{2,4}){2,4}(?![\w-])|\+\d{1,3}[ -]?\d{2,4}-\d{3,4}-?\d{3,4}/g;
const CARD = /\b(?:\d[ -]?){13,19}\b/g;

/** Returns the reasons a text must NOT be sent; empty array = allowed. */
export function sensitiveFindings(text: string): string[] {
  const out = new Set<string>();
  for (const [name, re] of SECRET_PATTERNS) if (re.test(text)) out.add(name);
  for (const m of text.match(EMAIL) ?? []) if (!RESERVED.test(m)) out.add("email");
  for (const m of text.match(PHONE) ?? []) if (m.replace(/\D/g, "").length >= 9) out.add("phone");
  for (const m of text.match(CARD) ?? []) if (luhn(m.replace(/\D/g, ""))) out.add("card_number");
  return [...out];
}
function luhn(d: string) {
  if (d.length < 13 || d.length > 19) return false;
  let s = 0;
  for (let i = 0; i < d.length; i++) { let n = Number(d[d.length - 1 - i]); if (i % 2) { n *= 2; if (n > 9) n -= 9; } s += n; }
  return s % 10 === 0;
}

export function assertSendable(dataClass: DataClass, texts: string[]): void {
  if (!ALLOWED_DATA.includes(dataClass)) throw new GuardError("data_class_not_authorized", dataClass);
  const found = new Set(texts.flatMap(sensitiveFindings));
  if (found.size) throw new GuardError("sensitive_content", [...found].join(","));
}
