"use server";
import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { ownerForAction, back, field, uuidField } from "@/lib/os/actions";
import { ledgerErrorCode } from "@/lib/dev-bridge/ledger-server";
import { githubEvents, parseHandoff } from "@/lib/dev-bridge/ledger";
import { snapshot } from "@/lib/dev-bridge/runtime";

const PATH = "/admin/dev-bridge/ledger";
const done = (ok: string) => { revalidatePath(PATH); back(PATH, { ok }); };
const fail = (error: { code?: string; message?: string } | null): never => back(PATH, { error: ledgerErrorCode(error) });
const https = (v: string) => (/^https:\/\/[^\s<>"]{3,500}$/.test(v.trim()) ? v.trim() : null);
const int = (v: string) => (/^\d{1,7}$/.test(v) && Number(v) > 0 ? Number(v) : null);
const date = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export async function claimOwner(form: FormData) {
  const { supabase } = await ownerForAction();
  const owner = field(form, "owner");
  if (owner !== "miguel" && owner !== "samuel") back(PATH, { error: "dev_bridge_invalid" });
  const { error } = await supabase.rpc("dev_bridge_claim_owner", { p_owner: owner });
  if (error) fail(error);
  done("claimed");
}

export type TokenState = { token?: string; agent?: string; error?: string };
/** Generates the agent token on the server; only its sha256 is stored. The plain token is returned ONCE to the owner. */
export async function issueAgentToken(_prev: TokenState, form: FormData): Promise<TokenState> {
  const { supabase } = await ownerForAction();
  const agent = field(form, "agent");
  if (!/^(miguel|samuel)\.(claude|codex)$/.test(agent)) return { error: "dev_bridge_invalid" };
  const days = Math.min(90, Math.max(1, Number(field(form, "days")) || 30));
  const token = "avd_" + randomBytes(24).toString("base64url");
  const { error } = await supabase.rpc("dev_bridge_agent_token", {
    p_agent: agent, p_token_sha256: createHash("sha256").update(token).digest("hex"), p_prefix: token.slice(0, 8), p_days: days,
  });
  if (error) return { error: ledgerErrorCode(error) };
  revalidatePath(PATH);
  return { token, agent };
}

export async function revokeAgentToken(form: FormData) {
  const { supabase } = await ownerForAction();
  const agent = field(form, "agent");
  if (!/^(miguel|samuel)\.(claude|codex)$/.test(agent)) back(PATH, { error: "dev_bridge_invalid" });
  const { error } = await supabase.rpc("dev_bridge_agent_token", { p_agent: agent, p_token_sha256: null, p_prefix: null, p_days: null });
  if (error) fail(error);
  done("revoked");
}

export async function declareTime(form: FormData) {
  const { supabase } = await ownerForAction();
  const hours = Number(field(form, "hours") || 0), minutes = Number(field(form, "minutes") || 0);
  const total = Math.round(hours * 60 + minutes);
  const workDate = date(field(form, "work_date"));
  const description = field(form, "description").trim();
  if (!workDate || !(total >= 1 && total <= 1440) || description.length < 3 || description.length > 1000) back(PATH, { error: "dev_bridge_invalid" });
  const supersedes = uuidField(form, "supersedes");
  const { error } = await supabase.rpc("dev_bridge_declare_time", {
    p_work_date: workDate, p_minutes: total, p_description: description, p_issue: int(field(form, "issue")),
    p_evidence_url: https(field(form, "evidence_url")), p_supersedes: supersedes, p_reason: field(form, "reason").trim() || null,
  });
  if (error) fail(error);
  done(supersedes ? "corrected" : "declared");
}

/** ChatGPT/department handoff or manual work note. Paste the standard handoff text; recorded as the caller's own work. */
export async function recordHandoff(form: FormData) {
  const { supabase } = await ownerForAction();
  const text = field(form, "handoff").slice(0, 8000);
  const h = parseHandoff(text);
  const title = (field(form, "title").trim() || h.task || "").slice(0, 300);
  if (title.length < 3) back(PATH, { error: "dev_bridge_invalid" });
  const evidence = https(field(form, "evidence_url")) ?? https(h.evidence?.split(/\s+/).find(w => w.startsWith("https://")) ?? "");
  const detail = [h.decisions && `Decisiones: ${h.decisions}`, h.work && `Trabajo: ${h.work}`, h.documents && `Documentos: ${h.documents}`,
    h.status && `Estado: ${h.status}`, h.next && `Próximo paso: ${h.next}`].filter(Boolean).join("\n") || text.slice(0, 4000);
  const source = field(form, "source") === "manual" ? "manual" : "chatgpt_import";
  const { error } = await supabase.rpc("dev_bridge_record", { p_entry: {
    source, kind: field(form, "kind") === "decision" ? "decision" : "handoff", title, detail: detail.slice(0, 4000), evidence_url: evidence,
    department: (field(form, "department").trim() || h.department || "").slice(0, 60), issue_number: int(field(form, "issue")),
    // Same text pasted twice is the same contribution (idempotent).
    idempotency_key: "h-" + createHash("sha256").update(title + "\n" + text).digest("hex").slice(0, 40),
  } });
  if (error) fail(error);
  done("recorded");
}

/** Imports verifiable GitHub facts from the authenticated Dev Bridge snapshot, keeping original dates. */
export async function importGithub() {
  const { supabase } = await ownerForAction();
  const s = await snapshot();
  if (s.github.status !== "VERIFIED" || !s.github.data || s.github.data.coverage === "summary") back(PATH, { error: "github_unverified" });
  const { error, data } = await supabase.rpc("dev_bridge_import_github", { p_events: githubEvents(s.github.data) });
  if (error) fail(error);
  revalidatePath(PATH);
  back(PATH, { ok: "imported", n: String(data ?? 0) });
}

export async function createCommitment(form: FormData) {
  const { supabase } = await ownerForAction();
  const owner = field(form, "owner"), agreed = date(field(form, "agreed_on")), target = date(field(form, "target_date"));
  if ((owner !== "miguel" && owner !== "samuel") || !agreed || !target) back(PATH, { error: "dev_bridge_invalid" });
  const { error } = await supabase.rpc("dev_bridge_commitment_create", {
    p_owner: owner, p_title: field(form, "title").trim(), p_criteria: field(form, "criteria").trim(), p_agreed: agreed, p_target: target,
    p_dependencies: field(form, "dependencies").trim().slice(0, 1000), p_issue: int(field(form, "issue")),
  });
  if (error) fail(error);
  done("commitment");
}

export async function moveCommitment(form: FormData) {
  const { supabase } = await ownerForAction();
  const id = uuidField(form, "id"), to = field(form, "to"), version = Number(field(form, "version"));
  if (!id || !["in_progress", "blocked", "ready_for_review", "completed", "verified", "in_progress_reopen", "cancelled", "reschedule"].includes(to) || !Number.isInteger(version)) back(PATH, { error: "dev_bridge_invalid" });
  const { error } = await supabase.rpc("dev_bridge_commitment_transition", {
    p_id: id, p_to: to, p_note: field(form, "note").trim().slice(0, 1000), p_evidence_url: https(field(form, "evidence_url")),
    p_new_target: date(field(form, "new_target")), p_expected_version: version,
  });
  if (error) fail(error);
  done("moved");
}
