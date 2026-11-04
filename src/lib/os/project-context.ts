/**
 * Commercial context of a module project (Website Designer, E-commerce Designer, CRM Creator, AI Receptionist,
 * Marketing Hub): the client 360°, the sale and work order it came from, and the tasks tied to it. It is read from
 * the real relations (os_projects.client_id, crm_work_orders.project_id, crm_tasks.project_id), so every module shares
 * one client / sale / project / task spine instead of keeping its own copy. Read-only; nothing is inferred by name.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { run } from "./data";

export type ContextClient = { id: string; legal_name: string; client_code: string };
export type ContextOrder = {
  id: string; sale_id: string; sale_number: string | null; status: string; due_on: string | null;
  assignee_id: string; department_id: string;
};
export type ContextTask = { id: string; title: string; status: string; priority: string; due_at: string | null; assignee_id: string };
export type ProjectContext = {
  client: ContextClient | null; order: ContextOrder | null; tasks: ContextTask[];
  open: number; overdue: number; closed: number;
};
export const OPEN_TASK_STATUSES = ["todo", "in_progress", "blocked"];

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** Pure summary used by the panel and the tests. */
export function summarizeTasks(tasks: ContextTask[], now = Date.now()) {
  const open = tasks.filter(t => OPEN_TASK_STATUSES.includes(t.status));
  return {
    open: open.length,
    overdue: open.filter(t => t.due_at !== null && Date.parse(t.due_at) < now).length,
    closed: tasks.filter(t => t.status === "done").length,
  };
}

/** Null when the sales tables are not available in this environment (the panel then stays hidden, never invented). */
export async function loadProjectContext(supabase: SupabaseClient, projectId: string): Promise<ProjectContext | null> {
  const [order, tasks, project] = await Promise.all([
    run<{
      id: string; sale_id: string; client_id: string; department_id: string; assignee_id: string; status: string; due_on: string | null;
      crm_sales: { sale_number: string } | { sale_number: string }[] | null; crm_clients: ContextClient | ContextClient[] | null;
    } | null>(supabase.from("crm_work_orders")
      .select("id,sale_id,client_id,department_id,assignee_id,status,due_on,crm_sales(sale_number),crm_clients(id,legal_name,client_code)")
      .eq("project_id", projectId).maybeSingle()),
    run<ContextTask[]>(supabase.from("crm_tasks").select("id,title,status,priority,due_at,assignee_id")
      .eq("project_id", projectId).order("due_at", { ascending: true, nullsFirst: false }).limit(50)),
    run<{ crm_clients: ContextClient | ContextClient[] | null } | null>(supabase.from("os_projects")
      .select("crm_clients(id,legal_name,client_code)").eq("id", projectId).maybeSingle()),
  ]);
  if (order.error === "schema_pending" || tasks.error === "schema_pending") return null;
  const wo = order.data;
  const taskRows = tasks.data ?? [];
  const client = one(wo?.crm_clients) ?? one(project.data?.crm_clients);
  return {
    client,
    order: wo ? {
      id: wo.id, sale_id: wo.sale_id, sale_number: one(wo.crm_sales)?.sale_number ?? null, status: wo.status,
      due_on: wo.due_on, assignee_id: wo.assignee_id, department_id: wo.department_id,
    } : null,
    tasks: taskRows,
    ...summarizeTasks(taskRows),
  };
}
