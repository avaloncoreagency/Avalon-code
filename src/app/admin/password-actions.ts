"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AUTH_RULES, authLimiter, clientIp, hashKey } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { getAppOrigin } from "@/lib/auth/policy";
import { clearPasswordFlow, validPasswordFlow } from "@/lib/auth/email-flow";

export async function requestRecovery(form: FormData) {
  const rawEmail = form.get("email");
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  const ip = clientIp(await headers());
  const allowed = authLimiter.hit(hashKey("recovery-ip", ip), AUTH_RULES.recoveryPerIp).allowed &&
    (!email || authLimiter.hit(hashKey("recovery-account", email), AUTH_RULES.recoveryPerAccount).allowed);
  // When throttled, show the same "sent" screen: no signal about the account.
  if (allowed && email && email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    try {
      const client = await createClient();
      await client.auth.resetPasswordForEmail(email, { redirectTo: `${getAppOrigin()}/admin/reset-password` });
    } catch { /* Always return the same result to avoid account enumeration. */ }
  }
  redirect("/admin/forgot-password?sent=1");
}
export async function savePassword(form: FormData) {
  const type = form.get("flow") === "invite" ? "invite" : "recovery";
  const path = type === "invite" ? "/admin/signup" : "/admin/reset-password";
  if (!authLimiter.hit(hashKey("password-set-ip", clientIp(await headers())), AUTH_RULES.passwordSetPerIp).allowed) redirect(`${path}?error=throttled`);
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user || !await validPasswordFlow(user.id, type)) redirect(`${path}?error=expired`);
  const password = form.get("password");
  if (typeof password !== "string" || password.length < 12 || password.length > 1024 || password !== form.get("confirm")) redirect(`${path}?error=password`);
  const result = await client.auth.updateUser({ password });
  if (result.error) redirect(`${path}?error=password`);
  await clearPasswordFlow();
  await client.auth.signOut({ scope: "local" });
  redirect("/admin/login?updated=1");
}
