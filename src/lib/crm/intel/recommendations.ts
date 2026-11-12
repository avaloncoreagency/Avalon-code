import type { Answers, L } from "./types";
import { extractFacts, scoreLead, type Facts } from "./scoring";

// Rule-based recommendations. Each one states the problem, the evidence behind it, the Avalon service, a qualitative
// benefit, what data is missing and the next action. No ROI, conversions or revenue figures are ever invented.
export type Recommendation = {
  ruleId: string; service: string; problem: L; benefit: L; evidence: { label: string; value: string }[];
  missing: string[]; nextAction: L; kind: "service" | "advisory";
};

const L_ = (es: string, en: string): L => ({ es, en });

export function recommend(industry: string, answers: Answers): Recommendation[] {
  const f: Facts = extractFacts(industry, answers);
  const s = scoreLead(industry, answers);
  const out: Recommendation[] = [];
  const cat = (c: string) => s.categories.find(x => x.category === c);
  const restricted = s.legal.status === "restricted";
  const noCapacity = f.extraCapacity === 0 || f.availableNow === false;

  if (f.missedCallsPct !== undefined && f.missedCallsPct >= 10)
    out.push({ ruleId: "missed_calls", service: "AI Receptionist", kind: "service",
      problem: L_("Pierde llamadas de clientes potenciales", "Missing calls from potential customers"),
      benefit: L_("Cada llamada recibe respuesta y queda registrada para seguimiento", "Every call gets answered and logged for follow-up"),
      evidence: [{ label: "Llamadas perdidas", value: f.missedCallsPct + "%" }], missing: [],
      nextAction: L_("Revisar horarios sin cobertura y proponer AI Receptionist + seguimiento", "Review uncovered hours and propose AI Receptionist + follow-up") });

  if ((f.quotesWithoutFollowUp ?? 0) > 0 || f.followUp === "none" || (f.closeRatePct !== undefined && f.closeRatePct < 25))
    out.push({ ruleId: "follow_up", service: "CRM + seguimiento automatizado", kind: "service",
      problem: L_("Oportunidades sin seguimiento suficiente", "Opportunities without enough follow-up"),
      benefit: L_("Ninguna cotización queda olvidada; recordatorios y estados visibles", "No quote is forgotten; reminders and visible status"),
      evidence: [
        ...(f.quotesWithoutFollowUp !== undefined ? [{ label: "Cotizaciones sin seguimiento", value: String(f.quotesWithoutFollowUp) }] : []),
        ...(f.followUp ? [{ label: "Seguimiento", value: f.followUp }] : []),
        ...(f.closeRatePct !== undefined ? [{ label: "Tasa de cierre", value: f.closeRatePct + "%" }] : []),
      ], missing: f.hasCrm === undefined ? ["¿Usa CRM?"] : [],
      nextAction: L_("Mapear su proceso de cotización y proponer CRM Creator", "Map their quoting process and propose CRM Creator") });

  if ((f.occupancyPct !== undefined && f.occupancyPct <= 70) || f.hasBooking === false || (f.noShowPct ?? 0) >= 10)
    out.push({ ruleId: "booking", service: "Reservas + recordatorios", kind: "service",
      problem: L_("Huecos en la agenda o citas perdidas", "Gaps in the schedule or missed appointments"),
      benefit: L_("Reservas en línea y recordatorios para llenar huecos y reducir no-shows", "Online booking and reminders to fill gaps and reduce no-shows"),
      evidence: [
        ...(f.occupancyPct !== undefined ? [{ label: "Ocupación", value: f.occupancyPct + "%" }] : []),
        ...(f.hasBooking === false ? [{ label: "Sistema de citas", value: "no tiene" }] : []),
        ...(f.noShowPct !== undefined ? [{ label: "No-shows", value: f.noShowPct + "%" }] : []),
      ], missing: f.hasReminders === undefined && industry === "barber" ? ["¿Envía recordatorios?"] : [],
      nextAction: L_("Proponer sistema de citas con recordatorios", "Propose a booking system with reminders") });

  if (industry === "barber" && f.hasReminders === false)
    out.push({ ruleId: "retention", service: "CRM de retención", kind: "service",
      problem: L_("Sin recordatorios ni retención de clientes", "No reminders or customer retention"),
      benefit: L_("Recordar a los clientes cuándo volver según su frecuencia real", "Remind customers when to return based on their real frequency"),
      evidence: [{ label: "Recordatorios", value: "no" }], missing: [],
      nextAction: L_("Proponer campañas de retención con consentimiento", "Propose consent-based retention messages") });

  if (f.hasWebsite === false)
    out.push({ ruleId: "website", service: "Website Designer", kind: "service",
      problem: L_("No tiene sitio web", "No website"),
      benefit: L_("Presencia propia para mostrar servicios, zona y contacto verificados", "Owned presence to show verified services, area and contact"),
      evidence: [{ label: "Sitio web", value: "no tiene" }], missing: [],
      nextAction: L_("Crear un borrador en Website Designer con datos aprobados por el cliente", "Draft a site in Website Designer with client-approved data") });

  if (industry === "smoke_shop" && f.hasInventorySystem === false)
    out.push({ ruleId: "inventory", service: "POS, inventario y reportes", kind: "service",
      problem: L_("Inventario sin sistema dedicado", "Inventory without a dedicated system"),
      benefit: L_("Menos agotados y menos stock inmóvil, con reportes por categoría", "Fewer stock-outs and less dead stock, with per-category reports"),
      evidence: [{ label: "Gestión de inventario", value: "ninguna u hoja de cálculo" }], missing: [],
      nextAction: L_("Evaluar herramientas de inventario/POS (independiente de la publicidad)", "Evaluate inventory/POS tools (separate from advertising)") });

  if (restricted)
    out.push({ ruleId: "ads_restricted", service: "Publicidad restringida", kind: "advisory",
      problem: L_("La actividad publicitaria está restringida", "Advertising is restricted"),
      benefit: L_("Evitar campañas rechazadas o suspensiones de cuenta", "Avoid rejected campaigns or account suspensions"),
      evidence: s.legal.flags.map(x => ({ label: "Riesgo legal", value: x.code })), missing: [],
      nextAction: L_("Limitarse a opciones permitidas (perfil de Google Business informativo, contenido orgánico, mejoras operativas) y revisar políticas vigentes", "Stick to allowed options (informational Google Business Profile, organic content, operational improvements) and review current policies") });
  else if (noCapacity)
    out.push({ ruleId: "no_ads_without_capacity", service: "Capacidad antes que publicidad", kind: "advisory",
      problem: L_("No puede atender más clientes ahora", "Cannot take more customers now"),
      benefit: L_("No pagar por clientes que no se pueden atender", "Avoid paying for customers they cannot serve"),
      evidence: [{ label: "Capacidad adicional", value: String(f.extraCapacity ?? "no acepta trabajos nuevos") }], missing: [],
      nextAction: L_("No recomendar anuncios todavía; mejorar operación, precios o seguimiento", "Do not recommend ads yet; improve operations, pricing or follow-up") });
  else {
    const profit = cat("profitability"), budget = cat("budget");
    const budgetLow = (f.avalonBudget !== undefined && f.avalonBudget < 300) || (f.adBudget !== undefined && f.adBudget < 400);
    if (budgetLow)
      out.push({ ruleId: "organic_first", service: "Mejoras orgánicas y operativas", kind: "advisory",
        problem: L_("Presupuesto insuficiente para publicidad pagada", "Budget too low for paid advertising"),
        benefit: L_("Construir base (perfil de Google, reseñas, sitio) antes de invertir en anuncios", "Build the base (Google profile, reviews, site) before paying for ads"),
        evidence: [
          ...(f.avalonBudget !== undefined ? [{ label: "Presupuesto Avalon", value: "$" + f.avalonBudget }] : []),
          ...(f.adBudget !== undefined ? [{ label: "Presupuesto anuncios", value: "$" + f.adBudget }] : []),
        ], missing: [],
        nextAction: L_("Proponer plan orgánico y revisar presupuesto en 90 días", "Propose an organic plan and revisit budget in 90 days") });
    else if (profit?.earned !== null && profit && profit.earned! >= profit.max * 0.6 && (f.extraCapacity ?? 0) > 0 && budget?.earned !== null)
      out.push({ ruleId: "evaluate_ads", service: industry === "hvac" ? "Campañas (Google Local Services / Search, Meta)" : "Campañas publicitarias", kind: "service",
        problem: L_("Buena rentabilidad y capacidad disponible", "Good profitability and available capacity"),
        benefit: L_("Captar demanda que puede atender con margen", "Capture demand they can serve profitably"),
        evidence: [{ label: "Rentabilidad", value: `${profit.earned}/${profit.max}` }, { label: "Capacidad adicional/mes", value: String(f.extraCapacity) }],
        missing: f.canReportSales === undefined ? ["¿Puede reportar ventas atribuibles?"] : [],
        nextAction: L_("Evaluar campañas con presupuesto de prueba y medición acordada (sin prometer resultados)", "Evaluate campaigns with a test budget and agreed measurement (no promised results)") });
  }
  return out;
}
