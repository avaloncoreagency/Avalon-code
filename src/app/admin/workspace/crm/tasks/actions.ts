"use server";
import { revalidatePath } from "next/cache";
import { ownerForAction, back, field, uuidField } from "@/lib/os/actions";
import { TASK_PRIORITIES, TASK_STATUSES, saleErrorCode } from "@/lib/sales/domain";

const PATH = "/admin/workspace/crm/tasks";
const DEPARTMENTS = ["website", "ecommerce", "crm_creator", "receptionist", "marketing", "sales"];

function dueAt(value: string, tz: string) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw Error("date");
  // The browser sends local wall time plus its UTC offset in minutes.
  const offset = Number(tz);
  if (!Number.isInteger(offset) || Math.abs(offset) > 900) throw Error("date");
  const ms = Date.parse(`${value}:00Z`) + offset * 60000;
  if (!Number.isFinite(ms)) throw Error("date");
  return new Date(ms).toISOString();
}

// Server actions are public POST endpoints; accept only known and validated
// list parameters before including them in a navigation redirect.
function listContext(form: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  const view = field(form, "view");
  if (["mine", "assigned", "overdue", "all", "done"].includes(view)) result.view = view;
  const page = field(form, "page");
  if (/^\d{1,4}$/.test(page) && Number(page) <= 2000) result.page = String(Number(page));
  const client = uuidField(form, "client");
  if (client) result.client = client;
  const workOrder = uuidField(form, "work_order");
  if (workOrder) result.work_order = workOrder;
  return result;
}

export async function createTask(form: FormData) {
  const { supabase } = await ownerForAction();
  const returnContext = listContext(form);
  const title = field(form, "title").trim();
  const description = field(form, "description").trim();
  const assignee_id = uuidField(form, "assignee_id");
  const priority = field(form, "priority") || "normal";
  const department = field(form, "department_id");
  const client_id = uuidField(form, "client_id");
  const submittedWorkOrder = field(form, "work_order");
  // Context is only a navigation hint until the order has been fetched under
  // owner authorization. Never trust the submitted client/sale/project fields.
  if (submittedWorkOrder && !returnContext.work_order) back(PATH, { ...returnContext, error: "sale_invalid" });
  if (!title || title.length > 200 || description.length > 4000 || !assignee_id || !(TASK_PRIORITIES as readonly string[]).includes(priority) || (department && !DEPARTMENTS.includes(department))) back(PATH, { ...returnContext, error: "sale_invalid" });
  let due_at: string | null;
  try { due_at = dueAt(field(form, "due_at"), field(form, "tz_offset")); } catch { back(PATH, { ...returnContext, error: "sale_invalid_date" }); }
  let linkedOrder: { id: string; client_id: string; sale_id: string; project_id: string | null; department_id: string } | null = null;
  if (returnContext.work_order) {
    const { data, error } = await supabase.from("crm_work_orders")
      .select("id,client_id,sale_id,project_id,department_id")
      .eq("id", returnContext.work_order).maybeSingle();
    if (error) back(PATH, { ...returnContext, error: saleErrorCode(error) });
    if (!data || (client_id && client_id !== data.client_id)) back(PATH, { ...returnContext, error: "sale_invalid" });
    linkedOrder = data;
  }
  const { data, error } = await supabase.from("crm_tasks").insert({
    title, description, assignee_id, priority, due_at,
    client_id: linkedOrder?.client_id ?? client_id,
    department_id: linkedOrder?.department_id ?? (department || null),
    ...(linkedOrder ? {
      work_order_id: linkedOrder.id,
      sale_id: linkedOrder.sale_id,
      project_id: linkedOrder.project_id,
    } : {}),
  }).select("id").single();
  if (error) back(PATH, { ...returnContext, error: saleErrorCode(error) });
  revalidatePath(PATH);
  back(PATH, { ...returnContext, ok: "created", task: data.id });
}

export async function updateTask(form: FormData) {
  const { supabase } = await ownerForAction();
  const returnContext = listContext(form);
  const id = uuidField(form, "task_id");
  const version = Number(field(form, "version"));
  const status = field(form, "status");
  const assignee_id = uuidField(form, "assignee_id");
  const detail: Record<string, string> = field(form, "return") === "detail" && id ? { task: id } : {};
  if (!id || !Number.isSafeInteger(version) || !(TASK_STATUSES as readonly string[]).includes(status) || !assignee_id) back(PATH, { ...returnContext, ...detail, error: "sale_invalid" });
  const patch: Record<string, string> = { status, assignee_id };
  const priority = field(form, "priority");
  if (priority) {
    if (!(TASK_PRIORITIES as readonly string[]).includes(priority)) back(PATH, { ...returnContext, ...detail, error: "sale_invalid" });
    patch.priority = priority;
  }
  // Optimistic concurrency: only update the version the user saw.
  const { data, error } = await supabase.from("crm_tasks").update(patch).eq("id", id).eq("version", version).select("id").maybeSingle();
  if (error) back(PATH, { ...returnContext, ...detail, error: saleErrorCode(error) });
  if (!data) back(PATH, { ...returnContext, ...detail, error: "conflict" });
  revalidatePath(PATH);
  back(PATH, { ...returnContext, ...detail, ok: "saved" });
}

export async function commentTask(form: FormData) {
  const { supabase } = await ownerForAction();
  const returnContext = listContext(form);
  const id = uuidField(form, "task_id");
  const body = field(form, "body").trim();
  if (!id || !body || body.length > 4000) back(PATH, { ...returnContext, ...(id ? { task: id } : {}), error: "sale_invalid" });
  const { error } = await supabase.from("crm_task_comments").insert({ task_id: id, body });
  if (error) back(PATH, { ...returnContext, task: id, error: saleErrorCode(error) });
  revalidatePath(PATH);
  back(PATH, { ...returnContext, task: id, ok: "saved" });
}
