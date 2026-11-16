/** Public landing copy (ES/EN). Everything here is true or explicitly labelled as an illustrative demo / concept. */
export type Lang = "es" | "en";
export type ServiceKey = "website" | "ecommerce" | "crm" | "receptionist" | "chatbots" | "marketing" | "funnels" | "automation";

export const SERVICE_ORDER: ServiceKey[] = ["website", "ecommerce", "crm", "receptionist", "chatbots", "marketing", "funnels", "automation"];

export const COPY = {
  es: {
    nav: { solutions: "Soluciones", showroom: "Showroom", industries: "Industrias", work: "Proyectos", quote: "Cotizar proyecto", menu: "Menú", lang: "EN", langLabel: "Ver en inglés" },
    hero: {
      eyebrow: "Para contratistas, profesionales y empresas",
      title: "El sistema digital que impulsa tu negocio.",
      lead: "Consigue más oportunidades, atiende mejor a tus clientes y organiza tu negocio. Creamos páginas web, sistemas de ventas y asistentes inteligentes adaptados a tu manera de trabajar.",
      primary: "Encuentra tu solución", secondary: "Mira cómo funciona",
    },
    eco: {
      eyebrow: "Ecosistema Avalon", title: "Todo lo que tu negocio necesita. En un solo ecosistema.",
      lead: "No necesitas comprarlo todo. Empieza por lo que más te hace falta: conseguir clientes, atender consultas, organizar ventas o ahorrar tiempo.",
      groups: { attract: "Atraer clientes", manage: "Organizar y vender", attend: "Atender 24/7", automate: "Automatizar" },
      explore: "Explorar solución", propose: "Solicitar propuesta",
    },
    services: {
      website: { name: "Website Design", short: "Sitios profesionales, rápidos y adaptables, pensados para convertir visitas en clientes.", benefits: ["Diseño a medida y responsive", "SEO técnico y buen rendimiento", "Formularios conectados a tu CRM"] },
      ecommerce: { name: "E-commerce", short: "Tiendas digitales con catálogo, pagos y administración comercial.", benefits: ["Catálogo y variantes", "Pagos con el proveedor que elijas", "Pedidos e inventario en un panel"] },
      crm: { name: "Custom CRM", short: "Un CRM diseñado para tu proceso: contactos, oportunidades, clientes, citas y ventas.", benefits: ["Pipeline a tu medida", "Tareas y recordatorios", "Reportes para decidir"] },
      receptionist: { name: "AI Receptionist", short: "Recepcionista de IA para llamadas, consultas y reservas, según las integraciones disponibles.", benefits: ["Responde preguntas frecuentes", "Coordina citas", "Transfiere a tu equipo"] },
      chatbots: { name: "AI Chatbots", short: "Asistentes inteligentes para tu web y canales, entrenados con información que tú apruebas.", benefits: ["Respuestas al instante", "Captura de datos de contacto", "Conexión al CRM si se contrata"] },
      marketing: { name: "Marketing & Campaigns", short: "Estrategia, contenido y campañas digitales, incluida la gestión de Meta Ads.", benefits: ["Campañas por objetivo", "Presupuesto que tú apruebas", "Medición clara de resultados"] },
      funnels: { name: "Funnel Builder", short: "Recorridos de captación: del anuncio a la página, al formulario y al CRM.", benefits: ["Landing pages enfocadas", "Consentimiento registrado", "Seguimiento automático"] },
      automation: { name: "Business Automations", short: "Conectamos tus herramientas y eliminamos tareas repetitivas.", benefits: ["Notificaciones automáticas", "Flujos entre herramientas", "Menos trabajo manual"] },
    },
    show: {
      eyebrow: "Showroom interactivo", title: "Descubre Avalon en acción.",
      lead: "Explora cómo se ven y se usan nuestras herramientas. Son demostraciones locales con datos de ejemplo: nada se envía ni se conecta a sistemas reales.",
      badge: "Demo ilustrativa · datos de ejemplo", needs: "Requiere contratación e integración",
    },
    journey: {
      eyebrow: "Cómo trabaja todo junto", title: "De la primera consulta al seguimiento, todo más organizado.",
      steps: [
        ["Te descubren", "Un cliente encuentra tu negocio por tu website o una campaña."],
        ["Piden información", "Completa un formulario, escribe al chat o llama."],
        ["El CRM lo registra", "La oportunidad queda organizada con su origen y su historial."],
        ["La IA ayuda", "Un asistente responde dudas frecuentes o coordina una cita."],
        ["Tu equipo convierte", "Das seguimiento a tiempo y cierras la venta."],
        ["Ves tus resultados", "Consultas en un panel qué funciona y qué mejorar."],
      ],
    },
    ind: {
      eyebrow: "Cualquier industria", title: "Si tienes clientes, podemos construir tu sistema.",
      lead: "¿Tienes un negocio de HVAC, roofing, barbería, limpieza, consultoría o algo completamente distinto? Cuéntanos qué haces y explora un ejemplo de solución para ti.",
      tools: "Herramientas que podemos desarrollar", pilot: "Proyecto piloto en preparación. Lo mostraremos aquí cuando exista y tengamos autorización.",
    },
    work: {
      eyebrow: "Proyectos", title: "Ejemplos de lo que construimos.",
      lead: "Publicaremos casos reales solo con autorización de cada cliente. Mientras tanto, estos son ejemplos conceptuales de soluciones.",
      badge: "Ejemplo conceptual",
      items: [
        ["Website + reservas para una barbería", "Sitio rápido con agenda en línea y recordatorios automáticos."],
        ["CRM para un contratista HVAC", "Pipeline de cotizaciones por zona con tareas de seguimiento."],
        ["Tienda en línea para un comercio local", "Catálogo, pagos y campañas de recompra conectadas."],
      ],
    },
    contact: {
      eyebrow: "Cotiza tu proyecto", title: "Tu próxima etapa de crecimiento comienza aquí.",
      lead: "No tienes que saber qué herramienta necesitas. Cuéntanos qué haces, qué te está costando tiempo o clientes y qué te gustaría mejorar. Te ayudaremos a encontrar el punto de partida.",
      points: ["Propuesta a la medida de tu negocio", "Puedes elegir uno o varios servicios", "Tus datos solo se usan para responderte"],
      other: "Trabajamos con empresas establecidas, negocios pequeños y profesionales independientes. Puedes empezar con una sola herramienta.",
    },
    footer: { tagline: "Soluciones digitales, automatización e IA para negocios que quieren crecer.", admin: "Acceso del equipo", rights: "Todos los derechos reservados." },
  },
  en: {
    nav: { solutions: "Solutions", showroom: "Showroom", industries: "Industries", work: "Work", quote: "Get a quote", menu: "Menu", lang: "ES", langLabel: "Ver en español" },
    hero: {
      eyebrow: "For contractors, professionals and businesses",
      title: "The digital system that powers your business.",
      lead: "Get more opportunities, respond to customers and keep your business organized. We build websites, sales systems and smart assistants tailored to how you work.",
      primary: "Find your solution", secondary: "See how it works",
    },
    eco: {
      eyebrow: "The Avalon ecosystem", title: "Everything your business needs. In one ecosystem.",
      lead: "You do not need everything at once. Start with what matters most: finding customers, handling inquiries, managing sales or saving time.",
      groups: { attract: "Win customers", manage: "Organize & sell", attend: "Respond 24/7", automate: "Automate" },
      explore: "Explore solution", propose: "Request a proposal",
    },
    services: {
      website: { name: "Website Design", short: "Professional, fast, responsive sites built to turn visits into customers.", benefits: ["Custom, responsive design", "Technical SEO and performance", "Forms connected to your CRM"] },
      ecommerce: { name: "E-commerce", short: "Online stores with catalog, payments and sales management.", benefits: ["Catalog and variants", "Payments with your chosen provider", "Orders and inventory in one panel"] },
      crm: { name: "Custom CRM", short: "A CRM designed around your process: contacts, opportunities, clients, appointments and sales.", benefits: ["Your own pipeline", "Tasks and reminders", "Reports to decide"] },
      receptionist: { name: "AI Receptionist", short: "An AI receptionist for calls, inquiries and bookings, depending on available integrations.", benefits: ["Answers common questions", "Coordinates appointments", "Hands off to your team"] },
      chatbots: { name: "AI Chatbots", short: "Smart assistants for your site and channels, trained on information you approve.", benefits: ["Instant answers", "Contact capture", "CRM connection when commissioned"] },
      marketing: { name: "Marketing & Campaigns", short: "Strategy, content and digital campaigns, including Meta Ads management.", benefits: ["Goal-based campaigns", "Budget you approve", "Clear measurement"] },
      funnels: { name: "Funnel Builder", short: "Acquisition journeys: from ad to page, to form, to CRM.", benefits: ["Focused landing pages", "Recorded consent", "Automatic follow-up"] },
      automation: { name: "Business Automations", short: "We connect your tools and remove repetitive work.", benefits: ["Automatic notifications", "Flows between tools", "Less manual work"] },
    },
    show: {
      eyebrow: "Interactive showroom", title: "See Avalon in action.",
      lead: "Explore how our tools look and feel. These are local demos with sample data: nothing is sent or connected to real systems.",
      badge: "Illustrative demo · sample data", needs: "Requires a contract and integration",
    },
    journey: {
      eyebrow: "How it works together", title: "From the first inquiry to follow-up, keep everything organized.",
      steps: [
        ["They find you", "A customer discovers your business through your website or a campaign."],
        ["They ask", "They fill a form, write to the chat or call."],
        ["The CRM records it", "The opportunity is organized with its source and history."],
        ["AI helps", "An assistant answers common questions or books an appointment."],
        ["Your team converts", "You follow up on time and close the sale."],
        ["You see results", "A dashboard shows what works and what to improve."],
      ],
    },
    ind: {
      eyebrow: "Any industry", title: "If you have customers, we can build your system.",
      lead: "HVAC, roofing, barbershops, cleaning, consulting or something entirely different? Tell us what you do and explore a sample solution for your business.",
      tools: "Tools we can build", pilot: "Pilot project in preparation. We will show it here once it exists and we have permission.",
    },
    work: {
      eyebrow: "Work", title: "Examples of what we build.",
      lead: "We only publish real cases with each client's permission. Meanwhile, these are conceptual solution examples.",
      badge: "Conceptual example",
      items: [
        ["Website + booking for a barbershop", "A fast site with online booking and automatic reminders."],
        ["CRM for an HVAC contractor", "A quote pipeline by service area with follow-up tasks."],
        ["Online store for a local shop", "Catalog, payments and connected repeat-purchase campaigns."],
      ],
    },
    contact: {
      eyebrow: "Get a quote", title: "Your next stage of growth starts here.",
      lead: "You do not need to know which tool to ask for. Tell us what you do, what costs you time or customers, and what you want to improve. We will help you find a starting point.",
      points: ["A proposal tailored to your business", "Pick one or several services", "Your data is only used to reply to you"],
      other: "We work with established companies, small businesses and independent professionals. You can start with just one tool.",
    },
    footer: { tagline: "Digital solutions, automation and AI for businesses that want to grow.", admin: "Team access", rights: "All rights reserved." },
  },
} as const;

export const GROUPS: { key: "attract" | "manage" | "attend" | "automate"; services: ServiceKey[] }[] = [
  { key: "attract", services: ["website", "marketing", "funnels"] },
  { key: "manage", services: ["crm", "ecommerce"] },
  { key: "attend", services: ["receptionist", "chatbots"] },
  { key: "automate", services: ["automation"] },
];
