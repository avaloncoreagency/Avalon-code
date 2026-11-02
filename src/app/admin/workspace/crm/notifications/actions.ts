"use server";
import { revalidatePath } from "next/cache";
import { ownerForAction, back, uuidField } from "@/lib/os/actions";
import { saleErrorCode } from "@/lib/sales/domain";

const PATH = "/admin/workspace/crm/notifications";

/** RLS restricts updates to the signed-in owner's own inbox and to read_at only. */
export async function markRead(form: FormData) {
  const { supabase, userId } = await ownerForAction();
  const id = uuidField(form, "id");
  let query = supabase.from("crm_notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", userId).is("read_at", null);
  if (id) query = query.eq("id", id);
  const { error } = await query;
  if (error) back(PATH, { error: saleErrorCode(error) });
  revalidatePath(PATH);
  back(PATH, { ok: "saved" });
}
