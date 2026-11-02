"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAppOrigin } from "@/lib/auth/policy";
import { clearPasswordFlow, validPasswordFlow } from "@/lib/auth/email-flow";

export async function requestRecovery(form: FormData) {
  if (process.env.AUTH_PASSWORD_LOGIN_ENABLED !== "true") redirect("/admin/login?error=disabled");
  const email = form.get("email");
  if (typeof email === "string" && email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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
  if (process.env.AUTH_PASSWORD_LOGIN_ENABLED !== "true") redirect("/admin/login?error=disabled");
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
