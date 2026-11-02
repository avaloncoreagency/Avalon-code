"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedMember } from "@/lib/auth/access";
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

// Retain the existing password method, gated until its activation is approved.
export async function signIn(formData: FormData) {
  if (process.env.AUTH_PASSWORD_LOGIN_ENABLED !== "true") redirect("/admin/login?error=disabled");
  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof email !== "string" || typeof password !== "string" || !email || !password ||
      email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length > 1024) redirect("/admin/login?error=invalid");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/admin/login?error=invalid");
  if (!await getAuthorizedMember(supabase)) {
    await supabase.auth.signOut({ scope: "local" });
    redirect("/admin/login?error=unauthorized");
  }
  redirect("/admin/dashboard");
}
