const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

function loadTriage() {
  const source = fs.readFileSync("src/lib/crm/inquiry-triage.ts", "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", js)(mod, mod.exports);
  return mod.exports.inquiryTriageReason;
}

const triage = loadTriage();

test("inquiry triage marks unsolicited vendor SEO sales pitches as possible spam", () => {
  assert.equal(triage("Hey team, I wanted to reach out about growing website traffic. We offer customized SEO services. Please send your target keywords."), "vendor_outreach");
  assert.equal(triage("We help businesses rank higher on Google and AI search platforms. May I send you a quote & price list?"), "vendor_outreach");
});

test("inquiry triage flags unsolicited search-index registration pitches", () => {
  assert.equal(triage("Add avaloncoreagency.com in Google's Search Index to be displayed in online search results! Register your website now."), "indexing_solicitation");
});

test("inquiry triage leaves legitimate inquiries and ambiguous requests for human review", () => {
  const valid = [
    "I own a barbershop and need a new website and appointment booking.",
    "We offer SEO services, but need a CRM to manage our own clients.",
    "Can you quote a website with SEO and Google indexing for my business?",
    "Quiero una cotización para el CRM de mi barbería.",
    "I can send you our price list so your team can build our e-commerce website.",
    "Please register my website on Google, I need help with search results.",
    "We need to rank higher on Google and improve website traffic.",
  ];
  for (const message of valid) assert.equal(triage(message), null, message);
});

test("inquiry triage is pure, bounded and never labels based on identity, email or service choices", () => {
  for (const value of [null, undefined, {}, [], 9, true, "", "  "])
    assert.equal(triage(value), null);
  assert.equal(triage("A".repeat(100000)), null);
});
