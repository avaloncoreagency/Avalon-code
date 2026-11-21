"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/session";
import { getAppOrigin } from "@/lib/auth/policy";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function get(form: FormData, field: string) {
  const value = form.get(field);
  return typeof value === "string" ? value.trim() : "";
}
function done(status: string): never {
  revalidatePath("/admin/staff");
  redirect(`/admin/staff?status=${status}`);
}

/** Email invitations are issued by a protected Supabase Edge Function,
 * never by shipping an admin key into the Next.js application. The function
 * creates an INACTIVE operator, which owners must activate separately. */
export async function inviteStaffEmployee(form: FormData) {
  const { supabase } = await requireOwner();
  const email = get(form, "employee_email").toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    done("invalid");
  try {
    const { data, error } = await supabase.functions.invoke("staff-invite", {
      body: { email, origin: getAppOrigin() },
    });
    if (error || !data || data.invited !== true ||
        data.requires_owner_activation !== true) done("invite-failed");
  } catch {
    done("invite-failed");
  }
  done("invite-sent");
}

/** Only existing, trusted operator memberships can become employees. */
export async function setStaffAccess(form: FormData) {
  const { supabase, userId } = await requireOwner();
  const employeeId = get(form, "employee_id");
  const displayName = get(form, "display_name");
  const active = get(form, "active") === "yes";
  const can_create_casefiles = active && get(form, "can_create_casefiles") === "yes";
  const can_message = active && get(form, "can_message") === "yes";
  if (!UUID.test(employeeId) || displayName.length > 80 || !displayName)
    done("invalid");
  const { data: directory, error: directoryError } = await supabase.rpc("office_directory");
  if (directoryError || !Array.isArray(directory) ||
      !directory.some(m => m.user_id === employeeId && m.role === "operator"))
    done("denied");
  const saved = await supabase.from("staff_portal_access").upsert({
    user_id: employeeId, active, can_create_casefiles, can_message,
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
