/**
 * Service-specific quote configurators on top of one common quote engine (QuoteContent/QuoteLine in model.ts).
 * Each service asks only what matters for its scope; complex fields live under "advanced". The configurator writes
 * scope/deliverables/exclusions text and proposes a line. It NEVER invents a price: the unit price comes only from an
 * approved crm_service_catalog price, or is left empty for the owner to fill. External spend (ads, licences, usage) is
 * written to third-party costs, never to Avalon's lines.
 */
export type Bi = readonly [string, string];
export type Question = {
  key: string;
  label: Bi;
  type: "number" | "text" | "select" | "boolean";
  options?: readonly { value: string; label: Bi }[];
  advanced?: boolean;
  /** External/third-party amount (ad spend, licences): goes to third-party costs, not to Avalon's price. */
  external?: boolean;
  max?: number;
};
export type ServiceKind = "one_time" | "monthly";
export type ServiceConfigurator = {
  id: string;
  label: Bi;
  group: "web" | "crm" | "google" | "marketing" | "ai" | "automation" | "special";
  /** Approved catalog codes this service maps to, if present in crm_service_catalog. */
  catalogCodes: readonly string[];
  kind: ServiceKind;
  questions: readonly Question[];
  /** Fixed exclusions that always apply (owners can edit the text afterwards). */
  exclusions: Bi;
  /** Uses the provider usage estimator (receptionist/chatbot). */
  estimator?: "receptionist" | "chatbot";
};

const yesNo = [{ value: "yes", label: ["Sí", "Yes"] as Bi }, { value: "no", label: ["No", "No"] as Bi }];
const n = (key: string, es: string, en: string, extra: Partial<Question> = {}): Question => ({ key, label: [es, en], type: "number", ...extra });
const tx = (key: string, es: string, en: string, extra: Partial<Question> = {}): Question => ({ key, label: [es, en], type: "text", ...extra });
const sel = (key: string, es: string, en: string, options: readonly { value: string; label: Bi }[], extra: Partial<Question> = {}): Question => ({ key, label: [es, en], type: "select", options, ...extra });
const opt = (value: string, es: string, en: string) => ({ value, label: [es, en] as Bi });

const GOOGLE_EXCL: Bi = ["Licencias, inversión publicitaria y consumo de APIs de Google se pagan directamente a Google y no forman parte del precio de Avalon.", "Google licences, ad spend and API usage are paid directly to Google and are not part of Avalon's price."];

export const SERVICE_CONFIGURATORS: readonly ServiceConfigurator[] = [
  { id: "website", label: ["Sitio web", "Website"], group: "web", catalogCodes: ["desarrollo-web"], kind: "one_time",
    questions: [n("pages", "Número de páginas", "Number of pages", { max: 500 }), sel("content", "Contenido", "Content", [opt("client", "Lo aporta el cliente", "Client provides"), opt("avalon", "Lo redacta Avalon", "Avalon writes"), opt("mixed", "Mixto", "Mixed")]),
      n("languages", "Idiomas", "Languages", { max: 10 }), tx("integrations", "Integraciones (formularios, reservas, CRM…)", "Integrations (forms, bookings, CRM…)"),
      sel("domain", "Dominio", "Domain", [opt("existing", "Existente del cliente", "Client's existing"), opt("new", "Nuevo (a nombre del cliente)", "New (in the client's name)")], { advanced: true }),
      sel("hosting", "Hosting", "Hosting", [opt("avalon", "Gestionado por Avalon", "Managed by Avalon"), opt("client", "Del cliente", "Client's own")], { advanced: true }),
      n("revisions", "Rondas de revisión", "Revision rounds", { advanced: true, max: 10 }), sel("maintenance", "Mantenimiento mensual", "Monthly maintenance", yesNo, { advanced: true })],
    exclusions: ["Dominio, hosting de terceros, licencias de plantillas o plugins y fotografía profesional se presupuestan aparte.", "Domain, third-party hosting, theme/plugin licences and professional photography are quoted separately."] },
  { id: "ecommerce", label: ["E-commerce / Shopify", "E-commerce / Shopify"], group: "web", catalogCodes: ["tienda-online"], kind: "one_time",
    questions: [sel("platform", "Plataforma", "Platform", [opt("shopify", "Shopify", "Shopify"), opt("woocommerce", "WooCommerce", "WooCommerce"), opt("other", "Otra", "Other")]),
      n("products", "Productos", "Products", { max: 100000 }), n("variants", "Variantes por producto (promedio)", "Variants per product (avg.)", { max: 100 }),
      tx("payments", "Pasarelas de pago", "Payment gateways"), tx("shipping", "Envíos y zonas", "Shipping and zones"),
      sel("taxes", "Configuración de impuestos", "Tax setup", yesNo, { advanced: true }), sel("catalogLoad", "Carga de catálogo por Avalon", "Catalog upload by Avalon", yesNo, { advanced: true }),
      tx("support", "Soporte posterior", "Post-launch support", { advanced: true })],
    exclusions: ["Suscripción de la plataforma, apps de pago, comisiones de pasarela y costos de envío los paga el cliente al proveedor.", "Platform subscription, paid apps, gateway fees and shipping costs are paid by the client to the provider."] },
  { id: "crm", label: ["CRM personalizado", "Custom CRM"], group: "crm", catalogCodes: ["crm-personalizado"], kind: "one_time",
    questions: [n("users", "Usuarios", "Users", { max: 1000 }), n("pipelines", "Pipelines", "Pipelines", { max: 50 }), tx("modules", "Módulos (ventas, tareas, facturas…)", "Modules (sales, tasks, invoices…)"),
      tx("permissions", "Roles y permisos", "Roles and permissions"), tx("integrations", "Integraciones", "Integrations", { advanced: true }),
      sel("migration", "Migración de datos existentes", "Existing data migration", yesNo, { advanced: true }), tx("support", "Soporte y formación", "Support and training", { advanced: true })],
    exclusions: ["Licencias de software de terceros y limpieza de datos de origen no incluidas salvo que se indique.", "Third-party software licences and source data cleanup are not included unless stated."] },
  { id: "gbp", label: ["Google Business Profile", "Google Business Profile"], group: "google", catalogCodes: [], kind: "one_time",
    questions: [n("locations", "Ubicaciones", "Locations", { max: 200 }), sel("verification", "Verificación pendiente", "Verification pending", yesNo), sel("posts", "Publicaciones mensuales", "Monthly posts", yesNo, { advanced: true }), sel("reviews", "Gestión de reseñas", "Review management", yesNo, { advanced: true })],
    exclusions: GOOGLE_EXCL },
  { id: "google_ads", label: ["Google Ads", "Google Ads"], group: "google", catalogCodes: [], kind: "monthly",
    questions: [n("adSpend", "Inversión publicitaria mensual (USD, la paga el cliente a Google)", "Monthly ad spend (USD, paid by the client to Google)", { external: true }), n("campaigns", "Campañas", "Campaigns", { max: 100 }),
      tx("goals", "Conversiones a medir", "Conversions to track"), sel("reporting", "Informe", "Reporting", [opt("monthly", "Mensual", "Monthly"), opt("biweekly", "Quincenal", "Biweekly")], { advanced: true })],
    exclusions: GOOGLE_EXCL },
  { id: "ga4", label: ["Google Analytics 4", "Google Analytics 4"], group: "google", catalogCodes: [], kind: "one_time",
    questions: [n("properties", "Propiedades", "Properties", { max: 50 }), tx("events", "Eventos y conversiones", "Events and conversions"), sel("consent", "Modo de consentimiento", "Consent mode", yesNo, { advanced: true })], exclusions: GOOGLE_EXCL },
  { id: "search_console", label: ["Search Console", "Search Console"], group: "google", catalogCodes: [], kind: "one_time",
    questions: [n("sites", "Sitios", "Sites", { max: 50 }), sel("sitemaps", "Sitemaps e indexación", "Sitemaps and indexing", yesNo)], exclusions: GOOGLE_EXCL },
  { id: "gtm", label: ["Tag Manager", "Tag Manager"], group: "google", catalogCodes: [], kind: "one_time",
    questions: [n("tags", "Etiquetas", "Tags", { max: 500 }), tx("platforms", "Plataformas (GA4, Ads, Meta…)", "Platforms (GA4, Ads, Meta…)")], exclusions: GOOGLE_EXCL },
  { id: "merchant_center", label: ["Merchant Center", "Merchant Center"], group: "google", catalogCodes: [], kind: "one_time",
    questions: [n("products", "Productos en el feed", "Products in feed", { max: 100000 }), sel("feed", "Origen del feed", "Feed source", [opt("platform", "Plataforma de tienda", "Store platform"), opt("sheet", "Hoja de cálculo", "Spreadsheet")])], exclusions: GOOGLE_EXCL },
  { id: "workspace", label: ["Google Workspace", "Google Workspace"], group: "google", catalogCodes: [], kind: "one_time",
    questions: [n("seats", "Usuarios (licencias que paga el cliente a Google)", "Seats (licences paid by the client to Google)", { external: true, max: 10000 }), sel("migration", "Migración de correo", "E-mail migration", yesNo), sel("dns", "Configuración DNS (MX, SPF, DKIM)", "DNS setup (MX, SPF, DKIM)", yesNo, { advanced: true })], exclusions: GOOGLE_EXCL },
  { id: "maps_platform", label: ["Google Maps Platform", "Google Maps Platform"], group: "google", catalogCodes: [], kind: "one_time",
    questions: [tx("apis", "APIs (mapas, rutas, lugares)", "APIs (maps, routes, places)"), n("monthlyRequests", "Solicitudes mensuales estimadas (consumo que paga el cliente)", "Estimated monthly requests (usage paid by the client)", { external: true })], exclusions: GOOGLE_EXCL },
  { id: "meta_marketing", label: ["Meta Ads y marketing", "Meta Ads and marketing"], group: "marketing", catalogCodes: ["marketing-mensual"], kind: "monthly",
    questions: [n("adSpend", "Inversión publicitaria mensual (USD, la paga el cliente a Meta)", "Monthly ad spend (USD, paid by the client to Meta)", { external: true }), tx("channels", "Canales", "Channels"),
      n("posts", "Publicaciones al mes", "Posts per month", { max: 200 }), tx("deliverables", "Entregables (creativos, reels…)", "Deliverables (creatives, reels…)"), sel("reporting", "Informe mensual", "Monthly report", yesNo, { advanced: true })],
    exclusions: ["La inversión publicitaria se paga directamente a la plataforma; no es ingreso de Avalon.", "Ad spend is paid directly to the platform; it is not Avalon revenue."] },
  { id: "local_seo", label: ["SEO local", "Local SEO"], group: "marketing", catalogCodes: [], kind: "monthly",
    questions: [n("locations", "Ubicaciones", "Locations", { max: 200 }), n("keywords", "Palabras clave objetivo", "Target keywords", { max: 500 }), n("citations", "Citas/directorios al mes", "Citations/directories per month", { advanced: true, max: 200 })],
    exclusions: ["No se garantizan posiciones concretas en buscadores.", "Specific search rankings are not guaranteed."] },
  { id: "funnels", label: ["Funnels", "Funnels"], group: "marketing", catalogCodes: ["generacion-leads"], kind: "one_time",
    questions: [n("steps", "Pasos del funnel", "Funnel steps", { max: 20 }), n("landings", "Landing pages", "Landing pages", { max: 50 }), n("forms", "Formularios", "Forms", { max: 50 }),
      tx("tracking", "Medición (eventos, píxeles)", "Tracking (events, pixels)"), n("monthlyVolume", "Volumen mensual esperado de leads", "Expected monthly lead volume", { advanced: true })],
    exclusions: ["Herramientas de terceros (email, SMS, landing builders) se pagan aparte.", "Third-party tools (e-mail, SMS, landing builders) are paid separately."] },
  { id: "chatbot", label: ["Chatbot IA", "AI Chatbot"], group: "ai", catalogCodes: [], kind: "one_time", estimator: "chatbot",
    questions: [tx("useCases", "Casos de uso", "Use cases"), tx("channels", "Canales", "Channels"), tx("knowledge", "Documentos y base de conocimiento", "Documents and knowledge base"),
      tx("integrations", "Integraciones", "Integrations", { advanced: true }), tx("support", "Soporte y mantenimiento", "Support and maintenance", { advanced: true })],
    exclusions: ["El consumo del proveedor de IA (tokens, plataforma, canales) se estima aparte y lo paga el cliente; no se activa ningún chatbot durante la cotización.", "AI provider usage (tokens, platform, channels) is estimated separately and paid by the client; no chatbot is activated while quoting."] },
  { id: "receptionist", label: ["Recepcionista IA", "AI Receptionist"], group: "ai", catalogCodes: ["recepcionista-ia"], kind: "one_time", estimator: "receptionist",
    questions: [tx("hours", "Horario y días de servicio", "Service hours and days"), tx("flows", "Flujos (citas, preguntas, transferencias)", "Flows (bookings, FAQs, transfers)"),
      tx("languages", "Idiomas", "Languages"), tx("integrations", "Integraciones (calendario, CRM)", "Integrations (calendar, CRM)", { advanced: true })],
    exclusions: ["Telefonía, minutos de plataforma, voz y modelo de IA se estiman aparte y los paga el cliente; no se activa el recepcionista durante la cotización.", "Telephony, platform minutes, voice and AI model are estimated separately and paid by the client; the receptionist is not activated while quoting."] },
  { id: "automation", label: ["Automatizaciones e integraciones", "Automations and integrations"], group: "automation", catalogCodes: [], kind: "one_time",
    questions: [n("workflows", "Flujos", "Workflows", { max: 200 }), n("monthlyRuns", "Ejecuciones mensuales", "Monthly runs"), tx("systems", "Sistemas / APIs", "Systems / APIs"),
      tx("failures", "Gestión de fallos y reintentos", "Failure handling and retries", { advanced: true }), sel("maintenance", "Mantenimiento mensual", "Monthly maintenance", yesNo, { advanced: true })],
    exclusions: ["Planes de plataformas de automatización y costos de APIs de terceros los paga el cliente.", "Automation platform plans and third-party API costs are paid by the client."] },
  { id: "special", label: ["Servicio especial autorizado", "Authorized special service"], group: "special", catalogCodes: [], kind: "one_time",
    questions: [tx("description", "Descripción del servicio", "Service description"), tx("authorization", "Quién lo autorizó", "Who authorized it")],
    exclusions: ["Solo se cotiza con autorización explícita de los propietarios.", "Quoted only with explicit owner authorization."] },
];

export type Answers = Record<string, string>;
export type CatalogPrice = { code: string; name: string; suggested_price: string | null; billing_type?: string | null };

export function configuratorById(id: string) {
  return SERVICE_CONFIGURATORS.find(c => c.id === id) ?? null;
}

/** Human-readable scope from the answers (only answered questions). External amounts are kept apart. */
export function configureService(cfg: ServiceConfigurator, answers: Answers, lang: "es" | "en", catalog: readonly CatalogPrice[]) {
  const t = (b: Bi) => (lang === "es" ? b[0] : b[1]);
  const shown = cfg.questions.filter(q => (answers[q.key] ?? "").trim() !== "");
  const value = (q: Question) => {
    const raw = answers[q.key].trim();
    if (q.type === "select") return t(q.options?.find(o => o.value === raw)?.label ?? [raw, raw]);
    return raw.slice(0, 300);
  };
  const internal = shown.filter(q => !q.external), external = shown.filter(q => q.external);
  const scope = [`${t(cfg.label)}:`, ...internal.map(q => `- ${t(q.label)}: ${value(q)}`)].join("\n");
  const thirdParty = external.length ? [`${t(cfg.label)} · ${lang === "es" ? "costos de terceros pagados por el cliente" : "third-party costs paid by the client"}:`,
    ...external.map(q => `- ${t(q.label)}: ${value(q)}`)].join("\n") : "";
  // Price only from an approved catalog entry; otherwise empty (owner decides). Never a demo price.
  const item = cfg.catalogCodes.map(code => catalog.find(c => c.code === code)).find(Boolean) ?? null;
  const line = { code: item?.code ?? null, name: item?.name ?? t(cfg.label), description: scope.slice(0, 300), kind: cfg.kind,
    qty: 1, unitPrice: item?.suggested_price && /^\d+(\.\d{1,2})?$/.test(item.suggested_price) ? item.suggested_price : "" };
  return { scope, thirdParty, exclusions: t(cfg.exclusions), line, priceSource: item?.suggested_price ? "catalog" as const : "owner" as const };
}
