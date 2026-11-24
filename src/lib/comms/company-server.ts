import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_COMPANY, signerFrom, type CompanyContact, type Lang, type Signer } from "./email";
import { loadOwnerDirectory } from "@/lib/identity/directory";
import type { DisplayIdentity } from "@/lib/identity/owners";

export type CompanyRow = {
  support_email: string; support_phone: string | null; support_phone_approved: boolean; support_hours: string;
  invite_sender_email: string; invite_sender_status: "unverified" | "verified" | "failed"; invite_sender_evidence: string;
  client_sender_email: string; reply_to_email: string; updated_at: string; updated_by: string | null;
};

/**
 * Corporate contact data. Before migration 20261124140000 exists the documented defaults are used and `ready` is false.
 * A phone number is exposed only when an owner marked it as an approved business number.
 */
export async function loadCompany(db: SupabaseClient): Promise<{ ready: boolean; row: CompanyRow | null; contact: CompanyContact }> {
  const r = await db.from("avalon_company_settings").select("*").eq("id", 1).maybeSingle();
  if (r.error || !r.data) return { ready: false, row: null, contact: DEFAULT_COMPANY };
  const row = r.data as CompanyRow;
  return { ready: true, row, contact: {
    supportEmail: row.support_email, supportPhone: row.support_phone_approved && row.support_phone ? row.support_phone : null,
    supportHours: row.support_hours, replyTo: row.reply_to_email, clientSender: row.client_sender_email,
    inviteSender: row.invite_sender_email, inviteSenderVerified: row.invite_sender_status === "verified",
  } };
}

/** The signer is the AUTHENTICATED user's own directory entry (official name + approved profile title). */
export async function signerForUser(db: SupabaseClient, userId: string, lang: Lang): Promise<Signer | null> {
  const directory = await loadOwnerDirectory(db);
  const me = ((directory.data ?? []) as (DisplayIdentity & { title?: string })[]).find(p => (p.user_id ?? p.id) === userId);
  return signerFrom(me ?? null, lang);
}

/** Directory entry by id (e.g. the onboarding's commercial owner), resolved server-side. */
export async function signerForId(db: SupabaseClient, id: string | null | undefined, lang: Lang): Promise<Signer | null> {
  if (!id) return null;
  return signerForUser(db, id, lang);
}

export function appOrigin() {
  const o = (process.env.APP_ORIGIN ?? "").trim();
  return /^https:\/\//.test(o) ? o.replace(/\/$/, "") : "https://avaloncoreagency.com";
}
