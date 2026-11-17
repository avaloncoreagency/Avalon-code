import type { Lang, ServiceKey } from "../copy";

/**
 * Copy for the four universes. Written for business owners, not for technologists: what it does for your business.
 * No invented results, clients or statistics. Communication Hub availability is stated as it is.
 */
export type EngineModule = {
  key: ServiceKey; also?: ServiceKey; name: string; label: string;
  problem: string; solution: string; benefits: [string, string, string]; availability?: string;
};
export type Apple = { title: string; text: string; service: ServiceKey | null };

export const MODULE_FOR: Record<ServiceKey, number> = { website: 0, ecommerce: 1, crm: 2, marketing: 3, funnels: 3, receptionist: 4, chatbots: 4, automation: 5 };

type UniverseCopy = {
  process: { eyebrow: string; title: string; steps: [string, string][] };
  hero: { eyebrow: string; line1: string; line2: string; sub: string; primary: string; secondary: string; scroll: string };
  launch: { eyebrow: string; title: string; hint: string; stages: [string, string][] };
  engine: { eyebrow: string; title: string; lead: string; problem: string; solution: string; benefits: string; open: string; quote: string; pick: string; modules: EngineModule[] };
  tree: { eyebrow: string; title: string; lead: string; hint: string; open: string; quote: string; close: string; note: string; apples: Apple[] };
};

export const UNIVERSE: Record<Lang, UniverseCopy> = {
  es: {
    process: { eyebrow: "Cómo trabajamos", title: "De la primera conversación al lanzamiento.", steps: [
      ["Conversamos", "Entendemos tu negocio, tus clientes y qué quieres mejorar. Sin tecnicismos."],
      ["Propuesta a medida", "Recibes alcance, plazos y precio por escrito antes de empezar."],
      ["Construimos contigo", "Ves avances reales y das tu opinión mientras lo desarrollamos."],
      ["Lanzamos y acompañamos", "Lo ponemos en marcha, te enseñamos a usarlo y seguimos disponibles."],
    ] },
    hero: {
      eyebrow: "Barberías · clínicas · contratistas · restaurantes · tiendas",
      line1: "Más clientes. Más trabajo.", line2: "Más crecimiento.",
      sub: "Convertimos las oportunidades de tu negocio en clientes atendidos, citas confirmadas y ventas mejor organizadas.",
      primary: "Descubre cómo puede crecer tu negocio", secondary: "Explora una demostración", scroll: "Haz crecer tu árbol",
    },
    launch: {
      eyebrow: "El despegue", title: "No necesitas entender la tecnología. Necesitas saber lo que puede hacer por tu negocio.",
      hint: "Toca o haz clic para acelerar",
      stages: [
        ["Deja atrás lo manual", "Llamadas perdidas, mensajes sin responder y datos repartidos en libretas y hojas sueltas."],
        ["Gana impulso", "Tu página, tu seguimiento de clientes y tu marketing empujando en la misma dirección."],
        ["Alcanza tu siguiente nivel", "Más oportunidades atendidas y un negocio más ordenado. Sin promesas mágicas: trabajo bien hecho."],
      ],
    },
    engine: {
      eyebrow: "El motor de crecimiento", title: "Seis herramientas. Un solo motor.",
      lead: "Cada módulo funciona por separado y rinde más conectado a los demás. Elige uno para verlo de cerca.",
      problem: "El problema", solution: "Lo que construimos", benefits: "Qué ganas", open: "Ver la solución completa", quote: "Pedir propuesta", pick: "Elige un módulo",
      modules: [
        { key: "website", name: "Website Designer", label: "Páginas web",
          problem: "Tus clientes te buscan desde el teléfono y no encuentran una página clara que les invite a contactarte.",
          solution: "Un sitio rápido y a tu medida, con reservas o formularios que llevan cada visita a un siguiente paso.",
          benefits: ["Se ve bien en cualquier pantalla", "Preparado para buscadores", "Formularios conectados a tu seguimiento"] },
        { key: "ecommerce", name: "E-commerce Designer", label: "Tiendas online",
          problem: "Vendes solo cuando el local está abierto, o por mensajes uno a uno.",
          solution: "Tu tienda en línea con catálogo, carrito y pagos con el proveedor que elijas.",
          benefits: ["Catálogo ordenado", "Compra sencilla desde el móvil", "Pedidos e inventario en un panel"] },
        { key: "crm", name: "CRM & Business Systems", label: "CRM y sistemas",
          problem: "Los contactos se pierden entre libretas, chats y hojas de cálculo.",
          solution: "Un sistema construido alrededor de tu proceso: clientes, oportunidades, citas y ventas en un solo lugar.",
          benefits: ["Seguimiento de cada oportunidad", "Calendario y tareas", "Visión clara de tus ventas"] },
        { key: "marketing", also: "funnels", name: "Marketing Hub & Funnels", label: "Marketing y embudos",
          problem: "Inviertes en publicidad sin saber qué funciona, o no llegan suficientes solicitudes.",
          solution: "Campañas y embudos: del anuncio a una página enfocada y a tu seguimiento, con el presupuesto que tú apruebas.",
          benefits: ["Campañas por objetivo", "Páginas de captación", "Medición clara, sin cifras infladas"] },
        { key: "receptionist", also: "chatbots", name: "Communication Hub", label: "Comunicación",
          problem: "Llamadas y mensajes se quedan sin responder mientras estás trabajando.",
          solution: "Chatbots y recepcionistas de IA que responden preguntas frecuentes y coordinan citas con la información que tú apruebas.",
          benefits: ["Respuestas a preguntas frecuentes", "Coordinación de citas", "Aviso a tu equipo cuando hace falta una persona"],
          availability: "En preparación. Se activa por proyecto, según el proveedor y las integraciones que se contraten; hoy no es un producto de entrega inmediata." },
        { key: "automation", name: "Business Automation", label: "Automatización",
          problem: "Tareas repetitivas que consumen horas: copiar datos, enviar recordatorios, avisar al equipo.",
          solution: "Conectamos las herramientas que ya usas para que la información fluya sola.",
          benefits: ["Recordatorios automáticos", "Datos sincronizados", "Menos trabajo manual"] },
      ],
    },
    tree: {
      eyebrow: "El árbol de oportunidades", title: "Lo que hoy plantas, mañana da fruto.",
      lead: "Las raíces son tus herramientas. Cada manzana es una oportunidad que puede abrirse para tu negocio.",
      hint: "Toca una manzana", open: "Ver cómo lo hacemos", quote: "Quiero esto para mi negocio", close: "Cerrar",
      note: "Son posibilidades reales, no promesas de ganancias: el resultado depende de tu negocio y del trabajo conjunto.",
      apples: [
        { title: "Mejor presencia digital", text: "Una página que explica bien lo que haces y da confianza desde el primer vistazo.", service: "website" },
        { title: "Más clientes potenciales", text: "Que quien busca tu servicio en tu zona te encuentre y pueda escribirte.", service: "marketing" },
        { title: "Reservas y citas", text: "Tus clientes eligen horario sin esperar a que contestes el teléfono.", service: "website" },
        { title: "Mejor organización", text: "Cada contacto, cotización y tarea en un mismo lugar, no en la memoria.", service: "crm" },
        { title: "Gestión de ventas", text: "Sabes en qué etapa está cada oportunidad y cuál es el siguiente paso.", service: "crm" },
        { title: "Marketing", text: "Campañas con un objetivo claro y un presupuesto que tú decides.", service: "marketing" },
        { title: "Comercio electrónico", text: "Tu catálogo abierto las 24 horas, con pedidos que llegan ordenados.", service: "ecommerce" },
        { title: "Comunicación", text: "Respuestas a las preguntas de siempre, aunque estés ocupado. En preparación.", service: "receptionist" },
        { title: "Automatización", text: "Recordatorios y avisos que salen solos, sin que nadie los escriba.", service: "automation" },
        { title: "Crecimiento sostenible", text: "Un sistema que crece contigo: empiezas por una pieza y sumas cuando lo necesitas.", service: null },
      ],
    },
  },
  en: {
    process: { eyebrow: "How we work", title: "From the first conversation to launch.", steps: [
      ["We talk", "We learn about your business, your customers and what you want to improve. No jargon."],
      ["Tailored proposal", "You get scope, timeline and price in writing before we start."],
      ["We build with you", "You see real progress and give feedback while we develop it."],
      ["Launch and support", "We put it live, show you how to use it and stay available."],
    ] },
    hero: {
      eyebrow: "Barbershops · clinics · contractors · restaurants · stores",
      line1: "More customers. More work.", line2: "More growth.",
      sub: "We turn your business's opportunities into customers attended, appointments confirmed and better-organized sales.",
      primary: "See how your business can grow", secondary: "Explore a demo", scroll: "Grow your tree",
    },
    launch: {
      eyebrow: "The launch", title: "You don't need to understand the technology. You need to know what it can do for your business.",
      hint: "Tap or click to accelerate",
      stages: [
        ["Leave manual work behind", "Missed calls, unanswered messages and data scattered across notebooks and spreadsheets."],
        ["Gain momentum", "Your website, your customer follow-up and your marketing pushing in the same direction."],
        ["Reach your next level", "More opportunities handled and a better-organized business. No magic promises: work done right."],
      ],
    },
    engine: {
      eyebrow: "The growth engine", title: "Six tools. One engine.",
      lead: "Each module works on its own and performs better connected to the rest. Pick one to see it up close.",
      problem: "The problem", solution: "What we build", benefits: "What you gain", open: "See the full solution", quote: "Request a proposal", pick: "Pick a module",
      modules: [
        { key: "website", name: "Website Designer", label: "Websites",
          problem: "Customers look you up on their phone and can't find a clear page that invites them to contact you.",
          solution: "A fast, custom site with booking or forms that turn every visit into a next step.",
          benefits: ["Looks right on any screen", "Ready for search engines", "Forms connected to your follow-up"] },
        { key: "ecommerce", name: "E-commerce Designer", label: "Online stores",
          problem: "You only sell while the shop is open, or one message at a time.",
          solution: "Your online store with catalog, cart and payments through the provider you choose.",
          benefits: ["Organized catalog", "Easy checkout on mobile", "Orders and inventory in one panel"] },
        { key: "crm", name: "CRM & Business Systems", label: "CRM & systems",
          problem: "Contacts get lost between notebooks, chats and spreadsheets.",
          solution: "A system built around your process: clients, opportunities, appointments and sales in one place.",
          benefits: ["Follow-up on every opportunity", "Calendar and tasks", "A clear view of your sales"] },
        { key: "marketing", also: "funnels", name: "Marketing Hub & Funnels", label: "Marketing & funnels",
          problem: "You spend on ads without knowing what works, or not enough requests come in.",
          solution: "Campaigns and funnels: from the ad to a focused page and into your follow-up, with the budget you approve.",
          benefits: ["Campaigns by objective", "Lead-capture pages", "Clear measurement, no inflated numbers"] },
        { key: "receptionist", also: "chatbots", name: "Communication Hub", label: "Communication",
          problem: "Calls and messages go unanswered while you're on the job.",
          solution: "AI chatbots and receptionists that answer common questions and coordinate appointments with information you approve.",
          benefits: ["Answers to common questions", "Appointment coordination", "Alerts your team when a person is needed"],
          availability: "In preparation. Activated per project, depending on the provider and integrations contracted; not an off-the-shelf product today." },
        { key: "automation", name: "Business Automation", label: "Automation",
          problem: "Repetitive tasks that eat hours: copying data, sending reminders, notifying the team.",
          solution: "We connect the tools you already use so information flows on its own.",
          benefits: ["Automatic reminders", "Synced data", "Less manual work"] },
      ],
    },
    tree: {
      eyebrow: "The opportunity tree", title: "What you plant today bears fruit tomorrow.",
      lead: "The roots are your tools. Each apple is an opportunity that can open up for your business.",
      hint: "Tap an apple", open: "See how we do it", quote: "I want this for my business", close: "Close",
      note: "These are real possibilities, not earnings promises: results depend on your business and on the work we do together.",
      apples: [
        { title: "Better digital presence", text: "A page that explains what you do and builds trust at first glance.", service: "website" },
        { title: "More potential customers", text: "People searching for your service in your area can find you and reach out.", service: "marketing" },
        { title: "Bookings and appointments", text: "Customers pick a time without waiting for you to answer the phone.", service: "website" },
        { title: "Better organization", text: "Every contact, quote and task in one place, not in your memory.", service: "crm" },
        { title: "Sales management", text: "You know which stage each opportunity is in and what comes next.", service: "crm" },
        { title: "Marketing", text: "Campaigns with a clear goal and a budget you decide.", service: "marketing" },
        { title: "E-commerce", text: "Your catalog open around the clock, with orders arriving organized.", service: "ecommerce" },
        { title: "Communication", text: "Answers to the usual questions even when you're busy. In preparation.", service: "receptionist" },
        { title: "Automation", text: "Reminders and alerts that go out on their own.", service: "automation" },
        { title: "Sustainable growth", text: "A system that grows with you: start with one piece and add more when you need it.", service: null },
      ],
    },
  },
};
