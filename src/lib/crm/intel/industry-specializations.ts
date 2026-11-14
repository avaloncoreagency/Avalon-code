import type { L, Question, QuestionType, Section } from "./types";

// Sector-specific discovery questions for Avalon B2B prospects.
// Keep question IDs immutable after release: existing saved assessments reference these IDs.
// No regulatory or platform-policy answer here counts as an automatic legal verification.
const l = (es: string, en: string): L => ({ es, en });
const q = (id: string, type: QuestionType, es: string, en: string, extra: Partial<Question> = {}): Question =>
  ({ id, type, label: l(es, en), ...extra });
const opts = (...pairs: [string, string, string][]) => pairs.map(([value, es, en]) => ({ value, label: l(es, en) }));
const yes = (id: string) => ({ q: id, eq: true });
const review = opts(["pending", "Pendiente de verificar", "Pending verification"],
  ["checked_by_owner", "Revisado manualmente por un propietario", "Manually checked by an owner"],
  ["missing_or_expired", "No disponible / vencido", "Missing / expired"]);

/** Additional sections append to GENERAL. Scoring still uses the established general fields and versioned rules. */
export const INDUSTRY_SPECIALIZATIONS: Record<string, Section[]> = {
  roofing: [
    { id: "rf_operations", title: l("Roofing · Servicios y requisitos", "Roofing · Services and requirements"),
      intro: l("Licencias, seguros y reclamaciones deben verificarse de forma independiente según la jurisdicción. Registrar una respuesta no es verificarla.", "Licenses, insurance and claims must be independently checked for the relevant jurisdiction. Recording an answer is not verification."),
      questions: [
        q("rf_services", "multi", "Servicios que desea promocionar", "Services to promote", { required: true, options: opts(
          ["replacement", "Reemplazo completo", "Full replacement"], ["repairs", "Reparación de goteras", "Leak repairs"],
          ["storm", "Daños por tormenta", "Storm damage"], ["commercial", "Techos comerciales", "Commercial roofing"],
          ["gutters", "Canaletas", "Gutters"], ["inspection", "Inspecciones", "Inspections"]) }),
        q("rf_clients", "choice", "Tipo de clientes", "Customer segment", { options: opts(
          ["residential", "Residencial", "Residential"], ["commercial", "Comercial", "Commercial"], ["both", "Ambos", "Both"]) }),
        q("rf_license_review", "choice", "Revisión manual de licencia y seguros", "Manual license and insurance review", { options: review }),
        q("rf_insurance_claims", "yesno", "¿Trabaja en proyectos relacionados con reclamaciones de seguros?", "Works on insurance-claim-related projects?"),
        q("rf_claims_process", "long", "¿Cómo gestiona las reclamaciones sin prometer cobertura ni resultados?", "How are claims handled without promising coverage or outcomes?", { when: yes("rf_insurance_claims") }),
        q("rf_service_zips", "long", "ZIP y condados donde puede trabajar", "ZIP codes and counties served"),
        q("rf_seasonal_limit", "long", "Restricciones de clima, permisos o temporada", "Weather, permit or seasonal constraints", { allowNA: true }),
      ] },
    { id: "rf_capacity", title: l("Roofing · Cotizaciones y capacidad", "Roofing · Quotes and capacity"), questions: [
      q("rf_crews", "number", "Cuadrillas disponibles", "Available crews"),
      q("rf_jobs_month", "number", "Proyectos terminados por mes", "Projects completed per month"),
      q("rf_extra_jobs", "number", "Proyectos adicionales posibles al mes", "Additional projects possible per month"),
      q("rf_avg_replacement", "money", "Ingreso promedio por reemplazo", "Average replacement revenue"),
      q("rf_direct_cost", "money", "Materiales, mano de obra y otros costos directos por reemplazo", "Materials, labor and other direct costs per replacement"),
      q("rf_quotes_month", "number", "Cotizaciones enviadas al mes", "Quotes sent per month"),
      q("rf_estimate_days", "number", "Días promedio para visitar y cotizar", "Average days to inspect and quote"),
      q("rf_quote_followup", "choice", "Seguimiento de cotizaciones", "Quote follow-up", { options: opts(
        ["none", "No se realiza", "Not tracked"], ["manual", "Manual", "Manual"], ["crm", "Con CRM", "With a CRM"]) }),
      q("rf_weekly_estimates", "number", "Inspecciones o cotizaciones que puede atender por semana", "Inspections or estimates they can handle per week"),
      q("rf_lead_handler", "choice", "¿Quién responde los leads nuevos?", "Who answers new leads?", { options: opts(
        ["owner", "El dueño", "The owner"], ["office", "Personal de oficina", "Office staff"],
        ["sales", "Vendedor / estimador", "Salesperson / estimator"], ["nobody", "Nadie asignado", "Nobody assigned"]) }),
      q("rf_response_minutes", "number", "Minutos promedio para responder a un lead nuevo", "Average minutes to respond to a new lead",
        { when: { q: "rf_lead_handler", in: ["owner", "office", "sales"] } }),
      q("rf_close_process", "long", "Proceso desde la cotización hasta el contrato firmado", "Process from estimate to signed contract"),
      q("rf_ad_budget", "money", "Presupuesto mensual de publicidad (lo paga el cliente a la plataforma)", "Monthly ad budget (paid by the client to the platform)", { allowNA: true }),
    ] },
  ],
  fencing: [
    { id: "fc_service", title: l("Fencing · Materiales y proyectos", "Fencing · Materials and projects"), questions: [
      q("fc_materials", "multi", "Materiales principales", "Main materials", { required: true, options: opts(
        ["wood", "Madera", "Wood"], ["vinyl", "Vinilo", "Vinyl"], ["aluminum", "Aluminio", "Aluminum"],
        ["chain", "Chain link", "Chain link"], ["iron", "Hierro", "Iron"], ["other", "Otros", "Other"]) }),
      q("fc_projects", "multi", "Tipos de trabajo", "Job types", { options: opts(
        ["new", "Instalación nueva", "New installation"], ["repair", "Reparación", "Repair"],
        ["gates", "Portones y accesos", "Gates and access"], ["commercial", "Comercial", "Commercial"]) }),
      q("fc_measurement", "choice", "Cómo obtiene medidas para cotizar", "How measurements are collected", { options: opts(
        ["site", "Visita al terreno", "On-site visit"], ["photos", "Fotos y medidas enviadas", "Customer photos and measurements"],
        ["both", "Ambas", "Both"]) }),
      q("fc_hoa", "yesno", "¿El trabajo suele necesitar permiso municipal o aprobación HOA?", "Does work often need a permit or HOA approval?"),
      q("fc_approval_delay", "number", "Días promedio de espera por aprobación", "Average approval wait in days", { when: yes("fc_hoa") }),
      q("fc_area", "long", "Áreas y distancias máximas de servicio", "Areas and maximum service distance"),
      q("fc_supply", "long", "Restricciones de suministro o materiales", "Material or supply constraints", { allowNA: true }),
    ] },
    { id: "fc_sales", title: l("Fencing · Margen y producción", "Fencing · Margin and delivery"), questions: [
      q("fc_crews", "number", "Cuadrillas que instalan cercas", "Fence installation crews"),
      q("fc_jobs_month", "number", "Instalaciones mensuales actuales", "Current monthly installations"),
      q("fc_extra_jobs", "number", "Instalaciones adicionales posibles al mes", "Additional installations possible per month"),
      q("fc_avg_feet", "number", "Pies lineales promedio por proyecto", "Average linear feet per project"),
      q("fc_avg_sale", "money", "Ingreso promedio por proyecto", "Average project revenue"),
      q("fc_direct_cost", "money", "Costo directo promedio por proyecto", "Average direct project cost"),
      q("fc_quote_days", "number", "Tiempo de entrega de cotización (días)", "Quote turnaround in days"),
      q("fc_lost_reason", "choice", "Motivo más frecuente de ventas perdidas", "Most frequent reason for lost quotes", { options: opts(
        ["price", "Precio", "Price"], ["delay", "Tiempo de respuesta", "Response time"],
        ["competitor", "Competidor", "Competitor"], ["unknown", "No se mide", "Not tracked"]) }),
      q("fc_team_size", "number", "Personas en el equipo de instalación", "People on the installation team"),
      q("fc_marketing_budget", "money", "Presupuesto mensual de marketing (lo paga el cliente a la plataforma)", "Monthly marketing budget (paid by the client to the platform)", { allowNA: true }),
      q("fc_commission_open", "yesno", "¿Está abierto a un modelo con comisión para Avalon?", "Open to a commission model for Avalon?"),
      q("fc_commission_proposed", "percent", "Comisión propuesta para Avalon (%) — no acordada", "Proposed commission for Avalon (%) — not agreed", { when: yes("fc_commission_open") }),
    ] },
  ],
  tattoo: [
    { id: "tt_studio", title: l("Tattoo · Artistas y experiencia", "Tattoo · Artists and experience"),
      intro: l("No almacenar fotos de clientes ni información sensible sin consentimiento y un proceso autorizado.", "Do not store customer photos or sensitive information without consent and an approved process."),
      questions: [
        q("tt_styles", "multi", "Estilos que ofrece el estudio", "Styles offered", { required: true, options: opts(
          ["fine_line", "Línea fina", "Fine line"], ["traditional", "Tradicional", "Traditional"],
          ["realism", "Realismo", "Realism"], ["blackwork", "Blackwork", "Blackwork"],
          ["color", "Color", "Color"], ["coverup", "Cover-ups", "Cover-ups"]) }),
        q("tt_artists", "number", "Artistas activos", "Active artists"),
        q("tt_stations", "number", "Estaciones disponibles", "Available stations"),
        q("tt_client_source", "multi", "Fuentes de consultas", "Inquiry sources", { options: opts(
          ["instagram", "Instagram", "Instagram"], ["tiktok", "TikTok", "TikTok"],
          ["referral", "Referidos", "Referrals"], ["google", "Google", "Google"], ["walkin", "Sin cita", "Walk-ins"]) }),
        q("tt_license_review", "choice", "Revisión de requisitos sanitarios y licencias", "Health and licensing requirements review", { options: review }),
        q("tt_consent", "yesno", "¿Obtiene consentimiento antes de publicar fotos del trabajo?", "Obtains consent before posting client work photos?"),
        q("tt_booking", "choice", "Cómo llegan y se reservan las citas", "How inquiries become bookings", { options: opts(
          ["dm", "Mensajes directos", "Direct messages"], ["online", "Reservas en línea", "Online booking"],
          ["phone", "Teléfono", "Phone"], ["walkin", "En persona", "In person"]) }),
      ] },
    { id: "tt_bookings", title: l("Tattoo · Reservas y ocupación", "Tattoo · Bookings and utilization"), questions: [
      q("tt_slots_week", "number", "Citas disponibles por semana", "Available appointment slots per week"),
      q("tt_empty_week", "number", "Citas que quedan vacías por semana", "Unfilled appointments per week"),
      q("tt_average_hours", "number", "Duración promedio de una sesión (horas completas)", "Average session length (whole hours)"),
      q("tt_avg_ticket", "money", "Ingreso promedio por sesión", "Average revenue per session"),
      q("tt_direct_cost", "money", "Insumos y costos directos promedio por sesión", "Average direct supplies and session costs"),
      q("tt_deposit", "yesno", "¿Solicita depósito para reservar?", "Requires a booking deposit?"),
      q("tt_deposit_amount", "money", "Depósito habitual", "Typical deposit", { when: yes("tt_deposit") }),
      q("tt_noshow", "percent", "% de ausencias y cancelaciones", "No-show and cancellation rate (%)"),
      q("tt_reminders", "yesno", "¿Envía recordatorios antes de la cita?", "Sends appointment reminders?"),
    ] },
  ],
  landscaping: [
    { id: "ls_routes", title: l("Landscaping · Servicios y rutas", "Landscaping · Services and routes"), questions: [
      q("ls_services", "multi", "Servicios que ofrece", "Services offered", { required: true, options: opts(
        ["mowing", "Corte y mantenimiento", "Mowing and maintenance"], ["design", "Diseño e instalación", "Design and installation"],
        ["hardscape", "Patios y hardscaping", "Patios and hardscaping"], ["irrigation", "Irrigación", "Irrigation"],
        ["cleanup", "Limpiezas estacionales", "Seasonal cleanup"], ["trees", "Árboles", "Tree work"]) }),
      q("ls_customer_mix", "choice", "Tipo de contratos", "Contract mix", { options: opts(
        ["recurring", "Mantenimiento recurrente", "Recurring maintenance"], ["project", "Proyectos puntuales", "One-off projects"],
        ["both", "Ambos", "Both"]) }),
      q("ls_area", "long", "Rutas, ZIP y distancia máxima", "Routes, ZIP codes and maximum distance"),
      q("ls_crews", "number", "Cuadrillas disponibles", "Available crews"),
      q("ls_trucks", "number", "Vehículos operativos", "Operating vehicles"),
      q("ls_recurring_clients", "number", "Clientes recurrentes actuales", "Existing recurring customers"),
      q("ls_seasonality", "long", "Meses lentos y restricciones por clima", "Slow seasons and weather constraints"),
    ] },
    { id: "ls_economics", title: l("Landscaping · Visitas y margen", "Landscaping · Visits and margin"), questions: [
      q("ls_visits_week", "number", "Visitas actuales por semana", "Current visits per week"),
      q("ls_extra_visits", "number", "Visitas adicionales posibles por semana", "Additional visits possible per week"),
      q("ls_visit_revenue", "money", "Ingreso promedio por visita", "Average revenue per visit"),
      q("ls_visit_cost", "money", "Mano de obra, combustible e insumos por visita", "Labor, fuel and supplies per visit"),
      q("ls_project_ticket", "money", "Ingreso promedio por proyecto puntual", "Average one-off project revenue"),
      q("ls_quotes_month", "number", "Cotizaciones de proyectos al mes", "Project quotes per month"),
      q("ls_quote_followup", "choice", "Seguimiento de cotizaciones", "Quote follow-up", { options: opts(
        ["none", "Ninguno", "None"], ["manual", "Manual", "Manual"], ["crm", "CRM", "CRM"]) }),
    ] },
  ],
  plumbing: [
    { id: "pl_services", title: l("Plumbing · Servicio y cumplimiento", "Plumbing · Services and compliance"),
      intro: l("Verificar licencias, seguros y requisitos de permisos fuera del cuestionario.", "Licenses, insurance and permit requirements must be checked separately."),
      questions: [
        q("pl_services", "multi", "Especialidades disponibles", "Service specialties", { required: true, options: opts(
          ["emergency", "Emergencias", "Emergency service"], ["drains", "Destapes y drenajes", "Drain cleaning"],
          ["repipe", "Repiping", "Repiping"], ["water_heater", "Calentadores de agua", "Water heaters"],
          ["remodel", "Remodelaciones", "Remodels"], ["commercial", "Plomería comercial", "Commercial plumbing"]) }),
        q("pl_license_review", "choice", "Revisión manual de licencias y seguros", "Manual license and insurance review", { options: review }),
        q("pl_emergency", "yesno", "¿Atiende llamadas de emergencia fuera de horario?", "Takes after-hours emergency calls?"),
        q("pl_dispatch_minutes", "number", "Tiempo promedio para despachar (minutos)", "Average dispatch time (minutes)", { when: yes("pl_emergency") }),
        q("pl_area", "long", "ZIP, condados y radios de servicio", "ZIP codes, counties and service radius"),
        q("pl_technicians", "number", "Técnicos disponibles", "Available technicians"),
        q("pl_vehicles", "number", "Unidades equipadas", "Equipped vehicles"),
      ] },
    { id: "pl_calls", title: l("Plumbing · Llamadas y rentabilidad", "Plumbing · Calls and profitability"), questions: [
      q("pl_calls_month", "number", "Llamadas entrantes por mes", "Incoming calls per month"),
      q("pl_missed_calls", "number", "Llamadas perdidas por mes", "Missed calls per month"),
      q("pl_jobs_week", "number", "Trabajos realizados por semana", "Jobs completed per week"),
      q("pl_extra_jobs", "number", "Trabajos adicionales posibles por semana", "Additional jobs possible per week"),
      q("pl_ticket", "money", "Ingreso promedio por trabajo", "Average revenue per job"),
      q("pl_direct_cost", "money", "Materiales y mano de obra por trabajo", "Materials and labor per job"),
      q("pl_quote_days", "number", "Días promedio para enviar cotización", "Average quote turnaround (days)"),
      q("pl_callbacks", "percent", "% de trabajos con segunda visita/corrección", "Callback or rework rate (%)"),
    ] },
  ],
  cleaning: [
    { id: "cl_services", title: l("Cleaning · Contratos y clientes", "Cleaning · Contracts and customers"), questions: [
      q("cl_services", "multi", "Tipos de limpieza", "Cleaning services", { required: true, options: opts(
        ["residential", "Residencial recurrente", "Recurring residential"], ["deep", "Limpieza profunda", "Deep cleaning"],
        ["move", "Mudanzas", "Move-in/out"], ["office", "Oficinas", "Offices"],
        ["post_construction", "Postconstrucción", "Post-construction"], ["vacation", "Alquileres vacacionales", "Vacation rentals"]) }),
      q("cl_frequency", "choice", "Frecuencia típica", "Typical frequency", { options: opts(
        ["weekly", "Semanal", "Weekly"], ["biweekly", "Quincenal", "Biweekly"],
        ["monthly", "Mensual", "Monthly"], ["one_time", "Una vez", "One-time"], ["mixed", "Mixta", "Mixed"]) }),
      q("cl_recurring_clients", "number", "Clientes que repiten cada mes", "Customers returning monthly"),
      q("cl_teams", "number", "Equipos operativos", "Operating teams"),
      q("cl_staff", "number", "Personas por equipo", "People per team"),
      q("cl_area", "long", "Zonas y ZIP atendidos", "Areas and ZIP codes served"),
      q("cl_insurance", "yesno", "¿Cuenta con seguro comercial apropiado?", "Has appropriate business insurance?"),
      q("cl_quality_process", "long", "Cómo comprueba calidad y gestiona reclamaciones", "How quality and complaints are handled"),
    ] },
    { id: "cl_utilization", title: l("Cleaning · Agenda y costos", "Cleaning · Scheduling and costs"), questions: [
      q("cl_jobs_week", "number", "Servicios por semana actualmente", "Current cleanings per week"),
      q("cl_extra_jobs", "number", "Servicios extra posibles por semana", "Additional cleanings possible per week"),
      q("cl_avg_revenue", "money", "Ingreso promedio por limpieza", "Average revenue per cleaning"),
      q("cl_direct_cost", "money", "Salarios, transporte e insumos por limpieza", "Wages, travel and supplies per cleaning"),
      q("cl_cancel_pct", "percent", "% de cancelaciones de última hora", "Last-minute cancellation rate (%)"),
      q("cl_scheduling", "choice", "Sistema de agenda", "Scheduling system", { options: opts(
        ["paper", "Papel/WhatsApp", "Paper or messages"], ["calendar", "Calendario", "Calendar"],
        ["software", "Software de reservas", "Booking software"]) }),
      q("cl_quotes", "choice", "Cómo cotiza", "Quoting method", { options: opts(
        ["flat", "Precio fijo", "Flat rate"], ["hours", "Por horas", "Hourly"],
        ["size", "Por área", "By property size"], ["custom", "Personalizado", "Custom"]) }),
    ] },
  ],
  restaurant: [
    { id: "rs_operations", title: l("Restaurantes · Servicio y demanda", "Restaurants · Service and demand"), questions: [
      q("rs_format", "choice", "Formato del negocio", "Business format", { required: true, options: opts(
        ["dine_in", "Salón", "Dine-in"], ["takeout", "Para llevar", "Takeout"],
        ["delivery", "Delivery", "Delivery"], ["catering", "Catering", "Catering"],
        ["mixed", "Mixto", "Mixed"]) }),
      q("rs_services", "multi", "Momentos de venta", "Service periods", { options: opts(
        ["breakfast", "Desayuno", "Breakfast"], ["lunch", "Almuerzo", "Lunch"],
        ["dinner", "Cena", "Dinner"], ["late", "Noche", "Late night"], ["events", "Eventos", "Events"]) }),
      q("rs_slow_periods", "long", "Días y horarios con capacidad ociosa", "Days and hours with unused capacity"),
      q("rs_seats", "number", "Asientos disponibles en el salón", "Dining room seats"),
      q("rs_extra_orders", "number", "Pedidos adicionales por día que puede aceptar", "Additional orders per day the kitchen can handle"),
      q("rs_reservations", "yesno", "¿Acepta reservas?", "Accepts reservations?"),
      q("rs_reservation_system", "text", "Herramienta para reservas", "Reservation tool", { when: yes("rs_reservations") }),
      q("rs_catering", "yesno", "¿Ofrece catering o eventos?", "Offers catering or events?"),
      q("rs_catering_ticket", "money", "Ingreso promedio por catering/evento", "Average catering/event revenue", { when: yes("rs_catering") }),
    ] },
    { id: "rs_economics", title: l("Restaurantes · Ventas y retención", "Restaurants · Sales and retention"), questions: [
      q("rs_avg_check", "money", "Ticket promedio por pedido o mesa", "Average check per order or table"),
      q("rs_food_cost_pct", "percent", "Costo de alimentos sobre ventas (%)", "Food cost as a share of sales (%)"),
      q("rs_labor_cost_pct", "percent", "Mano de obra sobre ventas (%)", "Labor cost as a share of sales (%)"),
      q("rs_online_orders", "yesno", "¿Recibe pedidos por plataformas externas?", "Uses external delivery/order platforms?"),
      q("rs_platform_fee_pct", "percent", "Comisión promedio de plataforma (%)", "Average platform fee (%)", { when: yes("rs_online_orders") }),
      q("rs_repeat_customers", "percent", "% aproximado de clientes frecuentes", "Approx. returning-customer share (%)"),
      q("rs_loyalty", "yesno", "¿Programa de fidelidad o base de contactos autorizada?", "Loyalty program or permission-based customer list?"),
      q("rs_reviews_process", "choice", "Seguimiento de reseñas", "Review follow-up", { options: opts(
        ["none", "No se revisan", "Not monitored"], ["manual", "Manual", "Manual"], ["managed", "Responsable asignado", "Assigned owner"]) }),
    ] },
  ],
  electrical: [
    { id: "el_services", title: l("Electrical · Especialidades y seguridad", "Electrical · Specialties and safety"),
      intro: l("Revisión manual de licencias, permisos y seguridad obligatoria. No se presume habilitación por llenar el formulario.", "Licensing, permits and safety require independent verification. Completing this form does not establish compliance."),
      questions: [
        q("el_services", "multi", "Trabajos ofrecidos", "Services offered", { required: true, options: opts(
          ["panel", "Paneles eléctricos", "Electrical panels"], ["ev", "Cargadores EV", "EV chargers"],
          ["rewire", "Recableado", "Rewiring"], ["troubleshoot", "Diagnóstico y reparación", "Troubleshooting and repair"],
          ["commercial", "Comercial", "Commercial"], ["lighting", "Iluminación", "Lighting"]) }),
        q("el_license_review", "choice", "Revisión manual de licencia y seguro", "Manual license and insurance review", { options: review }),
        q("el_permit_work", "yesno", "¿Realiza proyectos sujetos a permisos?", "Works on projects requiring permits?"),
        q("el_permit_process", "long", "Proceso para tramitar y cerrar permisos", "Permit application and close-out process", { when: yes("el_permit_work") }),
        q("el_emergency", "yesno", "¿Atiende emergencias?", "Provides emergency service?"),
        q("el_service_area", "long", "Áreas y ZIP de servicio", "Service area and ZIP codes"),
        q("el_technicians", "number", "Electricistas disponibles", "Available electricians"),
      ] },
    { id: "el_sales", title: l("Electrical · Cotizaciones y capacidad", "Electrical · Quotes and capacity"), questions: [
      q("el_jobs_week", "number", "Trabajos completados por semana", "Jobs completed per week"),
      q("el_extra_jobs", "number", "Trabajos adicionales posibles por semana", "Additional jobs possible per week"),
      q("el_ticket", "money", "Ingreso promedio por trabajo", "Average revenue per job"),
      q("el_direct_cost", "money", "Costo directo promedio por trabajo", "Average direct cost per job"),
      q("el_quotes", "number", "Cotizaciones emitidas por mes", "Quotes issued per month"),
      q("el_quote_days", "number", "Tiempo promedio para cotizar (días)", "Quote turnaround in days"),
      q("el_followup", "choice", "Seguimiento de cotizaciones", "Quote follow-up", { options: opts(
        ["none", "Ninguno", "None"], ["manual", "Manual", "Manual"], ["crm", "CRM", "CRM"]) }),
    ] },
  ],
  general_contractor: [
    { id: "gc_projects", title: l("Contratista general · Proyectos y control", "General contractor · Projects and oversight"),
      intro: l("Las licencias, seguros, permisos y condiciones de subcontratación requieren comprobación externa.", "Licensing, insurance, permits and subcontractor obligations require independent checks."),
      questions: [
        q("gc_project_types", "multi", "Tipos de proyectos", "Project types", { required: true, options: opts(
          ["remodel", "Remodelación", "Remodeling"], ["addition", "Ampliaciones", "Additions"],
          ["new_build", "Construcción nueva", "New construction"], ["commercial", "Locales comerciales", "Commercial build-outs"],
          ["kitchen_bath", "Cocinas y baños", "Kitchens and baths"], ["restoration", "Restauración", "Restoration"]) }),
        q("gc_license_review", "choice", "Revisión de licencia y seguros", "License and insurance review", { options: review }),
        q("gc_delivery_model", "choice", "Cómo ejecuta los trabajos", "How work is delivered", { options: opts(
          ["inhouse", "Equipo propio", "In-house crew"], ["subcontract", "Subcontratistas", "Subcontractors"],
          ["mixed", "Mixto", "Mixed"]) }),
        q("gc_subcontractors", "number", "Subcontratistas activos", "Active subcontractors", { when: { q: "gc_delivery_model", in: ["subcontract", "mixed"] } }),
        q("gc_permits", "yesno", "¿Gestiona permisos en nombre del cliente?", "Manages permits for clients?"),
        q("gc_change_orders", "long", "Cómo documenta cambios de alcance y costos", "How scope and price changes are documented"),
        q("gc_area", "long", "Área de proyectos y distancia máxima", "Project territory and maximum distance"),
      ] },
    { id: "gc_pipeline", title: l("Contratista general · Pipeline y margen", "General contractor · Pipeline and margin"), questions: [
      q("gc_active", "number", "Proyectos activos actualmente", "Currently active projects"),
      q("gc_extra_projects", "number", "Proyectos adicionales posibles por trimestre", "Additional projects possible per quarter"),
      q("gc_backlog_weeks", "number", "Semanas de trabajo comprometidas", "Weeks of contracted backlog"),
      q("gc_avg_contract", "money", "Ingreso promedio por contrato", "Average contract revenue"),
      q("gc_direct_cost", "money", "Costo directo promedio por contrato", "Average direct cost per contract"),
      q("gc_quote_days", "number", "Tiempo para entregar propuesta (días)", "Proposal turnaround (days)"),
      q("gc_quotes_month", "number", "Propuestas enviadas al mes", "Proposals sent per month"),
      q("gc_won_month", "number", "Contratos cerrados al mes", "Contracts won per month"),
    ] },
  ],
  other: [
    { id: "ot_business", title: l("Otro negocio · Modelo comercial", "Other industry · Business model"),
      intro: l("Personaliza este diagnóstico sin suponer que los requisitos de otra industria se aplican aquí.", "Customize this discovery without assuming another industry's rules apply."),
      questions: [
        q("ot_industry_name", "text", "¿A qué industria pertenece?", "What industry is this business in?", { required: true }),
        q("ot_business_model", "choice", "Modelo de negocio", "Business model", { options: opts(
          ["field", "Servicio en campo", "Field service"], ["appointment", "Servicio por cita", "Appointment service"],
          ["retail", "Comercio", "Retail"], ["professional", "Servicio profesional", "Professional service"],
          ["online", "Negocio digital", "Online business"], ["other", "Otro", "Other"]) }),
        q("ot_services", "long", "Productos o servicios principales", "Primary products or services"),
        q("ot_sales_unit", "choice", "¿Cómo se factura normalmente?", "Typical revenue unit", { options: opts(
          ["job", "Por trabajo", "Per job"], ["appointment", "Por cita", "Per appointment"],
          ["sale", "Por venta", "Per sale"], ["subscription", "Suscripción", "Subscription"],
          ["contract", "Contrato", "Contract"]) }),
        q("ot_customers", "choice", "A quién vende", "Customer segment", { options: opts(
          ["consumer", "Consumidores", "Consumers"], ["business", "Empresas", "Businesses"], ["mixed", "Ambos", "Both"]) }),
        q("ot_regulatory_review", "choice", "Revisión de requisitos legales aplicables", "Applicable legal requirements review", { options: review }),
        q("ot_special_requirements", "long", "Restricciones de operación o publicidad que debamos revisar", "Operational or advertising restrictions to review", { allowNA: true }),
      ] },
    { id: "ot_economics", title: l("Otro negocio · Capacidad y propuesta", "Other industry · Capacity and proposal"), questions: [
      q("ot_avg_sale", "money", "Ingreso promedio por unidad vendida", "Average revenue per unit sold"),
      q("ot_direct_cost", "money", "Costo directo por unidad", "Direct cost per unit"),
      q("ot_current_units", "number", "Unidades o clientes atendidos al mes", "Units or customers served monthly"),
      q("ot_extra_units", "number", "Capacidad adicional por mes", "Additional monthly capacity"),
      q("ot_team", "number", "Tamaño del equipo", "Team size"),
      q("ot_sales_process", "long", "Del primer contacto al cierre: ¿qué pasa?", "From first contact to closing: what happens?"),
      q("ot_payment_preference", "choice", "Modelo de pago que prefiere discutir con Avalon", "Payment model to discuss with Avalon", { options: opts(
        ["monthly", "Tarifa mensual", "Monthly fee"], ["commission", "Comisión", "Commission"],
        ["hybrid", "Mixto", "Hybrid"]) }),
      q("ot_proposed_commission", "percent", "Comisión propuesta (%) — no acordada", "Proposed commission (%) — not agreed", { when: { q: "ot_payment_preference", in: ["commission", "hybrid"] } }),
    ] },
  ],
};
