import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedOwner } from "./access";

/**
 * One verified identity + membership check per request, shared by the shell,
 * pages and server actions rendered in the same request.
 */
export const getOwnerSession = cache(async () => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return null;
  try {
    const supabase = await createClient();
    const owner = await getAuthorizedOwner(supabase);
    return owner ? { supabase, ...owner } : null;
  } catch {
    return null; // Fail closed.
  }
});

export async function requireOwner() {
  const session = await getOwnerSession();
  if (!session) redirect("/admin/login");
  return session;
}

export function displayName(user: User) {
  // Display only. Authorization never reads user_metadata.
  const meta = user.user_metadata ?? {};
  const name = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : "";
  if (name.trim()) return name.trim().slice(0, 80);
  return (user.email ?? "").split("@")[0] || "Owner";
}
