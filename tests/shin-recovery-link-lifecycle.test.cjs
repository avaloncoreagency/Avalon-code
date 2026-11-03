// SHIN / #98 T1: executable, network-free regression for recovery link lifecycle.
// Compiles the actual Next route and replaces only the Auth provider and cookie grant.
// No passwords, real identities, API requests, project secrets or database writes.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const ROUTE = "src/app/admin/auth/confirm/route.ts";
const ORIGIN = "https://isolated.example.invalid";
const USER = "00000000-0000-4000-8000-000000000001";

function harness({ verifyOtp, originFailure = false, grantFailure = false, clientFailure = false } = {}) {
  const observed = { verified: [], grants: [], clients: 0 };
  const mocks = {
    "next/server": {
      NextResponse: {
        redirect: (target, options) => ({
          status: 307,
          headers: new Headers({ Location: String(target), ...options.headers }),
        }),
        json: (data, options) => ({
          status: options.status,
          headers: new Headers(options.headers),
          data,
        }),
      },
    },
    "@/lib/supabase/server": {
      createClient: async () => {
        observed.clients++;
        if (clientFailure) throw Error("synthetic private Supabase client initialization failure");
        return {
          auth: {
            verifyOtp: async input => {
              observed.verified.push(input);
              return verifyOtp(input);
            },
          },
        };
      },
    },
    "@/lib/auth/policy": {
      getAppOrigin: () => {
        if (originFailure) throw Error("synthetic missing APP_ORIGIN");
        return ORIGIN;
      },
    },
    "@/lib/auth/email-flow": {
      grantPasswordFlow: async (id, purpose) => {
        if (grantFailure) throw Error("synthetic private AUTH_FLOW_SECRET/cookie failure");
        observed.grants.push({ id, purpose });
      },
    },
  };
  const source = fs.readFileSync(ROUTE, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    id => {
      if (!Object.hasOwn(mocks, id)) throw Error("Unexpected module: " + id);
      return mocks[id];
    },
    loaded, loaded.exports,
  );
  const call = params => loaded.exports.GET({
    nextUrl: new URL("/admin/auth/confirm?" + new URLSearchParams(params), ORIGIN),
  });
  return { call, observed };
}

function assertSafeRejection(response) {
  assert.equal(response.status, 307);
  const location = new URL(response.headers.get("location"));
  assert.equal(location.origin, ORIGIN);
  assert.equal(location.pathname + location.search, "/admin/login?error=callback");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.ok(!location.href.includes("synthetic-token"), "token must not leak into redirect");
}

test("recovery: invalid and expired OTP errors never mint a password-flow grant", async () => {
  for (const description of ["invalid token", "expired token"]) {
    const app = harness({
      verifyOtp: async () => ({
        data: { user: null },
        error: { message: "private provider diagnostic: " + description },
      }),
    });
    const response = await app.call({ type: "recovery", token_hash: "synthetic-token" });
    assertSafeRejection(response);
    assert.deepEqual(app.observed.verified, [{ token_hash: "synthetic-token", type: "recovery" }]);
    assert.deepEqual(app.observed.grants, []);
  }
});

test("recovery: consumed token cannot be replayed, even after one successful use", async () => {
  let consumed = false;
  const app = harness({
    verifyOtp: async () => {
      if (consumed) return { data: { user: null }, error: { message: "OTP already consumed" } };
      consumed = true;
      return { data: { user: { id: USER } }, error: null };
    },
  });
  const params = { type: "recovery", token_hash: "synthetic-token" };
  const accepted = await app.call(params);
  assert.equal(new URL(accepted.headers.get("location")).pathname, "/admin/reset-password");
  assert.equal(accepted.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(app.observed.grants, [{ id: USER, purpose: "recovery" }]);
  assertSafeRejection(await app.call(params));
  assert.equal(app.observed.verified.length, 2);
  assert.deepEqual(app.observed.grants, [{ id: USER, purpose: "recovery" }],
    "replayed link must not mint another grant");
});

test("recovery: provider exception, missing user and malformed purpose fail closed", async () => {
  const outage = harness({ verifyOtp: async () => { throw Error("private upstream outage"); } });
  assertSafeRejection(await outage.call({ type: "recovery", token_hash: "synthetic-token" }));
  assert.deepEqual(outage.observed.grants, []);

  const noUser = harness({ verifyOtp: async () => ({ data: { user: null }, error: null }) });
  assertSafeRejection(await noUser.call({ type: "recovery", token_hash: "synthetic-token" }));
  assert.deepEqual(noUser.observed.grants, []);

  const invalidInput = harness({
    verifyOtp: async () => { throw Error("should not contact Auth on invalid input"); },
  });
  for (const params of [
    { type: "other", token_hash: "synthetic-token" },
    { type: "recovery" },
    { type: "recovery", token_hash: "x".repeat(513) },
  ]) assertSafeRejection(await invalidInput.call(params));
  assert.equal(invalidInput.observed.clients, 0);
  assert.deepEqual(invalidInput.observed.grants, []);
});

test("recovery: missing app origin fails 503 before consuming a valid-looking token", async () => {
  const app = harness({
    originFailure: true,
    verifyOtp: async () => { throw Error("should not contact provider"); },
  });
  const response = await app.call({ type: "recovery", token_hash: "synthetic-token" });
  assert.equal(response.status, 503);
  assert.deepEqual(response.data, { error: "Authentication is not configured." });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(app.observed.clients, 0);
  assert.deepEqual(app.observed.grants, []);
});

test("recovery: cookie/signing grant failure fails closed after verified OTP", async () => {
  const app = harness({
    grantFailure: true,
    verifyOtp: async () => ({ data: { user: { id: USER } }, error: null }),
  });
  const response = await app.call({ type: "recovery", token_hash: "synthetic-token" });
  assertSafeRejection(response);
  assert.deepEqual(app.observed.verified, [{ token_hash: "synthetic-token", type: "recovery" }]);
  assert.deepEqual(app.observed.grants, [], "failed cookie signing must never mint a grant");
  assert.ok(!response.headers.get("location").includes(USER), "verified user ID must remain private");
});

test("recovery: Supabase client initialization outage rejects before touching OTP", async () => {
  const app = harness({
    clientFailure: true,
    verifyOtp: async () => { throw Error("OTP should never be checked"); },
  });
  const response = await app.call({ type: "recovery", token_hash: "synthetic-token" });
  assertSafeRejection(response);
  assert.equal(app.observed.clients, 1);
  assert.deepEqual(app.observed.verified, [], "client creation failure must not attempt OTP verification");
  assert.deepEqual(app.observed.grants, [], "client creation failure must not grant password access");
});

test("recovery: provider error with a user object must never grant password access", async () => {
  const app = harness({
    verifyOtp: async () => ({
      data: { user: { id: USER } },
      error: { message: "synthetic provider rejected OTP despite partial user result" },
    }),
  });
  const response = await app.call({ type: "recovery", token_hash: "synthetic-token" });
  assertSafeRejection(response);
  assert.deepEqual(app.observed.verified, [{ token_hash: "synthetic-token", type: "recovery" }]);
  assert.deepEqual(app.observed.grants, [], "an Auth error must override any partial identity");
});
