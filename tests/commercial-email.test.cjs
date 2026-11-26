"use strict";
// AVL-CLAUDE-CONVERGENCE-001 · commercial e-mails of the canonical outbox: recorded facts only, ES/EN, brand, escaping.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const cache = new Map();
const STUBS = { "server-only": {}, nodemailer: { createTransport: () => { throw Error("network transport must not be created in tests"); } } };
function load(file) {
  const abs = path.resolve(file);
  if (cache.has(abs)) return cache.get(abs).exports;
  const mod = { exports: {} }; cache.set(abs, mod);
  if (abs.endsWith(".json")) { mod.exports = JSON.parse(fs.readFileSync(abs, "utf8")); return mod.exports; }
  const out = ts.transpileModule(fs.readFileSync(abs, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, resolveJsonModule: true } }).outputText;
  const req = spec => {
    if (spec in STUBS) return STUBS[spec];
    const base = spec.startsWith("@/") ? path.join("src", spec.slice(2)) : spec.startsWith(".") ? path.join(path.dirname(abs), spec) : null;
    if (!base) return require(spec);
    return load(fs.existsSync(base) && base.endsWith(".json") ? base : base + ".ts");
  };
  new Function("module", "exports", "require", out)(mod, mod.exports, req);
  return mod.exports;
}
const email = load("src/lib/comms/email.ts");
const base = { contactName: "Laura QA", companyName: "Barbería <Sintética>", representative: { name: "Miguel Hobaica", title: "Cofundador" },
  company: email.DEFAULT_COMPANY, origin: "https://example.invalid" };

test("commercial kinds match the outbox constraint and render in ES/EN with the corporate mailbox", () => {
  const sql = fs.readFileSync("supabase/migrations/20261126100000_convergence_contracts_catalog_subscriptions.sql", "utf8");
  for (const k of email.COMMERCIAL_KINDS) assert.match(sql, new RegExp(`'${k}'`), k);
  const facts = [
    { kind: "quote_sent", quoteNumber: "COT-0001", title: "Sitio web", validUntil: "2026-12-31", oneTime: "1500", monthly: "200", currency: "USD", url: null },
    { kind: "contract_confirmation", contractTitle: "Acuerdo QA", verifiedOn: "2026-11-26T10:00:00Z", effectiveOn: "2026-12-01" },
    { kind: "payment_confirmation", amount: "750", currency: "USD", receivedOn: "2026-11-26", invoiceNumber: "F-0001" },
    { kind: "subscription_renewal_notice", product: "Marketing mensual", periodEnd: "2026-12-31", amount: "200", currency: "USD", period: "monthly", renewalMode: "manual" },
    { kind: "cancellation_confirmation", product: "Marketing mensual", endsOn: "2027-01-31", atPeriodEnd: true },
  ];
  for (const f of facts) for (const lang of ["es", "en"]) {
    const r = email.renderCommercial({ ...base, lang, facts: f });
    assert.ok(r, `${f.kind} ${lang}`);
    assert.match(r.html, /avalonacoreagency@gmail\.com/);
    assert.match(r.html, /brand\/email\/avalon-mark\.png/);
    assert.ok(!r.html.includes("<Sintética>"), "company name is escaped");
    assert.match(r.text, /Miguel Hobaica/);
    assert.ok(!/avalonagencymh/.test(r.html + r.text), "corporate mailbox only");
  }
  const q = email.renderCommercial({ ...base, lang: "es", facts: facts[0] });
  assert.match(q.text, /\$1,500\.00/); assert.match(q.text, /no es un contrato/);
  const en = email.renderCommercial({ ...base, lang: "en", facts: facts[3] });
  assert.match(en.text, /needs your confirmation/);
});

test("a message the recorded facts do not support is never rendered", () => {
  const no = f => email.renderCommercial({ ...base, lang: "es", facts: f });
  assert.equal(no({ kind: "quote_sent", quoteNumber: "", title: "x", validUntil: "2026-12-31", oneTime: null, monthly: null, currency: "USD", url: null }), null);
  assert.equal(no({ kind: "contract_confirmation", contractTitle: "x", verifiedOn: "", effectiveOn: null }), null);
  assert.equal(no({ kind: "payment_confirmation", amount: "0", currency: "USD", receivedOn: "2026-11-26", invoiceNumber: null }), null);
  assert.equal(no({ kind: "subscription_renewal_notice", product: "x", periodEnd: "2026-12-31", amount: "200", currency: "USD", period: "monthly", renewalMode: "none" }), null);
  assert.equal(no({ kind: "cancellation_confirmation", product: "x", endsOn: "", atPeriodEnd: false }), null);
  // Unsafe CTA URLs are dropped.
  const r = no({ kind: "quote_sent", quoteNumber: "COT-1", title: "x", validUntil: "2026-12-31", oneTime: "1", monthly: null, currency: "USD", url: "javascript:alert(1)" });
  assert.ok(!r.html.includes("javascript:"));
});
