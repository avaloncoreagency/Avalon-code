"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { grantPasswordFlow } from "@/lib/auth/email-flow";

/** Called only after Supabase Auth has verified the invited user's session.
 * An invitee is never upgraded to owner. This only issues a short-lived,
 * signed password-setup cookie for an already-approved operator identity. */
export async function completeStaffInvitation() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/admin/login?error=unauthorized");
  const { data: member, error: membershipError } = await supabase
    .from("agency_memberships").select("role")
    .eq("user_id",user.id).maybeSingle();
  if (membershipError || member?.role !== "operator") {
    await supabase.auth.signOut({ scope:"local" });
    redirect("/admin/login?error=unauthorized");
  }
  await grantPasswordFlow(user.id,"invite");
  redirect("/admin/signup");
}
