import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { hasAllowedProvider, isOwner } from "./policy";

export type AuthorizedOwner = { userId: string; role: "owner"; user: User };

/**
 * Verifies identity with Supabase Auth (never getSession or editable
 * user_metadata) and requires a trusted owner membership for that UUID.
 */
export async function getAuthorizedOwner(client?: SupabaseClient): Promise<AuthorizedOwner | null> {
  if (!client && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)) return null;
  const supabase = client ?? await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || !hasAllowedProvider(user.app_metadata.provider)) return null;
  const { data: membership, error: membershipError } = await supabase
    .from("agency_memberships")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError || !isOwner(membership?.role)) return null;
  return { userId: user.id, role: membership.role, user };
}

export async function getAuthorizedMember(client?: SupabaseClient) {
  const owner = await getAuthorizedOwner(client);
  return owner ? { userId: owner.userId, role: owner.role } : null;
}
