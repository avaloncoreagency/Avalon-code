const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

test("Deno radar worker has a guarded secret, daily cap, lease and no outbound sales messaging", () => {
  const edge = fs.readFileSync("supabase/functions/avalon-radar-worker/index.ts", "utf8");
  const migration = fs.readFileSync("supabase/migrations/20261103205000_radar_scheduler_core.sql", "utf8");
  const bundleSource = fs.readFileSync("supabase/functions/avalon-radar-worker/radar-website-safety.ts", "utf8");
  const realSource = fs.readFileSync("src/lib/crm/radar-website-safety.ts", "utf8");
  // Deno's Node https.request() is not supported in Supabase Edge.
  // Its native adapter must pin a vetted IPv4 and authenticate TLS using the
  // original hostname, preserving existing URL and robots protections.
  assert.match(bundleSource, /Deno\.resolveDns/);
  assert.match(bundleSource, /Deno\.connect\(/);
  assert.match(bundleSource, /Deno\.startTls\(/);
  assert.match(bundleSource, /isPublicAddress\(/);
  assert.match(bundleSource, /sameBusinessHost\(/);
  assert.match(bundleSource, /robotsAllows\(/);
  assert.match(bundleSource, /MAX_RESEARCH_PAGES = 3/);
  assert.doesNotMatch(bundleSource, /node:https|request\(accepted/);
  assert.match(realSource, /pinnedDnsLookup\(address\)/);
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


test("native Deno HTTPS adapter parses bounded HTTP/1.1 and chunked responses", () => {
  const source = fs.readFileSync("supabase/functions/avalon-radar-worker/radar-website-safety.ts", "utf8");
  const transpiled = ts.transpileModule(source, {
    fileName: "radar-website-safety.ts",
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  assert.deepEqual((transpiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error), []);
  const moduleObj = { exports: {} };
  new Function("require", "module", "exports", transpiled.outputText)(require, moduleObj, moduleObj.exports);
  const safety = moduleObj.exports;
  const enc = new TextEncoder();
  const response = enc.encode("HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n5\r\nhello\r\n0\r\n\r\n");
  const parsed = safety.parseHttpResponse(response, 20);
  assert.equal(parsed.status, 200);
  assert.equal(parsed.text, "hello");
  assert.equal(parsed.contentType, "text/plain; charset=utf-8");
  assert.equal(safety.websiteUrl("https://127.0.0.1/admin"), null);
  assert.equal(safety.isPublicAddress("10.0.0.1"), false);
  assert.equal(safety.isPublicAddress("169.254.169.254"), false);
  assert.equal(safety.robotsAllows("User-agent: *\nDisallow: /private", "/private/records"), false);
  assert.throws(() => safety.parseHttpResponse(response, 4), e => e.code === "oversize");
  const framed = enc.encode("HTTP/1.1 200 OK\r\nContent-Length: 5\r\nContent-Type: text/html\r\n\r\nhello");
  assert.equal(safety.parseHttpResponse(framed, 20, true).text, "hello");
  const unframed = enc.encode("HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\nhello");
  assert.throws(() => safety.parseHttpResponse(unframed, 20, true), e => e.code === "truncated");
  const missingRobots = enc.encode("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
  assert.equal(safety.parseHttpResponse(missingRobots, 20, true).status, 404);
  assert.match(source, /cause\.name === "UnexpectedEof"/);
  const compressed = enc.encode("HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\n\r\nabc");
  assert.throws(() => safety.parseHttpResponse(compressed, 20), e => e.code === "encoding");
  const malformed = enc.encode("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\nabc\r\nbad\r\n");
  assert.throws(() => safety.parseHttpResponse(malformed, 20), e => e.code === "chunk_invalid");
});
