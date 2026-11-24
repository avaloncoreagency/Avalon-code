"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireStaff, requireStaffMessenger } from "@/lib/auth/staff";
import { DEFAULT_TZ, isKind, isStatus, localToUtc, validTimeZone } from "@/lib/staff/work";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const field = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
};
function finish(path: string, state: string): never {
  revalidatePath(path);
  redirect(`${path}?status=${state}`);
}

export async function createStaffCasefile(form: FormData) {
  const session = await requireStaff();
  if (!session.permissions.can_create_casefiles) redirect("/staff?status=denied");
  const title = field(form, "title"), contact_name = field(form, "contact_name");
  const notes = field(form, "notes"), requested = field(form, "linked_client_id");
  const linked_client_id = requested || null;
  if (!title || title.length > 200 || contact_name.length > 160 ||
    notes.length > 12000 || (linked_client_id && !UUID.test(linked_client_id)))
    redirect("/staff?status=invalid");
  if (linked_client_id) {
    const grant = await session.supabase.from("staff_client_grants")
      .select("access_level").eq("user_id", session.userId)
      .eq("client_id", linked_client_id).eq("active", true).maybeSingle();
    if (grant.error || grant.data?.access_level !== "work")
      redirect("/staff?status=denied");
  }
  const { error } = await session.supabase.from("staff_casefiles").insert({
    user_id: session.userId, linked_client_id, title, contact_name, notes,
  });
  finish("/staff", error ? "failed" : "case-created");
}

export async function editStaffCasefile(form: FormData) {
  const session = await requireStaff();
  const id = field(form, "case_id"), title = field(form, "title");
  const contact_name = field(form, "contact_name"), notes = field(form, "notes");
  const status = field(form, "case_status");
  if (!UUID.test(id) || !title || title.length > 200 ||
    contact_name.length > 160 || notes.length > 12000 ||
    !["open","in_progress","closed"].includes(status))
    redirect("/staff?status=invalid");
  // RLS still enforces ownership AND a current work grant for linked cases.
  const { data, error } = await session.supabase.from("staff_casefiles")
    .update({ title, contact_name, notes, status })
    .eq("id", id).eq("user_id", session.userId).select("id").maybeSingle();
  finish("/staff", error || !data ? "failed" : "case-saved");
}

export async function sendStaffMessage(form: FormData) {
  const session = await requireStaffMessenger();
  const recipient_id = field(form, "recipient_id"), body = field(form, "body");
  const path = session.kind === "owner" ? "/admin/staff" : "/staff";
  if (!UUID.test(recipient_id) || recipient_id === session.userId ||
    !body || body.length > 4000) redirect(`${path}?status=invalid`);
  const { error } = await session.supabase.from("staff_private_messages")
    .insert({ sender_id: session.userId, recipient_id, body });
  finish(path, error ? "failed" : "sent");
}

export async function readStaffMessage(form: FormData) {
  const session = await requireStaffMessenger();
  const path = session.kind === "owner" ? "/admin/staff" : "/staff";
  const id = field(form, "message_id");
  if (!UUID.test(id)) redirect(`${path}?status=invalid`);
  // Only the recipient can change read_at; no message body editing or deletion.
  const { data, error } = await session.supabase.from("staff_private_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id).eq("recipient_id", session.userId)
    .is("read_at", null).select("id").maybeSingle();
  finish(path, error || !data ? "failed" : "read");
}

/** Employee-created work (needs can_create_events). Origin, assignee and author are fixed by the database. */
export async function createMyWorkItem(form: FormData) {
  const session = await requireStaff();
  if (!session.permissions.can_create_events) redirect("/staff?status=denied#calendar");
  const kind = field(form, "kind"), title = field(form, "title"), tz = field(form, "time_zone") || DEFAULT_TZ;
  const date = field(form, "date"), start = field(form, "start"), end = field(form, "end"), lead = field(form, "lead_id");
  if (!isKind(kind) || !title || title.length > 200 || !validTimeZone(tz) || (lead && !UUID.test(lead))) redirect("/staff?status=invalid#calendar");
  const startsAt = kind === "task" ? null : localToUtc(date, start, tz);
  const dueAt = kind === "task" ? localToUtc(date, start || "17:00", tz) : null;
  const endsAt = kind !== "task" && end ? localToUtc(date, end, tz) : null;
  if ((kind !== "task" && !startsAt) || (kind === "task" && !dueAt) || (endsAt && startsAt && endsAt < startsAt)) redirect("/staff?status=invalid#calendar");
  const key = UUID.test(field(form, "idempotency_key")) ? field(form, "idempotency_key") : randomUUID();
  const { error } = await session.supabase.from("staff_work_items").insert({
    idempotency_key: key, kind, origin: "staff_created", assignee_id: session.userId, title,
    instructions: field(form, "instructions").slice(0, 4000), starts_at: startsAt, ends_at: endsAt, due_at: dueAt, time_zone: tz, lead_id: lead || null,
  });
  // A replayed form (same idempotency key) is not an error: the item already exists.
  if (error && !/duplicate key|unique/i.test(error.message)) finish("/staff", /not_granted/.test(error.message) ? "denied" : "failed");
  finish("/staff", "work-saved");
}

/** Progress on an item the employee can see: status, completion evidence, reschedule when the DB allows it. */
export async function updateMyWorkItem(form: FormData) {
  const session = await requireStaff();
  const id = field(form, "item_id"), version = Number(field(form, "version")), status = field(form, "status");
  if (!UUID.test(id) || !Number.isInteger(version) || (status && !isStatus(status))) finish("/staff", "invalid");
  const patch: Record<string, unknown> = {};
  if (status) patch.status = status;
  const note = field(form, "completion_note");
  if (note) patch.completion_note = note.slice(0, 2000);
  if (status === "done" && note.length < 3) finish("/staff", "evidence-required");
  const date = field(form, "date"), start = field(form, "start"), tz = field(form, "time_zone") || DEFAULT_TZ;
  if (date) {
    const iso = localToUtc(date, start || "09:00", tz);
    if (!iso) finish("/staff", "invalid");
    if (field(form, "kind") === "task") patch.due_at = iso; else { patch.starts_at = iso; patch.ends_at = null; }
  }
  if (!Object.keys(patch).length) finish("/staff", "invalid");
  const { data, error } = await session.supabase.from("staff_work_items").update(patch).eq("id", id).eq("version", version).select("id");
  if (error) finish("/staff", /forbidden|reschedule|cancel/.test(error.message) ? "denied" : "failed");
  finish("/staff", data && data.length ? "work-saved" : "stale");
}

/** Internal notes: personal (only the author) or work (author, owners, people who can see the linked item). */
export async function addStaffNote(form: FormData) {
  const session = await requireStaff();
  const visibility = field(form, "visibility"), body = field(form, "body"), item = field(form, "item_id"), lead = field(form, "lead_id");
  if (!["personal", "work"].includes(visibility) || !body || body.length > 4000 || (item && !UUID.test(item)) || (lead && !UUID.test(lead))
    || (visibility === "personal" && (item || lead))) finish("/staff", "invalid");
  const { error } = await session.supabase.from("staff_notes").insert({ visibility, body, item_id: item || null, lead_id: lead || null });
  finish("/staff", error ? "denied" : "note-saved");
}
