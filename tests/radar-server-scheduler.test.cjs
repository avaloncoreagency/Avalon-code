const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

test("Deno radar worker has a guarded secret, daily cap, lease and no outbound sales messaging", () => {
  const edge = fs.readFileSync("supabase/functions/avalon-radar-worker/index.ts", "utf8");
  const migration = fs.readFileSync("supabase/migrations/20261103205000_radar_scheduler_core.sql", "utf8");
  const bundleSource = fs.readFileSync("supabase/functions/avalon-radar-worker/radar-website-safety.ts", "utf8");
  const realSource = fs.readFileSync("src/lib/crm/radar-website-safety.ts", "utf8");
  assert.equal(bundleSource.slice(bundleSource.indexOf("\n") + 1), realSource,
    "Edge bundle must use the same vetted pinned-DNS safety as the web radar");
  assert.match(edge, /SUPABASE_SECRET_KEYS/);
  assert.match(edge, /sameHash\(supplied, config.token_sha256\)/);
  assert.match(edge, /MAX_DAILY_REPORTS = 12/);
  assert.match(edge, /MAX_PER_INVOCATION = 2/);
  assert.match(edge, /lease_until/);
  assert.match(edge, /investigateOfficialWebsite/);
  assert.match(edge, /report\.identity_matched/);
  assert.match(edge, /\.eq\("confidence", "high"\)/);
  assert.match(edge, /p\.stars_override == null && Number\(p\.stars\) >= 4/);
  assert.match(edge, /crm_radar_worker_convert_verified/);
  assert.match(edge, /Conversion is independent of whether a website was crawled/);
  assert.doesNotMatch(edge, /sendEmail|twilio|resend\.emails|sendSms/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /current_user <> 'service_role'/);
  assert.match(migration, /strong_services < 2/);
  assert.match(migration, /revoke all on function public\.crm_radar_worker_convert_verified/);
  const transpiled = ts.transpileModule(edge, {
    fileName: "supabase/functions/avalon-radar-worker/index.ts",
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  assert.deepEqual((transpiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error), []);
});

