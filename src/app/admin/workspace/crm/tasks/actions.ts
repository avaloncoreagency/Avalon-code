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
  if (!title || title.length > 200 || description.length > 4000 || !assignee_id || !(TASK_PRIORITIES as readonly string[]).includes(priority) || (department && !DEPARTMENTS.includes(department))) back(PATH, { ...returnContext, error: "sale_invalid" });
  let due_at: string | null;
  try { due_at = dueAt(field(form, "due_at"), field(form, "tz_offset")); } catch { back(PATH, { ...returnContext, error: "sale_invalid_date" }); }
  const { data, error } = await supabase.from("crm_tasks").insert({ title, description, assignee_id, priority, due_at, client_id, department_id: department || null }).select("id").single();
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


/** Exact-version guard shared by details editing and reversible state changes. */
function taskIdentity(form: FormData) {
  const id = uuidField(form, "task_id");
  const raw = field(form, "version");
  if (!id || !/^[1-9]\\d{0,9}$/.test(raw)) return null;
  const version = Number(raw);
  return Number.isSafeInteger(version) ? { id, version } : null;
}

/** Owner-only, preserving the existing task, assignment, notifications and RLS. */
export async function saveTaskDetails(form: FormData) {
  const { supabase } = await ownerForAction();
  const context = listContext(form);
  const row = taskIdentity(form);
  const detail = row ? { task: row.id } : {};
  const title = field(form, "title").trim();
  const description = field(form, "description").trim();
  const priority = field(form, "priority");
  const assignee_id = uuidField(form, "assignee_id");
  const dueIso = field(form, "due_at_iso").trim();
  // UTC instant is produced from a browser-local datetime and must round-trip.
  let due_at: string | null = null;
  if (dueIso) {
    if (!/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$/.test(dueIso) ||
        !Number.isFinite(Date.parse(dueIso)) || new Date(dueIso).toISOString() !== dueIso) {
      back(PATH, { ...context, ...detail, error: "sale_invalid_date" });
    }
    due_at = dueIso;
  }
  if (!row || !title || title.length > 200 || description.length > 4000 ||
      !(TASK_PRIORITIES as readonly string[]).includes(priority) || !assignee_id) {
    back(PATH, { ...context, ...detail, error: "sale_invalid" });
  }
  const { data, error } = await supabase.from("crm_tasks")
    .update({ title, description, priority, assignee_id, due_at })
    .eq("id", row.id).eq("version", row.version).select("id").maybeSingle();
  if (error) back(PATH, { ...context, ...detail, error: saleErrorCode(error) });
  if (!data) back(PATH, { ...context, ...detail, error: "conflict" });
  revalidatePath(PATH);
  revalidatePath("/admin/workspace/crm/notifications");
  back(PATH, { ...context, ...detail, ok: "saved" });
}

/** Complete in one click; cancellation is reversible and preserves audit trail. */
export async function transitionTask(form: FormData) {
  const { supabase } = await ownerForAction();
  const context = listContext(form);
  const row = taskIdentity(form);
  const operation = field(form, "operation");
  const transitions: Record<string, { status: string; from: string[] }> = {
    complete: { status: "done", from: ["todo", "in_progress", "blocked"] },
    archive: { status: "cancelled", from: ["todo", "in_progress", "blocked"] },
    reopen: { status: "todo", from: ["done", "cancelled"] },
  };
  const transition = Object.hasOwn(transitions, operation) ? transitions[operation] : undefined;
  if (!row || !transition) back(PATH, { ...context, error: "sale_invalid" });
  const { data, error } = await supabase.from("crm_tasks")
    .update({ status: transition.status })
    .eq("id", row.id).eq("version", row.version).in("status", transition.from)
    .select("id").maybeSingle();
  if (error) back(PATH, { ...context, error: saleErrorCode(error) });
  if (!data) back(PATH, { ...context, error: "conflict" });
  revalidatePath(PATH);
  revalidatePath("/admin/workspace/crm/notifications");
  back(PATH, { ...context, ok: "saved" });
}
