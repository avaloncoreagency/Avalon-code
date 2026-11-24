const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const { createClient } = require("@supabase/supabase-js");

const source = readFileSync("src/lib/sales/quote-candidates.ts", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exportsUnderTest = {};
new Function("exports", compiled)(exportsUnderTest);
const { quoteCandidateQuery } = exportsUnderTest;

async function requestFor({ search, page = 0, total = 0 }) {
  const requests = [];
  const db = createClient("https://avalon-synthetic.invalid", "synthetic-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (url, init) => {
        requests.push({ url: new URL(url), headers: new Headers(init.headers) });
        return new Response("[]", {
          status: 200,
          headers: { "content-type": "application/json", "content-range": `*/${total}` },
        });
      },
    },
  });
  const result = await quoteCandidateQuery(db, ["accepted"], search, page);
  assert.equal(requests.length, 1, "no prior capped lookup of linked sales or candidates");
  assert.equal(result.error, null);
  return { ...requests[0], count: result.count };
}

test("candidate filters, exclusions, stable sort and exact count travel in the same paged database request", async () => {
  for (const total of [199, 200, 201, 501]) {
    const page = Math.floor((total - 1) / 50);
    const { url, headers, count } = await requestFor({ search: "Barbería Norte", page, total });
    const p = url.searchParams;
    assert.equal(url.pathname, "/rest/v1/crm_quotes");
    assert.match(headers.get("prefer"), /count=exact/);
    assert.equal(count, total);
    assert.equal(p.get("offset"), String(page * 50));
    assert.equal(p.get("limit"), "50");
    assert.equal(p.get("order"), "updated_at.desc,id.asc");
    assert.equal(p.get("status"), "in.(accepted)");
    assert.equal(p.get("deleted_at"), "is.null");
    assert.equal(p.get("linked_sale"), "is.null");
    assert.equal(p.get("lead.archived"), "eq.false");
    assert.equal(p.get("client.status"), "neq.archived");
    assert.equal(p.get("lead_match.company"), "imatch.Barbería Norte");
    assert.equal(p.get("client_match.legal_name"), "imatch.Barbería Norte");
    assert.deepEqual(p.getAll("or"), [
      "(client_id.is.null,client.not.is.null)",
      '(quote_number.imatch."Barbería Norte",title.imatch."Barbería Norte",lead_match.not.is.null,client_match.not.is.null)',
    ]);
    assert.match(p.get("select"), /linked_sale:crm_sales!crm_sales_quote_id_fkey\(\)/);
    assert.match(p.get("select"), /crm_leads!crm_quotes_lead_id_fkey!inner\(company\)/);
  }
});

test("search treats regex metacharacters and PostgREST delimiters as literal company text", async () => {
  const { url } = await requestFor({ search: 'A.* (Norte), "Pérez"' });
  const p = url.searchParams;
  assert.equal(p.get("lead_match.company"), String.raw`imatch.A\.\* \(Norte\), "Pérez"`);
  assert.match(p.getAll("or")[1], /quote_number\.imatch\."A\\\\\.\\\\\*.*\\"Pérez\\""/);
  const empty = await requestFor({ search: "" });
  assert.equal(empty.url.searchParams.getAll("or").length, 1);
  assert.doesNotMatch(empty.url.searchParams.get("select"), /lead_match|client_match/);
});

test("search preserves literal backslashes in regex and logic filters", async () => {
  const { url } = await requestFor({ search: "C:\\Ventas" });
  const p = url.searchParams;
  assert.equal(p.get("lead_match.company"), "imatch.C:" + "\\".repeat(2) + "Ventas");
  assert.ok(p.getAll("or")[1].includes('quote_number.imatch."C:' + "\\".repeat(4) + 'Ventas"'));
});
