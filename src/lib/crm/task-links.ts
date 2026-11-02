// Build task links with the current validated list context. Detail links may
// add a task ID, while Close and pagination must retain the active filters.
export type TaskLinkContext = {
  view: string;
  page: number;
  client?: string | null;
  workOrder?: string | null;
  task?: string | null;
};

export function taskLink({ view, page, client, workOrder, task }: TaskLinkContext): string {
  const params = new URLSearchParams({ view });
  if (page > 0) params.set('page', String(page));
  if (client) params.set('client', client);
  if (workOrder) params.set('work_order', workOrder);
  if (task) params.set('task', task);
  return `/admin/workspace/crm/tasks?${params.toString()}`;
}

/** A linked order is a team workflow: show everyone's open work by default. */
export function resolveTaskView(requested: string | null | undefined, fromWorkOrder: boolean): string {
  if (requested && ["mine", "assigned", "overdue", "all", "done"].includes(requested)) return requested;
  return fromWorkOrder ? "all" : "mine";
}
