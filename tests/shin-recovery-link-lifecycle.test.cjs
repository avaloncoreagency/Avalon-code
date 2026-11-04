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

function harness({ verifyOtp, originFailure = false, grantFailure = false, clientFailure = false, clearFailure = false, signOutFailure = false } = {}) {
  const observed = { verified: [], grants: [], clients: 0, clears: 0, signOuts: [] };
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
            signOut: async options => {
              observed.signOuts.push(options);
              if (signOutFailure) throw Error("synthetic local session revocation failure");
              return { error: null };
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
      clearPasswordFlow: async () => {
        observed.clears++;
        if (clearFailure) throw Error("synthetic cookie cleanup failure");
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
  assert.deepEqual(app.observed.signOuts, [], "successful recovery must preserve its temporary session");
  assert.equal(app.observed.clears, 0, "successful recovery must preserve the flow proof");
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
  assert.equal(app.observed.clears, 1, "failed grant must remove any partial password-flow cookie");
  assert.deepEqual(app.observed.signOuts, [{ scope: "local" }], "failed grant must revoke local Auth session");
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

test("recovery: consumed OTP remains unusable after a failed grant and retry", async () => {
  let consumed = false;
  const app = harness({
    grantFailure: true,
    verifyOtp: async () => {
      if (consumed) return { data: { user: null }, error: { message: "OTP consumed" } };
      consumed = true;
      return { data: { user: { id: USER } }, error: null };
    },
  });
  const params = { type: "recovery", token_hash: "synthetic-token" };
  assertSafeRejection(await app.call(params));
  assert.ok(consumed, "first attempt must consume the provider OTP before the cookie failure");
  assert.deepEqual(app.observed.grants, [], "a failed grant must not authorize password setup");

  // Reusing that same OTP must not recover access after the downstream failure.
  assertSafeRejection(await app.call(params));
  assert.equal(app.observed.verified.length, 2);
  assert.deepEqual(app.observed.grants, [], "replayed OTP must never mint a password-flow grant");
  assert.equal(app.observed.clears, 1, "cleanup only follows the initially verified OTP");
  assert.deepEqual(app.observed.signOuts, [{ scope: "local" }]);
});

test("recovery: malformed provider response fails closed without granting access", async () => {
  // Provider transport adapters can return incomplete/undefined data during
  // outages or SDK contract regressions. None may authorize password reset.
  const malformedResponses = [
    null,
    undefined,
    { data: null, error: null },
    { data: undefined, error: null },
    { data: {}, error: null },
  ];
  for (const result of malformedResponses) {
    const app = harness({ verifyOtp: async () => result });
    const response = await app.call({ type: "recovery", token_hash: "synthetic-token" });
    assertSafeRejection(response);
    assert.deepEqual(app.observed.verified, [{ token_hash: "synthetic-token", type: "recovery" }]);
    assert.deepEqual(app.observed.grants, [], "malformed provider data cannot grant password flow");
  }
});

test("recovery: an untrusted or malformed provider user ID cannot mint a password grant", async () => {
  // Auth user IDs are UUIDs. A partial/buggy SDK result must not turn an
  // arbitrary truthy value into the subject of a signed recovery cookie.
  for (const id of [undefined, null, "", " ", "not-a-uuid", USER + " ", 123, { value: USER }]) {
    const app = harness({
      verifyOtp: async () => ({ data: { user: { id } }, error: null }),
    });
    const response = await app.call({ type: "recovery", token_hash: "synthetic-token" });
    assertSafeRejection(response);
    assert.deepEqual(app.observed.verified, [{ token_hash: "synthetic-token", type: "recovery" }]);
    assert.deepEqual(app.observed.grants, [], "invalid user ID must not mint a recovery grant");
  }
});


test("recovery: malformed URL-decoded OTP hashes never reach Supabase", async () => {
  const app = harness({
    verifyOtp: async () => { throw Error("malformed input must not touch provider"); },
  });
  for (const token_hash of [" ", " synthetic-token", "synthetic-token ", "synthetic\n-token", "synthetic\t-token", "synthetic\u0000-token", "synthetic\u007f-token"]) {
    assertSafeRejection(await app.call({ type: "recovery", token_hash }));
  }
  assert.equal(app.observed.clients, 0);
  assert.deepEqual(app.observed.verified, []);
  assert.deepEqual(app.observed.grants, []);
});

test("recovery: cleanup exceptions cannot expose a consumed OTP or private cookie diagnostics", async () => {
  const app = harness({
    grantFailure: true,
    clearFailure: true,
    signOutFailure: true,
    verifyOtp: async () => ({ data: { user: { id: USER } }, error: null }),
  });
  const response = await app.call({ type: "recovery", token_hash: "synthetic-token" });
  assertSafeRejection(response);
  assert.equal(app.observed.clears, 1, "cleanup of any partial proof was attempted");
  assert.deepEqual(app.observed.signOuts, [{ scope: "local" }], "local session revoke was attempted");
  assert.deepEqual(app.observed.grants, []);
  assert.ok(!response.headers.get("location").includes(USER));
});
