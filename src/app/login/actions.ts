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
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/admin/login?error=invalid");
  authLimiter.reset(accountKey);
  const owner = await getOwnerState(supabase);
  if (owner.state === "mfa") redirect("/admin/mfa");
  if (owner.state !== "ok") {
    await supabase.auth.signOut({ scope: "local" });
    redirect("/admin/login?error=unauthorized");
  }
  redirect("/admin/dashboard");
}
