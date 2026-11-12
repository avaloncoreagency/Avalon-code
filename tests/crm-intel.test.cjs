// CRM Intelligence pure library: templates, conditional questions, honest progress, explainable scoring, legal flags and
// rule-based recommendations. No network, no database.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const cache = {};
function load(file) {
  const abs = path.resolve(file);
  if (cache[abs]) return cache[abs].exports;
  const js = ts.transpileModule(fs.readFileSync(abs, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} }; cache[abs] = mod;
  new Function("require", "module", "exports", js)(id => id.startsWith(".") ? load(path.join(path.dirname(abs), id + ".ts")) : require(id), mod, mod.exports);
  return mod.exports;
}
const T = load("src/lib/crm/intel/templates.ts");
const F = load("src/lib/crm/intel/form.ts");
const S = load("src/lib/crm/intel/scoring.ts");
const R = load("src/lib/crm/intel/recommendations.ts");
const I = load("src/lib/crm/intel/industries.ts");
const C = load("src/lib/crm/intel/reconcile.ts");

const A = (v) => ({ v, s: "answered" });
const U = { s: "unknown" };
const ids = t => t.sections.flatMap(s => s.questions.map(q => q.id));

test("all 13 industries have versioned bilingual sector-specific questionnaires with valid dependencies", () => {
  assert.equal(I.INDUSTRIES.length, 13);
  assert.ok(I.INDUSTRIES.every(i => i.specialized));
  for (const industry of I.INDUSTRIES) {
    const t = T.templateFor(industry.key);
    assert.equal(t.specialized, true, industry.key);
    assert.notEqual(t.version, T.GENERAL_VERSION, industry.key);
    const all = ids(t);
    assert.ok(all.length > ids(T.templateFor("hvac")).length / 3, "general baseline + sector questions");
    assert.ok(all.includes("g_main_problem"), "shared general questions included");
    assert.equal(new Set(all).size, all.length, industry.key + " has unique IDs");
    const own = t.sections.flatMap(s => s.questions).filter(q => !q.id.startsWith("g_"));
    assert.ok(own.length >= 10, industry.key + " has >=10 sector-specific questions");
    for (const q of t.sections.flatMap(s => s.questions)) {
      assert.ok(q.label.es && q.label.en, q.id + " bilingual");
      if (q.when) assert.ok(all.includes(q.when.q), q.id + " dependency exists");
      if (q.options) {
        assert.equal(new Set(q.options.map(o => o.value)).size, q.options.length, q.id + " options unique");
        assert.ok(q.options.every(o => o.label.es && o.label.en), q.id + " bilingual options");
      }
    }
  }
});

test("sector-specific conditional questions require known matching answers", () => {
  const roof = T.templateFor("roofing");
  const landsc = T.templateFor("landscaping");
  const restaurant = T.templateFor("restaurant");
  const custom = T.templateFor("other");
  const visible = (t, answers) => F.visibleQuestions(t, answers).flatMap(s => s.questions.map(q => q.id));
  assert.ok(!visible(roof, {}).includes("rf_claims_process"));
  assert.ok(visible(roof, {rf_claims: A(true)}).includes("rf_claims_process"));
  assert.ok(!visible(roof, {rf_claims: U}).includes("rf_claims_process"));
  assert.ok(!visible(landsc, {}).includes("ls_pesticide_status"));
  assert.ok(visible(landsc, {ls_services: A(["mowing", "pesticides"])}).includes("ls_pesticide_status"));
  assert.ok(!visible(landsc, {ls_services: A(["mowing"])}).includes("ls_pesticide_status"));
  assert.ok(visible(restaurant, {rs_modes: A(["dinein"])}).includes("rs_seats"));
  assert.ok(!visible(restaurant, {rs_modes: A(["takeout"])}).includes("rs_seats"));
  assert.ok(visible(custom, {ot_restricted_ads: A(true)}).includes("ot_restriction_notes"));
  assert.ok(!visible(custom, {ot_restricted_ads: A(false)}).includes("ot_restriction_notes"));
});

test("sector question validation never accepts implausible amounts or invented option keys", () => {
  const roof = T.templateFor("roofing"), rest = T.templateFor("restaurant");
  assert.equal(F.parseAnswer(T.findQuestion(roof, "rf_extra_jobs_month"), "2.4").ok, false);
  assert.equal(F.parseAnswer(T.findQuestion(rest, "rs_food_cost"), "105").ok, false);
  assert.equal(F.parseAnswer(T.findQuestion(roof, "rf_license_status"), "verified_by_ai").ok, false);
  assert.equal(F.parseAnswer(T.findQuestion(roof, "rf_license_status"), "pending").ok, true);
  assert.deepEqual(F.parseAnswer(T.findQuestion(rest, "rs_modes"), ["dinein", "dinein", "delivery"]), {
    ok: true, value: ["dinein", "delivery"]
  });
});

test("conditional questions appear only after the answer that enables them", () => {
  const t = T.templateFor("hvac");
  const visible = a => F.visibleQuestions(t, a).flatMap(s => s.questions.map(q => q.id));
  assert.ok(!visible({}).includes("h_install_price"));
  assert.ok(visible({ h_install: A(true) }).includes("h_install_price"));
  assert.ok(!visible({ h_install: A(false) }).includes("h_install_price"));
  assert.ok(!visible({ h_install: U }).includes("h_install_price"), "unknown never enables a branch");
  assert.ok(visible({ h_payment_pref: A("hybrid") }).includes("h_commission_proposed"));
});

test("partial saves allowed; progress is real; unknown does not satisfy a required question", () => {
  const t = T.templateFor("barber");
  const p0 = F.progress(t, {});
  assert.equal(p0.done, 0); assert.equal(p0.canComplete, false);
  const p1 = F.progress(t, { g_main_problem: A("Agenda vacía los martes"), g_goal_90d: U });
  assert.equal(p1.done, 2);
  assert.ok(p1.missingRequired.includes("g_goal_90d"), "unknown on a required question is still missing");
});

test("answer validation: amounts, percentages, integers and options; nothing is invented", () => {
  const t = T.templateFor("hvac");
  const qn = id => T.findQuestion(t, id);
  assert.deepEqual(F.parseAnswer(qn("h_install_price"), "$12,500.50"), { ok: true, value: 12500.5 });
  assert.equal(F.parseAnswer(qn("g_close_rate"), "120").ok, false);
  assert.equal(F.parseAnswer(qn("h_techs"), "2.5").ok, false);
  assert.equal(F.parseAnswer(qn("h_techs"), "-1").ok, false);
  assert.equal(F.parseAnswer(qn("h_segments"), "space").ok, false);
  assert.deepEqual(F.parseAnswer(qn("h_insurance"), ["general_liability", "general_liability"]), { ok: true, value: ["general_liability"] });
  assert.equal(F.parseAnswer(qn("g_main_problem"), "   ").ok, false, "empty text is not an answer");
});

const hvacStrong = {
  g_main_problem: A("Pocos trabajos de instalación"), g_goal_90d: A("10 instalaciones más"), g_decision_maker: A("Dueño"), g_start_when: A("30d"),
  g_accepts_tracking: A(true), g_shares_conversion_data: A(true), g_has_website: A(false), g_uses_crm: A(false), g_follow_up: A("manual"),
  h_license_type: A("cac"), h_license_verified: A("verified"), h_insurance: A(["general_liability", "workers_comp"]),
  h_install: A(true), h_repairs: A(true), h_install_price: A(9000), h_equipment_cost: A(3500), h_materials_cost: A(500), h_labor_cost: A(1200), h_permits_cost: A(300),
  h_installs_extra: A(3), h_repairs_extra: A(5), h_available_now: A(true), h_calls_month: A(120), h_missed_calls: A(30), h_quotes_month: A(40), h_jobs_closed: A(14),
  h_response_minutes: A(30), h_quotes_no_followup: A(12), h_ad_budget: A(2500), h_avalon_budget: A(1500), h_can_report_sales: A(true),
};

test("HVAC scoring is explainable: every category lists the factors and the evidence behind the points", () => {
  const r = S.scoreLead("hvac", hvacStrong);
  assert.equal(r.rulesVersion, S.RULES_VERSION);
  assert.ok(r.score >= 80, `strong HVAC lead scores A (got ${r.score})`);
  assert.equal(r.grade, "A");
  assert.equal(Object.values(S.WEIGHTS).reduce((a, b) => a + b, 0), 100);
  const profit = r.categories.find(c => c.category === "profitability");
  assert.equal(profit.factors[0].evidence, "$3,500 (calculado)", "gross profit computed from known costs and labelled as a calculation");
  assert.equal(r.legal.status, "clear");
});

test("unknown data is excluded, never negative; too little data = insufficient, not a low grade", () => {
  const few = S.scoreLead("hvac", { g_main_problem: A("x"), h_avalon_budget: A(1500), g_decision_maker: A("Dueño") });
  assert.equal(few.score, null); assert.equal(few.grade, "insufficient");
  const withUnknowns = S.scoreLead("hvac", { ...hvacStrong, h_ad_budget: U, h_response_minutes: U });
  const base = S.scoreLead("hvac", hvacStrong);
  assert.ok(withUnknowns.score >= base.score - 3, "turning answers into 'unknown' does not punish the lead");
  const budget = withUnknowns.categories.find(c => c.category === "budget");
  assert.equal(budget.factors.length, 1, "unknown ad budget is simply not scored");
});

test("answers hidden by a condition no longer count (install price after 'does not install')", () => {
  const r = S.scoreLead("hvac", { ...hvacStrong, h_install: A(false), h_install_gp: A(9000) });
  const profit = r.categories.find(c => c.category === "profitability");
  assert.ok(!String(profit.factors[0]?.evidence ?? "").includes("9,000"), "hidden install answers are ignored");
});

test("an explicit 'no capacity' scores 0 and blocks ad recommendations", () => {
  const busy = { ...hvacStrong, h_installs_extra: A(0), h_repairs_extra: A(0), h_available_now: A(false) };
  const r = S.scoreLead("hvac", busy);
  assert.equal(r.categories.find(c => c.category === "capacity").earned, 0);
  const recs = R.recommend("hvac", busy).map(x => x.ruleId);
  assert.ok(recs.includes("no_ads_without_capacity"));
  assert.ok(!recs.includes("evaluate_ads"), "never recommend ads without capacity");
});

test("HVAC recommendations come with evidence: missed calls, quotes without follow-up, no website, evaluate ads", () => {
  const recs = R.recommend("hvac", hvacStrong);
  const byId = Object.fromEntries(recs.map(r => [r.ruleId, r]));
  assert.ok(byId.missed_calls && byId.missed_calls.evidence[0].value === "25%");
  assert.ok(byId.follow_up && byId.website && byId.evaluate_ads);
  for (const r of recs) {
    assert.ok(r.problem.es && r.nextAction.es && r.service);
    assert.doesNotMatch(JSON.stringify(r), /ROI|retorno de|\d+\s*(clientes|ventas) (más|garantizad)/i, "no invented returns");
  }
});

test("HVAC legal risk is separate: an unverified or missing license is flagged even with a perfect score", () => {
  const r = S.scoreLead("hvac", { ...hvacStrong, h_license_verified: A("pending") });
  assert.equal(r.grade, "A"); assert.equal(r.legal.status, "review");
  const bad = S.scoreLead("hvac", { ...hvacStrong, h_license_type: A("none") });
  assert.equal(bad.legal.status, "restricted");
  assert.ok(R.recommend("hvac", { ...hvacStrong, h_license_type: A("none") }).some(x => x.ruleId === "ads_restricted"));
  assert.ok(!R.recommend("hvac", { ...hvacStrong, h_license_type: A("none") }).some(x => x.ruleId === "evaluate_ads"));
});

test("Barber: occupancy gaps → booking + reminders; retention when no reminders", () => {
  const b = { g_main_problem: A("Martes vacíos"), g_goal_90d: A("Llenar agenda"), b_type: A("owner"), b_new_client_revenue: A("shop"),
    b_cut_price: A(35), b_shop_keep_pct: A(60), b_occupancy_pct: A(55), b_slots_day: A(24), b_no_show_pct: A(15), b_booking_mode: A("walkin"),
    b_reminders: A(false), b_budget: A(600), g_decision_maker: A("Dueño"), g_start_when: A("now"), g_accepts_tracking: A(true) };
  const r = S.scoreLead("barber", b);
  assert.notEqual(r.grade, "insufficient");
  const ids_ = R.recommend("barber", b).map(x => x.ruleId);
  assert.ok(ids_.includes("booking") && ids_.includes("retention"));
});

test("Smoke Shop: restricted products → legal 'restricted', no paid-ads recommendation, operations still recommended", () => {
  const s = { g_main_problem: A("Inventario desordenado"), g_goal_90d: A("Menos agotados"), s_stores: A(2),
    s_categories: A(["nicotine_vapes", "glass_accessories"]), s_age_verification: A("none"), s_inventory_system: A("spreadsheet"),
    s_platforms: A(["meta_ads", "google_business"]), s_avg_ticket: A(28), s_gross_margin_pct: A(45), s_budget: A(2000),
    g_extra_capacity: A(50), g_avalon_budget: A(800), g_decision_maker: A("Dueña") };
  const r = S.scoreLead("smoke_shop", s);
  assert.equal(r.legal.status, "restricted");
  const codes = r.legal.flags.map(f => f.code);
  assert.ok(codes.includes("ads_restricted_products") && codes.includes("age_verification_missing") && codes.includes("paid_ads_requested_for_restricted"));
  const recs = R.recommend("smoke_shop", s).map(x => x.ruleId);
  assert.ok(recs.includes("ads_restricted") && recs.includes("inventory"));
  assert.ok(!recs.includes("evaluate_ads"), "a great score never overrides a legal restriction");
});


test("sector financial and capacity answers inform scoring without inventing missing values", () => {
  const answers = {
    rf_avg_profit: A(1800), rf_extra_jobs_month: A(8), rf_ads_budget: A(1200),
    rf_license_status: A("owner_verified"), g_avalon_budget: A(1200),
    g_decision_maker: A("Owner"), g_start_when: A("now"), g_accepts_tracking: A(true),
    g_shares_conversion_data: A(true), g_has_website: A(false), g_uses_crm: A(false),
    g_follow_up: A("manual"), g_close_rate: A(30),
  };
  const facts = S.extractFacts("roofing", answers);
  assert.equal(facts.grossProfitPerSale, 1800);
  assert.equal(facts.extraCapacity, 8);
  assert.equal(facts.adBudget, 1200);
  const scored = S.scoreLead("roofing", answers);
  assert.notEqual(scored.grade, "insufficient");
  assert.equal(scored.legal.status, "clear");
  assert.ok(scored.categories.find(c => c.category === "profitability").factors.some(f => f.evidence === "$1,800"));
});

test("unknown sector compliance prevents paid-ad recommendations; invalid and restricted stay separate from score", () => {
  const base = {
    rf_avg_profit: A(3000), rf_extra_jobs_month: A(15), rf_ads_budget: A(2200),
    g_avalon_budget: A(1400), g_decision_maker: A("Owner"),
    g_start_when: A("now"), g_accepts_tracking: A(true), g_shares_conversion_data: A(true),
    g_has_website: A(false), g_uses_crm: A(false), g_close_rate: A(30),
  };
  const review = S.scoreLead("roofing", base);
  assert.equal(review.legal.status, "review");
  assert.ok(R.recommend("roofing", base).some(r => r.ruleId === "ads_review_required"));
  assert.ok(!R.recommend("roofing", base).some(r => r.ruleId === "evaluate_ads"));
  const invalid = { ...base, rf_license_status: A("invalid") };
  assert.equal(S.scoreLead("roofing", invalid).legal.status, "restricted");
  assert.ok(R.recommend("roofing", invalid).some(r => r.ruleId === "ads_restricted"));
  assert.ok(!R.recommend("roofing", invalid).some(r => r.ruleId === "evaluate_ads"));
  const custom = { ...base, ot_restricted_ads: A(true) };
  assert.equal(S.scoreLead("other", custom).legal.status, "restricted");
  assert.ok(!R.recommend("other", custom).some(r => r.ruleId === "evaluate_ads"));
});

test("sector-specific unknown answers do not contribute points and conditional pesticide checks are honest", () => {
  const unknown = S.scoreLead("restaurant", {rs_avg_profit: U, rs_extras_month: U, rs_ads_budget: U});
  assert.equal(unknown.grade, "insufficient");
  const noPesticides = S.scoreLead("landscaping", {ls_services: A(["mowing"])});
  assert.equal(noPesticides.legal.status, "clear");
  const pesticides = S.scoreLead("landscaping", {ls_services: A(["mowing", "pesticides"])});
  assert.equal(pesticides.legal.status, "review");
  const verified = S.scoreLead("landscaping", {ls_services: A(["pesticides"]), ls_pesticide_status: A("owner_verified")});
  assert.equal(verified.legal.status, "clear");
});

test("reconciliation withdraws only stale suggested rules, preserving human decisions", () => {
  const existing = [
    {id:"1", rule_id:"evaluate_ads", status:"suggested", note:"", decided_by:null, version:3},
    {id:"2", rule_id:"website", status:"accepted", note:"Approved", decided_by:"owner", version:1},
    {id:"3", rule_id:"follow_up", status:"dismissed", note:"Not right now", decided_by:"owner", version:4},
    {id:"4", rule_id:"missed_calls", status:"edited", note:"Manual edit", decided_by:"owner", version:2}
  ];
  const result = C.reconcileRecommendations(existing, [{ruleId:"follow_up"}]);
  assert.deepEqual(result.changes, [{id:"1",version:3,ruleId:"evaluate_ads",action:"withdraw"}]);
  assert.deepEqual(result.humanReview.sort(), ["missed_calls","website"]);
});

test("previously auto-withdrawn rules can return without restoring manually dismissed rules", () => {
  const existing = [
    {id:"1",rule_id:"evaluate_ads",status:"dismissed",note:C.AUTO_WITHDRAW_NOTE,decided_by:null,version:5},
    {id:"2",rule_id:"website",status:"dismissed",note:"Owner said no",decided_by:"owner",version:2}
  ];
  const r = C.reconcileRecommendations(existing, [{ruleId:"evaluate_ads"},{ruleId:"website"}]);
  assert.deepEqual(r.changes,[{id:"1",version:5,ruleId:"evaluate_ads",action:"restore"}]);
  assert.deepEqual(r.humanReview,[]);
});

test("legal review and absent capacity yield independent warnings, never paid-ads recommendations", () => {
  const a = {
    rf_avg_profit:A(2000),rf_extra_jobs_month:A(0),rf_ads_budget:A(2200),
    g_avalon_budget:A(1200),g_decision_maker:A("Owner"),g_start_when:A("now")
  };
  const ids = R.recommend("roofing",a).map(x=>x.ruleId);
  assert.ok(ids.includes("ads_review_required"));
  assert.ok(ids.includes("no_ads_without_capacity"));
  assert.ok(!ids.includes("evaluate_ads"));
  const bad = {...a,rf_license_status:A("invalid")};
  const badIds = R.recommend("roofing",bad).map(x=>x.ruleId);
  assert.ok(badIds.includes("ads_restricted"));
  assert.ok(badIds.includes("no_ads_without_capacity"));
  assert.ok(!badIds.includes("evaluate_ads"));
});
