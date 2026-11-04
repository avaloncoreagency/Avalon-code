import type { ResearchReport, ResearchSignal } from "./radar-research";

/**
 * Avalon Analyst: deterministic, evidence-first commercial decision support.
 * Not an LLM: all findings must be traceable to the stored source report or
 * a verified owner-entered CRM need. Never infer that a missing HTML element
 * means the business lacks CRM, AI, marketing, customers or budget.
 */
export type RadarIntelProfile = {
  company: string;
  category?: string;
  phone?: string;
  website?: string;
  contact?: string;
  stars: number | null;
  stars_override: number | null;
  stars_reasons?: string[];
  confidence: string;
  status: string;
  do_not_contact: boolean;
  needs: Array<{
    service: string;
    state: string;
    confidence: string;
    evidence_url?: string;
    note?: string;
  }>;
};
export type IntelFact = { title: string; description: string; source_url?: string };
export type RadarIntelBrief = {
  headline: string;
  explanation: string;
  classification: "restricted" | "preliminary" | "researching" | "review" | "qualified" | "pipeline";
  confidence: "none" | "low" | "medium" | "high";
  facts: IntelFact[];
  nextAction: string;
  questions: string[];
  promoteReady: boolean;
  disclaimer: string;
};

const SERVICE: Record<string, string> = {
  website: "Sitio web", ecommerce: "E-commerce", crm: "CRM y seguimiento",
  receptionist: "Recepción de llamadas", marketing: "Marketing", automation: "Automatización",
};
const goodSource = (value?: string): string | undefined => {
  if (!value || value.length > 500) return undefined;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || u.port || u.hostname.split(".").length < 2)
      return undefined;
    if (/\b(localhost|internal|local|invalid)\b/i.test(u.hostname) ||
        /^\d{1,3}(?:\.\d{1,3}){3}$/.test(u.hostname) || u.hostname.startsWith("["))
      return undefined;
    return u.href;
  } catch { return undefined; }
};
const observed = (report: ResearchReport | null, code: string): ResearchSignal | undefined =>
  report?.signals?.find(s => s.code === code && s.outcome === "observed");
const notSeen = (report: ResearchReport | null, code: string): boolean =>
  !!report?.signals?.some(s => s.code === code && s.outcome === "not_observed");
const withSource = (title: string, description: string, link?: string): IntelFact =>
  ({ title, description, source_url: goodSource(link) });

export function buildRadarIntelligence(p: RadarIntelProfile, report: ResearchReport | null): RadarIntelBrief {
  const verified = p.needs.filter(n => ["verified_missing", "opportunity_to_improve"].includes(n.state)
    && ["medium", "high"].includes(n.confidence) && n.note?.trim()
    && goodSource(n.evidence_url));
  const starred = p.stars_override ?? p.stars;
  const preliminary = p.stars_override == null && (p.stars_reasons ?? [])
    .some(x => x.startsWith("Precalificación automática:"));
  const canPromote = (p.status === "pending" || p.status === "approved")
    && !p.do_not_contact
    && starred !== null && (p.stars_override != null || !preliminary)
    && ((starred ?? 0) >= 3 || p.stars_override != null);
  const identity = report?.identity_matched === true;
  const facts: IntelFact[] = [];
  const add = (title: string, description: string, source?: string) => {
    if (facts.length < 6) facts.push(withSource(title, description, source));
  };

  if (p.website) add("Web registrada", "El directorio o el propietario registró una URL; no implica que su contenido haya sido validado.", p.website);
  if (p.phone) add("Teléfono registrado", "Existe un dato de contacto comercial que deberá confirmarse antes de usarlo.");
  if (report && identity) add("Identidad web contrastada", "El nombre del negocio coincide con el título o encabezado de la web consultada.", report.website);
  for (const n of verified.slice(0, 2)) {
    add("Oportunidad documentada: " + (SERVICE[n.service] ?? n.service),
      (n.note ?? "").slice(0, 210), n.evidence_url);
  }
  const summarySignals: Array<[string,string,string]> = [
    ["booking_link","Reservas en línea","Se observó un enlace de citas o reservas; no se verificó el proceso completo."],
    ["contact_form","Formulario de contacto","Se observó un formulario con campos de contacto; no se probó su entrega."],
    ["contact_page","Contacto web","Se encontró un enlace a una sección de contacto."],
    ["storefront","Tienda en línea","Se observó un enlace o indicio de tienda; no se comprobaron ventas."],
    ["social_links","Redes sociales","La web enlaza redes sociales; su actividad y resultados son desconocidos."],
    ["local_business_schema","Datos de negocio estructurados","Se observaron datos de tipo LocalBusiness u Organization para buscadores."],
  ];
  for (const [code,title,description] of summarySignals) {
    const signal = observed(report, code);
    if (signal) add(title, description, signal.source_url);
  }

  const qualified = verified.length > 0 && !preliminary;
  const communication = p.phone?.trim() ? "teléfono comercial" : p.website ? "sitio web" : "fuente pública";
  const questions = [
    "¿Cómo registran y dan seguimiento a las solicitudes de nuevos clientes?",
    observed(report, "booking_link")
      ? "¿Su sistema actual de reservas confirma y recuerda las citas automáticamente?"
      : "¿Cómo reciben y programan las reservas o solicitudes de servicio?",
    observed(report, "contact_form")
      ? "¿Quién responde los formularios y cuánto tardan en contactar a cada prospecto?"
      : "¿Qué canal de contacto prefieren sus clientes y cómo miden la respuesta?",
  ];

  if (p.do_not_contact || p.status === "rejected") return {
    headline: "Negocio restringido",
    explanation: "El prospecto está marcado como No contactar o descartado. No se promoverá al pipeline.",
    classification: "restricted", confidence: "none", facts, questions: [],
    nextAction: "No contactar ni lanzar más investigaciones. Solo un propietario puede revisar el estado.",
    promoteReady: false, disclaimer: "No se han hecho afirmaciones comerciales adicionales.",
  };
  if (p.status === "converted") return {
    headline: "Prospecto incorporado al pipeline",
    explanation: "La tarjeta comercial ya existe. Conserva el historial de investigación y evita duplicarla.",
    classification: "pipeline", confidence: verified.length ? "medium" : "low",
    facts, questions: [], nextAction: "Abrir su tarjeta en Leads y continuar el seguimiento.",
    promoteReady: false, disclaimer: "El estado del pipeline no confirma por sí solo una venta.",
  };

  let headline = "Perfil preliminar: investigación pendiente";
  let explanation = "Los datos del directorio permiten priorizar la revisión, pero no confirman necesidades comerciales.";
  let nextAction = p.website
    ? "Esperar o revisar el análisis de la web oficial; después confirmar una necesidad concreta con una fuente."
    : "Localizar y confirmar la web oficial o hablar con el negocio antes de atribuirle necesidades.";
  let classification: RadarIntelBrief["classification"] = "preliminary";

  if (report?.status === "blocked") {
    headline = "Investigación web restringida";
    explanation = "La web no se pudo consultar de forma permitida. No se interpretó el bloqueo como falta de servicios.";
    nextAction = "Usar otra fuente pública autorizada o confirmar la información directamente con el negocio.";
    classification = "researching";
  } else if (report && !identity) {
    headline = "Web consultada; identidad sin confirmar";
    explanation = "Hay información técnica, pero no podemos demostrar que el dominio pertenezca al negocio.";
    nextAction = "Confirmar el dominio oficial antes de recomendar servicios basados en estas páginas.";
    classification = "researching";
  } else if (identity && verified.length === 0) {
    headline = "Sitio contrastado, oportunidades por confirmar";
    explanation = "El radar obtuvo señales públicas del sitio. La presencia de herramientas no demuestra que necesiten reemplazarlas.";
    const misses = ["seo_title","seo_meta_description","mobile_viewport"].filter(code => notSeen(report, code));
    nextAction = misses.length >= 2
      ? "Validar el impacto de los hallazgos técnicos en móvil y buscadores; solo después proponer una optimización."
      : "Confirmar en una conversación qué les cuesta tiempo, ventas o seguimiento antes de calificar como oportunidad.";
    classification = "review";
  } else if (qualified) {
    headline = "Oportunidad verificada para evaluar";
    explanation = "Hay una necesidad documentada. Revisa su actualidad, confianza y encaje comercial antes de crear el lead.";
    nextAction = canPromote
      ? "Revisar las fuentes y pulsar «Pasar a Nuevo lead» para crear una única tarjeta."
      : "Confirmar los hallazgos y la puntuación para decidir si merece entrar al pipeline.";
    classification = canPromote ? "qualified" : "review";
  }
  if (p.stars_override != null && canPromote) {
    headline = "Calificación manual confirmada";
    explanation = "Un propietario ajustó las estrellas. Conserva su justificación y contrasta la necesidad comercial.";
    nextAction = "Pasar a Nuevo lead usando la calificación manual ya registrada.";
    classification = "qualified";
  }
  if (canPromote && classification !== "qualified") {
    classification = "qualified";
    nextAction = "Revisar la calificación y pasar la oportunidad a «Nuevo lead» con un clic.";
  }
  return {
    headline, explanation, classification,
    confidence: verified.some(n => n.confidence === "high") && verified.length >= 2 ? "high" :
      identity && report?.confidence === "medium" ? "medium" :
      report?.confidence === "low" || p.stars !== null ? "low" : "none",
    facts,
    questions: questions.slice(0, 3),
    nextAction: nextAction + (canPromote ? "" : " Canal de verificación sugerido: " + communication + "."),
    promoteReady: canPromote,
    disclaimer: "Análisis automático basado en reglas y fuentes guardadas; no es una IA generativa. Ausencia de datos ≠ ausencia de servicios. Las estrellas y la confianza son indicadores distintos.",
  };
}

export function formatRadarBriefForCopy(profile: RadarIntelProfile, brief: RadarIntelBrief): string {
  return [
    "AVALON · DIAGNÓSTICO DE PROSPECTO",
    "Negocio: " + profile.company,
    "Calificación: " + (profile.stars_override ?? profile.stars ?? "Sin estrellas") +
      " · confianza: " + brief.confidence,
    "Diagnóstico: " + brief.headline + ". " + brief.explanation,
    ...brief.facts.map(f => "• " + f.title + ": " + f.description + (f.source_url ? " (" + f.source_url + ")" : "")),
    "Siguiente acción: " + brief.nextAction,
    "Preguntas para validar: " + brief.questions.join(" / "),
    brief.disclaimer,
  ].join("\n").slice(0, 4400);
}
