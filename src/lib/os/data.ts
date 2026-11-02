import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModuleKey } from "./domain";

// All reads/writes use the signed-in user's Supabase client, so PostgreSQL RLS
// is the final authority. No service-role key exists in this application.

export type DbErrorCode = "schema_pending" | "denied" | "duplicate" | "invalid" | "conflict" | "unavailable";
type DbError = { code?: string; message?: string } | null;
type DbResponse = { data: unknown; error: DbError; status?: number; count?: number | null };

export function mapDbError(error: DbError, status?: number): DbErrorCode {
  const code = error?.code ?? "";
  if (code === "PGRST205" || code === "42P01" || code === "PGRST202" || status === 404) return "schema_pending";
  if (code === "42501" || status === 401 || status === 403) return "denied";
  if (code === "23505") return "duplicate";
  if (["23514", "23502", "23503", "22P02", "22001", "22007", "22003"].includes(code)) return "invalid";
  return "unavailable";
}

export type Loaded<T> = { data: T; error: null; count: number | null } | { data: null; error: DbErrorCode; count: null };

export async function run<T>(query: PromiseLike<DbResponse>): Promise<Loaded<T>> {
  try {
    const result = await query;
    if (result.error) return { data: null, error: mapDbError(result.error, result.status), count: null };
    // maybeSingle() legitimately returns null ("not found"); never coerce it.
    return { data: result.data as T, error: null, count: result.count ?? null };
  } catch {
    return { data: null, error: "unavailable", count: null };
  }
}

export type ProjectRow = {
  id: string;
  module: ModuleKey;
  name: string;
  description: string;
  status: "draft" | "active" | "archived";
  settings: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
  version: number;
};
export const PROJECT_COLUMNS = "id,module,name,description,status,settings,created_by,created_at,updated_at,version";

export function listProjects(supabase: SupabaseClient, module: ModuleKey, { includeArchived = false } = {}) {
  let query = supabase.from("os_projects").select(PROJECT_COLUMNS).eq("module", module).order("updated_at", { ascending: false }).limit(100);
  if (!includeArchived) query = query.neq("status", "archived");
  return run<ProjectRow[]>(query);
}

export function getProject(supabase: SupabaseClient, module: ModuleKey, id: string) {
  return run<ProjectRow | null>(supabase.from("os_projects").select(PROJECT_COLUMNS).eq("id", id).eq("module", module).maybeSingle());
}

type Filter = ["eq" | "neq" | "lt" | "lte" | "gte", string, string | number] | ["not_in", string, string[]] | ["is_null", string];
export async function countRows(supabase: SupabaseClient, table: string, filters: Filter[] = []) {
  // Not head:true — supabase-js reports a HEAD 404 (missing table, empty body) as
  // success, which would hide a pending migration. A 1-row GET returns PGRST205.
  let query = supabase.from(table).select("id", { count: "exact" }).range(0, 0);
  for (const filter of filters) {
    switch (filter[0]) {
      case "not_in": query = query.not(filter[1], "in", `(${filter[2].join(",")})`); break;
      case "is_null": query = query.is(filter[1], null); break;
      case "eq": query = query.eq(filter[1], filter[2]); break;
      case "neq": query = query.neq(filter[1], filter[2]); break;
      case "lt": query = query.lt(filter[1], filter[2]); break;
      case "lte": query = query.lte(filter[1], filter[2]); break;
      case "gte": query = query.gte(filter[1], filter[2]); break;
    }
  }
  const result = await run<null>(query);
  return result.error ? { count: null, error: result.error } : { count: result.count ?? 0, error: null };
}

export type AuditRow = { id: number; table_name: string; record_id: string; project_id: string | null; operation: string; actor_id: string | null; summary: string; created_at: string };
export function recentAudit(supabase: SupabaseClient, limit = 8) {
  return run<AuditRow[]>(supabase.from("os_audit").select("id,table_name,record_id,project_id,operation,actor_id,summary,created_at").order("created_at", { ascending: false }).limit(limit));
}
