import "server-only";
import { createHmac } from "node:crypto";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Least-privilege client for the two public intake RPCs (P0.2, docs/sql/public-intake-role-review.sql).
 *
 * When AVALON_INTAKE_JWT_SECRET is configured, the server signs a 60-second JWT with role "avalon_intake": a NOLOGIN
 * role that can only EXECUTE crm_public_inquiry / crm_growth_funnel_submit. This lets the database refuse the direct
 * anonymous path that skips the server's Turnstile and per-IP checks. No privileged Supabase key is used, the token never
 * reaches the browser, and with the secret absent the current anonymous client is used (documented rollout state).
 */
const b64 = (value: string | Buffer) => Buffer.from(value).toString("base64url");

export function signIntakeToken(secret: string, now = Math.floor(Date.now() / 1000)): string {
  const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64(JSON.stringify({ role: "avalon_intake", iss: "avalon-intake", iat: now, exp: now + 60 }));
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

export type IntakeMode = "role" | "anon";
export function intakeMode(env = process.env): IntakeMode {
  return (env.AVALON_INTAKE_JWT_SECRET?.trim().length ?? 0) >= 32 ? "role" : "anon";
}

/** Returns null when the role path is not configured; callers then keep using the existing anonymous client. */
export function createIntakeClient(env = process.env): SupabaseClient | null {
  if (intakeMode(env) !== "role") return null;
  const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public environment variables are missing");
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${signIntakeToken(env.AVALON_INTAKE_JWT_SECRET!.trim())}` } },
  });
}
