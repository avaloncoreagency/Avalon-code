/**
 * Pure read-only overview of existing CRM work orders and tasks.
 * No mutations, provider calls or financial estimates.
 */
export const ACTIVE_ORDER_STATUSES = ["open", "in_progress", "blocked"] as const;

export type DeliveryOrder = { id: string; status: string; due_on: string | null };
export type DeliveryTask = { work_order_id: string | null; status: string };
export type TaskProgress = { done: number; total: number };
export type DeliverySummary = {
  active: number;
  blocked: number;
  overdue: number;
  attention: number;
  delivered: number;
  cancelled: number;
  progress: Record<string, TaskProgress>;
  overdueIds: string[];
  attentionIds: string[];
};

/** Due dates are DATE fields. An order is overdue only before today's UTC date. */
export function summarizeDelivery(
  orders: readonly DeliveryOrder[],
  tasks: readonly DeliveryTask[],
  todayUtc: string,
): DeliverySummary {
  const progress: Record<string, TaskProgress> = Object.create(null);
  const knownIds = new Set<string>();
  for (const order of orders) {
    knownIds.add(order.id);
    progress[order.id] = { done: 0, total: 0 };
  }
  for (const task of tasks) {
    if (!task.work_order_id || !knownIds.has(task.work_order_id) || task.status === "cancelled") continue;
    const item = progress[task.work_order_id];
    item.total += 1;
    if (task.status === "done") item.done += 1;
  }
  let active = 0, blocked = 0, delivered = 0, cancelled = 0;
  const overdueIds: string[] = [];
  for (const order of orders) {
    const isActive = (ACTIVE_ORDER_STATUSES as readonly string[]).includes(order.status);
    if (isActive) active += 1;
    if (order.status === "blocked") blocked += 1;
    if (order.status === "delivered") delivered += 1;
    if (order.status === "cancelled") cancelled += 1;
    if (isActive && order.due_on && /^\d{4}-\d{2}-\d{2}$/.test(order.due_on) && order.due_on < todayUtc) {
      overdueIds.push(order.id);
    }
  }
  // A blocked and overdue order needs attention only once; closed work is excluded.
  const attentionIds = [...new Set([...overdueIds, ...orders.filter(order => order.status === "blocked").map(order => order.id)])];
  return { active, blocked, overdue: overdueIds.length, attention: attentionIds.length,
    delivered, cancelled, progress, overdueIds, attentionIds };
}
