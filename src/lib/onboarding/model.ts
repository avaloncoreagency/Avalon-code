/**
 * Client onboarding & delivery (pure). Checklists derive from docs/client-operations/ONBOARDING_AND_DELIVERY_CHECKLISTS.md.
 * Nothing here infers progress from a sale, a payment or a URL: every item is ticked by a person and the delivery
 * gate is evaluated from recorded facts only.
 */
export type Lang = "es" | "en";
export const PRODUCT_TYPES = ["website", "ecommerce", "crm", "marketing", "ai_tools", "other"] as const;
export type ProductType = typeof PRODUCT_TYPES[number];
export const PRODUCT_LABEL: Record<ProductType, [string, string]> = {
  website: ["Sitio web", "Website"], ecommerce: ["E-commerce", "E-commerce"], crm: ["CRM personalizado", "Custom CRM"],
  marketing: ["Marketing / Funnels", "Marketing / Funnels"], ai_tools: ["Herramientas IA", "AI tools"], other: ["Otro servicio", "Other service"],
};

export const STAGES = ["preparation", "data_pending", "documents_pending", "approved", "welcome_sent", "kickoff", "build",
  "review", "qa", "delivery_ready", "delivered", "support", "closed"] as const;
export type Stage = typeof STAGES[number];
export const STAGE_LABEL: Record<Stage, [string, string]> = {
  preparation: ["Preparación", "Preparation"], data_pending: ["Datos pendientes", "Data pending"], documents_pending: ["Documentos pendientes", "Documents pending"],
  approved: ["Aprobado para onboarding", "Approved for onboarding"], welcome_sent: ["Bienvenida enviada", "Welcome sent"], kickoff: ["Kickoff", "Kickoff"],
  build: ["Configuración y desarrollo", "Setup and build"], review: ["Revisión", "Review"], qa: ["QA", "QA"],
  delivery_ready: ["Entrega preparada", "Delivery ready"], delivered: ["Entregado", "Delivered"], support: ["Soporte", "Support"], closed: ["Cerrado", "Closed"],
};
export const isStage = (v: unknown): v is Stage => typeof v === "string" && (STAGES as readonly string[]).includes(v);
export const isProductType = (v: unknown): v is ProductType => typeof v === "string" && (PRODUCT_TYPES as readonly string[]).includes(v);

export type ChecklistItem = { key: string; label: [string, string]; done: boolean; done_by?: string | null; done_at?: string | null };
type Def = [key: string, es: string, en: string];
const COMMON: Def[] = [
  ["client_identity", "Cliente canónico confirmado (sin unir por nombre)", "Canonical client confirmed (never matched by name)"],
  ["decision_maker", "Responsable de decisiones y contacto de entrega identificados", "Decision-maker and delivery contact identified"],
  ["scope_version", "Versión de cotización/contrato, alcance y exclusiones verificados", "Quote/contract version, scope and exclusions verified"],
  ["approval_evidence", "Evidencia de aprobación registrada (no se asume firma ni pago)", "Approval evidence recorded (signature or payment never assumed)"],
  ["privacy", "Necesidades de privacidad, datos y confidencialidad confirmadas", "Privacy, data and confidentiality needs confirmed"],
];
const BY_PRODUCT: Record<ProductType, Def[]> = {
  website: [["logo", "Logo (vectorial si existe) y permisos de uso", "Logo (vector if available) and usage permission"], ["domain", "Dominio: propiedad, acceso delegado y quién paga", "Domain: ownership, delegated access and payer"],
    ["content", "Contenido aprobado (textos, servicios, FAQ)", "Approved content (copy, services, FAQ)"], ["sections", "Mapa del sitio y secciones acordadas", "Sitemap and sections agreed"],
    ["photos", "Fotografías con licencia o consentimiento", "Photos with license or consent"], ["forms", "Formularios y destino de los envíos", "Forms and submission destination"],
    ["contacts", "Datos de contacto verificados", "Verified contact details"], ["revisions", "Rondas de revisión acordadas", "Revision rounds agreed"], ["publish", "Plan de publicación y hosting", "Publishing and hosting plan"]],
  ecommerce: [["catalog", "Catálogo y fotos aprobados", "Approved catalog and photos"], ["inventory", "Inventario aprobado", "Approved inventory"], ["prices", "Precios aprobados", "Approved prices"],
    ["variants", "Variantes / SKU", "Variants / SKU"], ["payments", "Proveedor de pagos del comerciante y responsabilidades PCI", "Merchant payment provider and PCI responsibilities"],
    ["shipping", "Envíos e impuestos revisados por el comerciante", "Shipping and taxes reviewed by merchant"], ["returns", "Política de devoluciones del comerciante", "Merchant returns policy"],
    ["tests", "Casos de prueba en sandbox (compra, reembolso, avisos)", "Sandbox test cases (purchase, refund, notifications)"]],
  crm: [["roles", "Roles y permisos", "Roles and permissions"], ["users", "Usuarios autorizados", "Authorized users"], ["pipeline", "Etapas del pipeline", "Pipeline stages"],
    ["clients", "Relación canónica cliente/lead/venta", "Canonical client/lead/sale relationship"], ["data", "Origen de datos, consentimiento de importación y deduplicación", "Data provenance, import consent and deduplication"],
    ["reports", "Fuente de reportes/KPI (lo no disponible es UNKNOWN)", "Report/KPI source (unavailable is UNKNOWN)"], ["automations", "Automatizaciones acordadas", "Agreed automations"],
    ["security", "Pruebas de aislamiento entre clientes y denegación", "Cross-client isolation and denial tests"]],
  marketing: [["goals", "Objetivos medibles acordados", "Measurable goals agreed"], ["materials", "Materiales aprobados", "Approved materials"], ["channels", "Canales acordados", "Agreed channels"],
    ["budget", "Presupuesto publicitario aprobado por escrito (pagado por el cliente)", "Ad budget approved in writing (paid by the client)"],
    ["policies", "Políticas de anuncios y afirmaciones sustentadas", "Ad policies and substantiated claims"], ["kpi", "KPI y fuente de medición", "KPIs and measurement source"]],
  // Templates only: paused AI products are never activated or presented as delivered from here.
  ai_tools: [["scope_ai", "Alcance de la herramienta IA y supervisión humana", "AI tool scope and human oversight"], ["knowledge", "Base de conocimiento aprobada", "Approved knowledge base"],
    ["consent_ai", "Avisos y consentimiento de usuarios finales", "End-user notices and consent"], ["handoff", "Transferencia a humano definida", "Human handoff defined"],
    ["activation", "Activación autorizada por los propietarios (producto pausado hasta entonces)", "Activation authorized by owners (product paused until then)"]],
  other: [["deliverables", "Entregables definidos", "Deliverables defined"], ["acceptance", "Criterios de aceptación observables", "Observable acceptance criteria"]],
};

export function checklistFor(product: ProductType): ChecklistItem[] {
  return [...COMMON, ...BY_PRODUCT[product]].map(([key, es, en]) => ({ key, label: [es, en], done: false, done_by: null, done_at: null }));
}

/** Tolerant reader for stored checklists (jsonb); unknown shapes are dropped, never trusted. */
export function readChecklist(v: unknown): ChecklistItem[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap(x => {
    const o = x as Record<string, unknown>;
    if (!o || typeof o.key !== "string" || !Array.isArray(o.label) || typeof o.label[0] !== "string" || typeof o.label[1] !== "string") return [];
    return [{ key: o.key.slice(0, 60), label: [o.label[0].slice(0, 200), o.label[1].slice(0, 200)] as [string, string], done: o.done === true,
      done_by: typeof o.done_by === "string" ? o.done_by : null, done_at: typeof o.done_at === "string" ? o.done_at : null }];
  }).slice(0, 60);
}

export function toggleItem(list: ChecklistItem[], key: string, done: boolean, by: string, at: string): ChecklistItem[] {
  if (!list.some(i => i.key === key)) throw Error("onboarding_checklist_unknown");
  return list.map(i => i.key !== key ? i : { ...i, done, done_by: done ? by : null, done_at: done ? at : null });
}

export const progress = (list: ChecklistItem[]) => ({ done: list.filter(i => i.done).length, total: list.length });

/** Map an existing os_projects module to the onboarding product type (stable mapping, no name matching). */
export function productTypeForModule(module: string | null | undefined): ProductType {
  return module === "website" ? "website" : module === "ecommerce" ? "ecommerce" : module === "crm_creator" ? "crm"
    : module === "marketing" ? "marketing" : module === "receptionist" || module === "chatbots" ? "ai_tools" : "other";
}

export type DeliveryFacts = { checklist: ChecklistItem[]; qaPassed: boolean; liveUrl: string; manualIssued: boolean; contractLinked: boolean; deliveredTo: string };
/** Delivery gate: every failing reason is listed; nothing passes by default. */
export function deliveryBlockers(f: DeliveryFacts): string[] {
  const out: string[] = [];
  const pr = progress(f.checklist);
  if (pr.total === 0 || pr.done < pr.total) out.push("checklist_incomplete");
  if (!f.qaPassed) out.push("qa_not_passed");
  if (!/^https:\/\/\S{3,}$/.test(f.liveUrl)) out.push("live_url_missing");
  if (!f.manualIssued) out.push("manual_missing");
  if (!f.contractLinked) out.push("contract_missing");
  if (f.deliveredTo.trim().length < 2) out.push("recipient_missing");
  return out;
}
export const BLOCKER_LABEL: Record<string, [string, string]> = {
  checklist_incomplete: ["Checklist incompleto", "Checklist incomplete"], qa_not_passed: ["QA no aprobado", "QA not passed"],
  live_url_missing: ["Falta la URL real (https)", "Real URL (https) missing"], manual_missing: ["Falta el manual del producto", "Product manual missing"],
  contract_missing: ["Sin contrato o borrador vinculado al cliente", "No agreement or draft linked to the client"], recipient_missing: ["Falta el receptor de la entrega", "Delivery recipient missing"],
};

/** Allowed forward/back moves; delivered/support/closed are reached through the delivery action, never by a plain jump. */
export function canMove(from: Stage, to: Stage): boolean {
  if (from === to) return false;
  if (to === "delivered") return false; // only via recordDelivery (needs the gate)
  if (to === "welcome_sent") return false; // only when a welcome e-mail is actually sent (provider id or recorded evidence)
  if (from === "closed") return false;
  const a = STAGES.indexOf(from), b = STAGES.indexOf(to);
  if (to === "support" || to === "closed") return a >= STAGES.indexOf("delivered");
  // A welcome e-mail is recommended, not mandatory: approved → kickoff may skip it (the record shows it was not sent).
  if (from === "approved" && to === "kickoff") return true;
  return Math.abs(a - b) === 1 || (b < a && b < STAGES.indexOf("delivered"));
}
