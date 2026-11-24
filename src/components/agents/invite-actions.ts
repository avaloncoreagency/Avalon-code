"use server";
import { revalidatePath } from "next/cache";
import { back, field, ownerForAction } from "@/lib/os/actions";
import { AGENT_PORTAL_PATH } from "@/lib/agents/portal";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAGE = `${AGENT_PORTAL_PATH}#agent-invite-identity`;

/**
 * Agent-invitation sender (AGENT PORTAL). Owners only: session check here plus the RLS policy that requires
 * updated_by = auth.uid(). "verified" is accepted only with technical evidence (database check ≥ 10 chars), so the word
 * is never shown without proof. Only the invitation columns are written; client/support settings are untouched.
 */
export async function updateInviteSender(form: FormData) {
  const { supabase, userId } = await ownerForAction();
  const email = field(form, "invite_sender_email").trim().toLowerCase();
  const status = field(form, "invite_sender_status");
  const evidence = field(form, "invite_sender_evidence").trim().slice(0, 1000);
  if (!EMAIL.test(email) || email.length > 254 || !["unverified", "verified", "failed"].includes(status) || (status === "verified" && evidence.length < 10))
    back(PAGE, { invite_sender: "invalid" });
  const stamp = new Date().toISOString();
  const r = await supabase.from("avalon_company_settings").update({
    invite_sender_email: email, invite_sender_status: status, invite_sender_evidence: evidence, updated_by: userId, updated_at: stamp,
  }).eq("id", 1);
  // RLS can filter an update to zero rows without an error: confirm by reading the row back.
  const check = r.error ? null : await supabase.from("avalon_company_settings").select("invite_sender_status,updated_by,updated_at").eq("id", 1).maybeSingle();
  const saved = check?.data as { invite_sender_status: string; updated_by: string | null; updated_at: string } | null | undefined;
  if (r.error || !saved || saved.invite_sender_status !== status || saved.updated_by !== userId || Date.parse(saved.updated_at) !== Date.parse(stamp))
    back(PAGE, { invite_sender: "invalid" });
  revalidatePath(AGENT_PORTAL_PATH);
  back(PAGE, { invite_sender: "saved" });
}
