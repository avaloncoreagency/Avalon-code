// Avalon CRM Intelligence V2 — new industry question groups.
// All values are owner-entered facts, not independently verified certifications.
// IDs are stable and never reused for a different question. No external calls.
import type { L, Question, QuestionType, Section } from "./types";

const l = (es: string, en: string): L => ({ es, en });
const q = (id: string, type: QuestionType, es: string, en: string, extra: Partial<Question> = {}): Question =>
  ({ id, type, label: l(es, en), ...extra });
const opts = (...pairs: [string, string, string][]) => pairs.map(([value, es, en]) => ({ value, label: l(es, en) }));
const YES = (id: string) => ({ q: id, eq: true });
const verification = opts(
  ["owner_verified", "Verificado manualmente por un propietario", "Manually verified by an owner"],
  ["pending", "Pendiente de revisión", "Review pending"],
  ["invalid", "No válido o vencido", "Invalid or expired"],
  ["not_required", "El negocio indica que no aplica; revisar", "Business says not required; review"]
);

export const EXTRA_INDUSTRY_VERSIONS: Record<string, string> = {
  roofing: "roofing-1", fencing: "fencing-1", tattoo: "tattoo-1",
  landscaping: "landscaping-1", plumbing: "plumbing-1", cleaning: "cleaning-1",
  restaurant: "restaurant-1", electrical: "electrical-1",
  general_contractor: "general-contractor-1", other: "custom-1",
};

export const EXTRA_INDUSTRY_SECTIONS: Record<string, Section[]> = {
  roofing: [
    { id: "rf_scope", title: l("Roofing · Proyectos", "Roofing · Jobs"), questions: [
      q("rf_types", "multi", "Servicios de techos ofrecidos", "Roofing services offered", { required: true, options: opts(
        ["replacement", "Reemplazos", "Replacements"], ["repair", "Reparaciones", "Repairs"], ["inspection", "Inspecciones", "Inspections"],
        ["commercial", "Techos comerciales", "Commercial roofing"], ["waterproofing", "Impermeabilización", "Waterproofing"]) }),
      q("rf_materials", "multi", "Materiales con los que trabaja", "Materials worked with", { options: opts(
        ["shingle", "Shingle", "Shingle"], ["metal", "Metal", "Metal"], ["tile", "Teja", "Tile"], ["flat", "Techo plano", "Flat roof"], ["other", "Otros", "Other"]) }),
      q("rf_service_area", "long", "ZIP y condados atendidos", "ZIP codes and counties served"),
      q("rf_crew_count", "number", "Cuadrillas activas", "Active crews"),
      q("rf_extra_jobs_month", "number", "Obras adicionales que puede terminar al mes", "Additional roofing jobs that can finish per month"),
      q("rf_storm_dependency", "yesno", "¿La demanda depende de tormentas?", "Is demand driven by storms?"),
    ] },
    { id: "rf_economics", title: l("Roofing · Rentabilidad y cumplimiento", "Roofing · Economics and compliance"), questions: [
      q("rf_avg_ticket", "money", "Valor promedio de una obra", "Average project value"),
      q("rf_avg_profit", "money", "Beneficio bruto promedio por obra", "Average gross profit per project"),
      q("rf_ads_budget", "money", "Presupuesto mensual sostenible para anuncios", "Sustainable monthly advertising budget"),
      q("rf_license_status", "choice", "Estado de la licencia aplicable", "Applicable license status", { required: true, options: verification }),
      q("rf_insurance_verified", "yesno", "¿Se ha revisado el seguro vigente?", "Has current insurance been reviewed?"),
      q("rf_claims", "yesno", "¿Interviene en reclamaciones de seguro?", "Works with insurance claims?"),
      q("rf_claims_process", "long", "Quién gestiona las reclamaciones y con qué autorización", "Who handles claims and under what authority", { when: YES("rf_claims") }),
    ] },
  ],
  fencing: [
    { id: "fn_operation", title: l("Fencing · Instalación", "Fencing · Installation"), questions: [
      q("fn_fence_types", "multi", "Tipos de cerca", "Fence types", { required: true, options: opts(
        ["wood", "Madera", "Wood"], ["vinyl", "Vinilo", "Vinyl"], ["aluminum", "Aluminio", "Aluminum"],
        ["chainlink", "Chain-link", "Chain-link"], ["privacy", "Privacidad", "Privacy"], ["commercial", "Comercial", "Commercial"]) }),
      q("fn_gate_services", "yesno", "¿Instala portones y automatización?", "Installs gates and gate automation?"),
      q("fn_lead_time_days", "number", "Días hasta la instalación", "Days until installation"),
      q("fn_crews", "number", "Cuadrillas disponibles", "Available installation crews"),
      q("fn_extra_jobs_month", "number", "Instalaciones adicionales por mes", "Additional installations per month"),
      q("fn_service_zips", "long", "ZIP y municipios que atiende", "ZIP codes and municipalities served"),
    ] },
    { id: "fn_finance", title: l("Fencing · Precios y permisos", "Fencing · Pricing and permits"), questions: [
      q("fn_price_ft", "money", "Precio promedio por pie lineal", "Average price per linear foot"),
      q("fn_cost_ft", "money", "Costo directo promedio por pie lineal", "Average direct cost per linear foot"),
      q("fn_avg_profit", "money", "Beneficio bruto promedio por instalación", "Average gross profit per installation"),
      q("fn_ads_budget", "money", "Presupuesto publicitario mensual sostenible", "Sustainable monthly ad budget"),
      q("fn_permit_status", "choice", "Estado de requisitos de permiso locales", "Local permit requirement status", { options: verification }),
      q("fn_quote_followup", "yesno", "¿Hace seguimiento de cotizaciones sin respuesta?", "Follows up on unanswered estimates?"),
    ] },
  ],
  tattoo: [
    { id: "tt_studio", title: l("Tattoo · Estudio y agenda", "Tattoo · Studio and bookings"), questions: [
      q("tt_artists", "number", "Artistas activos", "Active artists", { required: true }),
      q("tt_styles", "multi", "Especialidades", "Specialties", { options: opts(
        ["fine_line", "Fine line", "Fine line"], ["realism", "Realismo", "Realism"], ["traditional", "Tradicional", "Traditional"],
        ["blackwork", "Blackwork", "Blackwork"], ["coverups", "Cover-ups", "Cover-ups"], ["piercing", "Piercing", "Piercing"]) }),
      q("tt_booking", "choice", "Sistema de reservas", "Booking method", { options: opts(
        ["walkin", "Sin cita", "Walk-in"], ["messages", "Mensajes directos", "Direct messages"], ["calendar", "Agenda digital", "Digital calendar"]) }),
      q("tt_deposit", "yesno", "¿Cobra depósito para reservar?", "Requires a booking deposit?"),
      q("tt_no_show_pct", "percent", "Porcentaje aproximado de no-shows", "Approximate no-show rate"),
      q("tt_extra_sessions_month", "number", "Sesiones adicionales disponibles al mes", "Extra sessions available per month"),
      q("tt_portfolio", "yesno", "¿Cuenta con portafolio autorizado para publicar?", "Has an approved portfolio for publication?"),
    ] },
    { id: "tt_compliance", title: l("Tattoo · Ingresos y seguridad", "Tattoo · Revenue and safety"), questions: [
      q("tt_avg_ticket", "money", "Ticket promedio por sesión", "Average ticket per session"),
      q("tt_avg_profit", "money", "Beneficio bruto promedio por sesión", "Average gross profit per session"),
      q("tt_ads_budget", "money", "Presupuesto mensual para marketing", "Monthly marketing budget"),
      q("tt_permit_status", "choice", "Permisos sanitarios y del estudio aplicables", "Applicable health/studio permits", { required: true, options: verification }),
      q("tt_age_consent", "yesno", "¿Verifica edad, identidad y consentimiento según corresponda?", "Verifies age, identity and consent as applicable?"),
      q("tt_hygiene", "yesno", "¿Dispone de protocolos documentados de higiene?", "Has documented hygiene protocols?"),
    ] },
  ],
  landscaping: [
    { id: "ls_services", title: l("Landscaping · Servicios y rutas", "Landscaping · Services and routes"), questions: [
      q("ls_services", "multi", "Servicios ofrecidos", "Services offered", { required: true, options: opts(
        ["mowing", "Corte y mantenimiento", "Mowing and maintenance"], ["design", "Diseño", "Design"], ["hardscape", "Hardscaping", "Hardscaping"],
        ["irrigation", "Riego", "Irrigation"], ["tree", "Árboles", "Tree services"], ["pesticides", "Aplicación de pesticidas", "Pesticide application"]) }),
      q("ls_recurring", "yesno", "¿Tiene contratos de mantenimiento recurrentes?", "Has recurring maintenance contracts?"),
      q("ls_route_zips", "long", "Zonas y rutas de servicio", "Service areas and routes"),
      q("ls_crews", "number", "Cuadrillas y vehículos disponibles", "Available crews and vehicles"),
      q("ls_extra_jobs_month", "number", "Clientes adicionales que puede atender al mes", "Additional clients serviceable per month"),
      q("ls_seasonality", "long", "Cambios de demanda por temporada", "Seasonal demand changes"),
    ] },
    { id: "ls_finance", title: l("Landscaping · Contratos y cumplimiento", "Landscaping · Contracts and compliance"), questions: [
      q("ls_avg_ticket", "money", "Ingreso promedio mensual por cliente", "Average monthly revenue per client"),
      q("ls_avg_profit", "money", "Beneficio bruto promedio por cliente/mes", "Average gross profit per client/month"),
      q("ls_ads_budget", "money", "Presupuesto mensual para anuncios", "Monthly ad budget"),
      q("ls_retention_months", "number", "Meses promedio de retención", "Average client retention in months"),
      q("ls_pesticide_status", "choice", "Licencia aplicable para pesticidas (si ofrece el servicio)", "License status for pesticide work (if offered)", {
        when: { q: "ls_services", includesAny: ["pesticides"] }, options: verification }),
      q("ls_insurance", "yesno", "¿Dispone de cobertura de seguro apropiada?", "Has appropriate insurance coverage?"),
    ] },
  ],
  plumbing: [
    { id: "pl_operation", title: l("Plumbing · Trabajos y atención", "Plumbing · Jobs and response"), questions: [
      q("pl_services", "multi", "Trabajos ofrecidos", "Work offered", { required: true, options: opts(
        ["emergency", "Emergencias", "Emergency"], ["repairs", "Reparaciones", "Repairs"], ["install", "Instalaciones", "Installations"],
        ["drain", "Destape y drenajes", "Drain cleaning"], ["commercial", "Comercial", "Commercial"]) }),
      q("pl_24h", "yesno", "¿Atiende emergencias fuera de horario?", "Handles after-hours emergencies?"),
      q("pl_response_mins", "number", "Tiempo de respuesta aproximado en minutos", "Approximate response time in minutes", { when: YES("pl_24h") }),
      q("pl_techs", "number", "Técnicos y vehículos de servicio", "Technicians and service vehicles"),
      q("pl_extra_jobs_month", "number", "Trabajos adicionales posibles por mes", "Additional jobs possible per month"),
      q("pl_quote_backlog", "number", "Cotizaciones pendientes de seguimiento", "Quotes awaiting follow-up"),
    ] },
    { id: "pl_economics", title: l("Plumbing · Economía y licencias", "Plumbing · Economics and licensing"), questions: [
      q("pl_avg_ticket", "money", "Ticket promedio por trabajo", "Average invoice per job"),
      q("pl_avg_profit", "money", "Beneficio bruto promedio por trabajo", "Average gross profit per job"),
      q("pl_ads_budget", "money", "Presupuesto mensual para anuncios", "Monthly ad budget"),
      q("pl_license_status", "choice", "Estado de licencia aplicable", "Applicable license status", { required: true, options: verification }),
      q("pl_insurance", "yesno", "¿Seguro y responsabilidades revisados?", "Insurance and liability coverage reviewed?"),
      q("pl_permits", "yesno", "¿Gestiona permisos cuando se requieren?", "Obtains permits when required?"),
    ] },
  ],
  cleaning: [
    { id: "cl_services", title: l("Cleaning · Servicios y personal", "Cleaning · Services and staffing"), questions: [
      q("cl_clients", "multi", "Segmentos atendidos", "Customer segments", { required: true, options: opts(
        ["homes", "Casas", "Homes"], ["offices", "Oficinas", "Offices"], ["short_term", "Alquiler vacacional", "Short-term rental"],
        ["construction", "Post-construcción", "Post-construction"], ["medical", "Instalaciones médicas", "Medical facilities"]) }),
      q("cl_recurring", "yesno", "¿Ofrece contratos recurrentes?", "Offers recurring contracts?"),
      q("cl_teams", "number", "Equipos de limpieza disponibles", "Available cleaning teams"),
      q("cl_extra_jobs_month", "number", "Servicios adicionales disponibles al mes", "Extra appointments available per month"),
      q("cl_zips", "long", "ZIP y zonas atendidas", "Service ZIP codes and areas"),
      q("cl_booking", "choice", "Método para agendar", "Booking method", { options: opts(
        ["manual", "Manual", "Manual"], ["online", "Online", "Online"], ["none", "No hay agenda", "No booking process"]) }),
    ] },
    { id: "cl_finance", title: l("Cleaning · Márgenes y calidad", "Cleaning · Margins and quality"), questions: [
      q("cl_avg_ticket", "money", "Ingreso promedio por servicio", "Average revenue per cleaning"),
      q("cl_avg_profit", "money", "Beneficio bruto promedio por servicio", "Average gross profit per cleaning"),
      q("cl_ads_budget", "money", "Presupuesto mensual de captación", "Monthly acquisition budget"),
      q("cl_cancellation_pct", "percent", "Cancelaciones y ausencias (%)", "Cancellations and no-shows (%)"),
      q("cl_insured", "yesno", "¿Seguro y fianza apropiados al servicio?", "Appropriate insurance and bonding?"),
      q("cl_quality", "long", "Cómo controla calidad y reclamaciones", "How quality and complaints are managed"),
    ] },
  ],
  restaurant: [
    { id: "rs_service", title: l("Restaurante · Operación y demanda", "Restaurant · Operations and demand"), questions: [
      q("rs_modes", "multi", "Canales de venta", "Sales channels", { required: true, options: opts(
        ["dinein", "Salón", "Dine-in"], ["takeout", "Para llevar", "Takeout"], ["delivery", "Delivery", "Delivery"],
        ["catering", "Catering", "Catering"], ["events", "Eventos", "Events"]) }),
      q("rs_seats", "number", "Capacidad de asientos", "Seating capacity", { when: { q: "rs_modes", includesAny: ["dinein"] } }),
      q("rs_has_reservations", "yesno", "¿Acepta reservas?", "Accepts reservations?", { when: { q: "rs_modes", includesAny: ["dinein"] } }),
      q("rs_order_online", "yesno", "¿Recibe pedidos directos en línea?", "Accepts direct online orders?"),
      q("rs_extras_month", "number", "Pedidos o comensales adicionales posibles al mes", "Extra orders or diners possible per month"),
      q("rs_slow_periods", "long", "Horarios y días de menor demanda", "Slow days and hours"),
      q("rs_delivery_fees", "percent", "Comisión de plataformas de delivery (%)", "Delivery platform fee (%)", { when: { q: "rs_modes", includesAny: ["delivery"] } }),
    ] },
    { id: "rs_finance", title: l("Restaurante · Márgenes y permisos", "Restaurant · Margins and permits"), questions: [
      q("rs_avg_ticket", "money", "Ticket promedio por orden", "Average order value"),
      q("rs_avg_profit", "money", "Beneficio bruto promedio por orden", "Average gross profit per order"),
      q("rs_food_cost", "percent", "Costo de alimentos como % de ventas", "Food cost as % of sales"),
      q("rs_ads_budget", "money", "Presupuesto mensual sostenible para marketing", "Sustainable monthly marketing budget"),
      q("rs_permit_status", "choice", "Estado de los permisos sanitarios aplicables", "Applicable food/health permit status", { required: true, options: verification }),
      q("rs_allergen_process", "yesno", "¿Gestiona información de alérgenos?", "Has an allergen-information process?"),
    ] },
  ],
  electrical: [
    { id: "el_services", title: l("Electrical · Proyectos y respuesta", "Electrical · Projects and response"), questions: [
      q("el_jobs", "multi", "Tipos de trabajo", "Job types", { required: true, options: opts(
        ["residential", "Residencial", "Residential"], ["commercial", "Comercial", "Commercial"], ["panels", "Paneles y breakers", "Panels and breakers"],
        ["rewiring", "Cableado", "Rewiring"], ["ev", "Cargadores EV", "EV chargers"], ["emergency", "Emergencias", "Emergencies"]) }),
      q("el_techs", "number", "Electricistas / cuadrillas disponibles", "Available electricians / crews"),
      q("el_extra_jobs_month", "number", "Trabajos adicionales que puede completar al mes", "Extra jobs that can be completed per month"),
      q("el_service_area", "long", "Condados y ZIP atendidos", "Counties and ZIP codes served"),
      q("el_emergency", "yesno", "¿Atiende emergencias?", "Takes emergency jobs?"),
      q("el_quote_backlog", "number", "Cotizaciones sin seguimiento", "Estimates with no follow-up"),
    ] },
    { id: "el_compliance", title: l("Electrical · Ingresos y permisos", "Electrical · Revenue and permits"), questions: [
      q("el_avg_ticket", "money", "Ticket promedio", "Average job value"),
      q("el_avg_profit", "money", "Beneficio bruto promedio por trabajo", "Average gross profit per job"),
      q("el_ads_budget", "money", "Presupuesto mensual para anuncios", "Monthly ads budget"),
      q("el_license_status", "choice", "Estado de la licencia correspondiente", "Applicable license status", { required: true, options: verification }),
      q("el_insurance", "yesno", "¿Cobertura y responsabilidades verificadas?", "Insurance and liability coverage verified?"),
      q("el_permits", "yesno", "¿Obtiene permisos e inspecciones cuando aplican?", "Obtains permits and inspections when applicable?"),
    ] },
  ],
  general_contractor: [
    { id: "gc_projects", title: l("Contratista general · Proyectos", "General contractor · Projects"), questions: [
      q("gc_types", "multi", "Especialidades", "Specialties", { required: true, options: opts(
        ["remodel", "Remodelaciones", "Remodeling"], ["new_build", "Construcción nueva", "New construction"],
        ["commercial", "Comercial", "Commercial"], ["additions", "Ampliaciones", "Additions"],
        ["restoration", "Restauración", "Restoration"]) }),
      q("gc_subs", "number", "Subcontratistas o cuadrillas disponibles", "Available subcontractors or crews"),
      q("gc_extra_jobs_month", "number", "Proyectos adicionales que puede iniciar al mes", "Extra projects that can start per month"),
      q("gc_backlog", "number", "Proyectos actualmente en ejecución", "Projects currently in progress"),
      q("gc_zips", "long", "Zonas de servicio", "Service areas"),
      q("gc_change_orders", "yesno", "¿Documenta cambios de alcance y precio?", "Documents scope and price changes?"),
    ] },
    { id: "gc_finance", title: l("Contratista general · Rentabilidad y riesgos", "General contractor · Profit and risk"), questions: [
      q("gc_avg_ticket", "money", "Valor promedio de contrato", "Average contract value"),
      q("gc_avg_profit", "money", "Beneficio bruto promedio por proyecto", "Average gross profit per project"),
      q("gc_ads_budget", "money", "Presupuesto mensual sostenible de marketing", "Sustainable monthly marketing budget"),
      q("gc_license_status", "choice", "Estado de licencia aplicable", "Applicable license status", { required: true, options: verification }),
      q("gc_sub_insurance", "yesno", "¿Verifica seguros de subcontratistas?", "Verifies subcontractor insurance?"),
      q("gc_permits", "yesno", "¿Documenta permisos e inspecciones necesarios?", "Documents required permits and inspections?"),
      q("gc_payment_schedule", "long", "Cómo se acuerdan hitos y pagos", "How milestones and payments are agreed"),
    ] },
  ],
  other: [
    { id: "ot_model", title: l("Industria personalizada · Modelo de negocio", "Custom industry · Business model"), questions: [
      q("ot_industry_name", "text", "Nombre de la industria", "Industry name", { required: true }),
      q("ot_services", "long", "Productos o servicios concretos", "Specific products or services", { required: true }),
      q("ot_customer", "choice", "Cliente principal", "Primary customer", { options: opts(
        ["b2c", "Consumidor final", "Consumer"], ["b2b", "Otras empresas", "Other businesses"], ["mixed", "Ambos", "Both"]) }),
      q("ot_delivery", "choice", "Cómo entrega el servicio/producto", "How services/products are delivered", { options: opts(
        ["in_person", "Presencial", "In person"], ["remote", "Remoto", "Remote"], ["delivery", "Entrega a domicilio", "Delivery"], ["digital", "Digital", "Digital"]) }),
      q("ot_extra_jobs_month", "number", "Ventas o encargos adicionales posibles al mes", "Extra sales or orders possible per month"),
      q("ot_seasonality", "long", "Estacionalidad y limitaciones", "Seasonality and constraints"),
    ] },
    { id: "ot_finance", title: l("Industria personalizada · Economía y cumplimiento", "Custom industry · Economics and compliance"), questions: [
      q("ot_avg_ticket", "money", "Valor promedio de la venta", "Average sale value"),
      q("ot_avg_profit", "money", "Beneficio bruto promedio por venta", "Average gross profit per sale"),
      q("ot_ads_budget", "money", "Presupuesto mensual para marketing", "Monthly marketing budget"),
      q("ot_license_status", "choice", "Estado de permisos o licencias aplicables", "Applicable permits or licenses", { options: verification }),
      q("ot_restricted_ads", "yesno", "¿Sus productos o servicios podrían tener restricciones publicitarias?", "Could the products or services face advertising restrictions?"),
      q("ot_restriction_notes", "long", "Qué restricciones deben revisarse", "Restrictions requiring review", { when: YES("ot_restricted_ads") }),
      q("ot_consent_process", "yesno", "¿Obtiene consentimiento para comunicaciones comerciales?", "Obtains consent for marketing communications?"),
    ] },
  ],
};
