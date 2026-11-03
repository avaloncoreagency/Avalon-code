"use strict";
/**
 * Independently scheduled staging worker. No Next.js server keys, no user-facing
 * endpoints and no free-form instructions. Node 22 + locally pinned TypeScript.
 */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function compilePure(file, dependencies = {}) {
  const raw = fs.readFileSync(path.join(process.cwd(), file), "utf8");
  const output = ts.transpileModule(raw, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", output)(mod, mod.exports, id => {
    if (!(id in dependencies)) throw new Error("unexpected_module_import");
    return dependencies[id];
  });
  return mod.exports;
}
const jobs = compilePure("src/lib/office/manager-work.ts");
const worker = compilePure("src/lib/office/manager-worker.ts", { "./manager-work": jobs });
const CODES = Object.freeze(["ren", "shin", "haru", "sora", "kenji"]);
const PROD_REF = "ltbwzcrxeuczdhhtbqgm";
const VALID_REF = /^[a-z0-9]{20}$/;

function isolatedSettings(base, ref, key) {
  if (!VALID_REF.test(ref ?? "") || ref === PROD_REF ||
      base !== `https://${ref}.supabase.co` ||
      typeof key !== "string" || key.length < 40)
    throw new Error("staging_configuration_required");
  return { base, key };
}
function chooseManagers(value) {
  if (!value || value === "all") return [...CODES];
  if (!CODES.includes(value)) throw new Error("invalid_manager");
  return [value];
}

/** All HTTP traffic is to one exact Supabase staging host, no redirects. */
function createGateway(config, fetcher = fetch) {
  const { base, key } = isolatedSettings(config.base, config.ref, config.key);
  async function call(method, endpoint, params = {}, value) {
    const url = new URL("/rest/v1/" + endpoint, base);
    for (const [param, item] of Object.entries(params)) url.searchParams.set(param, String(item));
    const headers = { apikey: key, authorization: `Bearer ${key}` };
    if (value !== undefined) headers["content-type"] = "application/json";
    if (method === "HEAD") headers.prefer = "count=exact";
    const response = await fetcher(url.toString(), {
      method, redirect: "error", headers,
      ...(value === undefined ? {} : { body: JSON.stringify(value) }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) throw new Error("staging_http_unavailable");
    if (method === "HEAD") {
      const contentRange = response.headers.get("content-range") || "";
      const last = contentRange.split("/").pop();
      if (!/^\d+$/.test(last ?? "")) throw new Error("staging_count_unavailable");
      return Number(last);
    }
    const raw = await response.text();
    return raw ? JSON.parse(raw) : null;
  }
  const countReader = async spec => {
    const params = { select: spec.table === "agency_memberships" ? "user_id" : "id" };
    for (const filter of spec.filters) {
      if (filter.op === "in") params[filter.column] =
        "in.(" + [...filter.value].map(x => String(x)).join(",") + ")";
      else params[filter.column] = filter.op + "." + filter.value;
    }
    return call("HEAD", spec.table, params);
  };
  const store = {
    claim: async (runKey, manager, source, requestId) => {
      const data = await call("POST", "rpc/office_manager_claim_run", {}, {
        p_run_key: runKey, p_manager: manager, p_source: source, p_request_id: requestId,
      });
      return data === null || typeof data === "string" ? data : null;
    },
    finish: async (runKey, token, status, result, errorCode) =>
      (await call("POST", "rpc/office_manager_finish_run", {}, {
        p_run_key: runKey, p_token: token, p_status: status,
        p_result: result, p_error_code: errorCode,
      })) === true,
  };
  const eligibleRequests = async manager => {
    const rows = await call("GET", "office_agent_requests", {
      select: "id",
      agent: "eq." + manager,
      status: "eq.registered",
      body: "eq." + worker.SAFE_OFFICE_COMMAND,
      order: "created_at.asc",
      limit: 4,
    });
    if (!Array.isArray(rows) || rows.some(x => !x || typeof x.id !== "string"))
      throw new Error("invalid_queue_response");
    return rows;
  };
  return { countReader, store, eligibleRequests };
}

async function runStagingManagers({
  baseUrl, projectRef, serviceKey, manager = "all",
  fetcher = fetch, gateway = null, now = new Date(),
}) {
  // Even in mocked tests, do not allow an invalid manager ID.
  const managers = chooseManagers(manager);
  const db = gateway || createGateway({ base: baseUrl, ref: projectRef, key: serviceKey }, fetcher);
  const results = [];
  for (const code of managers) {
    try {
      const scheduled = await worker.executeWorkerRun(code, "scheduled", null, db.store, db.countReader, now);
      const queued = await db.eligibleRequests(code);
      const attempts = [];
      for (const row of queued) {
        const work = await worker.executeWorkerRun(code, "requested", row.id,
          db.store, db.countReader, now);
        attempts.push(work.status);
      }
      results.push({ manager: code,
        ok: scheduled.status !== "failed" && !attempts.includes("failed"),
        status: scheduled.status,
        queuedCompleted: attempts.filter(s => s === "completed").length,
        queuedDuplicate: attempts.filter(s => s === "duplicate").length });
    } catch {
      // Keep connection failures and private data out of workflow output.
      results.push({ manager: code, ok: false, status: "unavailable",
        queuedCompleted: 0, queuedDuplicate: 0 });
    }
  }
  return results;
}

if (require.main === module) {
  runStagingManagers({
    baseUrl: process.env.AVALON_STAGING_SUPABASE_URL,
    projectRef: process.env.AVALON_MANAGER_STAGING_SUPABASE_REF,
    serviceKey: process.env.AVALON_STAGING_SERVICE_ROLE_KEY,
    manager: process.env.MANAGER_CHOICE || "all",
  }).then(results => {
    for (const result of results) console.log(JSON.stringify(result));
    if (results.some(result => !result.ok)) process.exitCode = 1;
  }).catch(err => {
    console.error("Staging manager runner unavailable:",
      err?.message === "staging_configuration_required" ? err.message : "configuration_error");
    process.exitCode = 1;
  });
}
module.exports = { CODES, isolatedSettings, chooseManagers, createGateway, runStagingManagers };
