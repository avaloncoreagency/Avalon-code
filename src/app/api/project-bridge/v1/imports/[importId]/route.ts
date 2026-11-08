import { createHash } from "node:crypto";
import { createClient as createAnon } from "@supabase/supabase-js";
import { reply, readJson, UUID } from "@/lib/project-bridge/http";

export const dynamic = "force-dynamic";

async function status(req: Request, importId: string, markUploaded: boolean) {
  const token = /^Bearer (avb_[A-Za-z0-9_-]{20,80})$/.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!token) return reply({ error: "invalid_token" }, 401);
  if (!UUID.test(importId)) return reply({ error: "not_found" }, 404);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anon) return reply({ error: "not_configured" }, 503);
  const db = createAnon(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const r = await db.rpc("os_bridge_api_import_status", { p_token_sha256: createHash("sha256").update(token).digest("hex"), p_import: importId, p_mark_uploaded: markUploaded });
  if (r.error) {
    const map: Record<string, [string, number]> = { "28000": ["invalid_token", 401], P0002: ["not_found", 404], "22023": ["archive_not_uploaded", 409] };
    const [code, st] = map[r.error.code ?? ""] ?? ["unavailable", 503];
    return reply({ error: code }, st);
  }
  return reply(r.data);
}

/** Status of an import created with this token (never other imports). */
export async function GET(req: Request, { params }: { params: Promise<{ importId: string }> }) {
  return status(req, (await params).importId, false);
}
/** Confirms the upload: the import moves to `received` and waits for an owner in the library. */
export async function POST(req: Request, { params }: { params: Promise<{ importId: string }> }) {
  const body = await readJson(req, 256);
  if (!body || body.uploaded !== true) return reply({ error: "invalid_body" }, 400);
  return status(req, (await params).importId, true);
}
