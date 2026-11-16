"use client";
/* eslint-disable @next/next/no-img-element -- pre-optimized static WebP with srcset/sizes; avoids the Vercel image-optimization quota. */
import { useId, useState } from "react";
import { COPY, SERVICE_ORDER, type Lang, type ServiceKey } from "./copy";
import { Icon } from "./icons";
import { MEDIA } from "./media";
import s from "./landing.module.css";

/** Local, self-contained demos with sample data. Nothing here calls a backend, phone line or ad account. */
const D = {
  es: {
    website: { pages: ["Inicio", "Servicios", "Contacto"], hero: ["Tu negocio, en su mejor versión", "Diseño rápido, claro y listo para convertir."], url: "tunegocio.com" },
    ecommerce: { items: [["Zapatillas", 89], ["Reloj", 149], ["Mochila", 64]] as [string, number][], add: "Añadir", cart: "Carrito", total: "Total", empty: "Vacío" },
    crm: { cols: ["Nuevo", "Propuesta", "Ganado"], deals: [["Clínica Norte", "Website + CRM"], ["Barbería Centro", "Reservas"], ["Roofing Pro", "Funnels"]], kpis: ["Oportunidades", "En propuesta", "Ganadas"], move: "Avanzar →" },
    receptionist: { steps: ["Llamada entrante", "Saludo y motivo", "Consulta de disponibilidad", "Cita propuesta", "Aviso a tu equipo"], next: "Siguiente paso", reset: "Reiniciar", note: "Flujo ilustrativo: no hay una línea telefónica conectada en esta demo." },
    chatbots: { q: [["¿Cuál es su horario?", "Abrimos de lunes a sábado, de 9:00 a 19:00. (Respuesta de ejemplo)"], ["¿Puedo reservar una cita?", "¡Claro! Te comparto los horarios disponibles y confirmo tu cita. (Respuesta de ejemplo)"], ["¿Hacen presupuestos?", "Sí. Déjame tu correo y te enviaremos una propuesta. (Respuesta de ejemplo)"]] as [string, string][], hello: "Hola 👋 Soy el asistente de demostración. Elige una pregunta." },
    marketing: { camps: ["Local", "Remarketing", "Temporada"], label: "Rendimiento ilustrativo por semana" },
    funnels: { steps: ["Anuncio", "Landing", "Formulario", "CRM"], hint: "Toca cada etapa para ver qué ocurre en ella.", info: ["El anuncio llega a tu público objetivo.", "Una página enfocada explica tu oferta.", "El visitante deja sus datos con consentimiento.", "La oportunidad entra a tu CRM con su origen."] },
    automation: { nodes: ["Formulario", "CRM", "Correo", "Calendario"], run: "Ejecutar flujo", done: "Flujo completado (simulado)" },
  },
  en: {
    website: { pages: ["Home", "Services", "Contact"], hero: ["Your business, at its best", "Fast, clear design built to convert."], url: "yourbusiness.com" },
    ecommerce: { items: [["Sneakers", 89], ["Watch", 149], ["Backpack", 64]] as [string, number][], add: "Add", cart: "Cart", total: "Total", empty: "Empty" },
    crm: { cols: ["New", "Proposal", "Won"], deals: [["North Clinic", "Website + CRM"], ["Downtown Barber", "Booking"], ["Roofing Pro", "Funnels"]], kpis: ["Opportunities", "In proposal", "Won"], move: "Advance →" },
    receptionist: { steps: ["Incoming call", "Greeting and reason", "Availability check", "Appointment offered", "Team notified"], next: "Next step", reset: "Restart", note: "Illustrative flow: no phone line is connected in this demo." },
    chatbots: { q: [["What are your hours?", "We're open Monday to Saturday, 9am to 7pm. (Sample answer)"], ["Can I book an appointment?", "Of course! I'll share available times and confirm it. (Sample answer)"], ["Do you give quotes?", "Yes. Leave your email and we'll send a proposal. (Sample answer)"]] as [string, string][], hello: "Hi 👋 I'm the demo assistant. Pick a question." },
    marketing: { camps: ["Local", "Retargeting", "Seasonal"], label: "Illustrative weekly performance" },
    funnels: { steps: ["Ad", "Landing", "Form", "CRM"], hint: "Tap each stage to see what happens.", info: ["The ad reaches your target audience.", "A focused page explains your offer.", "The visitor leaves details with consent.", "The opportunity lands in your CRM with its source."] },
    automation: { nodes: ["Form", "CRM", "Email", "Calendar"], run: "Run flow", done: "Flow completed (simulated)" },
  },
};

function Website({ lang }: { lang: Lang }) {
  const t = D[lang].website; const [p, setP] = useState(0);
  return <div className={s.browser}><div className={s.browserBar}><i /><i /><i /><span>{t.url}</span></div>
    <div className={s.site}><div className={s.siteNav}>{t.pages.map((x, i) => <button key={x} type="button" aria-pressed={p === i} onClick={() => setP(i)}>{x}</button>)}</div>
      <div className={s.siteHero} key={p}><b>{p === 0 ? t.hero[0] : t.pages[p]}</b><span>{t.hero[1]}</span></div>
      <div className={s.products}>{[0, 1, 2].map(i => <div key={i} className={s.product} style={{ background: "#eef0fb" }}><div className={s.thumb} style={{ filter: `hue-rotate(${i * 40 + p * 30}deg)` }} /></div>)}</div></div></div>;
}
function Ecommerce({ lang }: { lang: Lang }) {
  const t = D[lang].ecommerce; const [cart, setCart] = useState<number[]>([]);
  const total = cart.reduce((a, i) => a + t.items[i][1], 0);
  return <div className={s.screen}><h4>{t.cart}: {cart.length || t.empty} · {t.total} ${total}</h4>
    <div className={s.products}>{t.items.map(([n, pr], i) => <div key={n} className={s.product}><div className={s.thumb} style={{ filter: `hue-rotate(${i * 50}deg)` }} />
      <b>{n}</b><small>${pr}</small><button type="button" className={s.demoBtn} onClick={() => setCart(c => [...c, i])}>{t.add}</button></div>)}</div></div>;
}
function Crm({ lang }: { lang: Lang }) {
  const t = D[lang].crm; const [stage, setStage] = useState([0, 0, 1]);
  const count = (c: number) => stage.filter(x => x === c).length;
  return <div className={s.screen}><div className={s.kpis}>{t.kpis.map((k, i) => <div key={k} className={s.kpi}><b>{i === 0 ? stage.length : count(i)}</b><span>{k}</span></div>)}</div>
    <div className={s.cols}>{t.cols.map((c, ci) => <div key={c} className={s.col}><h5>{c}</h5>
      {t.deals.map(([n, sub], di) => stage[di] === ci && <div key={n} className={s.deal}><b>{n}</b><small>{sub}</small>
        {ci < 2 && <button type="button" className={s.demoBtn} onClick={() => setStage(st => st.map((x, j) => j === di ? x + 1 : x))}>{t.move}</button>}</div>)}</div>)}</div></div>;
}
function Receptionist({ lang }: { lang: Lang }) {
  const t = D[lang].receptionist; const [i, setI] = useState(0);
  return <div className={s.screen}><ol className={s.steps}>{t.steps.map((x, k) => <li key={x} data-on={k <= i}><span>{k + 1}</span>{x}</li>)}</ol>
    <div className={s.chips} style={{ marginTop: 14 }}>{i < t.steps.length - 1
      ? <button type="button" className={s.chip} onClick={() => setI(i + 1)}>{t.next} →</button>
      : <button type="button" className={s.chip} onClick={() => setI(0)}>{t.reset}</button>}</div>
    <p style={{ color: "#9aa3d8", fontSize: 12, marginBottom: 0 }}>{t.note}</p></div>;
}
function Chatbots({ lang }: { lang: Lang }) {
  const t = D[lang].chatbots; const [msgs, setMsgs] = useState<[string, string][]>([["bot", t.hello]]);
  return <div className={s.screen}><div className={s.msgs} aria-live="polite">{msgs.map(([from, text], i) => <div key={i} className={s.msg} data-from={from}>{text}</div>)}</div>
    <div className={s.chips}>{t.q.map(([q, a]) => <button key={q} type="button" className={s.chip} onClick={() => setMsgs(m => [...m.slice(-4), ["user", q], ["bot", a]])}>{q}</button>)}</div></div>;
}
function Marketing({ lang }: { lang: Lang }) {
  const t = D[lang].marketing; const [c, setC] = useState(0);
  const data = [[40, 55, 48, 70, 66, 82, 90], [30, 34, 52, 49, 60, 72, 68], [20, 28, 46, 80, 94, 70, 58]][c];
  return <div className={s.screen}><h4>{t.label}</h4><div className={s.chips}>{t.camps.map((x, i) => <button key={x} type="button" className={s.chip} aria-pressed={c === i} onClick={() => setC(i)}>{x}</button>)}</div>
    <div className={s.bars} aria-hidden="true">{data.map((v, i) => <i key={i} style={{ height: `${v}%` }} />)}</div></div>;
}
function Funnels({ lang }: { lang: Lang }) {
  const t = D[lang].funnels; const [i, setI] = useState(0);
  return <div className={s.screen}><div className={s.flowRow}>{t.steps.map((x, k) => <span key={x} style={{ display: "contents" }}>
    {k > 0 && <span className={s.link} data-on={k <= i} />}
    <button type="button" className={s.node} data-on={k <= i} onClick={() => setI(k)} style={{ color: "inherit", font: "inherit", cursor: "pointer" }}>{x}</button></span>)}</div>
    <p style={{ marginTop: 16 }} aria-live="polite">{t.info[i]}</p><small style={{ color: "#9aa3d8" }}>{t.hint}</small></div>;
}
function Automation({ lang }: { lang: Lang }) {
  const t = D[lang].automation; const [i, setI] = useState(-1);
  const run = () => { setI(0); t.nodes.forEach((_, k) => setTimeout(() => setI(k), 450 * k)); setTimeout(() => setI(t.nodes.length), 450 * t.nodes.length); };
  return <div className={s.screen}><div className={s.flowRow}>{t.nodes.map((x, k) => <span key={x} style={{ display: "contents" }}>
    {k > 0 && <span className={s.link} data-on={i >= k} />}<span className={s.node} data-on={i >= k}>{x}</span></span>)}</div>
    <div className={s.chips} style={{ marginTop: 18 }}><button type="button" className={s.chip} onClick={run}>{t.run}</button></div>
    <p aria-live="polite" style={{ color: "#9aa3d8" }}>{i >= t.nodes.length ? t.done : ""}</p></div>;
}

const DEMOS: Record<ServiceKey, (p: { lang: Lang }) => React.ReactNode> = {
  website: Website, ecommerce: Ecommerce, crm: Crm, receptionist: Receptionist, chatbots: Chatbots, marketing: Marketing, funnels: Funnels, automation: Automation,
};
const VISUAL: Partial<Record<ServiceKey, keyof typeof MEDIA.products>> = { ecommerce: "ecommerce", receptionist: "receptionist", automation: "automation", marketing: "marketing" };

export function Showroom({ lang }: { lang: Lang }) {
  const t = COPY[lang]; const [k, setK] = useState<ServiceKey>("crm"); const id = useId();
  const Demo = DEMOS[k]; const svc = t.services[k]; const v = VISUAL[k];
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = SERVICE_ORDER.indexOf(k) + (e.key === "ArrowRight" ? 1 : -1);
    const next = SERVICE_ORDER[(i + SERVICE_ORDER.length) % SERVICE_ORDER.length];
    setK(next); document.getElementById(`${id}-${next}`)?.focus();
  };
  return <div className={s.showroom}>
    <div className={s.tabs} role="tablist" aria-label={t.show.title} onKeyDown={onKey}>
      {SERVICE_ORDER.map(key => <button key={key} id={`${id}-${key}`} type="button" role="tab" className={s.tab} aria-selected={k === key}
        aria-controls={`${id}-panel`} tabIndex={k === key ? 0 : -1} onClick={() => setK(key)}><Icon name={key} size={18} />{t.services[key].name}</button>)}
    </div>
    <div className={s.panel} id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${k}`} key={k}>
      <div className={s.panelText}>
        <span className={s.badge}>{t.show.badge}</span>
        <h3>{svc.name}</h3><p>{svc.short}</p>
        <ul className={s.benefits}>{svc.benefits.map(b => <li key={b}><Icon name="check" size={16} />{b}</li>)}</ul>
        {v && <img className={s.demoImg} style={{ marginTop: 16 }} src={`/brand/${v}-720.webp`} width={720} height={539} loading="lazy" decoding="async" alt={MEDIA.products[v].alt[lang]} />}
        <div className={s.cardLinks} style={{ marginTop: 16 }}>
          <a href={`/soluciones/${k}${lang === "en" ? "?lang=en" : ""}`}>{t.eco.explore} <Icon name="arrow" size={16} /></a>
          <a href="#cotizacion">{t.eco.propose}</a>
        </div>
        <p className={s.needs}>{t.show.needs}</p>
      </div>
      <div className={s.device}><Demo lang={lang} /></div>
    </div>
  </div>;
}

/** One service's interactive demo, framed as a device (used on /soluciones/[service]). */
export function ServiceDemo({ lang, service }: { lang: Lang; service: ServiceKey }) {
  const Demo = DEMOS[service];
  return <div className={s.device}><Demo lang={lang} /></div>;
}
