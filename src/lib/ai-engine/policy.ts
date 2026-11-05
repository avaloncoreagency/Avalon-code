// Avalon AI Engine — tiered autonomy. Managers act WITHOUT asking on every step, but only inside these tiers:
//   auto   → read-only queries, diagnostics, analysis, tests without external effects, internal state, drafts
//   policy → pre-approved routine work with limits: retries, low-risk edits on isolated branches, draft PRs, evidence comments
//   owner  → production, migrations on real data, permission changes, spending, external communication, deletion, anything
//            irreversible. NEVER executed by a manager: it is recorded as a request for the owner.
// Plus: global kill switch, per-manager suspension, hourly/daily limits per manager, reserved seats always inert.
export type Tier = "auto" | "policy" | "owner";
export type Action =
  | "read" | "diagnose" | "analyze" | "test_isolated" | "update_internal_state" | "draft"
  | "retry" | "branch_low_risk_edit" | "open_draft_pr" | "post_evidence"
  | "production_change" | "migration_real_data" | "permission_change" | "spend" | "external_contact" | "delete_data" | "irreversible";

export const TIER: Record<Action, Tier> = {
  read: "auto", diagnose: "auto", analyze: "auto", test_isolated: "auto", update_internal_state: "auto", draft: "auto",
  retry: "policy", branch_low_risk_edit: "policy", open_draft_pr: "policy", post_evidence: "policy",
  production_change: "owner", migration_real_data: "owner", permission_change: "owner", spend: "owner",
  external_contact: "owner", delete_data: "owner", irreversible: "owner",
};

/** What each manager may do by itself (auto + policy). Anything else is denied or escalated to the owner. */
export const ALLOWED: Record<string, Action[]> = {
  ren: ["read", "diagnose", "analyze", "test_isolated", "update_internal_state", "draft", "retry", "branch_low_risk_edit", "open_draft_pr", "post_evidence"],
  shin: ["read", "diagnose", "analyze", "test_isolated", "update_internal_state", "draft", "retry", "post_evidence"],
  haru: ["read", "diagnose", "analyze", "test_isolated", "update_internal_state", "draft", "retry", "post_evidence"],
  sora: ["read", "diagnose", "analyze", "test_isolated", "update_internal_state", "draft", "retry", "post_evidence"],
  kenji: ["read", "diagnose", "analyze", "test_isolated", "update_internal_state", "draft", "retry", "post_evidence"],
};

export const LIMITS = { perHour: 6, perDay: 30, retries: 2 };

export type PolicyContext = {
  killSwitch: boolean;
  suspended: string[];
  counts: { hour: number; day: number };
  reserved?: boolean;
};
export type Decision = { allowed: boolean; tier: Tier; reason: string };

export function decide(manager: string, action: Action, ctx: PolicyContext): Decision {
  const tier = TIER[action];
  if (!tier) return { allowed: false, tier: "owner", reason: "unknown_action" };
  if (ctx.killSwitch) return { allowed: false, tier, reason: "kill_switch" };
  if (ctx.reserved || !ALLOWED[manager]) return { allowed: false, tier, reason: "reserved_or_unknown_worker" };
  if (ctx.suspended.includes(manager)) return { allowed: false, tier, reason: "manager_suspended" };
  if (tier === "owner") return { allowed: false, tier, reason: "requires_owner_approval" };
  if (!ALLOWED[manager].includes(action)) return { allowed: false, tier, reason: "action_not_in_manager_policy" };
  if (ctx.counts.hour >= LIMITS.perHour) return { allowed: false, tier, reason: "hourly_limit" };
  if (ctx.counts.day >= LIMITS.perDay) return { allowed: false, tier, reason: "daily_limit" };
  return { allowed: true, tier, reason: tier === "auto" ? "automatic" : "pre_approved_policy" };
}

/** Task intake: which manager owns a request. Deterministic keywords; the AI classifier may only pick among these keys. */
export const ROUTING: { manager: string; words: RegExp }[] = [
  { manager: "shin", words: /segur|security|rls|auth|sesi[oó]n|permis|secret|vulnerab|mfa|acceso|token/i },
  { manager: "haru", words: /crm|lead|venta|cliente|pipeline|etapa|calendar|tarea|propuesta|proyecto/i },
  { manager: "sora", words: /integraci|radar|geoapify|higgsfield|sincroniz|creativ|marketing|website|e-?commerce|dise[nñ]o|imagen|video|3d|oficina/i },
  { manager: "kenji", words: /prueba|test|calidad|regresi|rendimiento|m[oó]vil|ci\b|lint|coste|costo|bug/i },
  { manager: "ren", words: /plan|coordin|refactor|c[oó]digo|desarroll|rama|pr\b|dependen|organiz/i },
];
const stripMeta = (t: string) => t.replace(/`[^`]*`|\b[a-z-]+:[a-z-]+\b/gi, " "); // code spans and labels are not the request
export function routeTask(text: string, title = ""): { manager: string; method: "keywords" } {
  let best = { manager: "ren", hits: 0 };
  const body = stripMeta(text), head = stripMeta(title);
  for (const r of ROUTING) {
    const hits = (body.match(new RegExp(r.words.source, "gi")) ?? []).length + 3 * (head.match(new RegExp(r.words.source, "gi")) ?? []).length;
    if (hits > best.hits) best = { manager: r.manager, hits };
  }
  return { manager: best.manager, method: "keywords" };
}
/** Actions a free-text request asks for that a manager may never do alone. */
export function ownerOnlyRequests(raw: string): Action[] {
  const text = stripMeta(raw);
  const out: Action[] = [];
  // Whole words / explicit stems only: "comprueba" is not "comprar", "publicados" is not "publicar" (found on Issues #139/#140).
  if (/\b(producci[oó]n|production|deploy|desplegar|despliega|despliegue|publicar|publ[ií]calo|publica en)\b/i.test(text)) out.push("production_change");
  if (/\b(migraci[oó]n|migration|alter table|drop table|drop column)\b/i.test(text)) out.push("migration_real_data");
  if (/\b(permisos?|roles?|owner|admin)\b/i.test(text) && /\b(cambi\w*|otorg\w*|quit\w*|grant|revok\w*|revoca\w*|conced\w*)\b/i.test(text)) out.push("permission_change");
  if (/\b(pagar|pago|pagos|comprar|compra de|gastar|recargar|recarga|factura|facturaci[oó]n|suscripci[oó]n|suscribir|tarjeta)\b|\$\s?\d/i.test(text)) out.push("spend");
  if (/\b(email|correo|whatsapp|llamar|contactar|enviar a|escribir a)\b/i.test(text)) out.push("external_contact");
  if (/\b(borra\w*|elimina\w*|delete|purge|truncate)\b/i.test(text) && !/\belimina(r)? (la |el )?(duplicad|doble)/i.test(text)) out.push("delete_data");
  return out;
}

// ─── Order lifecycle (P0-A) ─────────────────────────────────────────────────────────────────────────────────────────────
// An order is NEVER "done" because a manager finished a generic routine. A diagnosis is a diagnosis; a requested change is
// only "implemented" when an executor produced a change (commit/PR) and only "verified" when its checks passed.
export type OrderState =
  | "received" | "classified" | "waiting" | "running" | "diagnosed" | "needs_implementation"
  | "implemented" | "verified" | "blocked" | "failed" | "needs_owner";
export const ORDER_LABEL: Record<OrderState, string> = {
  received: "avalon:task", classified: "avalon:task", waiting: "avalon:task", running: "avalon:in-progress",
  diagnosed: "avalon:diagnosed", needs_implementation: "avalon:needs-implementation", implemented: "avalon:implemented",
  verified: "avalon:verified", blocked: "avalon:blocked", failed: "avalon:failed", needs_owner: "avalon:needs-owner",
};
/** Labels that mean "the system already produced a terminal answer": intake does not pick these up again. */
export const TERMINAL_LABELS = ["avalon:diagnosed", "avalon:needs-implementation", "avalon:implemented", "avalon:verified", "avalon:failed", "avalon:needs-owner", "avalon:blocked", "avalon:done"];

export type Intent = "diagnose" | "change";
const CHANGE_VERB = /^(arregl|corrig|fix|implement|a[nñ]ad|agreg|cambi|elimin|quit|fusion|unific|cre[ae]|mejor|actualiz|migr|refactor|redise[nñ]|integr[ae]|conect[ae])/i;
const DIAGNOSE_VERB = /^(revis|audit|verific|comprob|compru|analiz|diagnost|inform|report|consult|med[ií]r?|mide|list|valid)/i;
/**
 * Does the order ask for a change or only for a review? The imperative verb at the start of the TITLE decides (after an
 * optional "Orden:"/"Tarea:" prefix) — nouns like "integración" in the body do not turn a review into a change (Issue
 * #140). Without a clear title verb, any change verb in the text wins; ambiguous orders count as changes (fail-safe).
 */
export function classifyIntent(raw: string, title = ""): Intent {
  const head = stripMeta(title || raw.split("\n")[0]).replace(/^\s*(orden|tarea|task|order)\s*[:\-–]\s*/i, "").trim();
  if (CHANGE_VERB.test(head)) return "change";
  if (DIAGNOSE_VERB.test(head)) return "diagnose";
  const text = stripMeta(raw);
  const change = /\b(arregl|corrig|fix|implement|a[nñ]ad|agreg|cambi|elimin|quit|fusion|unific|cre[ae]|mejor|actualiz|migr|refactor|redise[nñ])/i.test(text);
  const diagnose = /\b(revis|audit|verific|comprob|analiz|diagn|inform|report|estado|consult|mide|medir|lista)/i.test(text);
  return change || !diagnose ? "change" : "diagnose";
}

export type ExecutionResult = {
  status: string; // runManager status
  checks?: { ok?: boolean; exit?: number | null }[];
  change?: { pr?: string; commit?: string } | null; // only implementation executors set this
};
/** Final state of an order after one execution attempt. Pure and conservative. */
export function orderOutcome(intent: Intent, r: ExecutionResult, ownerOnly: Action[] = []): { state: OrderState; reason: string } {
  if (ownerOnly.length) return { state: "needs_owner", reason: "owner_only:" + ownerOnly.join(",") };
  if (r.status === "skipped") return { state: "waiting", reason: "not_run" };
  if (r.status !== "succeeded") return { state: "failed", reason: r.status };
  const evidence = Array.isArray(r.checks) && r.checks.length > 0 && r.checks.every(c => typeof c.exit === "number");
  if (!evidence) return { state: "blocked", reason: "no_verifiable_evidence" };
  const allGreen = r.checks!.every(c => c.ok !== false && c.exit === 0);
  if (intent === "diagnose") return { state: "diagnosed", reason: allGreen ? "diagnosis_clean" : "diagnosis_found_issues" };
  if (!r.change) return { state: "needs_implementation", reason: "diagnosis_only_no_change_executor" };
  return allGreen ? { state: "verified", reason: "change_and_checks_passed" } : { state: "implemented", reason: "change_made_checks_not_green" };
}
