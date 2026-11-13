import { createHash } from "node:crypto";
import { createClient as createAnon } from "@supabase/supabase-js";
import { reply, readJson, str } from "@/lib/project-bridge/http";
import { CATEGORIES, SOURCE_TOOLS, bridgeCategoryEnabled } from "@/lib/project-bridge/policy";

export const dynamic = "force-dynamic";

/**
 * Private import API for authorized tools (Claude Code, Codex, ChatGPT exports, scripts). Auth: `Authorization: Bearer avb_…`
 * (created and revoked by an owner in the library; stored only as sha256). The token can ONLY open an import that waits
 * for its ZIP in the private inbox; an owner reviews and processes it in the library. No privileged key is involved:
 * the database checks the token hash inside a reviewed SECURITY DEFINER function.
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = /^Bearer (avb_[A-Za-z0-9_-]{20,80})$/.exec(auth)?.[1];
  if (!token) return reply({ error: "invalid_token" }, 401);
  const body = await readJson(req, 4096);
  if (!body) return reply({ error: "invalid_body" }, 400);
  const category = str(body.category, 20) ?? "website";
  const name = str(body.fileName, 255) ?? "";
  const key = str(body.idempotencyKey, 100) ?? "";
  const tool = str(body.sourceTool, 20) ?? "api";
  if (!(CATEGORIES as readonly string[]).includes(category) || !(SOURCE_TOOLS as readonly string[]).includes(tool)) return reply({ error: "invalid_body" }, 400);
  if (!bridgeCategoryEnabled(category,process.env.AVALON_PRODUCT_CONTROL_EXTENDED_UPLOADS === "true"))
    return reply({ error: "category_not_enabled" }, 409);
  if (!/\.zip$/i.test(name) || key.length < 8) return reply({ error: "invalid_body", detail: "fileName must end in .zip; idempotencyKey ≥ 8 chars" }, 400);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anon) return reply({ error: "not_configured" }, 503);
  const db = createAnon(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const r = await db.rpc("os_bridge_api_open_import", {
    p_token_sha256: createHash("sha256").update(token).digest("hex"), p_category: category,
    p_project_name: str(body.projectName, 120) ?? "", p_original_name: name, p_source_tool: tool, p_idempotency_key: key,
  });
  if (r.error) {
    const map: Record<string, [string, number]> = { "28000": ["invalid_token", 401], "54000": ["rate_limited", 429], "23505": ["idempotency_key_in_use", 409], "23514": ["invalid_body", 400] };
    const [code, status] = map[r.error.code ?? ""] ?? ["unavailable", 503];
    return reply({ error: code }, status);
  }
  const data = r.data as { import_id: string; status: string; upload_path: string; replayed: boolean };
  return reply({
    importId: data.import_id, status: data.status, replayed: data.replayed,
    upload: {
      method: "POST", url: `${url}/storage/v1/object/avalon-projects/${data.upload_path}`,
      headers: { apikey: anon, authorization: `Bearer ${anon}`, "content-type": "application/zip", "x-upsert": "false" },
      maxBytes: 26214400, expiresInSeconds: 1800,
    },
    next: `POST /api/project-bridge/v1/imports/${data.import_id} with {"uploaded":true} after the upload`,
  }, data.replayed ? 200 : 201);
}
