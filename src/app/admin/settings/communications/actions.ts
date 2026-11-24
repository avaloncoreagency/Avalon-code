"use server";
import { revalidatePath } from "next/cache";
import { back, field, ownerForAction } from "@/lib/os/actions";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAGE = "/admin/settings/communications";

/**
 * Client communications & support settings. Owners only (session + RLS policy requiring updated_by = auth.uid()).
 * A phone is shown only once marked approved. The agent-invitation sender is NOT written here (AGENT PORTAL owns it).
 */
export async function updateCompanySettings(form: FormData) {
  const { supabase, userId } = await ownerForAction();
  const emails = ["support_email", "client_sender_email", "reply_to_email"].map(k => [k, field(form, k).trim().toLowerCase()] as const);
  if (emails.some(([, v]) => !EMAIL.test(v) || v.length > 254)) back(PAGE, { error: "settings_invalid" });
  const phone = field(form, "support_phone").trim();
  if (phone && !/^\+?[0-9 ().-]{7,24}$/.test(phone)) back(PAGE, { error: "settings_invalid" });
  const stamp = new Date().toISOString();
  const r = await supabase.from("avalon_company_settings").update({
    ...Object.fromEntries(emails), support_phone: phone || null, support_phone_approved: Boolean(phone) && field(form, "support_phone_approved") === "on",
    support_hours: field(form, "support_hours").trim().slice(0, 200), updated_by: userId, updated_at: stamp,
  }).eq("id", 1);
  // RLS can filter an update to zero rows without an error: confirm by reading the row back.
  const check = r.error ? null : await supabase.from("avalon_company_settings").select("updated_by,updated_at").eq("id", 1).maybeSingle();
  const saved = check?.data as { updated_by: string | null; updated_at: string } | null | undefined;
  if (r.error || !saved || saved.updated_by !== userId || Date.parse(saved.updated_at) !== Date.parse(stamp)) back(PAGE, { error: "settings_invalid" });
  revalidatePath(PAGE);
  back(PAGE, { ok: "settings" });
}
