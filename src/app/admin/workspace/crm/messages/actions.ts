"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth/session";

const PATH = "/admin/workspace/crm/messages";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const textField = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
};
function finish(status: string): never {
  revalidatePath(PATH);
  redirect(PATH + "?status=" + status);
}

/** Owner-only thin adapter for the existing Staff private messaging RLS engine. */
export async function sendInternalMessage(form: FormData) {
  const { supabase, userId } = await requireOwner();
  const recipient_id = textField(form, "recipient_id");
  const body = textField(form, "body");
  if (!UUID.test(recipient_id) || recipient_id === userId || !body || body.length > 4000) {
    finish("invalid");
  }
  // Supabase RLS and the trigger enforce sender identity, recipient visibility and rate limits.
  const result = await supabase.from("staff_private_messages")
    .insert({ sender_id: userId, recipient_id, body });
  finish(result.error ? "failed" : "sent");
}

export async function markInternalMessageRead(form: FormData) {
  const { supabase, userId } = await requireOwner();
  const id = textField(form, "message_id");
  if (!UUID.test(id)) finish("invalid");
  // Only the actual recipient can set read_at. Sender and other owners cannot read on behalf of anyone.
  const result = await supabase.from("staff_private_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id).eq("recipient_id", userId).is("read_at", null)
    .select("id").maybeSingle();
  finish(result.error || !result.data ? "failed" : "read");
}
