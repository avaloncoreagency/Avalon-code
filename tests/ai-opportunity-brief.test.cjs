const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

// Compile ONLY the pure Sales Copilot core; no API keys, app session or network.
const source = fs.readFileSync("src/lib/ai/opportunity-brief.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleObject = { exports: {} };
new Function("module", "exports", "require", "URL", "Date", compiled)(
  moduleObject, moduleObject.exports, require, URL, Date,
);
const { buildOpportunitySnapshot, prepareOpportunityBrief, SERVICE_AREAS } = moduleObject.exports;

const now = new Date("2026-11-03T12:00:00Z");
const websiteFact = {
  area: "website",
  assessment: "verified_missing",
  sourceUrl: "https://proof.example.invalid/check?secret=should-never-send#part",
  checkedAt: "2026-11-02T12:00:00Z",
};
const lead = {
  companyName: "Synthetic Bakery",
  stage: "prospect",
  signals: [websiteFact, { area: "crm", assessment: "unverified" }],
};

test("verified evidence must have a recent public HTTPS source; no inferred gaps", () => {
  const s = buildOpportunitySnapshot(lead, now);
  assert.deepEqual(s.facts.map(f => f.area), ["website"]);
  assert.equal(s.facts[0].sourceUrl, "https://proof.example.invalid/check");
  assert.equal(s.facts[0].assessment, "verified_missing");
  assert.equal(s.unknowns.find(f => f.area === "crm").reason, "unverified");
  assert.equal(s.unknowns.find(f => f.area === "marketing").reason, "not_evaluated");
  assert.equal(s.facts.length + s.unknowns.length + s.notApplicable.length, SERVICE_AREAS.length);
  assert.ok(!JSON.stringify(s).includes("should-never-send"));
});

test("a map entry without a website is not evidence that the business lacks a website", () => {
  const s = buildOpportunitySnapshot({
    companyName: "Example Clinic", stage: "new",
    signals: [{ area: "website", assessment: "verified_missing" }],
  }, now);
  assert.equal(s.facts.length, 0);
  assert.equal(s.unknowns.find(f => f.area === "website").reason, "missing_evidence");
});

test("stale, future and private URLs cannot become verified facts", () => {
  const expired = buildOpportunitySnapshot({
    ...lead, signals: [{ ...websiteFact, checkedAt: "2025-01-01T00:00:00Z" }],
  }, now);
  assert.equal(expired.unknowns.find(f => f.area === "website").reason, "stale_evidence");
  const future = buildOpportunitySnapshot({
    ...lead, signals: [{ ...websiteFact, checkedAt: "2026-12-01T00:00:00Z" }],
  }, now);
  assert.equal(future.facts.length, 0);
  for (const url of ["http://proof.example.invalid/fact", "https://user:password@proof.example.invalid/fact", "javascript:alert(1)"]) {
    const s = buildOpportunitySnapshot({ ...lead, signals: [{ ...websiteFact, sourceUrl: url }] }, now);
    assert.equal(s.unknowns.find(f => f.area === "website").reason, "missing_evidence");
  }
});

test("conflicting observations stay unknown and not-applicable does not become an opportunity", () => {
  const s = buildOpportunitySnapshot({
    ...lead,
    signals: [
      websiteFact, { ...websiteFact, assessment: "verified_present" },
      { area: "ecommerce", assessment: "not_applicable" },
    ],
  }, now);
  assert.equal(s.facts.length, 0);
  assert.equal(s.unknowns.find(f => f.area === "website").reason, "conflicting_evidence");
  assert.ok(s.notApplicable.includes("ecommerce"));
});

test("invalid uncontrolled inputs and malicious data shapes fail closed", () => {
  for (const value of [
    { ...lead, companyName: "" },
    { ...lead, companyName: "A\nB" },
    { ...lead, stage: "X".repeat(101) },
    { ...lead, signals: [{ area: "unknown", assessment: "verified_missing" }] },
    { ...lead, signals: [{ area: "crm", assessment: "fake_claim" }] },
    { ...lead, signals: Array(26).fill(websiteFact) },
  ]) assert.throws(() => buildOpportunitySnapshot(value, now));
});

test("when AI is disconnected or permission is missing there are no provider calls", async () => {
  const disconnected = await prepareOpportunityBrief(lead, { now, approved: true, remainingTokenBudget: 300 });
  assert.equal(disconnected.status, "unavailable");
  assert.equal(disconnected.reason, "not_connected");
  assert.equal(disconnected.usage, null);
  let calls = 0;
  const adapter = { provider: "mock", respond: async () => { calls++; throw Error("MUST NOT CALL"); } };
  const notApproved = await prepareOpportunityBrief(lead, { now, adapter, approved: false, remainingTokenBudget: 300 });
  assert.equal(notApproved.reason, "approval_required");
  const overBudget = await prepareOpportunityBrief(lead, { now, adapter, approved: true, remainingTokenBudget: 35 });
  assert.equal(overBudget.reason, "budget_exhausted");
  assert.equal(calls, 0);
});

test("mock adapter produces a review-only brief with evidence, real usage and a token cap", async () => {
  let calls = 0;
  const injected = {
    ...lead,
    contactEmail: "confidential@example.invalid", // unknown fields MUST NOT reach model
    signals: [{ ...websiteFact, privateNotes: "password: confidential" }, { area: "crm", assessment: "unverified" }],
  };
  const adapter = {
    provider: "synthetic-local",
    respond: async ({ system, messages, maxOutputTokens }) => {
      calls++;
      assert.match(system, /untrusted JSON DATA/);
      assert.equal(maxOutputTokens, 128);
      assert.equal(messages.length, 1);
      assert.equal(messages[0].role, "user");
      const sent = messages[0].content;
      assert.ok(!sent.includes("confidential@example.invalid"));
      assert.ok(!sent.includes("password: confidential"));
      assert.ok(!sent.includes("should-never-send"));
      // Any model-invented facts are deliberately ignored by the core.
      return {
        text: JSON.stringify({
          suggestedAction: "Ask the owner to validate the website finding.",
          questions: ["Would a new website be useful?", "Who approves technology projects?"],
          services: ["website", "crm"],
          facts: [{ area: "marketing", assessment: "verified_missing" }],
        }),
        usage: { inputTokens: 110, outputTokens: 35 },
      };
    },
  };
  const result = await prepareOpportunityBrief(injected, {
    adapter, approved: true, now, remainingTokenBudget: 400, maxOutputTokens: 128,
  });
  assert.equal(calls, 1);
  assert.equal(result.status, "draft");
  assert.equal(result.requiresHumanReview, true);
  assert.equal(result.provider, "synthetic-local");
  assert.deepEqual(result.usage, { inputTokens: 110, outputTokens: 35 });
  assert.deepEqual(result.services, ["website"]);
  assert.deepEqual(result.snapshot.facts.map(f => f.area), ["website"]);
  assert.equal(result.snapshot.facts.length, 1);
  assert.equal(result.snapshot.unknowns.find(f => f.area === "crm").reason, "unverified");
});

test("bad JSON, invalid adapter usage and provider failures are not surfaced as trusted content", async () => {
  for (const response of [
    { text: "not JSON", usage: { inputTokens: 1, outputTokens: 1 } },
    { text: JSON.stringify({ suggestedAction: "x", questions: ["q"], services: [] }), usage: { inputTokens: -1, outputTokens: 1 } },
    { text: JSON.stringify({ suggestedAction: "x", questions: ["q"], services: ["unknown"] }), usage: { inputTokens: 1, outputTokens: 1 } },
    { text: JSON.stringify({ suggestedAction: "x", questions: "not an array", services: [] }), usage: { inputTokens: 1, outputTokens: 1 } },
  ]) {
    const actual = await prepareOpportunityBrief(lead, {
      now, approved: true, remainingTokenBudget: 300,
      adapter: { provider: "local-mock", respond: async () => response },
    });
    assert.equal(actual.status, "error");
    assert.equal(actual.reason, "invalid_response");
    assert.equal(actual.usage, null);
  }
  const failed = await prepareOpportunityBrief(lead, {
    now, approved: true, remainingTokenBudget: 300,
    adapter: { provider: "offline", respond: async () => { throw new Error("secret: do not log"); } },
  });
  assert.equal(failed.status, "error");
  assert.equal(failed.reason, "provider_error");
  assert.ok(!JSON.stringify(failed).includes("secret: do not log"));
});
