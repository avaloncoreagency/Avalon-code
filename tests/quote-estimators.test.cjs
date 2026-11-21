// V5 Phase 6 — service configurators and provider usage estimators. Synthetic rates only (clearly labelled).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const load = file => {
  const m = { exports: {} };
  new Function("module", "exports", "require", ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(m, m.exports, require);
  return m.exports;
};
const E = load("src/lib/quotes/usage-estimators.ts");
const C = load("src/lib/quotes/service-configurators.ts");
// SYNTHETIC test rates (not real provider prices): source + date make them "verified" for the arithmetic only.
const R = amount => ({ amount, source: "synthetic-test-rate", verifiedOn: "2026-11-21" });

test("billable seconds: minimum first, then rounded up to the provider increment", () => {
  assert.equal(E.billableSeconds(61, 60), 120, "per-minute billing rounds 61 s to 2 min");
  assert.equal(E.billableSeconds(61, 6), 66, "6-second increments");
  assert.equal(E.billableSeconds(61, 1), 61, "per-second");
  assert.equal(E.billableSeconds(5, 1, 30), 30, "30 s minimum per call");
  assert.equal(E.billableSeconds(0, 60), 0);
});

test("unverified or missing rates are N/D, never a guessed number", () => {
  assert.equal(E.rateValue({ amount: "0.01", source: "", verifiedOn: "2026-11-21" }), null, "no source");
  assert.equal(E.rateValue({ amount: "0.01", source: "https://x", verifiedOn: "yesterday" }), null, "no ISO date");
  assert.equal(E.rateValue(null), null);
  const plan = { provider: "N/D", planName: "", billingIncrementSec: 60, minimumBillableSec: 0, maxConcurrency: null, includedMinutes: 0,
    bundles: { telephony: false, stt: false, tts: false, llm: false }, rates: {} };
  const r = E.estimateReceptionist({ callsPerMonth: 100, avgDurationSec: 90, transferPct: 0, transferAvgSec: 0, outboundPerMonth: 0, outboundAvgSec: 0,
    concurrency: 1, phoneNumbers: 1, recordCalls: false, recordingRetentionMonths: 0, country: "US", language: "es" }, plan);
  for (const s of r.scenarios) { assert.equal(s.total, null); assert.ok(s.missing.includes("platform")); }
  assert.equal(E.costText(null, "es"), "N/D");
});

test("AI Receptionist: per-call rounding, mix, transfers, outbound, bundles and Low/Base/High", () => {
  const plan = { provider: "Synthetic Voice", planName: "test", billingIncrementSec: 60, minimumBillableSec: 0, maxConcurrency: 2, includedMinutes: 0,
    bundles: { telephony: false, stt: true, tts: true, llm: true },
    rates: { platformPerMinute: R("0.10"), telephonyInboundPerMinute: R("0.01"), telephonyOutboundPerMinute: R("0.02"), transferPerMinute: R("0.01"), numberMonthly: R("1.00") } };
  const input = { callsPerMonth: 1000, avgDurationSec: 0, mix: [{ sharePct: 50, durationSec: 30 }, { sharePct: 30, durationSec: 90 }, { sharePct: 20, durationSec: 240 }],
    transferPct: 10, transferAvgSec: 61, outboundPerMonth: 100, outboundAvgSec: 45, concurrency: 3, phoneNumbers: 1, recordCalls: false, recordingRetentionMonths: 0, country: "US", language: "es" };
  const r = E.estimateReceptionist(input, plan);
  assert.deepEqual(r.warnings, ["concurrency_exceeds_plan"]);
  const base = r.scenarios.find(s => s.scenario === "base");
  // Inbound: 500×60s + 300×120s + 200×240s = 30000+36000+48000 = 114000 s = 1900 min. Outbound: 100×60 s = 100 min.
  const c = Object.fromEntries(base.components.map(x => [x.key, x]));
  assert.equal(c.platform.quantity, 2000);
  assert.equal(c.platform.cost, 200);
  assert.equal(c.telephonyIn.cost, 19);
  assert.equal(c.telephonyOut.cost, 2);
  assert.equal(c.transfer.quantity, 200, "100 transfers × 120 s billed (61 s rounds up) = 200 min");
  assert.equal(c.stt.note, "included", "bundled STT is not charged twice");
  assert.equal(c.stt.cost, 0);
  assert.equal(base.total, 200 + 19 + 2 + 2 + 1);
  const low = r.scenarios.find(s => s.scenario === "low"), high = r.scenarios.find(s => s.scenario === "high");
  assert.ok(low.total < base.total && base.total < high.total);
  assert.deepEqual(E.validateReceptionist({ ...input, mix: [{ sharePct: 60, durationSec: 30 }] }), ["mix"], "mix must add up to 100%");
});

test("AI Chatbot: tokens incl. retrieved context, included conversations, one-time indexing apart, bundles", () => {
  const plan = { provider: "Synthetic LLM", model: "test-model", includedConversations: 500, bundlesModelTokens: false,
    rates: { platformMonthly: R("50"), overagePerConversation: R("0.05"), inputPerMillionTokens: R("1.00"), outputPerMillionTokens: R("4.00"),
      embeddingPerMillionTokens: R("0.10"), retrievalPerThousandQueries: R("0.50"), vectorStoragePerGbMonth: R("2.00"), channelMonthly: R("5.00") } };
  const input = { conversationsPerMonth: 1000, messagesPerConversation: 6, inputTokensPerMessage: 300, outputTokensPerMessage: 200,
    retrievalTokensPerMessage: 700, retrievalQueriesPerConversation: 3, channels: 2, knowledgeTokens: 2_000_000, knowledgeGb: 1 };
  const r = E.estimateChatbot(input, plan);
  const c = Object.fromEntries(r.scenarios.find(s => s.scenario === "base").components.map(x => [x.key, x]));
  assert.equal(c.overage.quantity, 500);
  assert.equal(c.overage.cost, 25);
  assert.equal(c.inputTokens.quantity, 6, "6000 msgs × (300+700) = 6M input tokens");
  assert.equal(c.inputTokens.cost, 6);
  assert.equal(c.outputTokens.cost, 4.8);
  assert.equal(c.retrieval.cost, 1.5);
  assert.equal(c.channels.cost, 10);
  assert.equal(r.scenarios.find(s => s.scenario === "base").total, 50 + 25 + 6 + 4.8 + 1.5 + 2 + 10);
  assert.equal(r.oneTimeTotal, 0.2, "indexing is one-time, not inside the monthly total");
  const bundled = E.estimateChatbot(input, { ...plan, bundlesModelTokens: true });
  const b = Object.fromEntries(bundled.scenarios.find(s => s.scenario === "base").components.map(x => [x.key, x]));
  assert.equal(b.inputTokens.note, "included");
  assert.equal(b.outputTokens.cost, 0, "plan that bundles tokens is not charged twice");
  const summary = E.externalCostsSummary("chatbot", plan.provider, r.scenarios, "es", r.oneTimeTotal);
  assert.match(summary, /no es una factura del proveedor ni un ingreso de Avalon/);
});

test("service configurators: one engine, specific questions, no invented prices, external spend kept apart", () => {
  const ids = C.SERVICE_CONFIGURATORS.map(c => c.id);
  for (const id of ["website", "ecommerce", "crm", "gbp", "google_ads", "ga4", "search_console", "gtm", "merchant_center", "workspace", "maps_platform", "meta_marketing", "local_seo", "funnels", "chatbot", "receptionist", "automation", "special"])
    assert.ok(ids.includes(id), `${id} configurator exists`);
  const keys = id => C.configuratorById(id).questions.map(q => q.key);
  assert.ok(keys("website").includes("pages") && keys("ecommerce").includes("variants") && keys("crm").includes("pipelines"), "forms differ per service");
  const ads = C.configureService(C.configuratorById("google_ads"), { adSpend: "1500", campaigns: "2" }, "es", []);
  assert.equal(ads.line.unitPrice, "", "no catalog price → owner decides, nothing invented");
  assert.equal(ads.priceSource, "owner");
  assert.match(ads.thirdParty, /1500/, "ad spend goes to third-party costs");
  assert.doesNotMatch(ads.scope, /1500/, "ad spend never in Avalon's scope/price");
  const web = C.configureService(C.configuratorById("website"), { pages: "8", content: "avalon" }, "en", [{ code: "desarrollo-web", name: "Web development", suggested_price: "2000.00" }]);
  assert.equal(web.line.code, "desarrollo-web");
  assert.equal(web.line.unitPrice, "2000.00");
  assert.equal(web.priceSource, "catalog");
  assert.match(web.scope, /Number of pages: 8/);
  assert.match(web.scope, /Avalon writes/);
  const unapproved = C.configureService(C.configuratorById("website"), { pages: "3" }, "en", [{ code: "desarrollo-web", name: "Web", suggested_price: null }]);
  assert.equal(unapproved.line.unitPrice, "", "catalog entry without an approved price stays empty");
});
