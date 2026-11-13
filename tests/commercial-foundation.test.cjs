const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

function load(path) {
  const src = fs.readFileSync(path, "utf8");
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", js)(mod, mod.exports);
  return mod.exports;
}
const { estimateSetup, estimateCommission } = load("src/lib/commercial/finance.ts");
const { evaluateContractorRoute } = load("src/lib/commercial/routing.ts");
const { conversionRate, costPerLead, avalonCommissionRevenue } = load("src/lib/commercial/metrics.ts");

const setup = {
  setupPrice: "1499.00", laborHours: "20", hourlyRate: "25",
  externalCosts: "100", contingency: "100", targetMargin: "40",
};
const commission = {
  collectedAmount: "8000.00", excludedAmount: "0", ratePercent: "5",
  signedTerms: false, eligibleAttribution: false, collectionVerified: false, legalReviewApproved: false,
};
const policy = {
  campaignId: "hvac-campaign", version: 1, contractorId: "contractor-a",
  enabled: true, signedContractVerified: true, licenseVerified: true,
  capacityAvailable: true, allowedZips: ["33311"], effectiveFromMs: 1000, effectiveUntilMs: null,
};
const request = {
  zip: "33311", displayedContractorId: "contractor-a", consentedContractorId: "contractor-a",
  displayedPolicyVersion: 1, consentGiven: true, receivedAtMs: 2000,
};

test("financial calculator: exact cents and correct gross margin", () => {
  const result = estimateSetup(setup);
  assert.equal(result.status, "ready");
  assert.equal(result.priceCents, 149900);
  assert.equal(result.costCents, 70000);
  assert.equal(result.profitCents, 79900);
  assert.equal(result.marginPercent, 53.30);
  assert.equal(result.minimumPriceCents, 116667);
});
test("financial calculator: unknown costs are never treated as zero", () => {
  assert.equal(estimateSetup({...setup, contingency: ""}).status, "incomplete");
  assert.equal(estimateSetup({...setup, contingency: "0"}).status, "ready");
});
test("financial calculator: invalid/negative/scientific/overflow inputs are rejected", () => {
  for (const value of ["-1", "1e4", "10.999", "abc", "999999999999"]) {
    assert.equal(estimateSetup({...setup, hourlyRate: value}).status, "invalid", value);
  }
  assert.equal(estimateSetup({...setup, setupPrice: "0"}).status, "invalid");
  assert.equal(estimateSetup({...setup, targetMargin: "100"}).status, "invalid");
});
test("financial calculator: negative margins are honest, not zeroed", () => {
  const result = estimateSetup({...setup, setupPrice: "100"});
  assert.equal(result.status, "ready");
  assert.equal(result.marginPercent, -600);
});
test("commission: $8000 at 5% yields $400 estimate, never a payable claim without evidence", () => {
  const result = estimateCommission(commission);
  assert.equal(result.status, "pending");
  assert.equal(result.estimatedCents, 40000);
  assert.equal(result.eligibleCents, null);
  assert.ok(result.reasons.includes("legal_review_pending"));
});
test("commission: all four checks permit simulated eligibility, not actual payment", () => {
  const result = estimateCommission({...commission,
    signedTerms: true, eligibleAttribution: true, collectionVerified: true, legalReviewApproved: true });
  assert.equal(result.status, "eligible");
  assert.equal(result.eligibleCents, 40000);
});
test("commission: exclusions apply before percentage; no negative base or rate above 100%", () => {
  const result = estimateCommission({...commission, excludedAmount: "1000", ratePercent: "5"});
  assert.equal(result.estimatedCents, 35000);
  assert.equal(estimateCommission({...commission, excludedAmount: "9000"}).status, "invalid");
  assert.equal(estimateCommission({...commission, ratePercent: "101"}).status, "invalid");
});
test("router: valid current and consented destination is eligible", () => {
  const r = evaluateContractorRoute(policy, request);
  assert.deepEqual(r, {status:"eligible",contractorId:"contractor-a",
    campaignId:"hvac-campaign",policyVersion:1,reasons:[]});
});
test("router: destination change never silently forwards an old page to another contractor", () => {
  const changed = {...policy,contractorId:"contractor-b",version:2};
  const r = evaluateContractorRoute(changed, request);
  assert.equal(r.status, "hold");
  assert.equal(r.contractorId, null);
  assert.ok(r.reasons.includes("destination_mismatch"));
  assert.ok(r.reasons.includes("stale_disclosure"));
});
test("router: no consent, license, contract or capacity fails closed", () => {
  const r = evaluateContractorRoute({...policy,
    licenseVerified:false,signedContractVerified:false,capacityAvailable:false},
    {...request,consentGiven:false});
  assert.equal(r.status,"hold");
  assert.equal(r.contractorId,null);
  assert.equal(r.reasons.length,4);
});
test("router: bad ZIP, inactive campaign and expired policy hold the request", () => {
  const r = evaluateContractorRoute({...policy,enabled:false,effectiveUntilMs:1500}, {...request,zip:"33009"});
  assert.equal(r.status,"hold");
  assert.ok(r.reasons.includes("out_of_service_area"));
  assert.ok(r.reasons.includes("campaign_inactive"));
  assert.ok(r.reasons.includes("policy_not_effective"));
});
test("metrics: unavailable sources are N/A, never fake zero", () => {
  assert.deepEqual(costPerLead({status:"not_connected"}, {status:"verified",value:4}), {status:"n_a"});
  assert.deepEqual(costPerLead({status:"verified",cents:1000},{status:"verified",value:0}),{status:"n_a"});
  assert.deepEqual(conversionRate({status:"unavailable"}, {status:"verified",value:100}), {status:"n_a"});
  assert.deepEqual(avalonCommissionRevenue({status:"partial"}), {status:"n_a"});
});
test("metrics: exact verified values can legitimately be zero", () => {
  assert.deepEqual(costPerLead({status:"verified",cents:0},{status:"verified",value:2}), {status:"verified",value:0});
  assert.deepEqual(conversionRate({status:"verified",value:2}, {status:"verified",value:5}), {status:"verified",value:40});
  assert.deepEqual(avalonCommissionRevenue({status:"verified",cents:40000}),{status:"verified",value:40000});
});
test("metrics: incoherent counts do not create a conversion over 100%", () => {
  assert.deepEqual(conversionRate({status:"verified",value:12},{status:"verified",value:10}),{status:"n_a"});
});
test("new commercial page is owner protected and cannot write sales or route consumer data", () => {
  const page = fs.readFileSync("src/app/admin/workspace/marketing-hub/commercial/page.tsx","utf8");
  const client = fs.readFileSync("src/app/admin/workspace/marketing-hub/commercial/commercial-calculator.tsx","utf8");
  assert.match(page,/await requireOwner\(\)/);
  assert.match(page,/CommercialCalculator/);
  assert.doesNotMatch(page+client,/service_role|\.insert\(|\.update\(|fetch\(|createSale\(|create_payment\(/);
});
