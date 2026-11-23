import { createHash } from "node:crypto";
import { createClient as createAnon } from "@supabase/supabase-js";
import { reply, readJson } from "@/lib/project-bridge/http";

export const dynamic = "force-dynamic";

/**
 * Dev Bridge 3.0 agent ingestion (Claude Code / Codex sessions and activity). Auth: `Authorization: Bearer avd_…`, issued
 * per agent (miguel.claude, miguel.codex, samuel.claude, samuel.codex) by THAT agent's owner and stored only as sha256.
 * The publishable key calls one reviewed SECURITY DEFINER function that checks the token hash, the session ownership,
 * the state machine and idempotency. Session time is measured with the database clock, not the caller's.
 */
export async function POST(req: Request) {
  const token = /^Bearer (avd_[A-Za-z0-9_-]{20,80})$/.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!token) return reply({ error: "invalid_token" }, 401);
  const body = await readJson(req, 16_384);
  if (!body) return reply({ error: "invalid_body" }, 400);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anon) return reply({ error: "not_configured" }, 503);
  const db = createAnon(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const r = await db.rpc("dev_bridge_agent_event", { p_token_sha256: createHash("sha256").update(token).digest("hex"), p_event: body });
  if (r.error) {
    const map: Record<string, [string, number]> = {
      "28000": ["invalid_token", 401], "54000": ["rate_limited", 429], "22023": ["invalid_event", 400],
      "23514": ["invalid_session_transition", 409], P0002: ["session_not_found", 404], PGRST202: ["not_deployed", 503], "42883": ["not_deployed", 503],
    };
    const [code, status] = map[r.error.code ?? ""] ?? ["unavailable", 503];
    return reply({ error: code }, status);
  }
  const data = r.data as { event_id: string; session_id: string | null; replayed: boolean };
  return reply({ eventId: data.event_id, sessionId: data.session_id, replayed: data.replayed }, data.replayed ? 200 : 201);
}
