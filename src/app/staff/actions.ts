"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff, requireStaffMessenger } from "@/lib/auth/staff";

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
