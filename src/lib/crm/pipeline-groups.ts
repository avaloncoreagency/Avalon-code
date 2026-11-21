import type { Row, Stage } from "./domain";

/**
 * Approved pipeline presentation (Miguel, 2026-11-19 — docs/independent-qa/PIPELINE_HANDOFF.md, Issue #253):
 * five visible groups over the EXISTING detailed stages. Nothing is migrated or rewritten: a lead keeps its detailed
 * stage (e.g. "Respondió") and its history; grouping is presentation only. Moving a card INTO a group writes that
 * group's canonical stage through the existing versioned update (won keeps the signed-contract gate, lost keeps the
 * loss reason). A stage that no group claims (an owner-created custom stage) is never dropped or auto-won: its cards
 * stay visible in a "to review" area until an owner moves them.
 */
export type PipelineGroupId = "new" | "conversation" | "proposal" | "won" | "lost";
export type PipelineGroup = { id: PipelineGroupId; label: [es: string, en: string]; stages: readonly string[]; target: string };

export const PIPELINE_GROUPS: readonly PipelineGroup[] = [
  { id: "new", label: ["Nuevo", "New"], stages: ["new", "researched", "contact-pending"], target: "new" },
  { id: "conversation", label: ["En conversación", "In conversation"], stages: ["contacted", "replied", "qualified", "meeting", "diagnosed", "nurture"], target: "contacted" },
  { id: "proposal", label: ["Propuesta", "Proposal"], stages: ["proposal", "negotiation"], target: "proposal" },
  { id: "won", label: ["Ganado", "Won"], stages: ["won"], target: "won" },
  { id: "lost", label: ["Perdido", "Lost"], stages: ["lost"], target: "lost" },
];
/** Groups reachable with the Previous/Advance arrows (closing a deal is always an explicit choice). */
export const OPEN_GROUPS: readonly PipelineGroupId[] = ["new", "conversation", "proposal"];

export type GroupedColumn = { group: PipelineGroup; leads: Row[]; estimatedValue: number };
export type GroupedPipeline = { columns: GroupedColumn[]; unmapped: Row[] };

export function groupOfStage(stageId: unknown): PipelineGroup | null {
  const id = String(stageId ?? "");
  return PIPELINE_GROUPS.find(group => group.stages.includes(id)) ?? null;
}

const estimate = (rows: Row[]) => rows.reduce((total, row) => {
  const value = Number(row.value ?? 0);
  return total + (Number.isFinite(value) && value > 0 ? value : 0);
}, 0);

/** Groups only the rows actually fetched (the feed is paginated); counts are page-scoped by construction. */
export function groupPipelineFive(rows: readonly Row[]): GroupedPipeline {
  const buckets = new Map<PipelineGroupId, Row[]>(PIPELINE_GROUPS.map(group => [group.id, []]));
  const unmapped: Row[] = [];
  for (const row of rows) {
    const group = groupOfStage(row.stage_id);
    if (group) buckets.get(group.id)!.push(row); else unmapped.push(row);
  }
  return {
    columns: PIPELINE_GROUPS.map(group => ({ group, leads: buckets.get(group.id)!, estimatedValue: estimate(buckets.get(group.id)!) })),
    unmapped,
  };
}

/**
 * Stage to write when a lead is moved into a group. Returns null when nothing must change: the lead is already in
 * that group (its detailed stage is preserved) or the canonical stage does not exist in this database.
 */
export function moveTarget(lead: Row, groupId: string, stages: readonly Stage[]): string | null {
  const group = PIPELINE_GROUPS.find(g => g.id === groupId);
  if (!group) return null;
  if (group.stages.includes(String(lead.stage_id ?? ""))) return null;
  return stages.some(stage => stage.id === group.target) ? group.target : null;
}

/** Neighbouring open group for the card arrows; unmapped or closed leads have none (explicit choice instead). */
export function neighbourGroup(lead: Row, direction: -1 | 1): PipelineGroup | null {
  const current = groupOfStage(lead.stage_id);
  if (!current) return null;
  const index = OPEN_GROUPS.indexOf(current.id);
  if (index < 0) return null;
  const next = OPEN_GROUPS[index + direction];
  return next ? PIPELINE_GROUPS.find(g => g.id === next)! : null;
}

/** Hard business rules a move into a group must satisfy before it can be saved. */
export type MoveRequirement = "loss_reason" | "won_gate" | null;
export function moveRequirement(groupId: string): MoveRequirement {
  return groupId === "lost" ? "loss_reason" : groupId === "won" ? "won_gate" : null;
}

/**
 * Restoring a lost (or re-opening a won) lead: when it returns to the group it worked in before, put it back on the
 * exact detailed stage it last had there (from crm_lead_stage_history, newest first) instead of the group's canonical
 * stage, so its working state is recovered. Falls back to moveTarget when there is no usable history.
 */
export function restoreTarget(lead: Row, groupId: string, stages: readonly Stage[], history: readonly { to_stage?: unknown }[]): string | null {
  const group = PIPELINE_GROUPS.find(g => g.id === groupId);
  if (!group || group.stages.includes(String(lead.stage_id ?? ""))) return null;
  for (const entry of history) {
    const stage = String(entry.to_stage ?? "");
    if (group.stages.includes(stage) && stages.some(s => s.id === stage)) return stage;
  }
  return moveTarget(lead, groupId, stages);
}

/** Group to render a lead in while a move is pending (optimistic), else its real group. */
export function displayedGroup(lead: Row, pending: ReadonlyMap<string, PipelineGroupId>): PipelineGroupId | null {
  return pending.get(String(lead.id)) ?? groupOfStage(lead.stage_id)?.id ?? null;
}
