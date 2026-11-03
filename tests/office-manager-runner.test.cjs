const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

function compilePure(path, deps = {}) {
  const source = fs.readFileSync(path, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", js)(mod, mod.exports, id => {
    if (!(id in deps)) throw Error("unexpected_import");
    return deps[id];
  });
  return mod.exports;
}
const jobs = compilePure("src/lib/office/manager-work.ts");
const { SAFE_OFFICE_COMMAND, workerRunKey, executeWorkerRun } = compilePure("src/lib/office/manager-worker.ts", {
  "./manager-work": jobs,
});
const poller = require("../scripts/office-manager-staging-poll.cjs");
const now = new Date("2026-11-03T21:06:00Z");
const uuid = "60a6b110-49ba-4725-b03a-26058c0d668a";
const stagingRef = "jasgumggzgoqbemtcmno";
const stagedUrl = "https://" + stagingRef + ".supabase.co";
const key = "synthetic-service-key-for-tests-only-never-live-" + "x".repeat(24);

test("five manager jobs, unique hours and only fixed commands", () => {
  assert.deepEqual([...poller.CODES], ["ren", "shin", "haru", "sora", "kenji"]);
  assert.equal(SAFE_OFFICE_COMMAND, "AVALON_MANAGER_CHECK_V1");
  assert.equal(workerRunKey("ren", "scheduled", now, null), "scheduled:ren:2026-11-03T21");
  assert.equal(workerRunKey("shin", "requested", now, uuid), "request:" + uuid);
  assert.throws(() => workerRunKey("shin", "requested", now, "run arbitrary shell"));
});

test("atomic claims prevent duplicate execution", async () => {
  const seen = new Set();
  let counts = 0, saved = 0;
  const store = {
    claim: async runKey => seen.has(runKey) ? null : (seen.add(runKey), uuid),
    finish: async () => { saved++; return true; },
  };
  const once = await executeWorkerRun("ren", "scheduled", null, store, async () => { counts++; return 4; }, now);
  const twice = await executeWorkerRun("ren", "scheduled", null, store, async () => { counts++; return 4; }, now);
  assert.equal(once.status, "completed");
  assert.equal(twice.status, "duplicate");
  assert.equal(saved, 1);
  assert.equal(counts, jobs.MANAGER_JOBS.ren.specs.length);
});

test("database failure saves error code only, never raw secret", async () => {
  const captured = [];
  const store = {
    claim: async () => uuid,
    finish: async (...args) => { captured.push(args); return true; },
  };
  const r = await executeWorkerRun("haru", "scheduled", null, store,
    async () => { throw Error("customer secret in database failure"); }, now);
  assert.equal(r.status, "failed");
  assert.equal(captured[0][2], "failed");
  assert.equal(captured[0][3], null);
  assert.equal(captured[0][4], "check_unavailable");
  assert.ok(!JSON.stringify(captured).includes("customer secret"));
});

test("lost lease cannot be represented as successful", async () => {
  await assert.rejects(
    () => executeWorkerRun("sora", "scheduled", null, {
      claim: async () => uuid,
      finish: async () => false,
    }, async () => 2, now), /lease_lost/,
  );
});

test("runner refuses production and cross-project credentials", () => {
  assert.deepEqual(poller.isolatedSettings(stagedUrl, stagingRef, key), { base: stagedUrl, key });
  for (const [base, ref, secret] of [
    ["https://ltbwzcrxeuczdhhtbqgm.supabase.co", "ltbwzcrxeuczdhhtbqgm", key],
    ["https://avaloncoreagency.com", stagingRef, key],
    ["http://" + stagingRef + ".supabase.co", stagingRef, key],
    [stagedUrl, "ltbwzcrxeuczdhhtbqgm", key],
    [stagedUrl, stagingRef, ""],
    [stagedUrl + "/", stagingRef, key],
  ]) assert.throws(() => poller.isolatedSettings(base, ref, secret));
  assert.deepEqual(poller.chooseManagers("all"), [...poller.CODES]);
  assert.deepEqual(poller.chooseManagers("sora"), ["sora"]);
  assert.throws(() => poller.chooseManagers("hacker"));
});

test("all five worker jobs use bounded mock gateway and report actual outcomes", async () => {
  const calls = [], saved = [];
  const gateway = {
    countReader: async spec => { calls.push(spec.table); return 2; },
    store: { claim: async () => uuid, finish: async (...args) => { saved.push(args); return true; } },
    eligibleRequests: async () => [],
  };
  const results = await poller.runStagingManagers({ gateway, now });
  assert.equal(results.length, 5);
  assert.ok(results.every(r => r.ok && r.status === "completed"));
  assert.equal(saved.length, 5);
  assert.ok(calls.length >= 10);
  assert.ok(saved.every(entry => entry[3].source === "staging_service_worker"));
});

test("transport errors do not stop independent managers or print keys", async () => {
  const gateway = {
    countReader: async spec => { if (spec.table === "crm_sales") throw Error("key " + key); return 2; },
    store: { claim: async () => uuid, finish: async () => true },
    eligibleRequests: async () => [],
  };
  const results = await poller.runStagingManagers({ gateway, now });
  assert.equal(results.length, 5);
  assert.deepEqual(results.filter(r => !r.ok).map(r => r.manager), ["haru"]);
  assert.ok(!JSON.stringify(results).includes(key));
});

test("PostgREST gateway sends only staging HEAD counts, authenticated RPC and fixed queue filters", async () => {
  const requests = [];
  const fakeFetch = async (url, opts) => {
    requests.push({ url, opts });
    if (opts.method === "HEAD") return { ok: true, headers: { get: name => name === "content-range" ? "*/4" : null } };
    if (url.includes("/rpc/office_manager_claim_run"))
      return { ok: true, text: async () => JSON.stringify(uuid) };
    if (url.includes("/rpc/office_manager_finish_run"))
      return { ok: true, text: async () => "true" };
    return { ok: true, text: async () => "[]" };
  };
  const db = poller.createGateway({ base: stagedUrl, ref: stagingRef, key }, fakeFetch);
  const results = await poller.runStagingManagers({ gateway: db, manager: "ren", now });
  assert.deepEqual(results.map(r => r.manager), ["ren"]);
  assert.equal(results[0].status, "completed");
  assert.ok(requests.some(x => x.opts.method === "HEAD"));
  assert.ok(requests.every(x => x.url.startsWith(stagedUrl + "/rest/v1/")));
  assert.ok(requests.every(x => x.opts.headers.apikey === key && x.opts.headers.authorization === "Bearer " + key));
  assert.ok(requests.some(x => x.url.includes("body=eq.AVALON_MANAGER_CHECK_V1")));
  assert.ok(!JSON.stringify(results).includes(key));
});

test("staging worker stays outside Next public application code", () => {
  assert.ok(!fs.existsSync("src/app/api/internal/office-manager-runner/route.ts"));
  const source = fs.readFileSync("scripts/office-manager-staging-poll.cjs", "utf8");
  assert.ok(!source.includes("NEXT_PUBLIC_SUPABASE_SECRET"));
  assert.ok(!source.includes("avaloncoreagency.com"));
  const history = fs.readFileSync("src/app/admin/workspace/crm/office/manager-work/history/api/route.ts", "utf8");
  assert.ok(history.includes("getOwnerSession()"));
  assert.ok(history.includes('"No autorizado"'));
});

test("schema restricts results to owners and claiming fixed system diagnostics", () => {
  const sql = fs.readFileSync("supabase/migrations/20261103211000_office_manager_runs.sql", "utf8");
  assert.ok(sql.includes("alter table public.office_manager_runs enable row level security;"));
  assert.ok(sql.includes("revoke all on public.office_manager_runs from anon, authenticated;"));
  assert.ok(sql.includes("grant select on public.office_manager_runs to authenticated;"));
  assert.ok(sql.includes("for select to authenticated using ((select crm_private.is_owner()))"));
  assert.ok(sql.includes("r.body = 'AVALON_MANAGER_CHECK_V1'"));
  assert.ok(sql.includes("claim_token = p_token"));
  assert.ok(sql.includes("lease_until > now()"));
  assert.ok(sql.includes("to service_role"));
});
