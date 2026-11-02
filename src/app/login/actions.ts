"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AUTH_RULES, authLimiter, clientIp, hashKey } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { getOwnerState } from "@/lib/auth/access";
import { getAppOrigin } from "@/lib/auth/policy";

export async function signInWithGoogle() {
  let destination: string | null = null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${getAppOrigin()}/admin/auth/callback`,
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });
    // Supabase controls the provider URL. Do not accept destinations from form input.
    if (!error && data.url && new URL(data.url).origin === new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin) destination = data.url;
  } catch { /* Show a generic error without disclosing provider details. */ }
  if (!destination) redirect("/admin/login?error=oauth");
  redirect(destination);
}

// Password is the primary administrative sign-in method.
export async function signIn(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof email !== "string" || typeof password !== "string" || !email || !password ||
      email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length > 1024) redirect("/admin/login?error=invalid");
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
