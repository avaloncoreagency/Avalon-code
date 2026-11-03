import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { executeWorkerRun, SAFE_OFFICE_COMMAND, type RunStore } from "@/lib/office/manager-worker";
import { executeManagerCheck, isManagerCode, type CountReader } from "@/lib/office/manager-work";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
const PROD_SUPABASE_REF = "ltbwzcrxeuczdhhtbqgm";

/** Fails closed on production, missing connection secrets or mixed DB endpoints. */
export function previewOnlySettings() {
  const projectRef = process.env.AVALON_MANAGER_STAGING_SUPABASE_REF ?? "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const workerToken = process.env.AVALON_MANAGER_WORKER_TOKEN ?? "";
  if (process.env.VERCEL_ENV !== "preview" || !/^[a-z0-9]{20}$/.test(projectRef) ||
      projectRef === PROD_SUPABASE_REF || !serviceKey || workerToken.length < 32 ||
      url !== `https://${projectRef}.supabase.co`) return null;
  return { url, serviceKey, workerToken };
}

function sameSecret(actual: string, expected: string): boolean {
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Called by the staging-only GitHub Actions runner, never by the browser.
 * The request contains ONLY a manager allowlist value; all jobs are static.
 */
export async function POST(request: NextRequest) {
  const settings = previewOnlySettings();
  if (!settings) return reply({ error: "Worker staging no configurado" }, 503);
  const provided = request.headers.get("authorization")?.replace(/^Bearer /i, "") ?? "";
  if (!sameSecret(provided, settings.workerToken)) return reply({ error: "No autorizado" }, 401);
  if (Number(request.headers.get("content-length") ?? 0) > 1024) return reply({ error: "Solicitud demasiado grande" }, 413);
  let body: unknown;
  try { body = await request.json(); } catch { return reply({ error: "JSON inválido" }, 400); }
  if (!body || Array.isArray(body) || typeof body !== "object") return reply({ error: "Solicitud inválida" }, 400);
  const params = body as Record<string, unknown>;
  if (Object.keys(params).length !== 1 || !isManagerCode(params.manager))
    return reply({ error: "Manager inválido" }, 400);
  const manager = params.manager;
  const client = createClient(settings.url, settings.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const countReader: CountReader = async spec => {
    let query = client.from(spec.table)
      .select(spec.table === "agency_memberships" ? "user_id" : "id", { count: "exact", head: true });
    for (const filter of spec.filters) {
      if (filter.op === "eq") query = query.eq(filter.column, String(filter.value));
      if (filter.op === "lt") query = query.lt(filter.column, String(filter.value));
      if (filter.op === "in") query = query.in(filter.column, [...filter.value as readonly string[]]);
    }
    const { count, error } = await query;
    if (error || count === null) throw new Error("count_unavailable");
    return count;
  };
  const store: RunStore = {
    claim: async (runKey, agent, source, requestId) => {
      const { data, error } = await client.rpc("office_manager_claim_run", {
        p_run_key: runKey, p_manager: agent, p_source: source, p_request_id: requestId,
      });
      if (error) throw new Error("claim_unavailable");
      return typeof data === "string" && UUID.test(data) ? data : null;
    },
    finish: async (runKey, token, status, result, errorCode) => {
      const { data, error } = await client.rpc("office_manager_finish_run", {
        p_run_key: runKey, p_token: token, p_status: status,
        p_result: result, p_error_code: errorCode,
      });
      if (error) throw new Error("finish_unavailable");
      return data === true;
    },
  };

  try {
    const scheduled = await executeWorkerRun(manager, "scheduled", null, store, countReader);
    // Existing free-form requests are intentionally NOT executed. Only explicit,
    // owner-created fixed diagnostics are eligible for the bounded worker.
    const { data: requests, error } = await client.from("office_agent_requests")
      .select("id").eq("agent", manager).eq("status", "registered")
      .eq("body", SAFE_OFFICE_COMMAND).order("created_at", { ascending: true }).limit(4);
    if (error) throw new Error("queue_unavailable");
    const queue: { id: string; status: string }[] = [];
    for (const item of requests ?? []) {
      const result = await executeWorkerRun(manager, "requested", item.id, store, countReader);
      queue.push({ id: item.id, status: result.status });
    }
    return reply({
      manager, scheduled: scheduled.status,
      processed: queue.filter(x => x.status === "completed").length,
      duplicates: queue.filter(x => x.status === "duplicate").length,
      failures: queue.filter(x => x.status === "failed").length,
      // Never include free-form requests, tokens, client details or secret values.
    }, scheduled.status === "failed" || queue.some(x => x.status === "failed") ? 503 : 200);
  } catch {
    return reply({ error: "Worker no disponible; comprobar esquema y conexión de staging" }, 503);
  }
}
