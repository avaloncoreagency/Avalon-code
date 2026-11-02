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
