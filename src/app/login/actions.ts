"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AUTH_RULES, authLimiter, clientIp, hashKey } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { getOwnerState } from "@/lib/auth/access";

// Avalon sign-in uses the owner's email and password, never a social redirect.
export async function signIn(formData: FormData) {
  const rawEmail = formData.get("email");
  const password = formData.get("password");
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof password !== "string" || !password || password.length > 1024) {
    redirect("/admin/login?error=invalid");
  }
  // Throttle per source IP and per account before contacting Supabase. The same
  // generic message is shown whether or not the account exists.
  const ip = clientIp(await headers());
  const accountKey = hashKey("login-account", email);
  if (!authLimiter.hit(hashKey("login-ip", ip), AUTH_RULES.loginPerIp).allowed ||
      !authLimiter.hit(accountKey, AUTH_RULES.loginPerAccount).allowed) redirect("/admin/login?error=throttled");
  // A network outage, bad configuration or API failure must NEVER be
  // misreported as Samuel/Miguel typing an incorrect password.
  let supabase: Awaited<ReturnType<typeof createClient>>;
  let authError: { code?: string; status?: number; message?: string } | null;
  try {
    supabase = await createClient();
    const result = await supabase.auth.signInWithPassword({ email, password });
    authError = result.error;
  } catch {
    redirect("/admin/login?error=unavailable");
  }
  if (authError) {
    const code = authError.code;
    if (code === "invalid_credentials" || code === "email_not_confirmed" ||
      (authError.status === 400 && /invalid login credentials/i.test(authError.message ?? ""))) {
      redirect("/admin/login?error=invalid");
    }
    if (authError.status === 429 || code === "over_request_rate_limit") {
      redirect("/admin/login?error=throttled");
    }
    // Safe operational diagnostics. Never log email, password, IP or tokens.
    console.error("[avalon-auth] Supabase sign-in unavailable", {
      code: typeof code === "string" ? code.slice(0, 60) : "unknown",
      status: authError.status ?? 0,
    });
    redirect("/admin/login?error=unavailable");
  }
  authLimiter.reset(accountKey);
  let owner: Awaited<ReturnType<typeof getOwnerState>>;
  try {
    owner = await getOwnerState(supabase);
  } catch {
    redirect("/admin/login?error=unavailable");
  }
  if (owner.state === "mfa") redirect("/admin/mfa");
  if (owner.state !== "ok") {
    await supabase.auth.signOut({ scope: "local" });
    redirect("/admin/login?error=unauthorized");
  }
  redirect("/admin/dashboard");
}
