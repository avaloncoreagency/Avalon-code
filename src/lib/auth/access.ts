import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getAuthorizedMember() {
  const supabase = await createClient();
  const { data: claims, error } = await supabase.auth.getClaims();
  if (error || !claims?.claims?.sub) return null;
  const userId = claims.claims.sub;
  const { data: membership, error: membershipError } = await supabase
    .from("agency_memberships")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (membershipError || !membership) return null;
  return { userId, role: membership.role as "owner" | "admin" | "operator" };
}
