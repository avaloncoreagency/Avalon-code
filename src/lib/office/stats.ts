// Office statistics: plain counts over stored records. No productivity score is computed on purpose.
export type TaskLite = { assignee_id: string; status: string; due_at: string | null; completed_at: string | null; created_at: string; project_id: string | null };
export type MemberStats = { assigned: number; open: number; overdue: number; done: number; projects: number };
export const OPEN_STATUSES = ["todo", "in_progress", "blocked"];
export const PERIODS = ["7", "30", "90", "all"] as const;
export type Period = (typeof PERIODS)[number];

export function periodStart(period: Period, now = Date.now()): number | null {
  return period === "all" ? null : now - Number(period) * 86400000;
}

/**
 * Definitions (shown in the UI):
 * - assigned: tasks created in the period with this assignee (all statuses).
 * - open / overdue: current state, independent of the period (open = todo|in_progress|blocked; overdue = open and due before now).
 * - done: tasks completed in the period.
 * - projects: distinct projects linked to any of the member's tasks.
 */
export function memberStats(tasks: TaskLite[], memberId: string, period: Period, now = Date.now()): MemberStats {
  const from = periodStart(period, now);
  const inPeriod = (v: string | null) => v !== null && (from === null || Date.parse(v) >= from);
  const mine = tasks.filter(t => t.assignee_id === memberId);
  const open = mine.filter(t => OPEN_STATUSES.includes(t.status));
  return {
    assigned: mine.filter(t => inPeriod(t.created_at)).length,
    open: open.length,
    overdue: open.filter(t => t.due_at !== null && Date.parse(t.due_at) < now).length,
    done: mine.filter(t => t.status === "done" && inPeriod(t.completed_at)).length,
    projects: new Set(mine.map(t => t.project_id).filter(Boolean)).size,
  };
}

export function teamStats(tasks: TaskLite[], period: Period, now = Date.now()) {
  const from = periodStart(period, now);
  const open = tasks.filter(t => OPEN_STATUSES.includes(t.status));
  return {
    active: open.length,
    overdue: open.filter(t => t.due_at !== null && Date.parse(t.due_at) < now).length,
    done: tasks.filter(t => t.status === "done" && t.completed_at !== null && (from === null || Date.parse(t.completed_at) >= from)).length,
  };
}

/** Daily completed-task counts for the sparkline (last n days, oldest first). */
export function completedSeries(tasks: TaskLite[], days: number, now = Date.now()): number[] {
  const out = Array.from({ length: days }, () => 0);
  const today = Math.floor(now / 86400000);
  for (const t of tasks) {
    if (t.status !== "done" || !t.completed_at) continue;
    const d = today - Math.floor(Date.parse(t.completed_at) / 86400000);
    if (d >= 0 && d < days) out[days - 1 - d]++;
  }
  return out;
}
