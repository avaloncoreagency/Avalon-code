import type { Answers, L } from "./types";
import { bool, list, num, str } from "./form";

// Explainable lead score (0–100). Rules are plain code, versioned, and every point has a visible reason.
// Unknown data is EXCLUDED (never counted as a negative): a category without data is "unknown", and the overall score is
// "insufficient" until enough weight is known. Legal risk is evaluated separately and can never be outweighed by points.
export const RULES_VERSION = "score-1";
export const WEIGHTS = { profitability: 20, capacity: 20, budget: 15, conversion: 15, fit: 15, commitment: 10, data: 5 } as const;
export type Category = keyof typeof WEIGHTS;
export const MIN_KNOWN_WEIGHT = 60;

export type Facts = {
  industry: string;
  grossProfitPerSale?: number; grossProfitComputed?: boolean;
  marginPct?: number;
  extraCapacity?: number;          // additional customers/jobs per month they can serve; 0 = none
  availableNow?: boolean;
  occupancyPct?: number;
  avalonBudget?: number; adBudget?: number;
  closeRatePct?: number; followUp?: string; responseMinutes?: number;
  missedCallsPct?: number; quotesWithoutFollowUp?: number; noShowPct?: number;
  hasWebsite?: boolean; hasCrm?: boolean; hasBooking?: boolean; hasReminders?: boolean; hasInventorySystem?: boolean;
  decisionMaker?: string; startWhen?: string; acceptsTracking?: boolean; sharesData?: boolean; canReportSales?: boolean;
  googleProfile?: string;
  // Legal
  licenseVerified?: string; licenseType?: string; insurance?: string[];
  restrictedProducts?: string[]; ageVerification?: string; adPlatforms?: string[];
};

const RESTRICTED = ["tobacco", "nicotine_vapes", "hemp_cbd", "kratom"];

/** Map answers to normalized facts. Industry-specific answers take precedence over the general questionnaire. */
export function extractFacts(industry: string, a: Answers): Facts {
  const f: Facts = { industry };
  const first = <T>(...xs: (T | undefined)[]) => xs.find(x => x !== undefined);
  // Profitability
  if (industry === "hvac") {
    const price = num(a, "h_install_price");
    const costs = ["h_equipment_cost", "h_materials_cost", "h_labor_cost", "h_permits_cost"].map(id => num(a, id));
    const computed = price !== undefined && costs.every(c => c !== undefined) ? price - costs.reduce((x, y) => x! + y!, 0)! : undefined;
    f.grossProfitPerSale = first(num(a, "h_install_gp"), computed, num(a, "h_repair_gp"));
    f.grossProfitComputed = num(a, "h_install_gp") === undefined && computed !== undefined;
    const inst = num(a, "h_installs_extra"), rep = num(a, "h_repairs_extra");
    if (inst !== undefined || rep !== undefined) f.extraCapacity = Math.round(((inst ?? 0) + (rep ?? 0)) * 4.3);
    f.availableNow = bool(a, "h_available_now");
    f.adBudget = num(a, "h_ad_budget"); f.avalonBudget = num(a, "h_avalon_budget");
    const calls = num(a, "h_calls_month"), missed = num(a, "h_missed_calls");
    if (calls !== undefined && missed !== undefined && calls > 0) f.missedCallsPct = Math.round((missed / calls) * 100);
    const quotes = num(a, "h_quotes_month"), closed = num(a, "h_jobs_closed");
    if (quotes !== undefined && closed !== undefined && quotes > 0) f.closeRatePct = Math.round((closed / quotes) * 100);
    f.quotesWithoutFollowUp = num(a, "h_quotes_no_followup");
    f.responseMinutes = num(a, "h_response_minutes");
    f.canReportSales = bool(a, "h_can_report_sales");
    f.licenseVerified = str(a, "h_license_verified"); f.licenseType = str(a, "h_license_type"); f.insurance = list(a, "h_insurance");
  } else if (industry === "barber") {
    const cut = num(a, "b_cut_price"), keep = num(a, "b_shop_keep_pct");
    if (cut !== undefined) { f.grossProfitPerSale = keep !== undefined ? Math.round(cut * keep) / 100 : undefined; }
    f.occupancyPct = num(a, "b_occupancy_pct");
    const slots = num(a, "b_slots_day");
    if (f.occupancyPct !== undefined && slots !== undefined) f.extraCapacity = Math.round(slots * (1 - f.occupancyPct / 100) * 22);
    f.noShowPct = num(a, "b_no_show_pct");
    const mode = str(a, "b_booking_mode");
    if (mode) f.hasBooking = mode !== "walkin";
    f.hasReminders = bool(a, "b_reminders");
    f.googleProfile = str(a, "b_google_profile");
    f.adBudget = num(a, "b_budget");
  } else if (industry === "smoke_shop") {
    f.marginPct = num(a, "s_gross_margin_pct");
    const ticket = num(a, "s_avg_ticket");
    if (ticket !== undefined && f.marginPct !== undefined) f.grossProfitPerSale = Math.round(ticket * f.marginPct) / 100;
    const inv = str(a, "s_inventory_system");
    if (inv) f.hasInventorySystem = inv !== "none" && inv !== "spreadsheet";
    const web = bool(a, "s_has_website"); if (web !== undefined) f.hasWebsite = web;
    f.adBudget = num(a, "s_budget");
    f.restrictedProducts = list(a, "s_categories")?.filter(c => RESTRICTED.includes(c));
    f.ageVerification = str(a, "s_age_verification");
    f.adPlatforms = list(a, "s_platforms");
  }
  // General questionnaire (fills only what the industry section did not)
  const avg = num(a, "g_avg_sale"), dc = num(a, "g_direct_costs");
  f.grossProfitPerSale ??= first(num(a, "g_gross_profit"), avg !== undefined && dc !== undefined ? avg - dc : undefined);
  if (f.extraCapacity === undefined) f.extraCapacity = num(a, "g_extra_capacity");
  f.avalonBudget ??= num(a, "g_avalon_budget");
  f.adBudget ??= first(num(a, "g_test_budget_90d") !== undefined ? Math.round(num(a, "g_test_budget_90d")! / 3) : undefined, num(a, "g_ad_spend_month"));
  f.closeRatePct ??= num(a, "g_close_rate");
  f.followUp = str(a, "g_follow_up");
  if (f.missedCallsPct === undefined) {
    const misses = bool(a, "g_misses_calls");
    f.missedCallsPct = misses === false ? 0 : num(a, "g_missed_calls_pct");
  }
  f.hasWebsite ??= bool(a, "g_has_website");
  f.hasCrm = bool(a, "g_uses_crm");
  f.hasBooking ??= bool(a, "g_has_booking");
  f.decisionMaker = str(a, "g_decision_maker");
  f.startWhen = str(a, "g_start_when");
  f.acceptsTracking = bool(a, "g_accepts_tracking");
  f.sharesData = bool(a, "g_shares_conversion_data");
  return f;
}

export type Factor = { label: L; points: number; max: number; evidence?: string };
export type CategoryResult = { category: Category; label: L; max: number; earned: number | null; knownMax: number; factors: Factor[] };
export type LegalResult = { status: "clear" | "review" | "restricted"; flags: { code: string; label: L }[] };
export type ScoreResult = {
  rulesVersion: string; score: number | null; grade: "A" | "B" | "C" | "D" | "insufficient";
  knownWeight: number; categories: CategoryResult[]; legal: LegalResult;
};

const CAT_LABEL: Record<Category, L> = {
  profitability: { es: "Rentabilidad", en: "Profitability" }, capacity: { es: "Capacidad para clientes nuevos", en: "Capacity for new customers" },
  budget: { es: "Presupuesto sostenible", en: "Sustainable budget" }, conversion: { es: "Conversión comercial", en: "Sales conversion" },
  fit: { es: "Necesidades y encaje con Avalon", en: "Needs and fit with Avalon" }, commitment: { es: "Compromiso y autoridad", en: "Commitment and authority" },
  data: { es: "Calidad de datos y medición", en: "Data quality and measurement" },
};
const L_ = (es: string, en: string): L => ({ es, en });
const step = (v: number, cuts: [number, number][]) => { for (const [min, pts] of cuts) if (v >= min) return pts; return 0; };

// Profit per sale differs by trade: an HVAC install and a haircut are not comparable.
const PROFIT_CUTS: Record<string, [number, number][]> = {
  hvac: [[1500, 10], [800, 8], [300, 5], [1, 2]],
  barber: [[30, 10], [18, 7], [10, 4], [1, 2]],
  smoke_shop: [[15, 10], [8, 7], [4, 4], [1, 2]],
  default: [[500, 10], [200, 7], [75, 4], [1, 2]],
};

export function scoreLead(industry: string, answers: Answers): ScoreResult {
  const f = extractFacts(industry, answers);
  const cats: CategoryResult[] = [];
  const add = (category: Category, comps: (Factor | null)[]) => {
    const known = comps.filter((x): x is Factor => x !== null);
    const knownMax = known.reduce((s, x) => s + x.max, 0);
    const raw = known.reduce((s, x) => s + x.points, 0);
    cats.push({ category, label: CAT_LABEL[category], max: WEIGHTS[category], knownMax,
      earned: knownMax ? Math.round((raw / knownMax) * WEIGHTS[category] * 10) / 10 : null, factors: known });
  };
  const $ = (n: number) => "$" + n.toLocaleString("en-US");

  // Profitability
  add("profitability", [
    f.grossProfitPerSale !== undefined ? { label: L_("Beneficio bruto por venta", "Gross profit per sale"), max: 10,
      points: step(f.grossProfitPerSale, PROFIT_CUTS[industry] ?? PROFIT_CUTS.default),
      evidence: $(f.grossProfitPerSale) + (f.grossProfitComputed ? " (calculado)" : "") } : null,
    f.marginPct !== undefined ? { label: L_("Margen bruto", "Gross margin"), max: 10, points: step(f.marginPct, [[50, 10], [35, 7], [20, 4], [1, 1]]), evidence: f.marginPct + "%" } : null,
  ]);
  // Capacity (an explicit "no capacity" is real information and scores 0)
  add("capacity", [
    f.extraCapacity !== undefined ? { label: L_("Capacidad adicional al mes", "Extra monthly capacity"), max: 10,
      points: f.extraCapacity <= 0 ? 0 : step(f.extraCapacity, [[20, 10], [8, 7], [3, 4], [1, 2]]), evidence: String(f.extraCapacity) } : null,
    f.availableNow !== undefined ? { label: L_("Acepta trabajos nuevos ahora", "Taking new work now"), max: 5, points: f.availableNow ? 5 : 0, evidence: f.availableNow ? "sí" : "no" } : null,
    f.occupancyPct !== undefined ? { label: L_("Ocupación (más hueco = más capacidad)", "Occupancy (more gaps = more capacity)"), max: 5,
      points: step(100 - f.occupancyPct, [[40, 5], [20, 3], [10, 1]]), evidence: f.occupancyPct + "%" } : null,
  ]);
  // Budget
  add("budget", [
    f.avalonBudget !== undefined ? { label: L_("Presupuesto para Avalon / mes", "Budget for Avalon / month"), max: 8,
      points: step(f.avalonBudget, [[1500, 8], [750, 6], [300, 3], [1, 1]]), evidence: $(f.avalonBudget) } : null,
    f.adBudget !== undefined ? { label: L_("Presupuesto publicitario / mes (del cliente)", "Ad budget / month (client's)"), max: 7,
      points: step(f.adBudget, [[2000, 7], [1000, 5], [400, 3], [1, 1]]), evidence: $(f.adBudget) } : null,
  ]);
  // Conversion
  add("conversion", [
    f.closeRatePct !== undefined ? { label: L_("Tasa de cierre", "Close rate"), max: 7, points: step(f.closeRatePct, [[40, 7], [25, 5], [15, 3], [1, 1]]), evidence: f.closeRatePct + "%" } : null,
    f.followUp !== undefined ? { label: L_("Proceso de seguimiento", "Follow-up process"), max: 4,
      points: ({ automated: 4, crm: 3, manual: 2, none: 0 } as Record<string, number>)[f.followUp] ?? 0, evidence: f.followUp } : null,
    f.responseMinutes !== undefined ? { label: L_("Tiempo de respuesta", "Response time"), max: 4,
      points: f.responseMinutes <= 15 ? 4 : f.responseMinutes <= 60 ? 3 : f.responseMinutes <= 240 ? 1 : 0, evidence: f.responseMinutes + " min" } : null,
  ]);
  // Fit: problems Avalon can solve (each counts once, max 15)
  const needs: Factor[] = [];
  const need = (cond: boolean | undefined, es: string, en: string, evidence: string) => { if (cond !== undefined) needs.push({ label: L_(es, en), max: 3, points: cond ? 3 : 0, evidence }); };
  need(f.missedCallsPct === undefined ? undefined : f.missedCallsPct >= 10, "Pierde llamadas", "Misses calls", f.missedCallsPct === undefined ? "" : f.missedCallsPct + "%");
  need(f.quotesWithoutFollowUp === undefined ? undefined : f.quotesWithoutFollowUp > 0, "Cotizaciones sin seguimiento", "Quotes without follow-up", String(f.quotesWithoutFollowUp ?? ""));
  need(f.hasWebsite === undefined ? undefined : !f.hasWebsite, "Sin sitio web", "No website", f.hasWebsite === undefined ? "" : f.hasWebsite ? "tiene" : "no tiene");
  need(f.hasCrm === undefined ? undefined : !f.hasCrm, "Sin CRM", "No CRM", f.hasCrm === undefined ? "" : f.hasCrm ? "usa" : "no usa");
  need(f.hasBooking === undefined ? undefined : !f.hasBooking, "Sin sistema de citas", "No booking system", f.hasBooking === undefined ? "" : f.hasBooking ? "tiene" : "no tiene");
  need(f.hasReminders === undefined ? undefined : !f.hasReminders, "Sin recordatorios", "No reminders", "");
  need(f.hasInventorySystem === undefined ? undefined : !f.hasInventorySystem, "Sin gestión de inventario", "No inventory system", "");
  if (needs.length) {
    const hit = needs.filter(n => n.points > 0);
    // Normalize: three or more real needs = full fit; known "no need" answers still count as data.
    add("fit", [{ label: L_("Necesidades que Avalon resuelve", "Needs Avalon solves"), max: 15, points: Math.min(15, hit.length * 5),
      evidence: hit.map(h => h.label.es).join(", ") || "ninguna detectada" }]);
  } else add("fit", []);
  // Commitment
  add("commitment", [
    f.decisionMaker !== undefined ? { label: L_("Decisor identificado", "Decision maker identified"), max: 4, points: 4, evidence: f.decisionMaker } : null,
    f.startWhen !== undefined ? { label: L_("Cuándo quiere empezar", "When they want to start"), max: 3,
      points: ({ now: 3, "30d": 3, "90d": 2, later: 1, undecided: 0 } as Record<string, number>)[f.startWhen] ?? 0, evidence: f.startWhen } : null,
    f.acceptsTracking !== undefined ? { label: L_("Colabora con la medición", "Collaborates on measurement"), max: 3, points: f.acceptsTracking ? 3 : 0, evidence: f.acceptsTracking ? "sí" : "no" } : null,
  ]);
  // Data & measurement
  add("data", [
    f.sharesData !== undefined ? { label: L_("Comparte datos de conversión", "Shares conversion data"), max: 3, points: f.sharesData ? 3 : 0 } : null,
    f.canReportSales !== undefined ? { label: L_("Puede reportar ventas atribuibles", "Can report attributable sales"), max: 2, points: f.canReportSales ? 2 : 0 } : null,
  ]);

  const knownWeight = cats.filter(c => c.earned !== null).reduce((s, c) => s + c.max, 0);
  const earned = cats.reduce((s, c) => s + (c.earned ?? 0), 0);
  const score = knownWeight >= MIN_KNOWN_WEIGHT ? Math.round((earned / knownWeight) * 100) : null;
  return { rulesVersion: RULES_VERSION, score, grade: gradeOf(score), knownWeight, categories: cats, legal: legalOf(f) };
}

export function gradeOf(score: number | null): ScoreResult["grade"] {
  if (score === null) return "insufficient";
  return score >= 80 ? "A" : score >= 60 ? "B" : score >= 40 ? "C" : "D";
}

/** Legal/compliance risk — separate from the commercial score. Not legal advice; flags what needs human review. */
export function legalOf(f: Facts): LegalResult {
  const flags: LegalResult["flags"] = [];
  let status: LegalResult["status"] = "clear";
  const bump = (s: LegalResult["status"]) => { if (s === "restricted" || (s === "review" && status === "clear")) status = s; };
  if (f.industry === "hvac") {
    if (f.licenseType === "none" || f.licenseVerified === "invalid") { flags.push({ code: "license_invalid", label: L_("Licencia inexistente o no válida: no promocionar servicios que la requieren", "No or invalid license: do not promote services that require one") }); bump("restricted"); }
    else if (f.licenseVerified !== "verified") { flags.push({ code: "license_unverified", label: L_("Licencia sin verificar en DBPR", "License not verified on DBPR") }); bump("review"); }
    if (f.insurance?.includes("none")) { flags.push({ code: "no_insurance", label: L_("Sin seguros declarados", "No insurance declared") }); bump("review"); }
  }
  if (f.industry === "smoke_shop") {
    if (f.restrictedProducts?.length) { flags.push({ code: "ads_restricted_products", label: L_("Vende productos con publicidad restringida (tabaco, nicotina, vapes, cáñamo/CBD o kratom). No se recomiendan Meta Ads ni Google Ads para ellos.", "Sells advertising-restricted products (tobacco, nicotine, vapes, hemp/CBD or kratom). Meta Ads / Google Ads are not recommended for them.") }); bump("restricted"); }
    if (f.ageVerification === "none") { flags.push({ code: "age_verification_missing", label: L_("No verifica la edad de los compradores", "Does not verify buyers' age") }); bump("review"); }
    if (f.adPlatforms?.some(p => p === "meta_ads" || p === "google_ads") && f.restrictedProducts?.length) {
      flags.push({ code: "paid_ads_requested_for_restricted", label: L_("El cliente pide anuncios pagados: revisar las políticas vigentes de cada plataforma antes de prometer nada", "Client asks for paid ads: review each platform's current policy before promising anything") });
    }
  }
  return { status, flags };
}
