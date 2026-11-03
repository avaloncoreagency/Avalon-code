// SHIN: deterministic owner/secret-isolation regression for the Geoapify geocoder.
// Synthetic identities and provider responses only; never issues a real request.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const file = "src/app/admin/workspace/crm/radar/geocode/route.ts";
const FAKE_KEY = "synthetic_geoapify_key_1234567890";
const request = q => ({ nextUrl: { searchParams: new URLSearchParams({ q }) } });

function loadRoute({ owner = null, key, fetchMock = () => { throw Error("unexpected network"); } } = {}) {
  const js = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const deps = {
    "next/server": { NextResponse: { json: (data, opts = {}) => ({
      data, status: opts.status ?? 200, headers: opts.headers ?? {},
    }) } },
    "@/lib/auth/session": { getOwnerSession: async () => owner },
    "@/lib/crm/radar-geoapify": {
      validGeoapifyKey: value => typeof value === "string" && /^[A-Za-z0-9_-]{8,160}$/.test(value),
    },
  };
  new Function("require", "module", "exports", "process", "fetch",
    "AbortSignal", "URL", "URLSearchParams", js)(
      name => {
        if (!Object.hasOwn(deps, name)) throw Error("Unexpected module: " + name);
        return deps[name];
      },
      module, module.exports,
      { env: key === undefined ? {} : { AVALON_GEOAPIFY_PLACES_KEY: key } },
      fetchMock, AbortSignal, URL, URLSearchParams,
    );
  return module.exports;
}

test("geocode denies anonymous users before touching the provider", async () => {
  let calls = 0;
  const { GET } = loadRoute({
    key: FAKE_KEY,
    fetchMock: () => { calls++; throw Error("unexpected network"); },
  });
  const result = await GET(request("Miami"));
  assert.equal(result.status, 403);
  assert.equal(result.headers["Cache-Control"], "private, no-store");
  assert.equal(calls, 0);
  assert.doesNotMatch(JSON.stringify(result.data), /synthetic_geoapify_key/);
});

test("geocode rejects empty or malformed provider keys without fallback", async () => {
  for (const key of [undefined, "", "malformed key!"]) {
    let calls = 0;
    const { GET } = loadRoute({
      owner: { userId: "synthetic-owner" },
      key,
      fetchMock: () => { calls++; throw Error("unexpected network"); },
    });
    const result = await GET(request("Miami"));
    assert.equal(result.status, 503, String(key));
    assert.equal(result.headers["Cache-Control"], "private, no-store");
    assert.equal(calls, 0);
  }
});

test("geocode validates query before contacting provider", async () => {
  let calls = 0;
  const { GET } = loadRoute({
    owner: { userId: "synthetic-owner" }, key: FAKE_KEY,
    fetchMock: () => { calls++; throw Error("unexpected network"); },
  });
  const result = await GET(request(" "));
  assert.equal(result.status, 400);
  assert.equal(calls, 0);
});

test("owner geocoding uses Geoapify only, hides key in response, and caches", async () => {
  let calls = 0;
  const { GET } = loadRoute({
    owner: { userId: "synthetic-owner" }, key: FAKE_KEY,
    fetchMock: async url => {
      calls++;
      assert.equal(url.origin, "https://api.geoapify.com");
      assert.equal(url.pathname, "/v1/geocode/search");
      assert.equal(url.searchParams.get("apiKey"), FAKE_KEY);
      assert.equal(url.searchParams.get("limit"), "5");
      return { ok: true, status: 200, json: async () => ({
        results: [{ formatted: "Miami, FL", lat: 25.77, lon: -80.19 }],
      }) };
    },
  });
  const first = await GET(request("Miami"));
  assert.equal(first.status, 200);
  assert.equal(first.headers["Cache-Control"], "private, no-store");
  assert.deepEqual(first.data.results, [{ label: "Miami, FL", lat: 25.77, lon: -80.19 }]);
  assert.doesNotMatch(JSON.stringify(first.data), /synthetic_geoapify_key/);
  const second = await GET(request("Miami"));
  assert.equal(second.status, 200);
  assert.equal(second.data.cached, true);
  assert.equal(calls, 1);
});
