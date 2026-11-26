import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { hasAllowedProvider, isOwner } from "./policy";

export type AuthorizedOwner = { userId: string; role: "owner"; user: User };

/**
 * Owner state for the current request:
 * - "none": no verified identity, provider not allowed, or no owner membership.
 * - "mfa":  verified owner who enrolled MFA but has not completed the second
 *           factor in this session (AAL1 while AAL2 is available). No access to
 *           data until /admin/mfa upgrades the session to AAL2.
 * - "ok":   verified owner at the required assurance level.
 * Identity is verified with Supabase Auth (never getSession or editable
 * user_metadata); fails closed on any error.
 */
export type OwnerState =
  | { state: "none" }
  | { state: "mfa"; userId: string; user: User }
  | ({ state: "ok" } & AuthorizedOwner);

export async function getOwnerState(client?: SupabaseClient): Promise<OwnerState> {
  if (!client && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)) return { state: "none" };
  const supabase = client ?? await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || !hasAllowedProvider(user.app_metadata.provider)) return { state: "none" };
  const { data: membership, error: membershipError } = await supabase
    .from("agency_memberships")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError || !isOwner(membership?.role)) return { state: "none" };
  const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError || !aal) return { state: "none" };
  if (aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") return { state: "mfa", userId: user.id, user };
  return { state: "ok", userId: user.id, role: membership.role, user };
}

export async function getAuthorizedOwner(client?: SupabaseClient): Promise<AuthorizedOwner | null> {
  const owner = await getOwnerState(client);
  return owner.state === "ok" ? { userId: owner.userId, role: owner.role, user: owner.user } : null;
}

export async function getAuthorizedMember(client?: SupabaseClient) {
  const owner = await getAuthorizedOwner(client);
  return owner ? { userId: owner.userId, role: owner.role } : null;
}

/**
 * The only employee role is an authenticated operator who has an explicit,
 * active staff_portal_access grant. This never upgrades an operator to owner.
 * Employees must enrol a verified TOTP factor (the database refuses Staff data otherwise); until they do,
 * `mfaEnrolled` is false and the portal sends them to /staff/mfa to enrol. AAL2 is enforced once enrolled.
 */
export type StaffState =
  | { state: "none" }
  | { state: "mfa"; userId: string; supabase: SupabaseClient }
  | { state: "ok"; role: "employee"; userId: string; user: User;
      supabase: SupabaseClient; mfaEnrolled: boolean;
      permissions: { commercial_permissions: string[]; can_create_casefiles: boolean; can_message: boolean; can_create_events: boolean; job_title: string } };

export async function getStaffState(client?: SupabaseClient): Promise<StaffState> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
    return { state: "none" };
  try {
    const supabase = client ?? await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user || !hasAllowedProvider(user.app_metadata.provider)) return { state: "none" };
    const [membership, access] = await Promise.all([
      supabase.from("agency_memberships").select("role").eq("user_id", user.id).maybeSingle(),
      supabase.from("staff_portal_access").select("active,can_create_casefiles,can_message,can_create_events,job_title,commercial_permissions")
        .eq("user_id", user.id).maybeSingle(),
    ]);
    if (membership.error || membership.data?.role !== "operator" ||
      access.error || access.data?.active !== true) return { state: "none" };
    const { data: assurance, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError || !assurance) return { state: "none" };
    const mfaEnrolled = (user.factors ?? []).some((f: { factor_type: string; status: string }) => f.factor_type === "totp" && f.status === "verified");
    // Enrolled staff must prove AAL2, even if nextLevel is inconsistent or absent.
    if ((mfaEnrolled || assurance.nextLevel === "aal2") && assurance.currentLevel !== "aal2")
      return { state: "mfa", userId: user.id, supabase };
    return {
      state: "ok", role: "employee", userId: user.id, user, supabase, mfaEnrolled,
      permissions: {
        can_create_casefiles: access.data.can_create_casefiles === true,
        commercial_permissions: Array.isArray(access.data.commercial_permissions) ? access.data.commercial_permissions : [],
        can_message: access.data.can_message === true,
        can_create_events: access.data.can_create_events === true,
        job_title: typeof access.data.job_title === "string" ? access.data.job_title : "",
      },
    };
  } catch {
    return { state: "none" };
  }
}
