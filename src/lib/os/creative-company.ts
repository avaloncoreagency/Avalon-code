import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// The product handoff may only identify a business by an explicit, bounded
// business name or an existing CRM UUID. Never infer a client from a prompt.
export const CREATIVE_REF = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;

export function exactCompanyName(value: unknown): string {
  if (typeof value !== "string") throw new Error("invalid");
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length > 200 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error("invalid");
  return name;
}

export function parseCreativeRef(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value !== "string") throw new Error("invalid");
  const ref = value.trim();
  if (!CREATIVE_REF.test(ref)) throw new Error("invalid");
  return ref;
}

function escapeLike(name: string): string {
  return name.replace(/[\\%_]/g, "\\$&");
}

type LeadMatch = { id: string; company: string };
export function exactMatches(rows: LeadMatch[], name: string): LeadMatch[] {
  const target = name.trim().toLocaleLowerCase("en-US");
  return rows.filter(row => row.company.trim().toLocaleLowerCase("en-US") === target);
}

export type LeadResolution =
  | { ok: true; id: string; created: boolean }
  | { ok: false; error: "ambiguous" | "unavailable" };

/** Owner-session Supabase client ONLY; relies on CRM RLS and existing constraints.
 * No privilege bypass, no synthetic contact, no sale. A race with two genuinely
 * distinct active leads is refused rather than guessed.
 */
export async function resolveOrCreateProductLead(db: SupabaseClient, ownerId: string, raw: string): Promise<LeadResolution> {
  const name = exactCompanyName(raw);
  if (!name) return { ok: false, error: "unavailable" };
  async function find(): Promise<LeadResolution | null> {
    const { data, error } = await db.from("crm_leads")
      .select("id,company").eq("archived", false)
      .ilike("company", escapeLike(name)).limit(3);
    if (error) return { ok: false, error: "unavailable" };
    const matches = exactMatches(data ?? [], name);
    if (matches.length > 1) return { ok: false, error: "ambiguous" };
    if (matches.length === 1) return { ok: true, id: matches[0].id, created: false };
    return null;
  }
  const existing = await find();
  if (existing) return existing;
  const { data, error } = await db.from("crm_leads").insert({
    company: name, contact: "", email: null,
    source: "Avalon OS - proyecto de cliente", owner_id: ownerId,
    stage_id: "new", value: 0, probability: 0, priority: "normal",
  }).select("id").single();
  if (!error && data) return { ok: true, id: data.id, created: true };
  // Unique index may win the concurrent insert; reuse only an exact identity.
  if (error?.code === "23505") return (await find()) ?? { ok: false, error: "unavailable" };
  return { ok: false, error: "unavailable" };
}
