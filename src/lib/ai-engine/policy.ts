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
  { manager: "haru", words: /crm|lead|venta|cliente|pipeline|etapa|radar|calendar|tarea|propuesta|proyecto/i },
  { manager: "sora", words: /creativ|higgsfield|marketing|website|e-?commerce|dise[nñ]o|imagen|video|3d|oficina/i },
  { manager: "kenji", words: /prueba|test|calidad|regresi|rendimiento|m[oó]vil|ci\b|lint|coste|costo|bug/i },
  { manager: "ren", words: /plan|coordin|refactor|c[oó]digo|desarroll|rama|pr\b|dependen|organiz/i },
];
export function routeTask(text: string): { manager: string; method: "keywords" } {
  let best = { manager: "ren", hits: 0 };
  for (const r of ROUTING) {
    const hits = (text.match(new RegExp(r.words.source, "gi")) ?? []).length;
    if (hits > best.hits) best = { manager: r.manager, hits };
  }
  return { manager: best.manager, method: "keywords" };
}
/** Actions a free-text request asks for that a manager may never do alone. */
export function ownerOnlyRequests(text: string): Action[] {
  const out: Action[] = [];
  if (/producci[oó]n|production|deploy|desplieg|publica/i.test(text)) out.push("production_change");
  if (/migraci[oó]n|migration|alter table|drop /i.test(text)) out.push("migration_real_data");
  if (/permis|rol(es)?\b|owner|admin/i.test(text) && /cambi|otorg|quit|grant|revok/i.test(text)) out.push("permission_change");
  if (/pag(ar|o)|compr|cr[eé]dito|factur|suscrip|\$/i.test(text)) out.push("spend");
  if (/email|correo|whatsapp|llamar|contactar|enviar a/i.test(text)) out.push("external_contact");
  if (/borra|elimina|delete|purge/i.test(text)) out.push("delete_data");
  return out;
}
