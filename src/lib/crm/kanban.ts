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
