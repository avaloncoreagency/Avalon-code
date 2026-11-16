"use client";
import { useEffect, useId, useMemo, useState } from "react";
import { COPY, type Lang, type ServiceKey } from "./copy";
import { Icon } from "./icons";
import s from "./landing.module.css";

/**
 * "Any industry" composer. Visitors type their business (or tap one of 60+ examples) and get an illustrative system
 * blueprint. It is rule-based and runs in the browser: no AI call, no network request, nothing is stored.
 * Every business maps to an operating model (how it sells and serves); unknown ones get the universal model.
 */
type Txt = { name: string; need: string; flow: [string, string, string, string]; kpis: [string, string, string] };
type Model = { k: string; kw: string[]; tools: ServiceKey[]; es: Txt; en: Txt };

const MODELS: Model[] = [
  { k: "appointments", tools: ["website", "receptionist", "crm", "marketing"],
    kw: ["barber", "barberia", "salon", "peluquer", "spa", "nail", "unas", "estetic", "beauty", "belleza", "tattoo", "tatuaje", "massage", "masaje", "lash", "pestan", "brow", "ceja", "maquill", "makeup", "groom"],
    es: { name: "Negocio por citas", need: "Tu agenda es tu inventario: cada hueco vacío es dinero perdido.", flow: ["Reserva en línea 24/7", "Recordatorio automático", "Recepción IA para mensajes", "Campaña para huecos libres"], kpis: ["Ocupación de agenda", "Ausencias evitadas", "Clientes que regresan"] },
    en: { name: "Appointment business", need: "Your calendar is your inventory: every empty slot is lost revenue.", flow: ["24/7 online booking", "Automatic reminder", "AI reception for messages", "Campaign for open slots"], kpis: ["Calendar occupancy", "No-shows avoided", "Returning clients"] } },
  { k: "health", tools: ["website", "crm", "receptionist", "automation"],
    kw: ["clinic", "clinica", "dent", "doctor", "medic", "physio", "fisio", "therap", "terap", "vet", "psico", "psych", "chiro", "optom", "nutri", "pediat", "derma", "orto", "lab", "farmac", "pharm", "salud", "health"],
    es: { name: "Salud y bienestar", need: "Confianza y puntualidad: agenda ordenada, seguimiento y formularios claros.", flow: ["Agenda y admisión en línea", "Recordatorios y confirmación", "Seguimiento de pacientes potenciales", "Reseñas y regreso a consulta"], kpis: ["Citas confirmadas", "Tiempo de respuesta", "Pacientes recurrentes"] },
    en: { name: "Health & wellness", need: "Trust and punctuality: an organized schedule, follow-up and clear forms.", flow: ["Online booking and intake", "Reminders and confirmation", "Prospective patient follow-up", "Reviews and return visits"], kpis: ["Confirmed visits", "Response time", "Returning patients"] } },
  { k: "field", tools: ["funnels", "crm", "receptionist", "automation"],
    kw: ["hvac", "roof", "techo", "fenc", "cerca", "plumb", "plomer", "electric", "landscap", "jardin", "clean", "limpieza", "pest", "plaga", "paint", "pintur", "contract", "contratist", "remodel", "construc", "solar", "pool", "piscina", "moving", "mudanza", "handyman", "garage", "concrete", "concreto", "floor", "piso", "window", "ventana", "lock", "locksmith", "cerraj", "tree", "arbol", "drywall", "insul", "gutter", "canal", "carpint", "carpent", "weld", "sold"],
    es: { name: "Servicios en campo", need: "Responder primero gana el trabajo: captar por zona, cotizar rápido y no olvidar a nadie.", flow: ["Landing por servicio y zona", "Llamada atendida al instante", "Cotización e inspección en el CRM", "Seguimiento hasta cerrar"], kpis: ["Solicitudes por zona", "Cotizaciones cerradas", "Tiempo hasta responder"] },
    en: { name: "Field services", need: "First to respond wins the job: capture by area, quote fast and never drop a lead.", flow: ["Landing per service and area", "Calls answered instantly", "Quote and inspection in the CRM", "Follow-up until it closes"], kpis: ["Requests by area", "Quotes won", "Time to respond"] } },
  { k: "food", tools: ["website", "chatbots", "receptionist", "marketing"],
    kw: ["restaur", "cafe", "coffee", "bakery", "panader", "bar", "pizza", "taco", "food", "comida", "cater", "burger", "sushi", "brewery", "cervec", "heladeri", "ice cream", "donut", "juice", "jugo", "cocina", "kitchen", "bistro", "deli", "pasteler"],
    es: { name: "Comida y bebida", need: "Mesas llenas también los martes: menú visible, reservas fáciles y razones para volver.", flow: ["Menú y reservas en la web", "Chat que responde horarios y pedidos", "Recepción IA en horas pico", "Campañas para días flojos"], kpis: ["Reservas semanales", "Pedidos directos", "Clientes que vuelven"] },
    en: { name: "Food & beverage", need: "Full tables on Tuesdays too: a visible menu, easy bookings and reasons to return.", flow: ["Menu and bookings online", "Chat for hours and orders", "AI reception at peak hours", "Campaigns for slow days"], kpis: ["Weekly bookings", "Direct orders", "Returning guests"] } },
  { k: "retail", tools: ["ecommerce", "chatbots", "marketing", "automation"],
    kw: ["store", "tienda", "shop", "boutique", "ecommerce", "e-commerce", "retail", "comercio", "ropa", "cloth", "fashion", "moda", "jewel", "joyer", "flor", "florist", "pet", "mascota", "toy", "jugueter", "furniture", "mueble", "cosmet", "perfum", "zapat", "shoe", "libre", "book", "gift", "regalo", "optica", "electron", "vape", "smoke", "liquor", "licor", "suplement", "supplement", "hardware", "ferreter", "farm", "granja", "artesan", "craft", "dropship", "amazon", "etsy", "marca", "brand"],
    es: { name: "Venta de productos", need: "Vender aunque la tienda esté cerrada, y que cada cliente compre otra vez.", flow: ["Tienda en línea con catálogo", "Chat que resuelve dudas de compra", "Campañas por producto", "Carrito abandonado y recompra"], kpis: ["Ventas en línea", "Ticket promedio", "Tasa de recompra"] },
    en: { name: "Product sales", need: "Sell while the store is closed, and get every customer to buy again.", flow: ["Online store with catalog", "Chat that answers buying questions", "Product campaigns", "Abandoned cart and repeat purchase"], kpis: ["Online sales", "Average order", "Repeat rate"] } },
  { k: "professional", tools: ["website", "crm", "chatbots", "automation"],
    kw: ["law", "abogad", "lawyer", "attorney", "legal", "account", "contad", "contab", "tax", "impuesto", "insur", "segur", "consult", "asesor", "agency", "agencia", "notar", "financ", "architect", "arquitect", "engineer", "ingenier", "design", "disen", "marketing", "software", "it ", "tecnolog", "recruit", "reclut", "staffing", "translat", "traduc", "coach", "immigra", "inmigra", "bank", "banco", "credit", "credito", "loan", "prestamo"],
    es: { name: "Servicios profesionales", need: "Vendes confianza y tiempo: calificar bien, dar seguimiento y documentar cada caso.", flow: ["Web que demuestra autoridad", "Formulario que califica el caso", "Pipeline por tipo de servicio", "Tareas y documentos automáticos"], kpis: ["Consultas calificadas", "Propuestas aceptadas", "Horas ahorradas"] },
    en: { name: "Professional services", need: "You sell trust and time: qualify well, follow up and document every case.", flow: ["A site that shows authority", "Form that qualifies the case", "Pipeline by service type", "Automatic tasks and documents"], kpis: ["Qualified inquiries", "Proposals accepted", "Hours saved"] } },
  { k: "property", tools: ["website", "funnels", "crm", "marketing"],
    kw: ["real estate", "realtor", "inmobili", "bienes raices", "property", "propiedad", "rent", "alquil", "renta", "mortgage", "hipotec", "broker", "apartment", "apartament", "condo", "hoa", "airbnb", "storage", "bodega", "coworking"],
    es: { name: "Inmuebles", need: "Ciclos largos y muchos interesados: cada contacto necesita su seguimiento.", flow: ["Fichas de propiedades en la web", "Landing por propiedad o zona", "CRM con etapas de compra o renta", "Avisos y visitas agendadas"], kpis: ["Interesados por propiedad", "Visitas agendadas", "Cierres"] },
    en: { name: "Real estate", need: "Long cycles and many prospects: every contact needs its own follow-up.", flow: ["Property listings online", "Landing per property or area", "CRM with buy or rent stages", "Alerts and scheduled showings"], kpis: ["Leads per listing", "Showings booked", "Closings"] } },
  { k: "auto", tools: ["website", "receptionist", "crm", "automation"],
    kw: ["auto", "car", "carro", "coche", "mechanic", "mecanic", "taller", "dealer", "concesion", "detail", "wash", "lavado", "tire", "tire shop", "llanta", "body shop", "chapa", "towing", "grua", "motor", "moto", "boat", "lancha", "rv", "truck repair", "transmis", "oil change", "aceite"],
    es: { name: "Automotriz", need: "Taller lleno y clientes informados: citas, presupuestos y avisos de mantenimiento.", flow: ["Citas de servicio en línea", "Presupuesto aprobado por mensaje", "Aviso cuando el auto está listo", "Recordatorio del próximo servicio"], kpis: ["Citas por semana", "Presupuestos aprobados", "Servicios repetidos"] },
    en: { name: "Automotive", need: "A full shop and informed customers: bookings, estimates and maintenance reminders.", flow: ["Online service booking", "Estimate approved by message", "Ready-for-pickup alert", "Next-service reminder"], kpis: ["Weekly bookings", "Estimates approved", "Repeat services"] } },
  { k: "fitness", tools: ["website", "crm", "chatbots", "marketing"],
    kw: ["gym", "gimnas", "yoga", "pilates", "crossfit", "fitness", "trainer", "entrenador", "martial", "marcial", "karate", "box", "dance", "danza", "baile", "studio", "estudio", "climb", "escalad", "swim", "natacion", "sport", "deport", "club", "golf", "tenis", "tennis", "padel"],
    es: { name: "Fitness y deporte", need: "Captar, convertir la clase de prueba y evitar que los miembros se vayan.", flow: ["Clase de prueba en la web", "Chat que agenda y resuelve dudas", "Seguimiento hasta la membresía", "Retención y reactivación"], kpis: ["Clases de prueba", "Nuevas membresías", "Retención mensual"] },
    en: { name: "Fitness & sports", need: "Attract, convert the trial class and keep members from leaving.", flow: ["Trial class on the site", "Chat that books and answers", "Follow-up to membership", "Retention and win-back"], kpis: ["Trial classes", "New memberships", "Monthly retention"] } },
  { k: "education", tools: ["website", "funnels", "crm", "automation"],
    kw: ["school", "escuela", "colegio", "tutor", "academ", "course", "curso", "class", "clase", "language", "idioma", "driving", "manejo", "daycare", "guarder", "preschool", "music", "musica", "art", "university", "universidad", "training", "capacitac", "online course", "bootcamp", "montessori"],
    es: { name: "Educación", need: "Inscripciones claras: del interés a la matrícula sin perder familias en el camino.", flow: ["Programas y horarios en la web", "Funnel de inscripción", "CRM de familias o alumnos", "Recordatorios y comunicados"], kpis: ["Solicitudes de información", "Inscripciones", "Asistencia"] },
    en: { name: "Education", need: "Clear enrollment: from interest to sign-up without losing families on the way.", flow: ["Programs and schedules online", "Enrollment funnel", "CRM for families or students", "Reminders and announcements"], kpis: ["Info requests", "Enrollments", "Attendance"] } },
  { k: "events", tools: ["website", "funnels", "crm", "chatbots"],
    kw: ["wedding", "boda", "photo", "foto", "video", "dj", "event", "evento", "venue", "salon de eventos", "party", "fiesta", "planner", "decor", "music band", "banda", "catering event", "rental", "alquiler de", "quince", "xv"],
    es: { name: "Eventos y creativos", need: "Mostrar tu trabajo, cotizar por fecha y no perder reservas por responder tarde.", flow: ["Portafolio que vende", "Cotizador por fecha y paquete", "Contratos y anticipos en el CRM", "Chat que responde disponibilidad"], kpis: ["Cotizaciones enviadas", "Fechas reservadas", "Tiempo de respuesta"] },
    en: { name: "Events & creatives", need: "Show your work, quote by date and never lose a booking to a slow reply.", flow: ["Portfolio that sells", "Quote by date and package", "Contracts and deposits in the CRM", "Chat that answers availability"], kpis: ["Quotes sent", "Dates booked", "Response time"] } },
  { k: "hospitality", tools: ["website", "chatbots", "receptionist", "marketing"],
    kw: ["hotel", "boutique hotel", "hotel boutique", "travel agency", "agencia de viaje", "motel", "hostel", "inn", "b&b", "resort", "travel", "viaje", "tour", "turism", "cruise", "crucero", "vacation", "vacacion", "camping", "glamping", "posada", "lodge", "cabin", "cabana"],
    es: { name: "Hospitalidad y turismo", need: "Más reservas directas y huéspedes atendidos a cualquier hora, en su idioma.", flow: ["Web con reserva directa", "Chat multilingüe 24/7", "Recepción IA para llamadas", "Campañas por temporada"], kpis: ["Reservas directas", "Consultas resueltas", "Ocupación"] },
    en: { name: "Hospitality & travel", need: "More direct bookings and guests served at any hour, in their language.", flow: ["Site with direct booking", "Multilingual 24/7 chat", "AI reception for calls", "Seasonal campaigns"], kpis: ["Direct bookings", "Questions resolved", "Occupancy"] } },
  { k: "community", tools: ["website", "crm", "automation", "marketing"],
    kw: ["church", "iglesia", "nonprofit", "ong", "ngo", "foundation", "fundacion", "charity", "caridad", "ministry", "ministerio", "association", "asociacion", "community", "comunidad", "volunteer", "voluntari", "club social", "union", "sindicato", "politic"],
    es: { name: "Comunidad y causas", need: "Mantener a tu comunidad informada y convertir el interés en participación.", flow: ["Web con eventos y donaciones", "Registro de miembros o voluntarios", "Comunicados automáticos", "Campañas de convocatoria"], kpis: ["Nuevos miembros", "Participación en eventos", "Donaciones"] },
    en: { name: "Community & causes", need: "Keep your community informed and turn interest into participation.", flow: ["Site with events and donations", "Member or volunteer sign-up", "Automatic announcements", "Outreach campaigns"], kpis: ["New members", "Event turnout", "Donations"] } },
  { k: "b2b", tools: ["website", "crm", "automation", "ecommerce"],
    kw: ["manufact", "fabric", "industr", "distrib", "wholesale", "mayore", "logist", "trucking", "transporte", "freight", "carga", "import", "export", "supplier", "proveedor", "b2b", "warehouse", "almacen", "packag", "empaque", "agro", "agric", "mining", "mineria", "oil", "energy", "energia", "chemical", "quimic", "print", "imprenta", "security", "seguridad", "janitorial"],
    es: { name: "Industria y B2B", need: "Ventas consultivas y operación compleja: cotizar, dar seguimiento y conectar sistemas.", flow: ["Catálogo y solicitud de cotización", "CRM por cuenta y oportunidad", "Portal o pedidos recurrentes", "Integraciones y reportes"], kpis: ["Cotizaciones abiertas", "Ciclo de venta", "Pedidos recurrentes"] },
    en: { name: "Industrial & B2B", need: "Consultative sales and complex operations: quote, follow up and connect systems.", flow: ["Catalog and quote requests", "CRM by account and deal", "Portal or recurring orders", "Integrations and reports"], kpis: ["Open quotes", "Sales cycle", "Recurring orders"] } },
];
const UNIVERSAL: Model = { k: "universal", kw: [], tools: ["website", "crm", "chatbots", "automation"],
  es: { name: "Modelo universal", need: "Todo negocio necesita lo mismo en el fondo: que lo encuentren, atender bien, dar seguimiento y medir.", flow: ["Presencia que genera confianza", "Atención inmediata en cada canal", "CRM con cada oportunidad", "Automatizaciones y reportes"], kpis: ["Nuevas oportunidades", "Tiempo de respuesta", "Ventas cerradas"] },
  en: { name: "Universal model", need: "Deep down every business needs the same: be found, respond well, follow up and measure.", flow: ["A presence that builds trust", "Instant response on every channel", "A CRM with every opportunity", "Automations and reports"], kpis: ["New opportunities", "Response time", "Closed sales"] } };

/** Example businesses for the cloud: [es, en]. Each one resolves through the same matcher as free text. */
const EXAMPLES: [string, string][] = [
  ["Barbería", "Barbershop"], ["Clínica dental", "Dental clinic"], ["HVAC", "HVAC"], ["Roofing", "Roofing"], ["Restaurante", "Restaurant"],
  ["Tienda de ropa", "Clothing store"], ["Abogados", "Law firm"], ["Inmobiliaria", "Real estate"], ["Taller mecánico", "Auto repair"], ["Gimnasio", "Gym"],
  ["Academia de idiomas", "Language school"], ["Fotógrafo de bodas", "Wedding photographer"], ["Hotel boutique", "Boutique hotel"], ["Iglesia", "Church"], ["Distribuidora", "Distributor"],
  ["Spa", "Spa"], ["Veterinaria", "Veterinary"], ["Plomería", "Plumbing"], ["Cafetería", "Coffee shop"], ["Joyería", "Jewelry store"],
  ["Contabilidad", "Accounting"], ["Administración de propiedades", "Property management"], ["Lavado de autos", "Car wash"], ["Estudio de yoga", "Yoga studio"], ["Guardería", "Daycare"],
  ["DJ y eventos", "DJ & events"], ["Agencia de viajes", "Travel agency"], ["Fundación", "Foundation"], ["Fábrica", "Manufacturer"], ["Salón de uñas", "Nail salon"],
  ["Fisioterapia", "Physical therapy"], ["Electricista", "Electrician"], ["Panadería", "Bakery"], ["Floristería", "Florist"], ["Seguros", "Insurance"],
  ["Hipotecas", "Mortgage broker"], ["Concesionario", "Car dealership"], ["CrossFit", "CrossFit box"], ["Tutorías", "Tutoring"], ["Salón de eventos", "Event venue"],
  ["Tours", "Tour operator"], ["ONG", "Nonprofit"], ["Logística", "Logistics"], ["Tatuajes", "Tattoo studio"], ["Psicología", "Psychology"],
  ["Paisajismo", "Landscaping"], ["Food truck", "Food truck"], ["Tienda de mascotas", "Pet store"], ["Consultoría", "Consulting"], ["Airbnb", "Airbnb host"],
  ["Llantera", "Tire shop"], ["Escuela de baile", "Dance school"], ["Escuela de manejo", "Driving school"], ["Wedding planner", "Wedding planner"], ["Mudanzas", "Moving company"],
  ["Limpieza", "Cleaning service"], ["Paneles solares", "Solar installer"], ["Cerrajería", "Locksmith"], ["Marca de cosméticos", "Cosmetics brand"], ["Imprenta", "Print shop"],
];

const norm = (x: string) => " " + x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9&]+/g, " ") + " ";
function match(input: string): Model {
  const q = norm(input); if (!q.trim()) return UNIVERSAL;
  let best = UNIVERSAL, score = 0;
  for (const m of MODELS) {
    // Longer keyword hits weigh more, so "salon de eventos" beats "salon". Short keys (spa, bar, gym…) must be whole words.
    const sc = m.kw.reduce((a, k) => { const n = norm(k).trim(); return a + (q.includes(n.length <= 3 ? ` ${n} ` : n) ? n.length : 0); }, 0);
    if (sc > score) { score = sc; best = m; }
  }
  return best;
}

export function AnyIndustry({ lang }: { lang: Lang }) {
  const t = COPY[lang]; const es = lang === "es"; const id = useId();
  const [text, setText] = useState(es ? "Barbería" : "Barbershop");
  const m = useMemo(() => match(text), [text]); const L = m[lang];
  const barber = /barber/.test(norm(text));
  const rows = [EXAMPLES.slice(0, 30), EXAMPLES.slice(30)];
  const q = es ? "" : "?lang=en";
  const label = text.trim() || (es ? "tu negocio" : "your business");
  // The seamless marquee needs a duplicate of each row; add it after the page is idle so it never weighs on first paint.
  const [loop, setLoop] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    const id = w.requestIdleCallback ? w.requestIdleCallback(() => setLoop(true)) : window.setTimeout(() => setLoop(true), 1200);
    return () => { if (!w.requestIdleCallback) window.clearTimeout(id); };
  }, []);
  return <div className={s.anyInd}>
    <form className={s.indAsk} onSubmit={e => e.preventDefault()} role="search">
      <label htmlFor={`${id}-q`}>{es ? "¿Qué tipo de negocio tienes?" : "What kind of business do you run?"}</label>
      <div className={s.indInput}><Icon name="spark" size={18} />
        <input id={`${id}-q`} value={text} onChange={e => setText(e.target.value)} maxLength={60} autoComplete="off" placeholder={es ? "Ej.: escuela de surf, taller de bicicletas, dentista…" : "e.g. surf school, bike repair, dentist…"} />
      </div>
    </form>
    <div className={s.cloud} data-loop={loop} aria-label={es ? "Ejemplos de industrias" : "Industry examples"}>
      {rows.map((row, r) => <div key={r} className={s.cloudRow} data-dir={r}>
        {(loop ? [0, 1] : [0]).map(copy => <div key={copy} className={s.cloudTrack} aria-hidden={copy === 1 || undefined}>
          {row.map(([a, b]) => { const n = es ? a : b; return <button key={n} type="button" tabIndex={copy ? -1 : 0} className={s.cloudPill} aria-pressed={text === n} onClick={() => setText(n)}>{n}</button>; })}
        </div>)}
      </div>)}
    </div>
    <div className={s.blueprint} key={m.k} aria-live="polite">
      <div className={s.bpHead}>
        <span className={s.badge}>{es ? "Plano ilustrativo" : "Illustrative blueprint"}</span>
        <h3>{es ? "Para" : "For"} <em>{label}</em></h3>
        <p className={s.bpModel}>{es ? "Modelo operativo" : "Operating model"}: <b>{L.name}</b></p>
        <p>{L.need}</p>
        {barber && <p className={s.pilot}>{t.ind.pilot}</p>}
      </div>
      <ol className={s.bpFlow}>{L.flow.map((f, i) => <li key={f} style={{ animationDelay: `${i * 110}ms` }}><span>{String(i + 1).padStart(2, "0")}</span>{f}</li>)}</ol>
      <div className={s.bpCols}>
        <div><p className={s.groupTitle}>{t.ind.tools}</p>
          <div className={s.toolList}>{m.tools.map((k, i) => <a key={k} className={s.tool} href={`/soluciones/${k}${q}`} style={{ animationDelay: `${200 + i * 90}ms` }}><span><Icon name={k} size={20} /></span>{t.services[k].name}</a>)}</div></div>
        <div><p className={s.groupTitle}>{es ? "Qué mediríamos" : "What we'd measure"}</p>
          <ul className={s.bpKpis}>{L.kpis.map(k => <li key={k}><Icon name="check" size={16} />{k}</li>)}</ul></div>
      </div>
      <div className={s.bpFoot}>
        <a className={`${s.btn} ${s.primary}`} href={`/?${es ? "" : "lang=en&"}services=${m.tools.join(",")}#cotizacion`}>{es ? "Quiero este sistema" : "I want this system"}<Icon name="arrow" size={18} /></a>
        <small>{es ? "Generado en tu navegador con reglas, sin IA y sin guardar datos. En la llamada lo adaptamos a tu operación real." : "Generated in your browser with rules — no AI, nothing stored. On the call we adapt it to your real operation."}</small>
      </div>
    </div>
  </div>;
}
