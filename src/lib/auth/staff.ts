import "server-only";
import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { hasAllowedProvider } from "@/lib/auth/policy";
import { getOwnerSession } from "@/lib/auth/session";

export type StaffSession = {
  role: "employee";
  userId: string;
  user: User;
  supabase: SupabaseClient;
  permissions: { can_create_casefiles: boolean; can_message: boolean };
};
export type StaffState =
  | { state: "none" }
  | { state: "mfa"; userId: string; supabase: SupabaseClient }
  | ({ state: "ok" } & StaffSession);

/** Employees are explicitly activated operators, never owners by email or metadata. */
export async function getStaffState(client?: SupabaseClient): Promise<StaffState> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
    return { state: "none" };
  try {
    const supabase = client ?? await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user || !hasAllowedProvider(user.app_metadata.provider))
      return { state: "none" };
    const [membership, access] = await Promise.all([
      supabase.from("agency_memberships").select("role").eq("user_id", user.id).maybeSingle(),
      supabase.from("staff_portal_access").select("active,can_create_casefiles,can_message")
        .eq("user_id", user.id).maybeSingle(),
    ]);
    if (membership.error || membership.data?.role !== "operator" ||
      access.error || access.data?.active !== true) return { state: "none" };
    const { data: assurance, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError || !assurance) return { state: "none" };
    if (assurance.nextLevel === "aal2" && assurance.currentLevel !== "aal2")
      return { state: "mfa", userId: user.id, supabase };
    return {
      state: "ok", role: "employee", userId: user.id, user, supabase,
      permissions: {
        can_create_casefiles: access.data.can_create_casefiles === true,
        can_message: access.data.can_message === true,
      },
    };
  } catch {
    return { state: "none" }; // Fail closed on network/schema errors.
  }
}

export async function requireStaff(): Promise<StaffSession> {
  const state = await getStaffState();
  if (state.state === "mfa") redirect("/staff/mfa");
  if (state.state !== "ok") redirect("/admin/login");
  return state;
}

/** Owner or active employee; owner-only routes continue using requireOwner. */
export async function requireStaffMessenger() {
  const owner = await getOwnerSession();
  if (owner) return { ...owner, kind: "owner" as const };
  const employee = await requireStaff();
  if (!employee.permissions.can_message) redirect("/staff?error=forbidden");
  return { ...employee, kind: "employee" as const };
}
