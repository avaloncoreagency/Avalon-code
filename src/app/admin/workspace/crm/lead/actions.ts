"use server";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { back, field, ownerForAction, uuidField } from "@/lib/os/actions";
import { isIndustry } from "@/lib/crm/intel/industries";
import { templateFor } from "@/lib/crm/intel/templates";
import { parseAnswer, progress } from "@/lib/crm/intel/form";
import { scoreLead } from "@/lib/crm/intel/scoring";
import { recommend } from "@/lib/crm/intel/recommendations";
import { reconcileRecommendations, AUTO_WITHDRAW_NOTE, type SavedRecommendation } from "@/lib/crm/intel/reconcile";
import { duplicateCandidateArgs, findDuplicates, type LeadLike } from "@/lib/crm/intel/duplicates";
import { intelErrorCode } from "@/lib/crm/intel/errors";
import type { Answer, Answers } from "@/lib/crm/intel/types";

const DESK = "/admin/workspace/crm/desk";
const LEAD = (id: string) => `/admin/workspace/crm/lead/${id}`;
const ORIGINS = ["manual", "radar", "referral", "website", "campaign", "other"];
const PRIORITIES = ["low", "normal", "high"];

function localInstant(value: string, tz: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw Error("date");
  const offset = Number(tz);
  if (!Number.isInteger(offset) || Math.abs(offset) > 900) throw Error("date");
  const ms = Date.parse(`${value}:00Z`) + offset * 60000;
  if (!Number.isFinite(ms)) throw Error("date");
  return new Date(ms).toISOString();
}
const clip = (s: string, n: number) => s.trim().slice(0, n);
const httpsUrl = (s: string) => {
  const v = s.trim();
  if (!v) return "";
  const withScheme = /^https?:\/\//i.test(v) ? v.replace(/^http:/i, "https:") : "https://" + v;
  try { const u = new URL(withScheme); return u.protocol === "https:" && withScheme.length <= 300 ? u.toString() : ""; } catch { return ""; }
};

// ── Quick Add ────────────────────────────────────────────────────────────────────────────────────────────────────
// Returns state to the form (no redirect) on errors or possible duplicates, so typed data is never lost and personal
// data never travels in a URL. Redirects to the new lead on success.
export type QuickAddState = { error?: string; duplicates?: { id: string; company: string; reasons: string[] }[]; values?: Record<string, string> } | null;
const QUICK_FIELDS = ["company", "industry_key", "contact", "phone", "email", "website", "city", "zip", "origin", "owner_id", "priority", "follow_up_at", "next_action", "note"];
export async function quickAddLead(_prev: QuickAddState, form: FormData): Promise<QuickAddState> {
  const { supabase, userId } = await ownerForAction();
  // React resets a form after an action: return what was typed so nothing is lost on an error or a duplicate warning.
  const values = Object.fromEntries(QUICK_FIELDS.map(k => [k, field(form, k).slice(0, 4000)]));
  const company = clip(field(form, "company"), 200);
  if (!company) return { error: "company_required", values };
  const email = clip(field(form, "email"), 254).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "invalid", values };
  const website = httpsUrl(field(form, "website"));
  const industry = field(form, "industry_key");
  const origin = ORIGINS.includes(field(form, "origin")) ? field(form, "origin") : "manual";
  const priority = PRIORITIES.includes(field(form, "priority")) ? field(form, "priority") : "normal";
  const owner = uuidField(form, "owner_id") ?? userId;
  let follow: string | null;
  try { follow = localInstant(field(form, "follow_up_at"), field(form, "tz_offset")); } catch { return { error: "invalid", values }; }
  const zip = field(form, "zip").trim();
  const row = {
    company, contact: clip(field(form, "contact"), 160), phone: clip(field(form, "phone"), 40), email: email || null, website,
    city: clip(field(form, "city"), 120), zip: /^[A-Za-z0-9 -]{3,10}$/.test(zip) ? zip : "",
    industry_key: isIndustry(industry) ? industry : null, origin, priority, owner_id: owner,
    source: ({ manual: "Entrada manual", radar: "Radar / Lead Hunter", referral: "Referido", website: "Website Avalon", campaign: "Campaña publicitaria", other: "Otro origen" } as Record<string, string>)[origin],
    next_action: clip(field(form, "next_action"), 300), follow_up_at: follow,
  };
  // Possible duplicates: warn, never merge. The owner can confirm it is a different business.
  if (field(form, "confirm_new") !== "1") {
    const candidate = { company, phone: row.phone, email: row.email, website };
    // Server-side candidate search over every lead (migration 20261112090000); the exact rules run here.
    let { data: existing, error } = await supabase.rpc("crm_lead_duplicate_candidates", duplicateCandidateArgs(candidate));
    // Database without that migration: previous behaviour (bounded read), so Quick Add keeps working.
    if (error?.code === "PGRST202") ({ data: existing, error } = await supabase.from("crm_leads").select("id,company,phone,email,website").eq("archived", false).limit(5000));
    if (error) return { error: intelErrorCode(error), values };
    const hits = findDuplicates(candidate, (existing ?? []) as LeadLike[]);
    if (hits.length) return { duplicates: hits.slice(0, 5), values };
  }
  const { data, error } = await supabase.from("crm_leads").insert(row).select("id").single();
  if (error) return { error: intelErrorCode(error), values };
  if (field(form, "note").trim()) await supabase.from("crm_activities").insert({ lead_id: data.id, body: clip(field(form, "note"), 4000), kind: "note" });
  revalidatePath(DESK);
  back(LEAD(data.id), { ok: "created" });
}

// ── Discovery (save a section; partial saves always allowed) ──────────────────────────────────────────────────────
export async function saveDiscovery(form: FormData) {
  const { supabase } = await ownerForAction();
  const lead = uuidField(form, "lead");
  const industry = field(form, "industry");
  if (!lead || !isIndustry(industry)) back("/admin/workspace/crm/desk", { error: "invalid" });
  const t = templateFor(industry);
  const section = t.sections.find(s => s.id === field(form, "section"));
  const here = `${LEAD(lead)}/discovery`;
  if (!section) back(here, { industry, error: "invalid" });
  const payload: Record<string, Answer & { base?: string | null } | { s: "clear"; base?: string | null }> = {};
  const invalid: string[] = [];
  for (const q of section.questions) {
    if (form.get(`present__${q.id}`) === null) continue;   // hidden by a condition in the browser: untouched
    let orig: Answer | null = null;
    try { orig = JSON.parse(field(form, `o__${q.id}`) || "null"); } catch { orig = null; }
    const base = orig?.at ?? null;
    const state = field(form, `s__${q.id}`);
    let next: Answer | null = null;
    if (state === "unknown" || state === "na") next = { s: state };
    else {
      const raw = q.type === "multi" ? form.getAll(`a__${q.id}`).map(String) : field(form, `a__${q.id}`);
      const parsed = parseAnswer(q, raw);
      if (parsed.ok) next = { v: parsed.value, s: "answered" };
      else if (parsed.error !== "empty") { invalid.push(q.id); continue; }
    }
    if (!next) { if (orig) payload[q.id] = { s: "clear", base }; continue; }
    if (orig && orig.s === next.s && JSON.stringify(orig.v ?? null) === JSON.stringify(next.v ?? null)) continue;
    payload[q.id] = { ...next, base };
  }
  const { data: current } = await supabase.from("crm_lead_assessments").select("answers").eq("lead_id", lead).eq("industry_key", industry).maybeSingle();
  const merged: Answers = { ...((current?.answers ?? {}) as Answers) };
  for (const [k, v] of Object.entries(payload)) { if (v.s === "clear") delete merged[k]; else merged[k] = v as Answer; }
  const p = progress(t, merged);
  const wantsComplete = field(form, "complete") === "1";
  const { data, error } = await supabase.rpc("crm_assessment_save", {
    p_lead: lead, p_industry: industry, p_template: t.version, p_answers: payload,
    p_status: wantsComplete && p.canComplete ? "complete" : "in_progress", p_progress: p.pct,
  });
  if (error) back(here, { industry, section: section.id, error: intelErrorCode(error) });
  const result = data as { assessment_id: string; answers: Answers; conflicts: string[] };
  await storeIntelligence(supabase, lead, result.assessment_id, industry, result.answers);
  revalidatePath(LEAD(lead));
  const nextSection = t.sections[t.sections.findIndex(s => s.id === section.id) + 1]?.id;
  back(here, {
    industry, section: result.conflicts.length || invalid.length || field(form, "stay") === "1" || !nextSection ? section.id : nextSection,
    ok: "saved", ...(result.conflicts.length ? { conflicts: result.conflicts.join(",") } : {}),
    ...(invalid.length ? { invalid: invalid.join(",") } : {}), ...(wantsComplete && !p.canComplete ? { missing: p.missingRequired.join(",") } : {}),
  });
}

/** Recompute the explainable score and the rule-based recommendations from the saved answers (never from the browser). */
async function storeIntelligence(supabase: SupabaseClient, lead: string, assessmentId: string, industry: string, answers: Answers) {
  const r = scoreLead(industry, answers);
  const { data: last } = await supabase.from("crm_lead_scores").select("score,grade,legal_status,legal_flags,rules_version,manual_score,manual_reason")
    .eq("lead_id", lead).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const flags = r.legal.flags.map(f => f.code);
  const same = last && last.score === r.score && last.grade === r.grade && last.legal_status === r.legal.status
    && JSON.stringify(last.legal_flags) === JSON.stringify(flags) && last.rules_version === r.rulesVersion;
  if (!same) {
    await supabase.from("crm_lead_scores").insert({
      lead_id: lead, assessment_id: assessmentId, rules_version: r.rulesVersion, score: r.score, grade: r.grade,
      breakdown: r.categories, legal_status: r.legal.status, legal_flags: flags,
      // A justified manual adjustment stays in force until an owner removes it.
      manual_score: last?.manual_score ?? null, manual_reason: last?.manual_score != null ? last.manual_reason : "",
    });
  }
  const recs = recommend(industry, answers);
  const { data: existing, error: listError } = await supabase.from("crm_lead_recommendations")
    .select("id,rule_id,status,note,decided_by,version").eq("lead_id", lead);
  // Never mutate recommendation state if the read failed: an apparent empty set must not
  // be interpreted as "there are no old recommendations".
  if (listError) return;
  const saved = (existing ?? []) as SavedRecommendation[];
  // Stale automatic suggestions are withdrawn (and restored if the evidence returns); human decisions are never touched.
  const { changes } = reconcileRecommendations(saved, recs);
  for (const change of changes) {
    const withdrawn = change.action === "withdraw";
    await supabase.from("crm_lead_recommendations")
      .update({ status: withdrawn ? "dismissed" : "suggested", note: withdrawn ? AUTO_WITHDRAW_NOTE : "", decided_by: null, decided_at: null })
      .eq("id", change.id).eq("lead_id", lead).eq("version", change.version)
      .eq("status", withdrawn ? "suggested" : "dismissed")
      // A manually dismissed rule cannot be resurrected, even if it changed since the read.
      .is("decided_by", null);
  }
  const known = new Map(saved.map(e => [e.rule_id, e.status]));
  for (const rec of recs) {
    const row = { service: rec.service, problem: rec.problem.es, evidence: rec.evidence, missing: rec.missing, next_action: rec.nextAction.es, rules_version: r.rulesVersion };
    if (!known.has(rec.ruleId)) await supabase.from("crm_lead_recommendations").insert({ lead_id: lead, rule_id: rec.ruleId, ...row });
    else if (known.get(rec.ruleId) === "suggested" || changes.some(c => c.ruleId === rec.ruleId && c.action === "restore"))
      await supabase.from("crm_lead_recommendations").update(row).eq("lead_id", lead).eq("rule_id", rec.ruleId).eq("status", "suggested");
  }
}

// ── Score: justified manual adjustment ────────────────────────────────────────────────────────────────────────────
export async function adjustScore(form: FormData) {
  const { supabase } = await ownerForAction();
  const lead = uuidField(form, "lead");
  if (!lead) back(DESK, { error: "invalid" });
  const reason = clip(field(form, "reason"), 1000);
  const clear = field(form, "clear") === "1";
  const manual = Number(field(form, "manual_score"));
  if (!clear && (!Number.isInteger(manual) || manual < 0 || manual > 100)) back(LEAD(lead), { error: "invalid" });
  if (!clear && reason.length < 15) back(LEAD(lead), { error: "reason_required" });
  const { data: last } = await supabase.from("crm_lead_scores").select("*").eq("lead_id", lead).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!last) back(LEAD(lead), { error: "invalid" });
  const { error } = await supabase.from("crm_lead_scores").insert({
    lead_id: lead, assessment_id: last.assessment_id, rules_version: last.rules_version, score: last.score, grade: last.grade, breakdown: last.breakdown,
    legal_status: last.legal_status, legal_flags: last.legal_flags, manual_score: clear ? null : manual, manual_reason: clear ? "" : reason,
  });
  if (error) back(LEAD(lead), { error: intelErrorCode(error) });
  revalidatePath(LEAD(lead));
  back(LEAD(lead), { ok: "saved" });
}

// ── Recommendations: accept / dismiss / edit ──────────────────────────────────────────────────────────────────────
export async function decideRecommendation(form: FormData) {
  const { supabase, userId } = await ownerForAction();
  const lead = uuidField(form, "lead"), id = uuidField(form, "id");
  const status = field(form, "status");
  if (!lead || !id || !["accepted", "dismissed", "edited", "suggested"].includes(status)) back(DESK, { error: "invalid" });
  const version = Number(field(form, "version"));
  // A stale rule may still be visible in history. A forged form must not be
  // able to accept or edit it as if it were a current recommendation.
  if (status !== "dismissed") {
    const { data: oldRule, error: ruleError } = await supabase.from("crm_lead_recommendations")
      .select("rule_id").eq("id", id).eq("lead_id", lead).maybeSingle();
    if (ruleError || !oldRule) back(LEAD(lead), { tab: "recs", error: "unavailable" });
    const { data: currentLead, error: leadError } = await supabase.from("crm_leads")
      .select("industry_key").eq("id", lead).maybeSingle();
    if (leadError || !currentLead?.industry_key) back(LEAD(lead), { tab: "recs", error: "stale_recommendation" });
    const { data: assessment, error: assessmentError } = await supabase.from("crm_lead_assessments")
      .select("answers").eq("lead_id", lead).eq("industry_key", currentLead.industry_key).maybeSingle();
    if (assessmentError || !assessment || !recommend(currentLead.industry_key, assessment.answers as Answers).some(x => x.ruleId === oldRule.rule_id))
      back(LEAD(lead), { tab: "recs", error: "stale_recommendation" });
  }
  const patch: Record<string, unknown> = { status, note: clip(field(form, "note"), 1000), decided_by: status === "suggested" ? null : userId, decided_at: status === "suggested" ? null : new Date().toISOString() };
  if (status === "edited") { patch.service = clip(field(form, "service"), 80) || undefined; patch.next_action = clip(field(form, "next_action"), 300); }
  const { data, error } = await supabase.from("crm_lead_recommendations").update(patch).eq("id", id).eq("lead_id", lead).eq("version", version).select("id");
  if (error) back(LEAD(lead), { error: intelErrorCode(error) });
  if (!data?.length) back(LEAD(lead), { error: "conflict" });
  revalidatePath(LEAD(lead));
  back(LEAD(lead), { ok: "saved", tab: "recs" });
}

// ── After a call: note + result + next contact, in one step ──────────────────────────────────────────────────────
export async function logInteraction(form: FormData) {
  const { supabase } = await ownerForAction();
  const lead = uuidField(form, "lead");
  if (!lead) back(DESK, { error: "invalid" });
  const kind = ["call", "note", "email", "whatsapp", "meeting"].includes(field(form, "kind")) ? field(form, "kind") : "note";
  const body = clip(field(form, "body"), 4000);
  let next: string | null;
  try { next = localInstant(field(form, "next_at"), field(form, "tz_offset")); } catch { back(LEAD(lead), { error: "invalid" }); }
  if (!body && !next) back(LEAD(lead), { error: "invalid" });
  if (body) {
    const { error } = await supabase.from("crm_activities").insert({ lead_id: lead, body, kind, status: "completed" });
    if (error) back(LEAD(lead), { error: intelErrorCode(error) });
  }
  if (next) {
    const action = clip(field(form, "next_action"), 300) || "Seguimiento";
    await supabase.from("crm_activities").insert({ lead_id: lead, body: "Próximo contacto: " + action, kind: "task", status: "pending", due_at: next });
    // Version-guarded so a concurrent edit by the other owner is not overwritten.
    const version = Number(field(form, "version"));
    const { data } = await supabase.from("crm_leads").update({ follow_up_at: next, next_action: action }).eq("id", lead).eq("version", version).select("id");
    if (!data?.length) back(LEAD(lead), { error: "conflict" });
  }
  revalidatePath(LEAD(lead)); revalidatePath(DESK);
  back(LEAD(lead), { ok: "saved" });
}

// ── Responsible owner, priority, stage, next action (optimistic version) ────────────────────────────────────────
export async function updateLeadMeta(form: FormData) {
  const { supabase } = await ownerForAction();
  const lead = uuidField(form, "lead");
  if (!lead) back(DESK, { error: "invalid" });
  const version = Number(field(form, "version"));
  const patch: Record<string, unknown> = {};
  const owner = uuidField(form, "owner_id"); if (owner) patch.owner_id = owner;
  if (PRIORITIES.includes(field(form, "priority"))) patch.priority = field(form, "priority");
  if (/^[a-z][a-z0-9-]{1,49}$/.test(field(form, "stage_id"))) patch.stage_id = field(form, "stage_id");
  if (form.has("next_action")) patch.next_action = clip(field(form, "next_action"), 300);
  if (form.has("loss_reason")) patch.loss_reason = clip(field(form, "loss_reason"), 1000);
  for (const k of ["legal_name", "contact", "contact_title", "phone", "address", "city", "specialty", "service_area"] as const)
    if (form.has(k)) patch[k] = clip(field(form, k), k === "service_area" ? 300 : k === "address" || k === "legal_name" ? 200 : 160);
  if (form.has("google_business_url")) patch.google_business_url = httpsUrl(field(form, "google_business_url"));
  if (form.has("website")) patch.website = httpsUrl(field(form, "website"));
  const { data, error } = await supabase.from("crm_leads").update(patch).eq("id", lead).eq("version", version).select("id");
  if (error) back(LEAD(lead), { error: intelErrorCode(error) });
  if (!data?.length) back(LEAD(lead), { error: "conflict" });
  revalidatePath(LEAD(lead)); revalidatePath(DESK);
  back(LEAD(lead), { ok: "saved" });
}

// ── Commercial terms: proposed vs agreed ─────────────────────────────────────────────────────────────────────────
function money(v: string): number | null {
  const s = v.replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw Error("invalid");
  return Math.round(n * 100) / 100;
}
export async function saveTerms(form: FormData) {
  const { supabase, userId } = await ownerForAction();
  const lead = uuidField(form, "lead");
  const kind = field(form, "kind");
  if (!lead || !["proposed", "agreed"].includes(kind)) back(DESK, { error: "invalid" });
  const target: Record<string, unknown> = {};
  try {
    target.setup_price = money(field(form, "setup_price"));
    target.monthly_fee = money(field(form, "monthly_fee"));
    target.client_ad_budget = money(field(form, "client_ad_budget"));
    const pct = field(form, "commission_pct").trim();
    target.commission_pct = pct ? Number(pct) : null;
    if (pct && (!Number.isFinite(target.commission_pct as number) || (target.commission_pct as number) < 0 || (target.commission_pct as number) > 100)) throw Error("invalid");
  } catch { back(LEAD(lead), { error: "invalid", tab: "terms" }); }
  const billing = field(form, "billing_model");
  target.billing_model = ["monthly", "commission", "hybrid"].includes(billing) ? billing : null;
  if (target.billing_model === "monthly") target.commission_pct = null;
  target.commission_base = ["gross_revenue", "gross_profit", "other"].includes(field(form, "commission_base")) ? field(form, "commission_base") : null;
  target.services = form.getAll("services").map(String).map(s => s.trim()).filter(Boolean).slice(0, 20);
  for (const k of ["attribution_rules", "cancellation_terms", "special_conditions"] as const) target[k] = clip(field(form, k), 2000);
  target.signer_name = clip(field(form, "signer_name"), 160); target.signer_title = clip(field(form, "signer_title"), 120);
  target.start_date = /^\d{4}-\d{2}-\d{2}$/.test(field(form, "start_date")) ? field(form, "start_date") : null;
  const months = Number(field(form, "duration_months")); target.duration_months = Number.isInteger(months) && months >= 1 && months <= 120 ? months : null;
  target.reconciliation = ["weekly", "biweekly", "monthly", "quarterly"].includes(field(form, "reconciliation")) ? field(form, "reconciliation") : null;
  // A commission percentage is never generated: an owner types it and, for agreed terms, explicitly approves it.
  if (kind === "agreed" && target.commission_pct !== null) {
    if (field(form, "approve_commission") !== "1") back(LEAD(lead), { error: "commission_needs_approval", tab: "terms" });
    target.commission_approved_by = userId;
  } else target.commission_approved_by = null;
  target.updated_by = userId;
  const version = Number(field(form, "version"));
  const res = version > 0
    ? await supabase.from("crm_commercial_terms").update(target).eq("lead_id", lead).eq("kind", kind).eq("version", version).select("id")
    : await supabase.from("crm_commercial_terms").insert({ lead_id: lead, kind, ...target }).select("id");
  if (res.error) back(LEAD(lead), { error: intelErrorCode(res.error), tab: "terms" });
  if (!res.data?.length) back(LEAD(lead), { error: "conflict", tab: "terms" });
  revalidatePath(LEAD(lead));
  back(LEAD(lead), { ok: "saved", tab: "terms" });
}

// ── Contracts: every transition is validated again by the database trigger ───────────────────────────────────────
export async function createContract(form: FormData) {
  const { supabase } = await ownerForAction();
  const lead = uuidField(form, "lead");
  if (!lead) back(DESK, { error: "invalid" });
  const title = clip(field(form, "title"), 200) || "Acuerdo comercial Avalon";
  const terms = uuidField(form, "terms_id");
  const accepted = field(form, "accepted") === "1";
  const { error } = await supabase.from("crm_contracts").insert({ lead_id: lead, title, terms_id: terms, accepted_at: accepted ? new Date().toISOString() : null });
  if (error) back(LEAD(lead), { error: intelErrorCode(error), tab: "contract" });
  revalidatePath(LEAD(lead));
  back(LEAD(lead), { ok: "saved", tab: "contract" });
}

export async function transitionContract(form: FormData) {
  const { supabase } = await ownerForAction();
  const lead = uuidField(form, "lead"), id = uuidField(form, "id");
  const to = field(form, "to");
  if (!lead || !id) back(DESK, { error: "invalid" });
  const patch: Record<string, unknown> = { status: to };
  if (to === "signed_pending_verification") {
    const signed = field(form, "signed_at");
    patch.signed_at = /^\d{4}-\d{2}-\d{2}$/.test(signed) ? `${signed}T12:00:00Z` : null;
    patch.signer_name = clip(field(form, "signer_name"), 160);
    patch.attachment_id = uuidField(form, "attachment_id");
    patch.external_reference = clip(field(form, "external_reference"), 300);
  }
  if (to === "verified_signed") {
    patch.verification_method = ["document_review", "esign_certificate", "in_person"].includes(field(form, "verification_method")) ? field(form, "verification_method") : null;
    patch.verification_note = clip(field(form, "verification_note"), 1000);
  }
  if (field(form, "accept") === "1") { delete patch.status; patch.accepted_at = new Date().toISOString(); }
  const { data, error } = await supabase.from("crm_contracts").update(patch).eq("id", id).eq("lead_id", lead).eq("version", Number(field(form, "version"))).select("id");
  if (error) back(LEAD(lead), { error: intelErrorCode(error), tab: "contract" });
  if (!data?.length) back(LEAD(lead), { error: "conflict", tab: "contract" });
  revalidatePath(LEAD(lead)); revalidatePath(DESK);
  back(LEAD(lead), { ok: "saved", tab: "contract" });
}
