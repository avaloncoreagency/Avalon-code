// Product delivery lifecycle (8.2) — pure logic. Synthetic data only.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const out = ts.transpileModule(fs.readFileSync("src/lib/os/delivery.ts", "utf8"), { compilerOptions: { module: 1, target: 9 } }).outputText;
const d = {}; vm.runInNewContext(out, { exports: d, URL });
const eq = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b);
const base = { note: "", evidenceUrl: "", productUrl: "", actor: "u1", now: "2026-11-19T00:00:00Z" };

test("a product without delivery data, or with malformed data, is a draft — never 'published'", () => {
  eq(d.readDelivery({}), { stage: "draft", history: [] });
  eq(d.readDelivery({ delivery: { stage: "live_verified_fake", history: "x" } }), { stage: "draft", history: [] });
  assert.equal(d.readDelivery({ delivery: { stage: "in_review", history: [] } }).stage, "in_review");
});

test("only documented transitions; history is appended with actor and time", () => {
  let cur = d.readDelivery({});
  assert.throws(() => d.nextDelivery(cur, { ...base, to: "delivered" }), /delivery_invalid_transition/);
  assert.throws(() => d.nextDelivery(cur, { ...base, to: "published" }), /delivery_invalid_stage/);
  for (const to of ["in_development", "in_review", "ready_to_deliver"]) cur = d.nextDelivery(cur, { ...base, to });
  assert.equal(cur.stage, "ready_to_deliver");
  assert.equal(cur.history.length, 3);
  eq(cur.history[0], { from: "draft", to: "in_development", at: base.now, by: "u1", note: "", evidence_url: "" });
});

test("delivered needs a note; live_verified needs HTTPS product URL + evidence link + note", () => {
  let cur = { stage: "ready_to_deliver", history: [] };
  assert.throws(() => d.nextDelivery(cur, { ...base, to: "delivered" }), /delivery_note_required/);
  cur = d.nextDelivery(cur, { ...base, to: "delivered", note: "Entregado al cliente por correo" });
  const live = { ...base, to: "live_verified", note: "Revisado en el dominio del cliente" };
  assert.throws(() => d.nextDelivery(cur, live), /delivery_url_required/, "a missing URL cannot be 'published'");
  assert.throws(() => d.nextDelivery(cur, { ...live, productUrl: "http://example.test" }), /delivery_url_required/);
  assert.throws(() => d.nextDelivery(cur, { ...live, productUrl: "https://example.test" }), /delivery_evidence_required/, "a URL alone is not enough");
  assert.throws(() => d.nextDelivery(cur, { ...live, productUrl: "https://example.test", evidenceUrl: "javascript:alert(1)" }), /delivery_invalid_evidence/);
  cur = d.nextDelivery(cur, { ...live, productUrl: "https://example.test", evidenceUrl: "https://example.test/" });
  assert.equal(cur.stage, "live_verified");
  assert.equal(d.nextDelivery(cur, { ...base, to: "maintenance" }).stage, "maintenance");
});
