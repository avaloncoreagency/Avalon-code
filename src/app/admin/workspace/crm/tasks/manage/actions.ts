"use server";

import { revalidatePath } from "next/cache";
import { ownerForAction, back, field, uuidField } from "@/lib/os/actions";
import { TASK_PRIORITIES, saleErrorCode } from "@/lib/sales/domain";

const PATH = "/admin/workspace/crm/tasks/manage";
const TASKS_PATH = "/admin/workspace/crm/tasks";
const NOTICES_PATH = "/admin/workspace/crm/notifications";
const VIEWS = ["mine", "assigned", "open", "done", "archived"] as const;
const OPEN = ["todo", "in_progress", "blocked"];

function location(form: FormData, id?: string) {
  const view = field(form, "view");
  return {
    view: (VIEWS as readonly string[]).includes(view) ? view : "mine",
    ...(id ? { task: id } : {}),
  };
}

function identity(form: FormData) {
  const id = uuidField(form, "task_id");
  const raw = field(form, "version");
  if (!id || !/^[1-9]\d{0,9}$/.test(raw)) return null;
  const version = Number(raw);
  return Number.isSafeInteger(version) ? { id, version } : null;
}

function validatedDue(form: FormData): string | null | undefined {
  const iso = field(form, "due_at_iso").trim();
  if (!iso) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(iso)) return undefined;
  const time = Date.parse(iso);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== iso) return undefined;
  return iso;
}

function changed() {
  revalidatePath(PATH);
  revalidatePath(TASKS_PATH);
  revalidatePath(NOTICES_PATH);
}

/** Uses the existing owner session, RLS and per-row version guard; never changes task identity. */
export async function saveTask(form: FormData) {
  const { supabase } = await ownerForAction();
  const row = identity(form);
  const redirectTo = location(form, row?.id);
  const title = field(form, "title").trim();
  const description = field(form, "description").trim();
  const priority = field(form, "priority");
  const assignee_id = uuidField(form, "assignee_id");
  const due_at = validatedDue(form);
  if (!row || !title || title.length > 200 || description.length > 4000 ||
      !(TASK_PRIORITIES as readonly string[]).includes(priority) || !assignee_id ||
      due_at === undefined) {
    back(PATH, { ...redirectTo, error: "sale_invalid" });
  }
  const { data, error } = await supabase.from("crm_tasks")
    .update({ title, description, priority, assignee_id, due_at })
    .eq("id", row.id).eq("version", row.version)
    .select("id").maybeSingle();
  if (error) back(PATH, { ...redirectTo, error: saleErrorCode(error) });
  if (!data) back(PATH, { ...redirectTo, error: "conflict" });
  changed();
  back(PATH, { ...redirectTo, ok: "saved" });
}

/** "Remove" is a reversible cancellation. Records, comments and audit trail remain intact. */
export async function transitionTask(form: FormData) {
  const { supabase } = await ownerForAction();
  const row = identity(form);
  const redirectTo = location(form);
  const operation = field(form, "operation");
  const transitions: Record<string, { status: string; from: string[] }> = {
    complete: { status: "done", from: OPEN },
    archive: { status: "cancelled", from: OPEN },
    reopen: { status: "todo", from: ["done", "cancelled"] },
  };
  const transition = transitions[operation];
  if (!row || !transition) back(PATH, { ...redirectTo, error: "sale_invalid" });
  const { data, error } = await supabase.from("crm_tasks")
    .update({ status: transition.status })
    .eq("id", row.id).eq("version", row.version)
    .in("status", transition.from)
    .select("id").maybeSingle();
  if (error) back(PATH, { ...redirectTo, error: saleErrorCode(error) });
  if (!data) back(PATH, { ...redirectTo, error: "conflict" });
  changed();
  back(PATH, { ...redirectTo, ok: "saved" });
}
