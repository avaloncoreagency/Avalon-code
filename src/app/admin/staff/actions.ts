"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/session";
import { getAppOrigin } from "@/lib/auth/policy";
import { isJobTitle, JOB_TITLES } from "@/lib/auth/staff-roles";
import { randomUUID } from "node:crypto";
import { DEFAULT_TZ, isKind, isPriority, localToUtc, validTimeZone } from "@/lib/staff/work";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function get(form: FormData, field: string) {
  const value = form.get(field);
  return typeof value === "string" ? value.trim() : "";
}
function done(status: string): never {
  revalidatePath("/admin/staff");
  redirect(`/admin/staff?status=${status}`);
}

/** staff-invite error codes → status shown to the owner (anything unknown stays "invite-failed"). */
const INVITE_FAILURES: Record<string, string> = {
  invitation_sent_enrollment_pending: "invite-enrollment-pending",
  email_already_registered: "invite-email-exists",
  invitation_not_configured: "invite-not-configured",
  untrusted_redirect: "invite-not-configured",
  mfa_required: "invite-mfa-required",
  forbidden: "invite-forbidden",
  unauthorized: "invite-forbidden",
  member_limit: "invite-member-limit",
};

/** Email invitations are issued by a protected Supabase Edge Function,
 * never by shipping an admin key into the Next.js application. The function
 * creates an INACTIVE operator, which owners must activate separately. */
export async function inviteStaffEmployee(form: FormData) {
  const { supabase } = await requireOwner();
  const email = get(form, "employee_email").toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    done("invalid");
  // Presentation data for the invitation e-mail. The inviter's name/title is NOT sent: the function resolves it from
  // the authenticated owner. Role label comes from the fixed job-title list, never free text from the browser.
  const lang = get(form, "invite_lang") === "en" ? "en" : "es";
  const invitee_name = get(form, "invitee_name").replace(/[\u0000-\u001f<>{}]/g, " ").trim().slice(0, 80);
  const jobTitle = get(form, "invite_job_title");
  const role_label = JOB_TITLES.find(([k]) => k === jobTitle)?.[1] ?? "";
  let outcome = "invite-failed";
  try {
    const { data, error } = await supabase.functions.invoke("staff-invite", {
      body: { email, origin: getAppOrigin(), lang, invitee_name, role_label },
    });
    if (!error && data?.invited === true && data.requires_owner_activation === true) {
      outcome = data.audited === true ? "invite-sent" : "invite-audit-pending";
    } else if (error?.context instanceof Response) {
      const failure = await error.context.json();
      outcome = INVITE_FAILURES[String(failure?.error)] ?? outcome;
    }
  } catch { /* A lost or malformed response leaves the outcome unconfirmed. */ }
  done(outcome);
}

/** Only existing, trusted operator memberships can become employees. */
export async function setStaffAccess(form: FormData) {
  const { supabase, userId } = await requireOwner();
  const employeeId = get(form, "employee_id");
  const displayName = get(form, "display_name");
  const active = get(form, "active") === "yes";
  const can_create_casefiles = active && get(form, "can_create_casefiles") === "yes";
  const can_message = active && get(form, "can_message") === "yes";
  const can_create_events = active && get(form, "can_create_events") === "yes";
  const job_title = get(form, "job_title") || "operator";
  if (!UUID.test(employeeId) || displayName.length > 80 || !displayName || !isJobTitle(job_title))
    done("invalid");
  const { data: directory, error: directoryError } = await supabase.rpc("office_directory");
  if (directoryError || !Array.isArray(directory) ||
      !directory.some(m => m.user_id === employeeId && m.role === "operator"))
    done("denied");
  const saved = await supabase.from("staff_portal_access").upsert({
    user_id: employeeId, active, can_create_casefiles, can_message, can_create_events, job_title,
    granted_by: userId, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (saved.error) done("failed");
  // The directory is a limited address book, never a staff role provider.
  const contact = await supabase.from("staff_contacts").upsert({
    user_id: employeeId, display_name: displayName, is_listed: active,
  }, { onConflict: "user_id" });
  done(contact.error ? "directory-failed" : active ? "access-enabled" : "access-revoked");
}

/** Assigned client access is a redacted name card, not full CRM/finance RLS. */
export async function grantStaffClient(form: FormData) {
  const { supabase, userId } = await requireOwner();
  const employeeId = get(form, "employee_id");
  const clientId = get(form, "client_id");
  const access_level = get(form, "access_level");
  if (!UUID.test(employeeId) || !UUID.test(clientId) ||
      !["view", "work"].includes(access_level)) done("invalid");
  const active = await supabase.from("staff_portal_access").select("active")
    .eq("user_id", employeeId).maybeSingle();
  if (active.error || active.data?.active !== true) done("denied");
  const dir = await supabase.rpc("office_directory");
  if (dir.error || !Array.isArray(dir.data) ||
      !dir.data.some((m: { user_id:string; role:string }) => m.user_id === employeeId && m.role === "operator"))
    done("denied");
  const client = await supabase.from("crm_clients").select("id,legal_name")
    .eq("id", clientId).neq("status", "archived").maybeSingle();
  if (client.error || !client.data) done("invalid");
  const { error } = await supabase.from("staff_client_grants").upsert({
    user_id: employeeId, client_id: clientId,
    client_name: client.data.legal_name, access_level,
    active: true, granted_by: userId, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,client_id" });
  done(error ? "failed" : "client-granted");
}

export async function revokeStaffClient(form: FormData) {
  const { supabase, userId } = await requireOwner();
  const employeeId = get(form, "employee_id"), clientId = get(form, "client_id");
  if (!UUID.test(employeeId) || !UUID.test(clientId)) done("invalid");
  const { data, error } = await supabase.from("staff_client_grants")
    .update({ active: false, granted_by: userId, updated_at: new Date().toISOString() })
    .eq("user_id", employeeId).eq("client_id", clientId).eq("active", true)
    .select("client_id").maybeSingle();
  done(error || !data ? "failed" : "client-revoked");
}

/** Seller base: an owner grants ONE lead to an active operator. Employees read it only through the redacted
 * staff_my_leads() projection; crm_leads RLS stays owner-only. */
export async function grantStaffLead(form: FormData) {
  const { supabase, userId } = await requireOwner();
  const employeeId = get(form, "employee_id"), leadId = get(form, "lead_id"), access_level = get(form, "access_level");
  if (!UUID.test(employeeId) || !UUID.test(leadId) || !["view", "work"].includes(access_level)) done("invalid");
  const active = await supabase.from("staff_portal_access").select("active").eq("user_id", employeeId).maybeSingle();
  if (active.error || active.data?.active !== true) done("denied");
  const lead = await supabase.from("crm_leads").select("id").eq("id", leadId).eq("archived", false).maybeSingle();
  if (lead.error || !lead.data) done("invalid");
  const { error } = await supabase.from("staff_lead_grants").upsert({
    user_id: employeeId, lead_id: leadId, access_level, active: true, granted_by: userId, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,lead_id" });
  done(error ? "failed" : "lead-granted");
}

export async function revokeStaffLead(form: FormData) {
  const { supabase, userId } = await requireOwner();
  const employeeId = get(form, "employee_id"), leadId = get(form, "lead_id");
  if (!UUID.test(employeeId) || !UUID.test(leadId)) done("invalid");
  const { data, error } = await supabase.from("staff_lead_grants")
    .update({ active: false, granted_by: userId, updated_at: new Date().toISOString() })
    .eq("user_id", employeeId).eq("lead_id", leadId).eq("active", true).select("lead_id").maybeSingle();
  done(error || !data ? "failed" : "lead-revoked");
}

/** Owner assigns a task / appointment / follow-up to ONE employee. Only that assignment becomes visible to them. */
export async function assignWorkItem(form: FormData) {
  const { supabase } = await requireOwner();
  const employeeId = get(form, "employee_id"), kind = get(form, "kind"), title = get(form, "title"), priority = get(form, "priority") || "normal";
  const tz = get(form, "time_zone") || DEFAULT_TZ, date = get(form, "date"), start = get(form, "start"), end = get(form, "end");
  const lead = get(form, "lead_id"), client = get(form, "client_id");
  if (!UUID.test(employeeId) || !isKind(kind) || !isPriority(priority) || !title || title.length > 200 || !validTimeZone(tz)
      || (lead && !UUID.test(lead)) || (client && !UUID.test(client))) done("invalid");
  const startsAt = kind === "task" ? null : localToUtc(date, start, tz);
  const dueAt = kind === "task" ? localToUtc(date, start || "17:00", tz) : localToUtc(get(form, "due_date"), get(form, "due_time") || "17:00", tz);
  const endsAt = kind !== "task" && end ? localToUtc(date, end, tz) : null;
  if ((kind !== "task" && !startsAt) || (kind === "task" && !dueAt) || (endsAt && startsAt && endsAt < startsAt)) done("invalid");
  const key = /^[0-9a-f-]{36}$/i.test(get(form, "idempotency_key")) ? get(form, "idempotency_key") : randomUUID();
  const { error } = await supabase.from("staff_work_items").insert({
    idempotency_key: key, kind, origin: "staff_assigned", assignee_id: employeeId, title, instructions: get(form, "instructions").slice(0, 4000),
    starts_at: startsAt, ends_at: endsAt, due_at: dueAt, time_zone: tz, priority, lead_id: lead || null, client_id: client || null,
    assignee_can_reschedule: get(form, "can_reschedule") === "yes",
  });
  if (error && !/duplicate key|unique/i.test(error.message)) done(/not_granted/.test(error.message) ? "work-link-denied" : "failed");
  done("work-assigned");
}

/** Owners control every employee calendar: cancel, reassign, reschedule or delete any item (optimistic version;
 * audit via trigger). The database refuses all of this to employees. */
export async function manageWorkItem(form: FormData) {
  const { supabase } = await requireOwner();
  const id = get(form, "item_id"), version = Number(get(form, "version")), op = get(form, "op"), to = get(form, "assignee_id");
  if (!UUID.test(id) || !Number.isInteger(version) || !["cancel", "reassign", "reschedule", "delete"].includes(op)
      || (op === "reassign" && !UUID.test(to))) done("invalid");
  if (op === "delete") {
    const { data, error } = await supabase.from("staff_work_items").delete().eq("id", id).eq("version", version).select("id");
    done(error ? "failed" : data && data.length ? "work-deleted" : "stale");
  }
  let patch: Record<string, string | null>;
  if (op === "reschedule") {
    const tz = get(form, "time_zone") || DEFAULT_TZ, date = get(form, "date"), start = get(form, "start"), end = get(form, "end");
    const kind = get(form, "kind");
    if (!validTimeZone(tz) || !isKind(kind)) done("invalid");
    const at = localToUtc(date, start || (kind === "task" ? "17:00" : ""), tz);
    if (!at) done("invalid");
    const endsAt = kind !== "task" && end ? localToUtc(date, end, tz) : null;
    if (endsAt && endsAt < at) done("invalid");
    patch = kind === "task" ? { due_at: at, time_zone: tz } : { starts_at: at, ends_at: endsAt, time_zone: tz };
    const title = get(form, "title");
    if (title) { if (title.length > 200) done("invalid"); patch.title = title; }
  } else {
    patch = op === "cancel" ? { status: "cancelled" } : { assignee_id: to, lead_id: null, client_id: null };
  }
  const { data, error } = await supabase.from("staff_work_items").update(patch).eq("id", id).eq("version", version).select("id");
  done(error ? "failed" : data && data.length ? ({ cancel: "work-cancelled", reassign: "work-reassigned", reschedule: "work-rescheduled" } as Record<string, string>)[op] : "stale");
}

/** Owners hand a lead to exactly ONE seller (or take it back with an empty seller). The database closes every other
 * employee's grant, so the lead, its proposals and its sale are visible only to that seller and the owners. */
export async function assignLeadToSeller(form: FormData) {
  const { supabase } = await requireOwner();
  const leadId = get(form, "lead_id"), seller = get(form, "seller_id");
  if (!UUID.test(leadId) || (seller && !UUID.test(seller))) done("invalid");
  const { error } = await supabase.rpc("crm_lead_assign_seller", { p_lead: leadId, p_seller: seller || null });
  done(error ? (/staff_seller_invalid/.test(error.message) ? "seller-invalid" : "failed") : seller ? "lead-assigned" : "lead-returned");
}
