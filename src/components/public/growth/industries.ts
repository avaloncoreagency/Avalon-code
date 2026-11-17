import type { Lang } from "../landing/copy";

/**
 * Synthetic industry profiles for the public demos. Every business, person and number here is fictional and is shown
 * with a "demo" label; nothing is sent to Supabase, a phone line, an ad account or a payment provider.
 */
export type IndustryKey = "barber" | "roofing" | "hvac" | "dental" | "restaurant" | "ecommerce" | "other";
export const INDUSTRY_ORDER: IndustryKey[] = ["barber", "roofing", "hvac", "dental", "restaurant", "ecommerce", "other"];

type L = { es: string; en: string };
export type Service = { name: L; price: number; minutes: number };
export type LeadSeed = { name: string; need: L; value: number };
export type Industry = {
  label: L; business: L; icon: string;
  services: Service[];
  leads: LeadSeed[];
  /** Visitor messages the chat demo offers as one-tap prompts. */
  prompts: L[];
  search: { query: L; category: L; rivals: L[] };
  ticket: number;                 // illustrative average ticket used by the ads simulator and the tree
  wonLabel: L;                    // what a closed opportunity means for this business
};

const l = (es: string, en: string): L => ({ es, en });

export const INDUSTRIES: Record<IndustryKey, Industry> = {
  barber: {
    label: l("Barbería", "Barbershop"), business: l("Barbería Norte · demo", "Northside Barbers · demo"), icon: "✂",
    services: [{ name: l("Corte clásico", "Classic cut"), price: 25, minutes: 30 }, { name: l("Corte + barba", "Cut + beard"), price: 38, minutes: 60 }, { name: l("Afeitado con toalla caliente", "Hot towel shave"), price: 30, minutes: 30 }],
    leads: [
      { name: "Diego R.", need: l("Corte + barba el sábado", "Cut + beard on Saturday"), value: 38 },
      { name: "Marcus T.", need: l("Corte para boda (grupo de 4)", "Wedding cuts (group of 4)"), value: 150 },
      { name: "Luis M.", need: l("Membresía mensual", "Monthly membership"), value: 90 },
      { name: "Andre K.", need: l("Afeitado antes de entrevista", "Shave before an interview"), value: 30 },
    ],
    prompts: [l("¿Tienen hueco mañana por la tarde?", "Any openings tomorrow afternoon?"), l("Quiero corte + barba", "I want a cut + beard"), l("¿Cuánto cuesta el afeitado?", "How much is a shave?")],
    search: { query: l("barbería cerca de mí", "barbershop near me"), category: l("Barbería", "Barbershop"), rivals: [l("Barbería del Centro (ejemplo)", "Downtown Cuts (example)"), l("Estudio Fade (ejemplo)", "Fade Studio (example)")] },
    ticket: 35, wonLabel: l("Reserva completada", "Booking completed"),
  },
  roofing: {
    label: l("Techos (roofing)", "Roofing"), business: l("Techos Sólidos · demo", "Solid Roofing · demo"), icon: "⌂",
    services: [{ name: l("Inspección de techo", "Roof inspection"), price: 150, minutes: 60 }, { name: l("Reparación de goteras", "Leak repair"), price: 650, minutes: 120 }, { name: l("Cotización de reemplazo", "Replacement estimate"), price: 0, minutes: 60 }],
    leads: [
      { name: "Karen W.", need: l("Gotera después de la tormenta", "Leak after the storm"), value: 650 },
      { name: "Tom & Ana P.", need: l("Reemplazo completo de techo", "Full roof replacement"), value: 14800 },
      { name: "Robert J.", need: l("Inspección para venta de casa", "Inspection before selling the house"), value: 150 },
      { name: "Silvia G.", need: l("Tejas dañadas por granizo", "Hail-damaged shingles"), value: 3200 },
    ],
    prompts: [l("Tengo una gotera, ¿pueden venir esta semana?", "I have a leak, can you come this week?"), l("Necesito cotizar un techo nuevo", "I need a quote for a new roof"), l("¿Hacen inspecciones?", "Do you do inspections?")],
    search: { query: l("reparación de techos cerca de mí", "roof repair near me"), category: l("Contratista de techos", "Roofing contractor"), rivals: [l("Roof Pro (ejemplo)", "Roof Pro (example)"), l("Top Shingle (ejemplo)", "Top Shingle (example)")] },
    ticket: 4200, wonLabel: l("Trabajo aprobado", "Job approved"),
  },
  hvac: {
    label: l("Climatización (HVAC)", "HVAC"), business: l("Clima Total · demo", "Total Comfort HVAC · demo"), icon: "❄",
    services: [{ name: l("Diagnóstico de A/C", "A/C diagnostic"), price: 89, minutes: 60 }, { name: l("Mantenimiento preventivo", "Preventive maintenance"), price: 149, minutes: 90 }, { name: l("Instalación de equipo", "System installation"), price: 0, minutes: 120 }],
    leads: [
      { name: "Patricia L.", need: l("El aire no enfría", "A/C is not cooling"), value: 420 },
      { name: "James O.", need: l("Cambio de equipo completo", "Full system replacement"), value: 7600 },
      { name: "Elena V.", need: l("Plan de mantenimiento anual", "Annual maintenance plan"), value: 299 },
      { name: "Chris D.", need: l("Ruido en la unidad exterior", "Noisy outdoor unit"), value: 260 },
    ],
    prompts: [l("Mi aire acondicionado no enfría", "My A/C isn't cooling"), l("¿Tienen servicio hoy?", "Do you have service today?"), l("Quiero cambiar mi equipo", "I want to replace my system")],
    search: { query: l("reparación de aire acondicionado", "ac repair near me"), category: l("Servicio de climatización", "HVAC contractor"), rivals: [l("Cool Air (ejemplo)", "Cool Air (example)"), l("Breeze HVAC (ejemplo)", "Breeze HVAC (example)")] },
    ticket: 1900, wonLabel: l("Servicio vendido", "Service sold"),
  },
  dental: {
    label: l("Clínica dental", "Dental clinic"), business: l("Sonrisa Clara · demo", "Bright Smile Dental · demo"), icon: "◡",
    services: [{ name: l("Primera consulta", "First visit"), price: 60, minutes: 30 }, { name: l("Limpieza dental", "Cleaning"), price: 90, minutes: 45 }, { name: l("Valoración de ortodoncia", "Orthodontic assessment"), price: 0, minutes: 45 }],
    leads: [
      { name: "María F.", need: l("Dolor de muela", "Toothache"), value: 180 },
      { name: "Kevin S.", need: l("Valoración de ortodoncia invisible", "Clear aligner assessment"), value: 4200 },
      { name: "Lucía A.", need: l("Limpieza para la familia", "Family cleaning"), value: 320 },
      { name: "Daniel B.", need: l("Blanqueamiento", "Whitening"), value: 450 },
    ],
    prompts: [l("¿Atienden urgencias hoy?", "Do you see emergencies today?"), l("Quiero una limpieza", "I'd like a cleaning"), l("¿Aceptan mi seguro?", "Do you take my insurance?")],
    search: { query: l("dentista cerca de mí", "dentist near me"), category: l("Clínica dental", "Dental clinic"), rivals: [l("Dental Plaza (ejemplo)", "Dental Plaza (example)"), l("Clínica Blanca (ejemplo)", "White Clinic (example)")] },
    ticket: 650, wonLabel: l("Paciente agendado", "Patient booked"),
  },
  restaurant: {
    label: l("Restaurante / café", "Restaurant / coffee shop"), business: l("Café Origen · demo", "Origin Café · demo"), icon: "☕",
    services: [{ name: l("Mesa para 2", "Table for 2"), price: 45, minutes: 60 }, { name: l("Mesa para 4", "Table for 4"), price: 90, minutes: 90 }, { name: l("Evento privado", "Private event"), price: 600, minutes: 120 }],
    leads: [
      { name: "Sofía N.", need: l("Cumpleaños para 12 personas", "Birthday for 12 guests"), value: 540 },
      { name: "Oficina Delta", need: l("Desayuno corporativo semanal", "Weekly corporate breakfast"), value: 380 },
      { name: "Jorge H.", need: l("Pedido para recoger", "Pickup order"), value: 42 },
      { name: "Emily R.", need: l("Cena de aniversario", "Anniversary dinner"), value: 120 },
    ],
    prompts: [l("¿Tienen mesa para 4 esta noche?", "Table for 4 tonight?"), l("Quiero organizar un cumpleaños", "I'd like to host a birthday"), l("¿Hacen pedidos para llevar?", "Do you do takeout?")],
    search: { query: l("café cerca de mí", "coffee shop near me"), category: l("Cafetería", "Coffee shop"), rivals: [l("Bean House (ejemplo)", "Bean House (example)"), l("La Esquina (ejemplo)", "The Corner (example)")] },
    ticket: 140, wonLabel: l("Reserva confirmada", "Reservation confirmed"),
  },
  ecommerce: {
    label: l("Comercio electrónico", "E-commerce"), business: l("Pasos · tienda demo", "Stride · demo store"), icon: "◳",
    services: [{ name: l("Asesoría de talla", "Fit consultation"), price: 0, minutes: 15 }, { name: l("Recogida en tienda", "Store pickup"), price: 0, minutes: 15 }, { name: l("Cambio o devolución", "Exchange or return"), price: 0, minutes: 30 }],
    leads: [
      { name: "Valeria P.", need: l("Carrito abandonado: 2 pares", "Abandoned cart: 2 pairs"), value: 248 },
      { name: "Nate C.", need: l("Pedido para equipo de running", "Order for a running club"), value: 1320 },
      { name: "Camila T.", need: l("Duda de talla antes de comprar", "Size question before buying"), value: 129 },
      { name: "Owen L.", need: l("Cliente recurrente, nueva colección", "Repeat customer, new collection"), value: 210 },
    ],
    prompts: [l("¿Tienen la talla 42?", "Do you have size 10?"), l("¿Cuánto tarda el envío?", "How long is shipping?"), l("Quiero cambiar un pedido", "I want to exchange an order")],
    search: { query: l("zapatillas running tienda", "running shoes store"), category: l("Tienda de calzado", "Shoe store"), rivals: [l("Runner Shop (ejemplo)", "Runner Shop (example)"), l("Urban Feet (ejemplo)", "Urban Feet (example)")] },
    ticket: 130, wonLabel: l("Pedido pagado (demo)", "Order paid (demo)"),
  },
  other: {
    label: l("Otro negocio", "Other business"), business: l("Tu Negocio · demo", "Your Business · demo"), icon: "◆",
    services: [{ name: l("Consulta inicial", "Initial consultation"), price: 0, minutes: 30 }, { name: l("Visita / servicio", "Visit / service"), price: 120, minutes: 60 }, { name: l("Seguimiento", "Follow-up"), price: 60, minutes: 30 }],
    leads: [
      { name: "Ana C.", need: l("Pide presupuesto por la web", "Asked for a quote on the website"), value: 900 },
      { name: "Michael B.", need: l("Llamó fuera de horario", "Called after hours"), value: 300 },
      { name: "Grupo Sur", need: l("Servicio mensual para su empresa", "Monthly service for their company"), value: 1500 },
      { name: "Laura E.", need: l("Recomendada por un cliente", "Referred by a customer"), value: 450 },
    ],
    prompts: [l("¿Tienen disponibilidad esta semana?", "Any availability this week?"), l("¿Cuánto cuesta el servicio?", "How much is the service?"), l("Quiero una cotización", "I'd like a quote")],
    search: { query: l("servicio cerca de mí", "service near me"), category: l("Negocio local", "Local business"), rivals: [l("Servicios Uno (ejemplo)", "Service One (example)"), l("Pro Local (ejemplo)", "Local Pro (example)")] },
    ticket: 600, wonLabel: l("Cliente convertido", "Customer converted"),
  },
};

export const tx = (lang: Lang, v: L) => v[lang];
export const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
