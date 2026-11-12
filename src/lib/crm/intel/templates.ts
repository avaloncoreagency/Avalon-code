import type { L, Question, QuestionType, Section, Template } from "./types";
import { INDUSTRIES } from "./industries";
import { EXTRA_INDUSTRY_SECTIONS, EXTRA_INDUSTRY_VERSIONS } from "./industry-specializations";

// Versioned questionnaire definitions. Bump a template version when questions change meaning; stored answers keep the
// version they were captured with. Never reuse a question id for a different meaning.
export const GENERAL_VERSION = "general-1";
const VERSIONS: Record<string, string> = { hvac: "hvac-fl-1", barber: "barber-1", smoke_shop: "smoke-1", ...EXTRA_INDUSTRY_VERSIONS };

const l = (es: string, en: string): L => ({ es, en });
const q = (id: string, type: QuestionType, es: string, en: string, extra: Partial<Question> = {}): Question =>
  ({ id, type, label: l(es, en), ...extra });
const opts = (...pairs: [string, string, string][]) => pairs.map(([value, es, en]) => ({ value, label: l(es, en) }));
const YES = (id: string) => ({ q: id, eq: true });

// ── General questionnaire (every industry) ────────────────────────────────────────────────────────────────────────
const GENERAL: Section[] = [
  { id: "g_situation", title: l("A. Situación comercial", "A. Business situation"), questions: [
    q("g_main_problem", "long", "¿Cuál es actualmente el mayor problema del negocio?", "What is the business's biggest problem right now?", { required: true }),
    q("g_goal_90d", "long", "¿Qué resultado quiere conseguir en los próximos 90 días?", "What result do they want in the next 90 days?", { required: true }),
    q("g_new_clients_month", "number", "Clientes nuevos al mes (actual)", "New customers per month (today)"),
    q("g_extra_clients_wanted", "number", "Clientes adicionales que desea al mes", "Additional customers wanted per month"),
    q("g_ideal_client", "long", "¿Cuál es su cliente ideal?", "Who is their ideal customer?"),
    q("g_top_services", "long", "¿Qué servicios generan mayor rentabilidad?", "Which services are most profitable?"),
  ] },
  { id: "g_profit", title: l("B. Rentabilidad", "B. Profitability"), questions: [
    q("g_avg_sale", "money", "Ingreso promedio por venta", "Average revenue per sale"),
    q("g_direct_costs", "money", "Costos directos por venta", "Direct costs per sale"),
    q("g_gross_profit", "money", "Beneficio bruto por venta", "Gross profit per sale", { help: l("Ingreso menos costos directos. Si no lo sabe, déjelo como «No sé».", "Revenue minus direct costs. Leave as “Unknown” if they don't know.") }),
    q("g_monthly_revenue", "money", "Facturación mensual (si desea compartirla)", "Monthly revenue (if they want to share it)", { allowNA: true }),
    q("g_recurring_pct", "percent", "% de ingresos de clientes recurrentes", "% of revenue from repeat customers"),
    q("g_cancellations", "yesno", "¿Hay cancelaciones o devoluciones frecuentes?", "Frequent cancellations or refunds?"),
    q("g_cancellations_detail", "long", "Detalle de cancelaciones", "Cancellation details", { when: YES("g_cancellations") }),
  ] },
  { id: "g_capacity", title: l("C. Capacidad", "C. Capacity"), questions: [
    q("g_extra_capacity", "number", "Clientes adicionales que puede atender al mes", "Additional customers they can serve per month", { required: true, help: l("0 = no puede atender más ahora.", "0 = cannot take more right now.") }),
    q("g_enough_staff", "yesno", "¿Tiene personal suficiente?", "Enough staff?"),
    q("g_constraints", "long", "Principales limitaciones operativas", "Main operational constraints"),
    q("g_onboard_time", "text", "Tiempo para atender a un cliente nuevo", "Time to serve a new customer"),
  ] },
  { id: "g_marketing", title: l("D. Marketing", "D. Marketing"), questions: [
    q("g_channels", "multi", "Canales que generan clientes hoy", "Channels bringing customers today", { options: opts(
      ["referrals", "Referidos", "Referrals"], ["google_search", "Google (búsqueda)", "Google search"], ["google_business", "Perfil de Google Business", "Google Business Profile"],
      ["meta", "Facebook / Instagram", "Facebook / Instagram"], ["lead_marketplaces", "Marketplaces de leads", "Lead marketplaces"], ["website", "Sitio web", "Website"],
      ["signage_walkins", "Letreros / pasantes", "Signage / walk-ins"], ["other", "Otro", "Other"]) }),
    q("g_active_campaigns", "yesno", "¿Tiene campañas activas?", "Active ad campaigns?"),
    q("g_ad_spend_month", "money", "Inversión publicitaria mensual actual", "Current monthly ad spend", { when: YES("g_active_campaigns") }),
    q("g_test_budget_90d", "money", "Presupuesto de pruebas para 90 días (sin depender de resultados inmediatos)", "90-day test budget (without relying on immediate results)"),
    q("g_close_rate", "percent", "% de oportunidades que se convierten en ventas", "% of opportunities that become sales"),
    q("g_follow_up", "choice", "¿Cómo hace el seguimiento?", "How do they follow up?", { options: opts(
      ["none", "No hay seguimiento", "No follow-up"], ["manual", "Manual (memoria, libreta, WhatsApp)", "Manual (memory, notebook, texts)"],
      ["crm", "Con un CRM", "With a CRM"], ["automated", "Automatizado", "Automated"]) }),
  ] },
  { id: "g_tech", title: l("E. Tecnología", "E. Technology"), questions: [
    q("g_has_website", "yesno", "¿Tiene página web?", "Has a website?"),
    q("g_website_url", "text", "Dirección del sitio", "Website address", { when: YES("g_has_website") }),
    q("g_uses_crm", "yesno", "¿Utiliza un CRM?", "Uses a CRM?"),
    q("g_has_booking", "yesno", "¿Tiene sistema de citas?", "Has a booking system?"),
    q("g_misses_calls", "yesno", "¿Pierde llamadas?", "Misses calls?"),
    q("g_missed_calls_pct", "percent", "% aproximado de llamadas perdidas", "Approx. % of calls missed", { when: YES("g_misses_calls") }),
    q("g_uses_automation", "yesno", "¿Utiliza automatizaciones?", "Uses automations?"),
    q("g_manual_processes", "long", "Procesos que hace a mano", "Processes done manually"),
  ] },
  { id: "g_decision", title: l("F. Decisión", "F. Decision"), questions: [
    q("g_decision_maker", "text", "¿Quién autoriza inversiones?", "Who approves investments?", { required: true }),
    q("g_start_when", "choice", "¿Cuándo desea comenzar?", "When do they want to start?", { options: opts(
      ["now", "Ya", "Now"], ["30d", "En 30 días", "Within 30 days"], ["90d", "En 90 días", "Within 90 days"], ["later", "Más adelante", "Later"], ["undecided", "No ha decidido", "Undecided"]) }),
    q("g_avalon_budget", "money", "Presupuesto mensual para servicios de Avalon (separado de publicidad)", "Monthly budget for Avalon services (separate from ad spend)"),
    q("g_accepts_tracking", "yesno", "¿Acepta colaborar con el seguimiento y la medición?", "Will they collaborate on tracking and measurement?"),
    q("g_shares_conversion_data", "yesno", "¿Dará la información necesaria para medir conversiones?", "Will they share the data needed to measure conversions?"),
  ] },
];

// ── HVAC (Florida) ───────────────────────────────────────────────────────────────────────────────────────────────
const HVAC: Section[] = [
  { id: "h_legal", title: l("HVAC · Legalidad y operación", "HVAC · Licensing and operation"),
    intro: l("En Florida, verificar la licencia en el portal público de DBPR (myfloridalicense.com). Avalon no la verifica automáticamente.", "In Florida, check the license on DBPR's public portal (myfloridalicense.com). Avalon does not verify it automatically."),
    questions: [
      q("h_license_type", "choice", "Tipo de licencia", "License type", { options: opts(
        ["cac", "Certified Class A (CAC)", "Certified Class A (CAC)"], ["cac_b", "Certified Class B", "Certified Class B"],
        ["registered", "Registrada (local)", "Registered (local)"], ["other", "Otra", "Other"], ["none", "Sin licencia", "No license"]) }),
      q("h_license_number", "text", "Número de licencia", "License number", { when: { q: "h_license_type", in: ["cac", "cac_b", "registered", "other"] } }),
      q("h_license_holder", "text", "Titular de la licencia", "License holder", { when: { q: "h_license_type", in: ["cac", "cac_b", "registered", "other"] } }),
      q("h_license_verified", "choice", "Verificación de licencia", "License verification", { required: true, options: opts(
        ["verified", "Verificada en DBPR por un propietario", "Verified on DBPR by an owner"], ["pending", "Pendiente de verificar", "Not verified yet"],
        ["invalid", "No válida / vencida", "Invalid / expired"]) }),
      q("h_insurance", "multi", "Seguros", "Insurance", { options: opts(
        ["general_liability", "Responsabilidad civil", "General liability"], ["workers_comp", "Workers' comp", "Workers' comp"], ["none", "Ninguno", "None"]) }),
      q("h_segments", "choice", "Clientes", "Customers", { required: true, options: opts(
        ["residential", "Residencial", "Residential"], ["commercial", "Comercial", "Commercial"], ["both", "Ambos", "Both"]) }),
      q("h_zips", "long", "Zonas y ZIP codes atendidos", "Areas and ZIP codes served"),
      q("h_emergency", "yesno", "¿Atiende emergencias?", "Takes emergency calls?"),
    ] },
  { id: "h_services", title: l("HVAC · Servicios", "HVAC · Services"), questions: [
    q("h_install", "yesno", "Instalación y reemplazo", "Installation and replacement", { required: true }),
    q("h_repairs", "yesno", "Reparaciones", "Repairs", { required: true }),
    q("h_maintenance", "yesno", "Mantenimiento", "Maintenance"),
    q("h_ductwork", "yesno", "Ductos (ductwork)", "Ductwork"),
    q("h_commercial_equipment", "yesno", "Equipos comerciales", "Commercial equipment"),
    q("h_high_margin", "long", "Servicios de mayor margen", "Highest-margin services"),
    q("h_no_promote", "long", "Servicios que NO quiere promocionar", "Services they do NOT want promoted"),
  ] },
  { id: "h_revenue", title: l("HVAC · Ingresos", "HVAC · Revenue"), questions: [
    q("h_install_price", "money", "Precio promedio por instalación", "Average installation price", { when: YES("h_install") }),
    q("h_equipment_cost", "money", "Costo del equipo", "Equipment cost", { when: YES("h_install") }),
    q("h_materials_cost", "money", "Costo de materiales", "Materials cost", { when: YES("h_install") }),
    q("h_labor_cost", "money", "Mano de obra", "Labor", { when: YES("h_install") }),
    q("h_permits_cost", "money", "Permisos y otros costos directos", "Permits and other direct costs", { when: YES("h_install") }),
    q("h_install_gp", "money", "Beneficio bruto estimado por instalación", "Estimated gross profit per installation", { when: YES("h_install"), help: l("Si se deja vacío y todos los costos son conocidos, Avalon lo calcula y lo muestra como cálculo, no como dato del cliente.", "If empty and every cost is known, Avalon computes it and shows it as a calculation, not as client data.") }),
    q("h_repair_price", "money", "Precio promedio por reparación", "Average repair price", { when: YES("h_repairs") }),
    q("h_repair_gp", "money", "Beneficio bruto por reparación", "Gross profit per repair", { when: YES("h_repairs") }),
    q("h_maint_ticket", "money", "Ticket promedio de mantenimiento", "Average maintenance ticket", { when: YES("h_maintenance") }),
    q("h_warranty_financing", "multi", "Garantías y financiamiento", "Warranties and financing", { options: opts(
      ["warranty", "Ofrece garantía", "Offers warranty"], ["financing", "Ofrece financiamiento", "Offers financing"], ["none", "Ninguno", "None"]) }),
  ] },
  { id: "h_capacity", title: l("HVAC · Capacidad", "HVAC · Capacity"), questions: [
    q("h_techs", "number", "Cantidad de técnicos", "Number of technicians", { required: true }),
    q("h_vehicles", "number", "Vehículos equipados", "Equipped vehicles"),
    q("h_installs_week", "number", "Instalaciones por semana (actual)", "Installations per week (today)", { when: YES("h_install") }),
    q("h_installs_extra", "number", "Instalaciones adicionales posibles por semana", "Additional installations possible per week", { when: YES("h_install") }),
    q("h_repairs_week", "number", "Reparaciones por semana (actual)", "Repairs per week (today)", { when: YES("h_repairs") }),
    q("h_repairs_extra", "number", "Reparaciones adicionales posibles por semana", "Additional repairs possible per week", { when: YES("h_repairs") }),
    q("h_first_visit_days", "number", "Días promedio hasta la primera visita", "Average days to first visit"),
    q("h_available_now", "yesno", "¿Puede aceptar trabajos nuevos ahora?", "Can take new jobs now?", { required: true }),
  ] },
  { id: "h_conversion", title: l("HVAC · Conversión", "HVAC · Conversion"), questions: [
    q("h_calls_month", "number", "Llamadas al mes", "Calls per month"),
    q("h_missed_calls", "number", "Llamadas perdidas al mes", "Missed calls per month"),
    q("h_quotes_month", "number", "Cotizaciones emitidas al mes", "Quotes issued per month"),
    q("h_jobs_closed", "number", "Trabajos cerrados al mes", "Jobs closed per month"),
    q("h_jobs_paid", "number", "Trabajos cobrados al mes", "Jobs paid per month"),
    q("h_response_minutes", "number", "Tiempo promedio de respuesta (minutos)", "Average response time (minutes)"),
    q("h_followup_owner", "text", "Responsable de seguimiento", "Who follows up"),
    q("h_quotes_no_followup", "number", "Cotizaciones pendientes sin seguimiento", "Open quotes with no follow-up"),
  ] },
  { id: "h_agreement", title: l("HVAC · Acuerdo con Avalon", "HVAC · Agreement with Avalon"),
    intro: l("Solo para preparar la propuesta. Las condiciones acordadas se registran en «Condiciones comerciales».", "Only to prepare the proposal. Agreed terms are recorded under “Commercial terms”."),
    questions: [
      q("h_ad_budget", "money", "Presupuesto publicitario mensual (gasto del cliente en la plataforma)", "Monthly ad budget (client's own platform spend)"),
      q("h_avalon_budget", "money", "Presupuesto mensual para la gestión de Avalon", "Monthly budget for Avalon's management"),
      q("h_payment_pref", "choice", "Preferencia de pago", "Payment preference", { options: opts(
        ["monthly", "Mensual", "Monthly"], ["commission", "Comisión", "Commission"], ["hybrid", "Híbrido", "Hybrid"]) }),
      q("h_commission_proposed", "percent", "Comisión que propone el cliente (%)", "Commission the client proposes (%)", { when: { q: "h_payment_pref", in: ["commission", "hybrid"] } }),
      q("h_commission_base", "choice", "Base de cálculo de la comisión", "Commission base", { when: { q: "h_payment_pref", in: ["commission", "hybrid"] }, options: opts(
        ["gross_revenue", "Ingreso bruto", "Gross revenue"], ["gross_profit", "Beneficio bruto", "Gross profit"], ["other", "Otra", "Other"]) }),
      q("h_can_report_sales", "yesno", "¿Puede reportar ventas atribuibles?", "Can report attributable sales?"),
      q("h_reconciliation", "choice", "Frecuencia de conciliación", "Reconciliation frequency", { options: opts(
        ["weekly", "Semanal", "Weekly"], ["biweekly", "Quincenal", "Biweekly"], ["monthly", "Mensual", "Monthly"]) }),
    ] },
];

// ── Barber / Barbershop ──────────────────────────────────────────────────────────────────────────────────────────
const BARBER: Section[] = [
  { id: "b_business", title: l("Barbería · Negocio", "Barber · Business"), questions: [
    q("b_type", "choice", "Tipo", "Type", { required: true, options: opts(["solo", "Barbero independiente", "Independent barber"], ["owner", "Propietario con equipo", "Owner with a team"]) }),
    q("b_stations", "number", "Número de estaciones", "Number of stations"),
    q("b_barbers", "number", "Número de barberos", "Number of barbers", { when: { q: "b_type", eq: "owner" } }),
    q("b_pay_model", "choice", "Modelo de pago", "Pay model", { when: { q: "b_type", eq: "owner" }, options: opts(
      ["chair_rent", "Alquiler de silla", "Chair rental"], ["commission", "Comisión", "Commission"], ["employees", "Empleados", "Employees"], ["mixed", "Mixto", "Mixed"]) }),
    q("b_new_client_revenue", "choice", "¿Quién recibe el ingreso de un cliente nuevo?", "Who receives a new customer's revenue?", { required: true, options: opts(
      ["shop", "El negocio", "The shop"], ["barber", "El barbero", "The barber"], ["split", "Se reparte", "Split"]) }),
  ] },
  { id: "b_sales", title: l("Barbería · Ventas", "Barber · Sales"), questions: [
    q("b_cut_price", "money", "Precio del corte", "Haircut price", { required: true }),
    q("b_beard_price", "money", "Precio de barba", "Beard price"),
    q("b_premium_price", "money", "Precio de servicios premium", "Premium services price"),
    q("b_top_services", "long", "Servicios más rentables", "Most profitable services"),
    q("b_avg_minutes", "number", "Duración promedio por cita (minutos)", "Average appointment length (minutes)"),
    q("b_shop_keep_pct", "percent", "% del servicio que conserva el negocio", "% of each service the business keeps"),
    q("b_repeat_weeks", "number", "Cada cuántas semanas vuelve un cliente", "How many weeks between repeat visits"),
  ] },
  { id: "b_capacity", title: l("Barbería · Capacidad", "Barber · Capacity"), questions: [
    q("b_slots_day", "number", "Citas disponibles por día", "Appointments available per day"),
    q("b_empty_days", "long", "Días y horarios vacíos", "Empty days and hours"),
    q("b_occupancy_pct", "percent", "Ocupación aproximada (%)", "Approximate occupancy (%)", { required: true }),
    q("b_no_show_pct", "percent", "Cancelaciones y no-shows (%)", "Cancellations and no-shows (%)"),
    q("b_booking_mode", "choice", "Reservas", "Bookings", { options: opts(["online", "Online", "Online"], ["walkin", "Sin cita (walk-in)", "Walk-in"], ["both", "Ambas", "Both"]) }),
    q("b_booking_software", "text", "Software de citas actual", "Current booking software", { when: { q: "b_booking_mode", in: ["online", "both"] } }),
  ] },
  { id: "b_marketing", title: l("Barbería · Marketing", "Barber · Marketing"), questions: [
    q("b_sources", "multi", "Procedencia de clientes nuevos", "Where new customers come from", { options: opts(
      ["walkins", "Pasantes", "Walk-ins"], ["referrals", "Referidos", "Referrals"], ["google", "Google", "Google"], ["instagram", "Instagram", "Instagram"],
      ["tiktok", "TikTok", "TikTok"], ["booking_app", "App de reservas", "Booking app"], ["other", "Otro", "Other"]) }),
    q("b_google_profile", "choice", "Presencia en Google", "Google presence", { options: opts(
      ["none", "No tiene perfil", "No profile"], ["unclaimed", "Perfil sin reclamar", "Unclaimed profile"], ["active", "Perfil activo", "Active profile"]) }),
    q("b_reviews", "number", "Número de reseñas", "Number of reviews", { when: { q: "b_google_profile", eq: "active" } }),
    q("b_rating", "rating", "Calificación promedio (0–5)", "Average rating (0–5)", { when: { q: "b_google_profile", eq: "active" } }),
    q("b_instagram", "yesno", "¿Instagram activo?", "Active Instagram?"),
    q("b_content", "choice", "Fotografías y contenido", "Photos and content", { options: opts(
      ["none", "No tiene", "None"], ["phone", "Del teléfono", "Phone photos"], ["professional", "Profesional", "Professional"]) }),
    q("b_reminders", "yesno", "¿Envía recordatorios de cita?", "Sends appointment reminders?"),
    q("b_loyalty", "yesno", "¿Programa de fidelización?", "Loyalty program?"),
    q("b_budget", "money", "Presupuesto mensual sostenible", "Sustainable monthly budget"),
  ] },
];

// ── Smoke Shop (special controls) ────────────────────────────────────────────────────────────────────────────────
const SMOKE: Section[] = [
  { id: "s_operation", title: l("Smoke Shop · Operación", "Smoke Shop · Operation"),
    intro: l("Tabaco, nicotina, vapes y productos similares tienen restricciones legales y publicitarias. Avalon no diseña mecanismos para eludir revisiones de plataformas.", "Tobacco, nicotine, vapes and similar products are legally and advertising-restricted. Avalon does not design ways around platform reviews."),
    questions: [
      q("s_stores", "number", "Cantidad de tiendas", "Number of stores", { required: true }),
      q("s_location", "text", "Ubicación", "Location"),
      q("s_permits", "multi", "Permisos", "Permits", { options: opts(
        ["tobacco_permit", "Permiso de venta de tabaco", "Tobacco retail permit"], ["sales_tax", "Registro de impuesto sobre ventas", "Sales tax registration"],
        ["local_business_tax", "Licencia local de negocio", "Local business tax receipt"], ["unknown", "No lo sabe", "Doesn't know"]) }),
      q("s_categories", "multi", "Categorías de productos", "Product categories", { required: true, options: opts(
        ["tobacco", "Tabaco", "Tobacco"], ["nicotine_vapes", "Vapes / nicotina", "Vapes / nicotine"], ["hemp_cbd", "Cáñamo / CBD", "Hemp / CBD"],
        ["kratom", "Kratom", "Kratom"], ["glass_accessories", "Vidrio y accesorios", "Glass and accessories"], ["apparel", "Ropa", "Apparel"],
        ["snacks_drinks", "Snacks y bebidas", "Snacks and drinks"], ["other", "Otros", "Other"]) }),
      q("s_age_verification", "choice", "Verificación de edad", "Age verification", { required: true, options: opts(
        ["id_scan", "Escaneo de identificación", "ID scanning"], ["visual", "Revisión visual de ID", "Visual ID check"], ["none", "No verifica", "No verification"]) }),
      q("s_restrictions", "long", "Restricciones de venta que aplica", "Sales restrictions applied"),
      q("s_compliance", "long", "Procedimientos de cumplimiento", "Compliance procedures"),
    ] },
  { id: "s_finance", title: l("Smoke Shop · Finanzas", "Smoke Shop · Finance"), questions: [
    q("s_avg_ticket", "money", "Ticket promedio", "Average ticket"),
    q("s_daily_sales", "money", "Ventas diarias aproximadas", "Approximate daily sales"),
    q("s_gross_margin_pct", "percent", "Margen bruto promedio (%)", "Average gross margin (%)"),
    q("s_margin_notes", "long", "Margen por categoría", "Margin by category"),
    q("s_slow_inventory", "yesno", "¿Inventario de lenta rotación?", "Slow-moving inventory?"),
    q("s_stockouts", "yesno", "¿Productos agotados con frecuencia?", "Frequent stock-outs?"),
    q("s_op_costs", "money", "Costos operativos mensuales", "Monthly operating costs"),
  ] },
  { id: "s_tech", title: l("Smoke Shop · Tecnología", "Smoke Shop · Technology"), questions: [
    q("s_pos", "text", "POS", "POS"),
    q("s_inventory_system", "choice", "Gestión de inventario", "Inventory management", { options: opts(
      ["none", "Ninguna", "None"], ["spreadsheet", "Hoja de cálculo", "Spreadsheet"], ["pos_module", "Módulo del POS", "POS module"], ["dedicated", "Sistema dedicado", "Dedicated system"]) }),
    q("s_reports", "yesno", "¿Tiene reportes de ventas?", "Has sales reports?"),
    q("s_has_website", "yesno", "¿Tiene sitio web?", "Has a website?"),
    q("s_catalog", "choice", "Catálogo en línea permitido", "Online catalog allowed", { options: opts(
      ["unknown", "Por revisar", "To be reviewed"], ["informational", "Solo informativo (sin venta en línea)", "Informational only (no online sales)"], ["none", "Ninguno", "None"]) }),
    q("s_customer_service", "text", "Sistemas de atención", "Customer service channels"),
    q("s_automation_need", "long", "Necesidades de automatización", "Automation needs"),
  ] },
  { id: "s_marketing", title: l("Smoke Shop · Marketing y restricciones", "Smoke Shop · Marketing and restrictions"), questions: [
    q("s_promotable", "multi", "Categorías potencialmente promocionables (sujetas a revisión)", "Potentially promotable categories (subject to review)", { options: opts(
      ["glass_accessories", "Vidrio y accesorios", "Glass and accessories"], ["apparel", "Ropa", "Apparel"], ["snacks_drinks", "Snacks y bebidas", "Snacks and drinks"], ["none", "Ninguna identificada", "None identified"]) }),
    q("s_platforms", "multi", "Plataformas que el cliente quiere usar", "Platforms the client wants to use", { options: opts(
      ["google_business", "Perfil de Google Business", "Google Business Profile"], ["organic_social", "Redes sociales orgánicas", "Organic social"],
      ["email_sms_consent", "Email/SMS con consentimiento", "Email/SMS with consent"], ["meta_ads", "Meta Ads", "Meta Ads"], ["google_ads", "Google Ads", "Google Ads"]) }),
    q("s_ad_restrictions_known", "yesno", "¿Conoce las restricciones publicitarias de su sector?", "Aware of their sector's ad restrictions?"),
    q("s_info_positioning", "long", "Necesidades de posicionamiento informativo", "Informational positioning needs"),
    q("s_budget", "money", "Presupuesto mensual", "Monthly budget"),
  ] },
];

const SPECIFIC: Record<string, Section[]> = { hvac: HVAC, barber: BARBER, smoke_shop: SMOKE, ...EXTRA_INDUSTRY_SECTIONS };

export function templateFor(industry: string): Template {
  const specific = SPECIFIC[industry];
  const specialized = !!specific && !!INDUSTRIES.find(i => i.key === industry)?.specialized;
  return {
    industry,
    version: specific ? `${GENERAL_VERSION}+${VERSIONS[industry]}` : GENERAL_VERSION,
    specialized,
    sections: specific ? [...GENERAL, ...specific] : GENERAL,
  };
}

export function findQuestion(t: Template, id: string): Question | undefined {
  for (const s of t.sections) for (const qq of s.questions) if (qq.id === id) return qq;
  return undefined;
}
