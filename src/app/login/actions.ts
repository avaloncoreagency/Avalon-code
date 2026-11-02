"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedMember } from "@/lib/auth/access";

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
