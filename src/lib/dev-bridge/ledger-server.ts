import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Commitment, LedgerEvent, LedgerSession, Owner, TimeEntry } from "./ledger";

export type AgentRow = { id: string; owner: Owner; tool: string; token_prefix: string | null; token_issued_at: string | null; expires_at: string | null; revoked_at: string | null; last_used_at: string | null };
export type CommitmentEvent = { commitment_id: string; from_status: string; to_status: string; note: string; target_date_from: string | null; target_date_to: string | null; created_at: string };
export type Ledger = {
  state: "ready" | "schema_pending" | "unavailable";
  me: Owner | null;
  people: { owner: Owner; claimed_at: string }[];
  agents: AgentRow[];
  sessions: LedgerSession[];
  events: LedgerEvent[];
  entries: TimeEntry[];
  commitments: Commitment[];
  commitmentEvents: CommitmentEvent[];
  truncated: boolean;
};

const MISSING = new Set(["42P01", "PGRST205", "PGRST202", "42883"]);
export const EVENT_LIMIT = 2000;

/** Reads the ledger for a period. RLS limits every read to owners; nothing here bypasses it. */
export async function loadLedger(supabase: SupabaseClient, userId: string, from: number, to: number): Promise<Ledger> {
  const empty: Ledger = { state: "ready", me: null, people: [], agents: [], sessions: [], events: [], entries: [], commitments: [], commitmentEvents: [], truncated: false };
  const fromIso = new Date(from).toISOString(), toIso = new Date(to).toISOString();
  const [people, agents, sessions, events, entries, commitments, cevents] = await Promise.all([
    supabase.from("dev_bridge_people").select("owner,user_id,claimed_at"),
    supabase.from("dev_bridge_agents").select("id,owner,tool,token_prefix,token_issued_at,expires_at,revoked_at,last_used_at").order("id"),
    // Sessions overlapping the period (started before its end and not ended before its start).
    supabase.from("dev_bridge_sessions").select("id,agent_id,owner,tool,title,status,started_at,ended_at,department,issue_number,summary,next_action")
      .lt("started_at", toIso).or(`ended_at.is.null,ended_at.gte.${fromIso}`).order("started_at", { ascending: false }).limit(500),
    supabase.from("dev_bridge_events").select("id,source,agent_id,owner,tool,session_id,kind,occurred_at,recorded_at,evidence,title,detail,evidence_url,ref,department,issue_number")
      .gte("occurred_at", new Date(from - 7 * 86400000).toISOString()).lt("occurred_at", toIso).order("occurred_at", { ascending: false }).limit(EVENT_LIMIT),
    supabase.from("dev_bridge_time_entries").select("id,owner,work_date,minutes,description,supersedes,correction_reason,issue_number,evidence_url,created_at").order("work_date", { ascending: false }).limit(2000),
    supabase.from("dev_bridge_commitments").select("id,owner,title,status,target_date,agreed_on,evidence_url,accepted_at,version,acceptance_criteria").order("target_date").limit(500),
    supabase.from("dev_bridge_commitment_events").select("commitment_id,from_status,to_status,note,target_date_from,target_date_to,created_at").order("created_at", { ascending: false }).limit(1000),
  ]);
  const errors = [people, agents, sessions, events, entries, commitments, cevents].map(r => r.error).filter(Boolean);
  if (errors.some(e => MISSING.has(e!.code ?? ""))) return { ...empty, state: "schema_pending" };
  if (errors.length) return { ...empty, state: "unavailable" };
  const peopleRows = (people.data ?? []) as { owner: Owner; user_id: string; claimed_at: string }[];
  return {
    state: "ready",
    me: peopleRows.find(p => p.user_id === userId)?.owner ?? null,
    people: peopleRows.map(p => ({ owner: p.owner, claimed_at: p.claimed_at })),
    agents: (agents.data ?? []) as AgentRow[],
    sessions: (sessions.data ?? []) as LedgerSession[],
    events: (events.data ?? []) as LedgerEvent[],
    entries: (entries.data ?? []) as TimeEntry[],
    commitments: (commitments.data ?? []) as Commitment[],
    commitmentEvents: (cevents.data ?? []) as CommitmentEvent[],
    truncated: (events.data ?? []).length >= EVENT_LIMIT,
  };
}

export const LEDGER_ERRORS: Record<string, [string, string]> = {
  dev_bridge_forbidden: ["Solo los propietarios pueden usar el registro.", "Only owners can use the ledger."],
  dev_bridge_identity_unclaimed: ["Primero registra tu identidad (Miguel o Samuel).", "First register your identity (Miguel or Samuel)."],
  dev_bridge_identity_conflict: ["Esa identidad ya pertenece a otra cuenta, o tu cuenta ya tiene otra.", "That identity belongs to another account, or yours already has one."],
  dev_bridge_not_your_agent: ["Solo el propietario de ese agente puede activarlo.", "Only that agent's owner can activate it."],
  dev_bridge_not_your_entry: ["Solo puedes corregir tus propias horas.", "You can only correct your own hours."],
  dev_bridge_already_corrected: ["Ese registro ya tiene una corrección; corrige la más reciente.", "That entry was already corrected; correct the latest one."],
  dev_bridge_needs_other_owner: ["La verificación la hace el otro propietario.", "The other owner must verify it."],
  dev_bridge_evidence_required: ["Verificar exige un enlace de evidencia.", "Verification requires an evidence link."],
  dev_bridge_reason_required: ["Indica el motivo (mín. 5 caracteres).", "Give a reason (min. 5 characters)."],
  dev_bridge_invalid_transition: ["Ese cambio de estado no está permitido.", "That status change is not allowed."],
  dev_bridge_not_your_commitment: ["Solo el responsable marca su compromiso como entregado.", "Only the responsible owner marks it delivered."],
  dev_bridge_version_conflict: ["Otra persona lo cambió antes. Recarga.", "Someone changed it first. Reload."],
  dev_bridge_invalid: ["Datos no válidos.", "Invalid data."],
  schema_pending: ["La migración del Dev Bridge 3.0 (20261123120000) aún no está aplicada.", "The Dev Bridge 3.0 migration (20261123120000) is not applied yet."],
  unavailable: ["Servicio no disponible.", "Service unavailable."],
};
export function ledgerErrorCode(error: { code?: string; message?: string } | null): string {
  if (!error) return "unavailable";
  if (MISSING.has(error.code ?? "")) return "schema_pending";
  const known = /\b(dev_bridge_[a-z_]+)\b/.exec(error.message ?? "")?.[1];
  return known && LEDGER_ERRORS[known] ? known : error.code === "22023" || error.code === "23514" ? "dev_bridge_invalid" : "unavailable";
}
