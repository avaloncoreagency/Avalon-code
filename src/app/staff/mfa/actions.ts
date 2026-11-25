"use server";
import { redirect } from "next/navigation";
import type { EnrollState } from "@/app/admin/mfa-actions";
import { getStaffState } from "@/lib/auth/staff";
import { AUTH_RULES, authLimiter, hashKey } from "@/lib/security/rate-limit";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export async function enrollStaffTotp(previous: EnrollState, form: FormData): Promise<EnrollState> {
  const staff = await getStaffState();
  if (staff.state !== "ok") return { step: "idle", error: "unauthorized" };
  const mfa = staff.supabase.auth.mfa;

  if (form.get("intent") === "confirm") {
    if (previous.step !== "scan" || !UUID.test(previous.factorId))
      return { step: "idle", error: "failed" };
    const key = hashKey("staff-mfa", staff.userId);
    if (!authLimiter.hit(key, AUTH_RULES.mfaVerifyPerUser).allowed)
      return { ...previous, error: "throttled" };
    const raw = form.get("code");
    const code = typeof raw === "string" ? raw.replace(/\s/g, "") : "";
    if (!/^\d{6}$/.test(code)) return { ...previous, error: "code" };
    const result = await mfa.challengeAndVerify({ factorId: previous.factorId, code });
    if (result.error) return { ...previous, error: "code" };
    authLimiter.reset(key);
    return { step: "done" };
  }

  if (!authLimiter.hit(hashKey("staff-mfa-enroll", staff.userId), AUTH_RULES.mfaEnrollPerUser).allowed)
    return { step: "idle", error: "throttled" };
  const { data: factors, error: listError } = await mfa.listFactors();
  if (listError || !factors) return { step: "idle", error: "failed" };
  if (factors.totp.some(factor => factor.status === "verified")) return { step: "idle", error: "exists" };
  for (const factor of factors.all) {
    if (factor.factor_type !== "totp" || factor.status !== "unverified") continue;
    const { error } = await mfa.unenroll({ factorId: factor.id });
    if (error) return { step: "idle", error: "failed" };
  }
  const { data, error } = await mfa.enroll({ factorType: "totp", issuer: "Avalon Core Agency" });
  if (error || !data || data.type !== "totp") return { step: "idle", error: "failed" };
  return { step: "scan", factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

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
