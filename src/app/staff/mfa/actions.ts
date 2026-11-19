"use server";
import { redirect } from "next/navigation";
import { getStaffState } from "@/lib/auth/staff";
import { AUTH_RULES, authLimiter, hashKey } from "@/lib/security/rate-limit";

export async function verifyStaffMfa(form: FormData) {
  const staff = await getStaffState();
  if (staff.state === "ok") redirect("/staff");
  if (staff.state !== "mfa") redirect("/admin/login");
  if (!authLimiter.hit(hashKey("staff-mfa", staff.userId), AUTH_RULES.mfaVerifyPerUser).allowed)
    redirect("/staff/mfa?error=throttled");
  const code = form.get("code");
  if (typeof code !== "string" || !/^\d{6}$/.test(code.replace(/\s/g, "")))
    redirect("/staff/mfa?error=code");
  const { data, error } = await staff.supabase.auth.mfa.listFactors();
  const factor = data?.totp.find(item => item.status === "verified");
  if (error || !factor) redirect("/staff/mfa?error=code");
  const verified = await staff.supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id, code: code.replace(/\s/g, ""),
  });
  if (verified.error) redirect("/staff/mfa?error=code");
  authLimiter.reset(hashKey("staff-mfa", staff.userId));
  redirect("/staff");
}
