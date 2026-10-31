import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { hasAllowedProvider, isOwner } from "./policy";

export async function getAuthorizedMember(client?: SupabaseClient) {
  if (!client && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)) return null;
  const supabase = client ?? await createClient();
  // Verify identity with Auth; never trust getSession or editable user_metadata.
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || !hasAllowedProvider(user.app_metadata.provider)) return null;
  const { data: membership, error: membershipError } = await supabase
    .from("agency_memberships")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError || !isOwner(membership?.role)) return null;
  return { userId: user.id, role: membership.role };
}
