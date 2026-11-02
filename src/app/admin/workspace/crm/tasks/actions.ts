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

export async function createTask(form: FormData) {
  const { supabase } = await ownerForAction();
  const title = field(form, "title").trim();
  const description = field(form, "description").trim();
  const assignee_id = uuidField(form, "assignee_id");
  const priority = field(form, "priority") || "normal";
  const department = field(form, "department_id");
  const client_id = uuidField(form, "client_id");
  if (!title || title.length > 200 || description.length > 4000 || !assignee_id || !(TASK_PRIORITIES as readonly string[]).includes(priority) || (department && !DEPARTMENTS.includes(department))) back(PATH, { error: "sale_invalid" });
  let due_at: string | null;
  try { due_at = dueAt(field(form, "due_at"), field(form, "tz_offset")); } catch { back(PATH, { error: "sale_invalid_date" }); }
  const { data, error } = await supabase.from("crm_tasks").insert({ title, description, assignee_id, priority, due_at, client_id, department_id: department || null }).select("id").single();
  if (error) back(PATH, { error: saleErrorCode(error) });
  revalidatePath(PATH);
  back(PATH, { ok: "created", task: data.id });
}

export async function updateTask(form: FormData) {
  const { supabase } = await ownerForAction();
  const id = uuidField(form, "task_id");
  const version = Number(field(form, "version"));
  const status = field(form, "status");
  const assignee_id = uuidField(form, "assignee_id");
  const detail: Record<string, string> = field(form, "return") === "detail" && id ? { task: id } : {};
  if (!id || !Number.isSafeInteger(version) || !(TASK_STATUSES as readonly string[]).includes(status) || !assignee_id) back(PATH, { error: "sale_invalid" });
  const patch: Record<string, string> = { status, assignee_id };
  const priority = field(form, "priority");
  if (priority) {
    if (!(TASK_PRIORITIES as readonly string[]).includes(priority)) back(PATH, { error: "sale_invalid" });
    patch.priority = priority;
  }
  // Optimistic concurrency: only update the version the user saw.
  const { data, error } = await supabase.from("crm_tasks").update(patch).eq("id", id).eq("version", version).select("id").maybeSingle();
  if (error) back(PATH, { ...detail, error: saleErrorCode(error) });
  if (!data) back(PATH, { ...detail, error: "conflict" });
  revalidatePath(PATH);
  back(PATH, { ...detail, ok: "saved" });
}

export async function commentTask(form: FormData) {
  const { supabase } = await ownerForAction();
  const id = uuidField(form, "task_id");
  const body = field(form, "body").trim();
  if (!id || !body || body.length > 4000) back(PATH, { error: "sale_invalid" });
  const { error } = await supabase.from("crm_task_comments").insert({ task_id: id, body });
  if (error) back(PATH, { task: id, error: saleErrorCode(error) });
  revalidatePath(PATH);
  back(PATH, { task: id, ok: "saved" });
}
