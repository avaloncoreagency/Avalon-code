import type { Metadata } from "next";
import Link from "next/link";
import { QuoteForm } from "@/components/public/quote-form";
import { SERVICE_NAMES } from "@/components/public/services";
import s from "./public.module.css";

/** Canonical public origin. Previews and the admin host never set it: only the production site is indexable. */
const SITE_ORIGIN = "https://avaloncoreagency.com";
const META = {
  es: {
    title: "Avalon Core Agency · IA, webs, CRM y automatización para empresas",
    description: "Desarrollo web, e-commerce, CRM personalizados, recepcionistas de IA, marketing y automatización empresarial. Solicita tu cotización.",
    og: "IA. Personas. Sistemas. Un mañana más brillante.", locale: "es_ES",
  },
  en: {
    title: "Avalon Core Agency · AI, websites, CRM and automation for businesses",
    description: "Web development, e-commerce, custom CRMs, AI receptionists, marketing and business automation. Request a quote.",
    og: "AI. People. Systems. A brighter tomorrow.", locale: "en_US",
  },
} as const;

/**
 * Title, description and Open Graph locale follow the page language (?lang=en).
 * No canonical/hreflang here on purpose: Next.js strips the query string from `alternates`, which would point every
 * language at "/" and tell search engines the English page is a duplicate. The language relation is declared in
 * sitemap.xml instead, where the full URLs are kept.
 */
export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const lang = (await searchParams).lang === "en" ? "en" : "es";
  const m = META[lang];
  return {
    metadataBase: new URL(SITE_ORIGIN),
    title: m.title,
    description: m.description,
    robots: { index: true, follow: true },
    openGraph: { title: "Avalon Core Agency", description: m.og, type: "website", siteName: "Avalon Core Agency", locale: m.locale },
  };
}

const COPY = {
  es: {
    eyebrow: "IA · PERSONAS · SISTEMAS", title: "Tecnología que hace crecer tu negocio.",
    lead: "Diseñamos webs, tiendas online, CRMs a medida, recepcionistas de IA y automatizaciones que trabajan juntos para captar clientes y ahorrar tiempo.",
    quote: "Solicitar cotización", services: "Servicios", process: "Cómo trabajamos", useCases: "Casos de uso", contact: "Solicita tu cotización",
    contactLead: "Cuéntanos qué necesitas. Revisamos cada solicitud personalmente y te respondemos con una propuesta.",
    serviceText: {
      website: "Sitios rápidos, accesibles y optimizados para SEO que convierten visitas en clientes.",
      ecommerce: "Tiendas online con catálogo, pagos y gestión de pedidos listas para vender.",
      crm: "CRMs a la medida de tu proceso comercial: pipeline, tareas y seguimiento.",
      receptionist: "Agentes de IA que atienden llamadas y mensajes, agendan citas y transfieren a tu equipo.",
      marketing: "Estrategia, contenido y campañas medibles para atraer a tu cliente ideal.",
      automation: "Conectamos tus herramientas y eliminamos tareas repetitivas.",
    },
    growthProducts: [
      ["AI Chatbots", "Asistentes web con conocimiento autorizado de tu empresa y conexión al CRM (según integración contratada)."],
      ["AI Receptionist", "Recepcionistas virtuales para llamadas y consultas; activación telefónica sujeta a permisos y proveedor."],
      ["Funnel Builder", "Landing pages de captación, solicitudes comerciales y citas con consentimiento y seguimiento en CRM."],
      ["Campaigns y Meta Ads", "Planificación multicanal y servicios de anuncios Facebook/Instagram con permisos y presupuesto aprobados."],
    ],
    steps: [["Diagnóstico", "Entendemos tu negocio y tus metas."], ["Propuesta", "Alcance, plazos y precio claros."], ["Construcción", "Entregas por fases con revisiones."], ["Lanzamiento y soporte", "Medimos, mejoramos y te acompañamos."]],
    cases: [["Restaurantes", "Reservas online, recepcionista de IA para llamadas y campañas locales."], ["Clínicas y dentistas", "Agenda automatizada, recordatorios y seguimiento de pacientes potenciales."], ["Comercios", "Tienda online conectada a inventario y marketing de recompra."], ["Servicios profesionales", "CRM para seguimiento de clientes y automatización de propuestas."]],
    portfolio: "Portafolio: publicaremos proyectos solo con autorización de cada cliente.", admin: "Acceso del equipo", lang: "English",
  },
  en: {
    eyebrow: "AI · PEOPLE · SYSTEMS", title: "Technology that grows your business.",
    lead: "We build websites, online stores, custom CRMs, AI receptionists and automations that work together to win customers and save time.",
    quote: "Request a quote", services: "Services", process: "How we work", useCases: "Use cases", contact: "Request your quote",
    contactLead: "Tell us what you need. We review every request personally and reply with a proposal.",
    serviceText: {
      website: "Fast, accessible, SEO-ready sites that turn visits into customers.",
      ecommerce: "Online stores with catalog, payments and order management, ready to sell.",
      crm: "CRMs tailored to your sales process: pipeline, tasks and follow-up.",
      receptionist: "AI agents that answer calls and messages, book appointments and hand off to your team.",
      marketing: "Strategy, content and measurable campaigns to reach your ideal customer.",
      automation: "We connect your tools and remove repetitive work.",
    },
    growthProducts: [
      ["AI Chatbots", "Website assistants using authorized company knowledge and CRM integration when commissioned."],
      ["AI Receptionist", "Virtual phone and inquiry reception; paid telephony requires explicit provider authorization."],
      ["Funnel Builder", "Opt-in lead capture, sales inquiry and appointment-request landing pages connected to the CRM."],
      ["Campaigns and Meta Ads", "Multichannel planning and Facebook/Instagram advertising services only with approved permissions and budget."],
    ],
    steps: [["Discovery", "We learn your business and goals."], ["Proposal", "Clear scope, timeline and price."], ["Build", "Phased delivery with reviews."], ["Launch & support", "We measure, improve and stay with you."]],
    cases: [["Restaurants", "Online bookings, an AI receptionist for calls and local campaigns."], ["Clinics & dentists", "Automated scheduling, reminders and lead follow-up."], ["Retail", "Online store connected to inventory and repeat-purchase marketing."], ["Professional services", "A CRM for client follow-up and proposal automation."]],
    portfolio: "Portfolio: we only publish projects with each client's permission.", admin: "Team access", lang: "Español",
  },
} as const;

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const lang = (await searchParams).lang === "en" ? "en" : "es";
  const t = COPY[lang];
  return (
    <main className={s.page} lang={lang}>
      <header className={s.nav}>
        <span className={s.brand}>AVALON <small>CORE AGENCY</small></span>
        <nav aria-label={lang === "es" ? "Principal" : "Main"}>
          <a href="#servicios">{t.services}</a><a href="#proceso">{t.process}</a><a href="#cotizacion">{t.quote}</a>
          <Link href={lang === "es" ? "/?lang=en" : "/"} hrefLang={lang === "es" ? "en" : "es"}>{t.lang}</Link>
        </nav>
      </header>
      <section className={s.hero}>
        <p className={s.eyebrow}>{t.eyebrow}</p>
        <h1>{t.title}</h1>
        <p className={s.lead}>{t.lead}</p>
        <a className={s.cta} href="#cotizacion">{t.quote} →</a>
        <div className={s.orb} aria-hidden="true" />
      </section>
      <section id="servicios" className={s.section} aria-labelledby="h-services">
        <h2 id="h-services">{t.services}</h2>
        <div className={s.grid}>{(Object.keys(SERVICE_NAMES[lang]) as (keyof typeof t.serviceText)[]).map(k =>
          <article key={k} className={s.card} data-service={k}><h3>{SERVICE_NAMES[lang][k]}</h3><p>{t.serviceText[k]}</p></article>)}</div>
      </section>
      <section className={s.section} aria-labelledby="h-growth">
        <h2 id="h-growth">{lang === "es" ? "Nuevos servicios comerciales" : "New growth services"}</h2>
        <p className={s.lead}>{lang === "es" ? "Servicios que podemos diseñar y preparar para tu negocio; ninguna integración de pago se activa sin aprobación." : "Services we can design and prepare for your business; paid integrations require approval."}</p>
        <div className={s.grid}>{t.growthProducts.map(([name, description]) =>
          <article key={name} className={s.card}><h3>{name}</h3><p>{description}</p></article>)}</div>
        <p className={s.note}>{lang === "es" ? "Para consultar, describe el producto en el formulario. La cotización no compra ni activa servicios." : "Describe your product needs in the quote form. A request does not buy or activate services."}</p>
        <a href="#cotizacion" className={s.cta}>{lang === "es" ? "Consultar servicios" : "Ask about services"}</a>
      </section>
      <section id="proceso" className={s.section} aria-labelledby="h-process">
        <h2 id="h-process">{t.process}</h2>
        <ol className={s.steps}>{t.steps.map(([h, p], i) => <li key={h}><span>{i + 1}</span><strong>{h}</strong><p>{p}</p></li>)}</ol>
      </section>
      <section className={s.section} aria-labelledby="h-cases">
        <h2 id="h-cases">{t.useCases}</h2>
        <div className={s.grid}>{t.cases.map(([h, p]) => <article key={h} className={s.card}><h3>{h}</h3><p>{p}</p></article>)}</div>
        <p className={s.note}>{t.portfolio}</p>
      </section>
      <section id="cotizacion" className={s.section} aria-labelledby="h-quote">
        <h2 id="h-quote">{t.contact}</h2>
        <p className={s.lead}>{t.contactLead}</p>
        <QuoteForm lang={lang} />
      </section>
      <footer className={s.footer}><span>© {new Date().getFullYear()} Avalon Core Agency</span><Link href="/admin/login">{t.admin}</Link></footer>
    </main>
  );
}
