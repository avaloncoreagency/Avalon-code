/* eslint-disable @next/next/no-img-element -- pre-optimized static WebP with srcset/sizes; avoids the Vercel image-optimization quota. */
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { QuoteForm } from "@/components/public/quote-form";
import { COPY, SERVICE_ORDER, type Lang, type ServiceKey } from "@/components/public/landing/copy";
import { Icon } from "@/components/public/landing/icons";
import { Reveal } from "@/components/public/landing/interactive";
import { MEDIA } from "@/components/public/landing/media";
import { ServiceDemo } from "@/components/public/landing/showroom";
import { SiteChrome, qs } from "@/components/public/landing/site-chrome";
import s from "@/components/public/landing/landing.module.css";

const SITE_ORIGIN = "https://avaloncoreagency.com";
export const viewport: Viewport = { themeColor: "#f7f8fd", colorScheme: "light", viewportFit: "cover" };
export const dynamicParams = false;
export function generateStaticParams() { return SERVICE_ORDER.map(service => ({ service })); }

/** Per-service sales detail. Truthful scope: what we can build; integrations depend on the client's providers. */
const DETAIL: Record<Lang, Record<ServiceKey, { intro: string; features: [string, string][]; family?: string }>> = {
  es: {
    website: { intro: "Diseñamos y desarrollamos sitios a medida: rápidos, accesibles, optimizados para buscadores y pensados para que cada visita tenga un siguiente paso claro.", features: [["Diseño responsive", "Experiencia cuidada en teléfono, tablet y computadora."], ["Velocidad y SEO", "Estructura semántica, metadatos y buen rendimiento."], ["Conversión", "Llamadas a la acción y formularios conectados a tu CRM."]] },
    ecommerce: { intro: "Tiendas en línea con catálogo, variantes, carrito y pagos con el proveedor que elijas, además de un panel para pedidos e inventario.", features: [["Catálogo", "Productos, variantes, colecciones y búsqueda."], ["Compra fluida", "Carrito y checkout claros en cualquier dispositivo."], ["Gestión", "Pedidos, inventario y campañas de recompra."]] },
    crm: { intro: "Un CRM construido alrededor de tu proceso comercial —no al revés— para gestionar contactos, oportunidades, clientes, citas y ventas en un solo lugar.", features: [["Pipeline a medida", "Las etapas reales de tu venta."], ["Seguimiento", "Tareas, recordatorios e historial de cada cliente."], ["Reportes", "Visión clara para decidir con datos."]] },
    receptionist: { family: "Communication Hub", intro: "Una recepcionista de IA que atiende consultas, responde preguntas frecuentes y coordina citas. La atención telefónica depende del proveedor y los permisos que se contraten.", features: [["Atención", "Saludo, identificación del motivo y respuestas frecuentes."], ["Citas", "Propuesta de horarios según tu disponibilidad."], ["Traspaso", "Aviso a tu equipo cuando hace falta una persona."]] },
    chatbots: { family: "Communication Hub", intro: "Asistentes inteligentes para tu web y canales, con información que tú apruebas, capaces de captar datos de contacto y, si se contrata, conectarse a tu CRM.", features: [["Respuestas al instante", "Preguntas frecuentes 24/7."], ["Captación", "Recogen datos de contacto con consentimiento."], ["Integración", "Conexión al CRM según el alcance contratado."]] },
    marketing: { intro: "Estrategia, contenido y campañas digitales, incluida la gestión de Meta Ads, siempre con presupuesto y permisos aprobados por ti.", features: [["Planificación", "Objetivos, audiencias y calendario."], ["Campañas", "Anuncios y contenido por objetivo."], ["Medición", "Resultados claros y mejoras continuas."]] },
    funnels: { intro: "Recorridos de captación de principio a fin: del anuncio a una página enfocada, a un formulario con consentimiento y al CRM con su origen.", features: [["Landing pages", "Una oferta, un mensaje, una acción."], ["Consentimiento", "Registro de qué aceptó cada persona."], ["Seguimiento", "La oportunidad entra a tu CRM automáticamente."]] },
    automation: { intro: "Conectamos tus herramientas para que la información fluya sola: notificaciones, tareas y actualizaciones sin trabajo manual repetitivo.", features: [["Disparadores", "Un formulario, una venta o una fecha inician el flujo."], ["Acciones", "Correos, tareas, avisos y registros."], ["Conexiones", "Entre tu web, CRM, calendario y más."]] },
  },
  en: {
    website: { intro: "We design and build custom sites: fast, accessible, search-optimized and built so every visit has a clear next step.", features: [["Responsive design", "A polished experience on phone, tablet and desktop."], ["Speed and SEO", "Semantic structure, metadata and strong performance."], ["Conversion", "Calls to action and forms connected to your CRM."]] },
    ecommerce: { intro: "Online stores with catalog, variants, cart and payments with your chosen provider, plus a panel for orders and inventory.", features: [["Catalog", "Products, variants, collections and search."], ["Smooth checkout", "Clear cart and checkout on any device."], ["Management", "Orders, inventory and repeat-purchase campaigns."]] },
    crm: { intro: "A CRM built around your sales process —not the other way around— to manage contacts, opportunities, clients, appointments and sales in one place.", features: [["Your pipeline", "The real stages of your sale."], ["Follow-up", "Tasks, reminders and each client's history."], ["Reports", "A clear view to decide with data."]] },
    receptionist: { family: "Communication Hub", intro: "An AI receptionist that handles inquiries, answers common questions and coordinates appointments. Phone handling depends on the contracted provider and permissions.", features: [["Reception", "Greeting, reason for the call and common answers."], ["Appointments", "Offers times based on your availability."], ["Handoff", "Alerts your team when a person is needed."]] },
    chatbots: { family: "Communication Hub", intro: "Smart assistants for your site and channels, using information you approve, able to capture contact details and connect to your CRM when commissioned.", features: [["Instant answers", "Common questions, 24/7."], ["Lead capture", "Contact details with consent."], ["Integration", "CRM connection per the contracted scope."]] },
    marketing: { intro: "Strategy, content and digital campaigns, including Meta Ads management, always with budget and permissions you approve.", features: [["Planning", "Goals, audiences and calendar."], ["Campaigns", "Ads and content by objective."], ["Measurement", "Clear results and continuous improvement."]] },
    funnels: { intro: "End-to-end acquisition journeys: from the ad to a focused page, to a consented form, to the CRM with its source.", features: [["Landing pages", "One offer, one message, one action."], ["Consent", "A record of what each person accepted."], ["Follow-up", "The opportunity lands in your CRM automatically."]] },
    automation: { intro: "We connect your tools so information flows on its own: notifications, tasks and updates without repetitive manual work.", features: [["Triggers", "A form, a sale or a date starts the flow."], ["Actions", "Emails, tasks, alerts and records."], ["Connections", "Between your site, CRM, calendar and more."]] },
  },
};

type Props = { params: Promise<{ service: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const isService = (v: string): v is ServiceKey => (SERVICE_ORDER as string[]).includes(v);

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { service } = await params; if (!isService(service)) return {};
  const lang: Lang = (await searchParams).lang === "en" ? "en" : "es";
  const v = COPY[lang].services[service];
  return {
    metadataBase: new URL(SITE_ORIGIN), title: `${v.name} · Avalon Core Agency`, description: v.short, robots: { index: true, follow: true },
    openGraph: { title: `${v.name} · Avalon Core Agency`, description: v.short, type: "website", siteName: "Avalon Core Agency", locale: lang === "es" ? "es_ES" : "en_US" },
  };
}

export default async function ServicePage({ params, searchParams }: Props) {
  const { service } = await params; if (!isService(service)) notFound();
  const lang: Lang = (await searchParams).lang === "en" ? "en" : "es";
  const t = COPY[lang], v = t.services[service], d = DETAIL[lang][service], q = qs(lang);
  const visual = (["ecommerce", "receptionist", "automation", "marketing"] as const).find(x => x === service);
  const related = SERVICE_ORDER.filter(k => k !== service).slice(0, 3);
  return (
    <SiteChrome lang={lang} path={`/soluciones/${service}`}>
      <section className={s.svcHero} aria-labelledby="h-svc">
        <div className={`${s.wrap} ${s.svcGrid}`}>
          <div className={s.heroIntro}>
            <p className={s.crumb}><a href={`/${q}#soluciones`}>{t.nav.solutions}</a>{d.family ? ` · ${d.family}` : ""}</p>
            <span className={s.cardIcon} style={{ marginBottom: 16 }}><Icon name={service} /></span>
            <h1 id="h-svc" className={s.h1} style={{ fontSize: "clamp(38px,5.4vw,68px)" }}>{v.name}</h1>
            <p className={s.lead}>{d.intro}</p>
            <div className={s.ctas}><a className={`${s.btn} ${s.primary}`} href="#cotizacion">{t.eco.propose}<Icon name="arrow" size={18} /></a><a className={`${s.btn} ${s.ghost}`} href="#demo">{t.nav.showroom}</a></div>
          </div>
          <div className={s.heroArtIn}>{visual
            ? <img className={s.demoImg} src={MEDIA.products[visual].src} srcSet={`/brand/${visual}-720.webp 720w, ${MEDIA.products[visual].src} 1440w`} sizes="(max-width: 980px) 100vw, 50vw" width={1440} height={1078} alt={MEDIA.products[visual].alt[lang]} fetchPriority="high" />
            : <img className={s.demoImg} src={MEDIA.devices.src} srcSet={`/brand/devices-960.webp 960w, ${MEDIA.devices.src} 1920w`} sizes="(max-width: 980px) 100vw, 50vw" width={1920} height={1080} alt={MEDIA.devices.alt[lang]} fetchPriority="high" />}</div>
        </div>
      </section>
      <section className={s.section} aria-label={lang === "es" ? "Funciones" : "Features"}>
        <div className={`${s.wrap} ${s.svcFeatures}`}>{d.features.map(([h, p], i) => <Reveal key={h} className={s.card} delay={i * 80}>
          <span className={s.cardIcon}><Icon name="check" /></span><h3>{h}</h3><p>{p}</p></Reveal>)}</div>
      </section>
      <section id="demo" className={s.section} aria-labelledby="h-demo">
        <div className={s.wrap}>
          <Reveal className={s.head}><p className={s.eyebrow}>{t.show.eyebrow}</p><h2 id="h-demo" className={s.h2}>{v.name}</h2><p className={s.sub}>{t.show.lead}</p></Reveal>
          <div className={s.showroom}><span className={s.badge}>{t.show.badge}</span><ServiceDemo lang={lang} service={service} /><p className={s.needs}>{t.show.needs}</p></div>
        </div>
      </section>
      <section className={s.section} aria-label={lang === "es" ? "Soluciones relacionadas" : "Related solutions"}>
        <div className={`${s.wrap} ${s.cards}`}>{related.map(k => <a key={k} className={s.card} href={`/soluciones/${k}${q}`}>
          <span className={s.cardIcon}><Icon name={k} /></span><h3>{t.services[k].name}</h3><p>{t.services[k].short}</p></a>)}</div>
      </section>
      <section id="cotizacion" className={s.section} aria-labelledby="h-quote">
        <div className={s.wrap}><div className={s.contact}>
          <img className={s.contactBg} src={MEDIA.closing.src} alt="" width={1920} height={1080} loading="lazy" decoding="async" />
          <div className={s.contactGrid}>
            <div><p className={s.eyebrow}>{t.contact.eyebrow}</p><h2 id="h-quote" className={s.h2}>{t.contact.title}</h2><p className={s.lead}>{t.contact.lead}</p></div>
            <div className={s.formCard}><QuoteForm lang={lang} /></div>
          </div>
        </div></div>
      </section>
    </SiteChrome>
  );
}
