import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DisplayIdentity } from "./owners";

/** Existing RLS-protected profile directory; no new permissions or persisted identities. */
export async function loadOwnerDirectory(db: SupabaseClient) {
  try {
    const directory = await db.rpc("office_directory");
    if (!directory.error && Array.isArray(directory.data)) {
      return { data: directory.data.filter((p: { role?: string }) => p.role === "owner") as DisplayIdentity[], error: null };
    }
    // Existing environments may predate office profiles. Identity remains explicit, never email-prefix guessed.
    if (directory.error && !["PGRST202", "42883", "42P01"].includes(directory.error.code)) return { data: null, error: directory.error };
    return await db.rpc("crm_owner_directory");
  } catch {
    return { data: null, error: { code: "IDENTITY_UNAVAILABLE", message: "Identity directory unavailable" } };
  }
}
