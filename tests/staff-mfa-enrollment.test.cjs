const assert = require("node:assert/strict");
const fs = require("node:fs");
const { test } = require("node:test");
const ts = require("typescript");

const factorId = "00000000-0000-4000-8000-0000000000f1";
const previous = { step: "scan", factorId, qr: "synthetic-qr", secret: "synthetic-key" };
const source = fs.readFileSync("src/app/staff/mfa/actions.ts", "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup({ state = "ok", factors = [], allowed = true, verifyError = null } = {}) {
  const calls = [];
  const mfa = {
    listFactors: async () => ({
      error: null,
      data: { all: factors, totp: factors.filter(factor => factor.status === "verified") },
    }),
    unenroll: async input => { calls.push(["unenroll", input]); return { error: null }; },
    enroll: async input => {
      calls.push(["enroll", input]);
      return { error: null, data: { type: "totp", id: factorId, totp: { qr_code: previous.qr, secret: previous.secret } } };
    },
    challengeAndVerify: async input => {
      calls.push(["verify", input]);
      return { error: verifyError };
    },
  };
  const dependencies = {
    "next/navigation": { redirect: () => assert.fail("Unexpected redirect") },
    "@/lib/auth/staff": { getStaffState: async () => ({ state, userId: "test-user", supabase: { auth: { mfa } } }) },
    "@/lib/security/rate-limit": {
      AUTH_RULES: {},
      authLimiter: { hit: () => ({ allowed }), reset: () => {} },
      hashKey: () => "test-key",
    },
  };
  const exports = {};
  new Function("exports", "require", js)(exports, path => {
    assert.ok(Object.hasOwn(dependencies, path));
    return dependencies[path];
  });
  return { enroll: exports.enrollStaffTotp, calls };
}

function form(intent, code = "") {
  const data = new FormData();
  data.set("intent", intent);
  data.set("code", code);
  return data;
}

test("active staff can replace an abandoned enrollment and verify their first TOTP factor", async () => {
  const { enroll, calls } = setup({ factors: [{ id: factorId, status: "unverified", factor_type: "totp" }] });
  assert.deepEqual(await enroll({ step: "idle" }, form("start")), previous);
  assert.deepEqual(await enroll(previous, form("confirm", "123 456")), { step: "done" });
  assert.deepEqual(calls, [
    ["unenroll", { factorId }],
    ["enroll", { factorType: "totp", issuer: "Avalon Core Agency" }],
    ["verify", { factorId, code: "123456" }],
  ]);
});

test("revoked staff, AAL1 challenge sessions and rate-limited attempts cannot enroll", async () => {
  for (const options of [{ state: "none" }, { state: "mfa" }, { allowed: false }]) {
    const { enroll, calls } = setup(options);
    const error = options.allowed === false ? "throttled" : "unauthorized";
    assert.equal((await enroll({ step: "idle" }, form("start"))).error, error);
    assert.equal((await enroll(previous, form("confirm", "123456"))).error, error);
    assert.deepEqual(calls, []);
  }
});

test("a verified factor is preserved and invalid verification stays pending", async () => {
  const verified = setup({ factors: [{ id: factorId, status: "verified", factor_type: "totp" }] });
  assert.deepEqual(await verified.enroll({ step: "idle" }, form("start")), { step: "idle", error: "exists" });
  assert.deepEqual(verified.calls, []);
  const invalid = setup({ verifyError: { code: "mfa_verification_failed" } });
  assert.deepEqual(await invalid.enroll(previous, form("confirm", "bad")), { ...previous, error: "code" });
  assert.deepEqual(invalid.calls, []);
  assert.deepEqual(await invalid.enroll(previous, form("confirm", "123456")), { ...previous, error: "code" });
});
