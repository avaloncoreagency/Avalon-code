import type { SupabaseClient } from "@supabase/supabase-js";

/** True once migration 20261124110000 (logical quote deletion) is applied. Before that, every page keeps working and
 * the delete action is simply not offered — never a broken button. */
export async function quoteSoftDeleteReady(db: SupabaseClient) {
  const probe = await db.from("crm_quotes").select("deleted_at").limit(0);
  return !probe.error;
}
