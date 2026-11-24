// SHIN security regression for newly added Radar research route.
// Synthetic sessions and database rows only; no network, customers or secrets.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const PATH = "src/app/admin/workspace/crm/radar/research/route.ts";
const PROSPECT_ID = "11111111-1111-4111-8111-111111111111";
const URL_ORIGIN = "https://avaloncoreagency.com";

function loadResearchRoute({ session = null, investigate = async () => {
  throw Error("Unexpected outbound website request");
} } = {}) {
  const js = ts.transpileModule(fs.readFileSync(PATH, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  const dependencies = {
    "next/server": {
      NextResponse: { json: (data, options = {}) => ({
        data, status: options.status ?? 200, headers: options.headers ?? {},
      }) },
    },
    "@/lib/auth/session": { getOwnerSession: async () => session },
    "@/lib/crm/radar-research": { investigateOfficialWebsite: investigate },
    "@/lib/crm/radar-website-safety": {
      ResearchBlocked: class ResearchBlocked extends Error {},
      websiteUrl: value => {
        try {
          const parsed = new URL(value);
          return parsed.protocol === "https:" ? parsed : null;
        } catch { return null; }
      },
    },
  };
  new Function("require", "module", "exports", js)(
    name => {
      if (!Object.hasOwn(dependencies, name))
        throw Error("Unexpected import: " + name);
      return dependencies[name];
    },
    mod, mod.exports,
  );
  return mod.exports;
}

function request(method, path, payload, origin = URL_ORIGIN) {
  const nextUrl = new URL(path, URL_ORIGIN);
  return {
    nextUrl,
    headers: { get(name) {
      if (name === "origin") return origin;
      if (name === "content-type") return "application/json";
      return null;
    } },
    json: async () => payload,
    method,
  };
}

// Promise-like Supabase select chain, with fully synthetic rows.
function fakeDb(resultFor) {
  const touched = [];
  return {
    touched,
    from(table) {
      const state = { table, columns: null };
      touched.push(table);
      let chain;
      chain = new Proxy({}, {
        get(_obj, key) {
          if (key === "then") return resolve => resolve(resultFor(state));
          if (key === "select") return columns => {
            state.columns = columns;
            return chain;
          };
          if (key === "maybeSingle") return async () => resultFor(state);
          return () => chain;
        },
      });
      return chain;
    },
  };
}

test("Radar research: anon cannot list queue, read reports, or access prospect rows", async () => {
  const { GET } = loadResearchRoute();
  for (const path of [
    "/admin/workspace/crm/radar/research?queue=1",
    "/admin/workspace/crm/radar/research?id=" + PROSPECT_ID,
  ]) {
    const response = await GET(request("GET", path));
    assert.equal(response.status, 403);
    assert.equal(response.headers["Cache-Control"], "private, no-store");
    assert.deepEqual(response.data, { error: "No autorizado." });
  }
});

test("Radar research: anon cannot initiate research even with a valid JSON payload", async () => {
  const { POST } = loadResearchRoute();
  const response = await POST(request("POST", "/admin/workspace/crm/radar/research", {
    id: PROSPECT_ID,
    website: "https://example.org",
  }));
  assert.equal(response.status, 403);
  assert.equal(response.headers["Cache-Control"], "private, no-store");
  assert.deepEqual(response.data, { error: "No autorizado." });
});

test("Radar research: an owner gets only a bounded synthetic queue without crawling", async () => {
  const db = fakeDb(({ table, columns }) => {
    if (table === "crm_radar_research_reports" && columns === "id")
      return { count: 0, data: null, error: null };
    if (table === "crm_radar_research_reports" && columns === "prospect_id")
      return { data: [], error: null };
    if (table === "crm_prospects")
      return { data: [{
        id: PROSPECT_ID, company: "Synthetic Dental",
        website: "https://example.org", do_not_contact: false,
        status: "pending", source_ref: "synthetic:one",
      }], error: null };
    throw Error("Unexpected query: " + table + "/" + columns);
  });
  const { GET } = loadResearchRoute({ session: {
    userId: "22222222-2222-4222-8222-222222222222", supabase: db,
  } });
  const response = await GET(request("GET", "/admin/workspace/crm/radar/research?queue=1"));
  assert.equal(response.status, 200);
  assert.deepEqual(response.data.batch, [{ id: PROSPECT_ID, company: "Synthetic Dental" }]);
  assert.equal(response.data.max_daily, 12);
  assert.equal(response.data.remaining, 12);
  assert.equal(db.touched.length, 3);
  assert.ok(db.touched.every(table => [
    "crm_radar_research_reports", "crm_prospects",
  ].includes(table)));
});

test("Radar research: owner cannot crawl do-not-contact businesses or bypass same-origin POST", async () => {
  const db = fakeDb(({ table }) => {
    if (table === "crm_prospects") return { data: {
      id: PROSPECT_ID, company: "Synthetic Opt-Out",
      website: "https://example.org", source_ref: "synthetic:two",
      status: "pending", do_not_contact: true,
    }, error: null };
    throw Error("Unexpected database query: " + table);
  });
  const { POST } = loadResearchRoute({ session: {
    userId: "22222222-2222-4222-8222-222222222222", supabase: db,
  } });
  const payload = { id: PROSPECT_ID, website: "https://example.org" };
  const blocked = await POST(request("POST", "/admin/workspace/crm/radar/research", payload));
  assert.equal(blocked.status, 409);
  assert.match(blocked.data.error, /No contactar/);
  assert.deepEqual(db.touched, ["crm_prospects"]);

  const crossOrigin = await POST(request(
    "POST", "/admin/workspace/crm/radar/research", payload, "https://untrusted.example.org",
  ));
  assert.equal(crossOrigin.status, 403);
  assert.match(crossOrigin.data.error, /Origen no autorizado/);
  assert.deepEqual(db.touched, ["crm_prospects"], "cross-origin request must not query DB");
});
