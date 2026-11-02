import type { Row, Stage } from "./domain";

export type PipelineColumn = {
  stage: Stage;
  leads: Row[];
  estimatedValue: number;
};

/** The board reports only rows actually fetched (max 50 per CRM page). */
export function groupPipeline(stages: readonly Stage[], rows: readonly Row[]): PipelineColumn[] {
  const byStage = new Map(stages.map((stage) => [stage.id, [] as Row[]]));
  for (const row of rows) {
    const bucket = byStage.get(String(row.stage_id ?? ""));
    if (bucket) bucket.push(row);
  }
  return stages.map((stage) => {
    const leads = byStage.get(stage.id)!;
    const estimatedValue = leads.reduce((total, row) => {
      const value = Number(row.value ?? 0);
      return total + (Number.isFinite(value) && value > 0 ? value : 0);
    }, 0);
    return { stage, leads, estimatedValue };
  });
}

/** Relative status uses the viewer's local day; no invented follow-up date. */
export function followUpState(value: unknown, now: Date = new Date()): "missing" | "overdue" | "today" | "scheduled" {
  if (typeof value !== "string" || !value) return "missing";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "missing";
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return day < today ? "overdue" : day === today ? "today" : "scheduled";
}

/** Counts and filters operate only on the loaded CRM page, never the whole database. */
export type PipelineFocus = "all" | "attention" | "overdue" | "today" | "missing";
export type PipelineFocusCounts = Record<PipelineFocus, number>;

function actionableStageIds(stages: readonly Stage[]): Set<string> {
  return new Set(stages.filter((stage) => stage.kind === "open").map((stage) => String(stage.id)));
}

export function pipelineFocusCounts(
  stages: readonly Stage[],
  rows: readonly Row[],
  now: Date = new Date(),
): PipelineFocusCounts {
  const openStages = actionableStageIds(stages);
  const counts: PipelineFocusCounts = { all: rows.length, attention: 0, overdue: 0, today: 0, missing: 0 };
  for (const lead of rows) {
    if (!openStages.has(String(lead.stage_id ?? "")) || lead.archived === true) continue;
    const status = followUpState(lead.follow_up_at, now);
    if (status === "scheduled") continue;
    counts[status] += 1;
    counts.attention += 1;
  }
  return counts;
}

export function filterPipelineByFocus(
  stages: readonly Stage[],
  rows: readonly Row[],
  focus: PipelineFocus,
  now: Date = new Date(),
): Row[] {
  if (focus === "all") return [...rows];
  const openStages = actionableStageIds(stages);
  return rows.filter((lead) => {
    if (!openStages.has(String(lead.stage_id ?? "")) || lead.archived === true) return false;
    const status = followUpState(lead.follow_up_at, now);
    return focus === "attention" ? status !== "scheduled" : status === focus;
  });
}
