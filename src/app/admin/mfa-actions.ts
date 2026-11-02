"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOwnerState } from "@/lib/auth/access";
import { getOwnerSession } from "@/lib/auth/session";
import { AUTH_RULES, authLimiter, hashKey } from "@/lib/security/rate-limit";

// TOTP multi-factor authentication through Supabase Auth (no custom crypto,
// secrets are generated and stored by Supabase). Opt-in per owner; once an
// owner has a verified factor, every new session must complete AAL2.

const CODE = /^\d{6}$/;
const code = (form: FormData) => {
  const value = form.get("code");
  return typeof value === "string" ? value.replace(/\s+/g, "") : "";
};

/** Second step of sign-in for owners with a verified TOTP factor. */
export async function verifyMfaLogin(form: FormData) {
  const supabase = await createClient();
  const owner = await getOwnerState(supabase);
  if (owner.state === "ok") redirect("/admin/dashboard");
  if (owner.state !== "mfa") redirect("/admin/login");
  if (!authLimiter.hit(hashKey("mfa-verify", owner.userId), AUTH_RULES.mfaVerifyPerUser).allowed) redirect("/admin/mfa?error=throttled");
  const value = code(form);
  if (!CODE.test(value)) redirect("/admin/mfa?error=code");
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find(f => f.status === "verified");
  if (listError || !factor) redirect("/admin/mfa?error=code");
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: value });
  if (error) redirect("/admin/mfa?error=code");
  authLimiter.reset(hashKey("mfa-verify", owner.userId));
  redirect("/admin/dashboard");
}

export async function cancelMfaLogin() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/admin/login");
}

export type EnrollState =
  | { step: "idle"; error?: string }
  | { step: "scan"; factorId: string; qr: string; secret: string; error?: string }
  | { step: "done" };

/** Starts TOTP enrollment for the signed-in owner; returns the QR to scan. */
export async function startTotpEnrollment(_prev: EnrollState): Promise<EnrollState> {
  const session = await getOwnerSession();
  if (!session) return { step: "idle", error: "unauthorized" };
  if (!authLimiter.hit(hashKey("mfa-enroll", session.userId), AUTH_RULES.mfaEnrollPerUser).allowed) return { step: "idle", error: "throttled" };
  const { supabase } = session;
  // Remove abandoned, never-verified factors so retries do not accumulate.
  const { data: existing } = await supabase.auth.mfa.listFactors();
  for (const factor of existing?.all ?? []) {
    if (factor.factor_type === "totp" && factor.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }
  if ((existing?.totp ?? []).some(f => f.status === "verified")) return { step: "idle", error: "exists" };
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Avalon OS ${new Date().toISOString().slice(0, 10)}` });
  if (error || !data || data.type !== "totp") return { step: "idle", error: "failed" };
  return { step: "scan", factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Confirms enrollment with the first code from the authenticator app. */
export async function confirmTotpEnrollment(prev: EnrollState, form: FormData): Promise<EnrollState> {
  // The previous state round-trips through the browser: re-validate it. Supabase
  // also rejects factors that do not belong to the signed-in user.
  if (prev.step !== "scan" || !/^[0-9a-f-]{36}$/i.test(prev.factorId)) return { step: "idle" };
  const session = await getOwnerSession();
  if (!session) return { step: "idle", error: "unauthorized" };
  if (!authLimiter.hit(hashKey("mfa-verify", session.userId), AUTH_RULES.mfaVerifyPerUser).allowed) return { ...prev, error: "throttled" };
  const value = code(form);
  if (!CODE.test(value)) return { ...prev, error: "code" };
  const { error } = await session.supabase.auth.mfa.challengeAndVerify({ factorId: prev.factorId, code: value });
  if (error) return { ...prev, error: "code" };
  revalidatePath("/admin/profile");
  revalidatePath("/admin/security");
  return { step: "done" };
}

/** Removes a verified factor. Supabase requires an AAL2 session for this. */
export async function removeTotpFactor(form: FormData) {
  const session = await getOwnerSession();
  if (!session) redirect("/admin/login");
  const factorId = form.get("factorId");
  if (form.get("confirm") !== "yes" || typeof factorId !== "string" || !/^[0-9a-f-]{36}$/i.test(factorId)) redirect("/admin/profile?mfa=required#mfa");
  const { error } = await session.supabase.auth.mfa.unenroll({ factorId });
  revalidatePath("/admin/profile");
  redirect(`/admin/profile?mfa=${error ? "failed" : "removed"}#mfa`);
}

/** Single entry point for the enrollment form (intent = start | confirm). */
export async function totpEnrollment(prev: EnrollState, form: FormData): Promise<EnrollState> {
  return form.get("intent") === "confirm" ? confirmTotpEnrollment(prev, form) : startTotpEnrollment(prev);
}
