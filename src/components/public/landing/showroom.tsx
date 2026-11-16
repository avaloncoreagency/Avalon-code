"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { COPY, SERVICE_ORDER, type Lang, type ServiceKey } from "./copy";
import { Icon } from "./icons";
import { VISUAL_FOR } from "./media";
import { ProductVideo } from "./product-video";
import s from "./landing.module.css";

/**
 * Showroom demos: self-contained mini-apps with sample data. They behave like the real product (state, flows,
 * results) but never call a backend, phone line, payment provider or ad account — every screen says so.
 */
type T = (es: string, en: string) => string;
const useT = (lang: Lang): T => (es, en) => (lang === "es" ? es : en);
const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const Toast = ({ msg }: { msg: string }) => msg ? <div className={s.toast} role="status">{msg}</div> : null;
function useToast(): [string, (m: string) => void] {
  const [m, setM] = useState(""); const tm = useRef<number>(0);
  return [m, (x: string) => { setM(x); window.clearTimeout(tm.current); tm.current = window.setTimeout(() => setM(""), 2600); }];
}

/* 1 · Website builder: pages, brand color, device preview, a CTA that "creates" a lead. */
function Website({ lang }: { lang: Lang }) {
  const t = useT(lang); const [page, setPage] = useState(0); const [hue, setHue] = useState(0); const [mobile, setMobile] = useState(false); const [toast, show] = useToast();
  const colors = ["#3554ff", "#0f9f8f", "#d9480f"]; const c = colors[hue];
  const pages = [t("Inicio", "Home"), t("Servicios", "Services"), t("Contacto", "Contact")];
  return <div className={s.app}>
    <div className={s.appBar}><div className={s.seg}>{pages.map((p, i) => <button key={p} type="button" aria-pressed={page === i} onClick={() => setPage(i)}>{p}</button>)}</div>
      <div className={s.seg}>{colors.map((x, i) => <button key={x} type="button" aria-label={t("Color de marca", "Brand color") + " " + (i + 1)} aria-pressed={hue === i} onClick={() => setHue(i)}><i className={s.swatch} style={{ background: x }} /></button>)}</div>
      <div className={s.seg}><button type="button" aria-pressed={!mobile} onClick={() => setMobile(false)}>{t("Escritorio", "Desktop")}</button><button type="button" aria-pressed={mobile} onClick={() => setMobile(true)}>{t("Móvil", "Mobile")}</button></div></div>
    <div className={s.browser} style={{ maxWidth: mobile ? 300 : "100%", margin: "0 auto", transition: "max-width .5s cubic-bezier(.2,.8,.2,1)" }}>
      <div className={s.browserBar}><i /><i /><i /><span>{t("tunegocio.com", "yourbusiness.com")}/{["", t("servicios", "services"), t("contacto", "contact")][page]}</span></div>
      <div className={s.site} key={page + "-" + hue}>
        {page === 0 && <><div className={s.siteHero} style={{ background: `linear-gradient(135deg, #12173f, ${c})` }}><b>{t("Tu negocio, en su mejor versión", "Your business, at its best")}</b><span>{t("Reserva en 30 segundos. Respuesta el mismo día.", "Book in 30 seconds. Same-day reply.")}</span>
          <button type="button" className={s.siteCta} style={{ color: c }} onClick={() => show(t("✓ Solicitud enviada al CRM (demo)", "✓ Request sent to the CRM (demo)"))}>{t("Pedir presupuesto", "Get a quote")}</button></div>
          <div className={s.siteRow} data-m={mobile}>{[t("Rápido", "Fast"), t("Confiable", "Reliable"), t("Local", "Local")].map(x => <div key={x} className={s.siteTile}><i style={{ background: c }} />{x}</div>)}</div></>}
        {page === 1 && <div className={s.siteRow} data-m={mobile}>{[[t("Instalación", "Installation"), "$450"], [t("Mantenimiento", "Maintenance"), "$120"], [t("Urgencias", "Emergency"), "$190"]].map(([n, p]) => <div key={n} className={s.siteTile}><i style={{ background: c }} /><b>{n}</b><small>{t("desde", "from")} {p}</small></div>)}</div>}
        {page === 2 && <form className={s.siteForm} onSubmit={e => { e.preventDefault(); show(t("✓ Lead creado con su origen: «Website · Contacto» (demo)", "✓ Lead created with source “Website · Contact” (demo)")); }}>
          <input aria-label={t("Nombre", "Name")} placeholder={t("Tu nombre", "Your name")} /><input aria-label="Email" placeholder="tu@email.com" type="email" />
          <button type="submit" className={s.siteCta} style={{ background: c, color: "#fff" }}>{t("Enviar", "Send")}</button></form>}
      </div>
    </div><Toast msg={toast} />
  </div>;
}

/* 2 · E-commerce: filter, product detail, cart and a 4-step checkout. */
function Ecommerce({ lang }: { lang: Lang }) {
  const t = useT(lang);
  const items = useMemo(() => [
    { id: 1, n: t("Zapatillas Aero", "Aero sneakers"), p: 89, cat: "ropa", h: 230 }, { id: 2, n: t("Reloj Orbit", "Orbit watch"), p: 149, cat: "acc", h: 260 },
    { id: 3, n: t("Mochila Nova", "Nova backpack"), p: 64, cat: "acc", h: 190 }, { id: 4, n: t("Chaqueta Arc", "Arc jacket"), p: 120, cat: "ropa", h: 300 },
  ], [t]);
  const [cat, setCat] = useState("all"); const [sel, setSel] = useState<number | null>(null); const [size, setSize] = useState("M");
  const [cart, setCart] = useState<{ id: number; size: string }[]>([]); const [step, setStep] = useState(0);
  const sub = cart.reduce((a, c) => a + (items.find(i => i.id === c.id)?.p ?? 0), 0), ship = sub > 150 || !sub ? 0 : 9;
  const steps = [t("Carrito", "Cart"), t("Envío", "Shipping"), t("Pago", "Payment"), t("Confirmado", "Confirmed")];
  const p = items.find(i => i.id === sel);
  return <div className={s.app}><div className={s.shop}>
    <div><div className={s.seg} style={{ marginBottom: 12 }}>{[["all", t("Todo", "All")], ["ropa", t("Ropa", "Apparel")], ["acc", t("Accesorios", "Accessories")]].map(([k, l]) => <button key={k} type="button" aria-pressed={cat === k} onClick={() => setCat(k)}>{l}</button>)}</div>
      {p ? <div className={s.pdp}><div className={s.thumb} style={{ filter: `hue-rotate(${p.h}deg)` }} /><div><b>{p.n}</b><p className={s.price}>{money(p.p)}</p>
        <div className={s.seg}>{["S", "M", "L"].map(z => <button key={z} type="button" aria-pressed={size === z} onClick={() => setSize(z)}>{z}</button>)}</div>
        <div className={s.row2}><button type="button" className={s.demoPrimary} onClick={() => { setCart(c => [...c, { id: p.id, size }]); setSel(null); setStep(0); }}>{t("Añadir al carrito", "Add to cart")}</button><button type="button" className={s.demoBtn} onClick={() => setSel(null)}>← {t("Volver", "Back")}</button></div></div></div>
        : <div className={s.products}>{items.filter(i => cat === "all" || i.cat === cat).map(i => <button key={i.id} type="button" className={s.product} onClick={() => setSel(i.id)}><div className={s.thumb} style={{ filter: `hue-rotate(${i.h}deg)` }} /><b>{i.n}</b><small>{money(i.p)}</small></button>)}</div>}
    </div>
    <aside className={s.cart} aria-label={steps[0]}>
      <ol className={s.stepper}>{steps.map((x, i) => <li key={x} data-on={i <= step}>{x}</li>)}</ol>
      {step === 3 ? <div className={s.done}><Icon name="check" size={28} /><b>{t("Pedido #1024 confirmado", "Order #1024 confirmed")}</b><small>{t("Pago simulado: no se cobró nada.", "Simulated payment: nothing was charged.")}</small><button type="button" className={s.demoBtn} onClick={() => { setCart([]); setStep(0); }}>{t("Nueva compra", "New order")}</button></div> : <>
        <ul className={s.cartList}>{cart.length ? cart.map((c, i) => { const it = items.find(x => x.id === c.id)!; return <li key={i}><span>{it.n} · {c.size}</span><span>{money(it.p)}</span></li>; }) : <li><span>{t("Tu carrito está vacío", "Your cart is empty")}</span></li>}</ul>
        <div className={s.totals}><span>{t("Subtotal", "Subtotal")} {money(sub)}</span><span>{t("Envío", "Shipping")} {ship ? money(ship) : t("gratis", "free")}</span><b>Total {money(sub + ship)}</b></div>
        <button type="button" className={s.demoPrimary} disabled={!cart.length} onClick={() => setStep(x => Math.min(3, x + 1))}>{[t("Ir al envío", "Go to shipping"), t("Continuar al pago", "Continue to payment"), t("Pagar (simulado)", "Pay (simulated)")][step]}</button></>}
    </aside></div></div>;
}

/* 3 · CRM: pipeline, search, deal panel with timeline, stage moves and logged activities that update KPIs. */
type Deal = { id: number; n: string; who: string; v: number; st: number; log: string[] };
function Crm({ lang }: { lang: Lang }) {
  const t = useT(lang);
  const cols = [t("Nuevo", "New"), t("Calificado", "Qualified"), t("Propuesta", "Proposal"), t("Ganado", "Won")];
  const [deals, setDeals] = useState<Deal[]>(() => [
    { id: 1, n: t("Clínica Norte", "North Clinic"), who: "Laura M.", v: 4800, st: 0, log: [t("Lead desde el website", "Lead from the website")] },
    { id: 2, n: t("Barbería Centro", "Downtown Barber"), who: "Carlos R.", v: 1900, st: 1, log: [t("Llamada atendida por IA", "Call handled by AI")] },
    { id: 3, n: "Roofing Pro", who: "Mike D.", v: 7200, st: 2, log: [t("Propuesta enviada", "Proposal sent")] },
    { id: 4, n: t("Café Aroma", "Aroma Café"), who: "Ana P.", v: 2600, st: 3, log: [t("Contrato firmado", "Contract signed")] },
  ]);
  const [open, setOpen] = useState<number | null>(1); const [q, setQ] = useState("");
  const d = deals.find(x => x.id === open);
  const upd = (id: number, f: (d: Deal) => Deal) => setDeals(ds => ds.map(x => x.id === id ? f(x) : x));
  const pipe = deals.filter(x => x.st < 3).reduce((a, x) => a + x.v, 0), won = deals.filter(x => x.st === 3);
  return <div className={s.app}><div className={s.screen}>
    <div className={s.kpis}><div className={s.kpi}><b>{money(pipe)}</b><span>{t("En pipeline", "In pipeline")}</span></div><div className={s.kpi}><b>{won.length}</b><span>{t("Ganadas", "Won")}</span></div><div className={s.kpi}><b>{money(won.reduce((a, x) => a + x.v, 0))}</b><span>{t("Ventas", "Revenue")}</span></div></div>
    <input className={s.search} value={q} onChange={e => setQ(e.target.value)} placeholder={t("Buscar oportunidad…", "Search opportunities…")} aria-label={t("Buscar", "Search")} />
    <div className={s.crmGrid}>
      <div className={s.cols4}>{cols.map((c, ci) => <div key={c} className={s.col}><p className={s.colHead}>{c} <small>{deals.filter(x => x.st === ci).length}</small></p>
        {deals.filter(x => x.st === ci && x.n.toLowerCase().includes(q.toLowerCase())).map(x => <button key={x.id} type="button" className={s.deal} data-open={open === x.id} onClick={() => setOpen(x.id)}><b>{x.n}</b><small>{money(x.v)}</small></button>)}</div>)}</div>
      {d && <div className={s.dealPanel} key={d.id}><b>{d.n}</b><small>{d.who} · {money(d.v)} · {cols[d.st]}</small>
        <ul className={s.timeline}>{d.log.slice().reverse().map((l, i) => <li key={i}>{l}</li>)}</ul>
        <div className={s.row2}>
          {d.st < 3 && <button type="button" className={s.demoPrimary} onClick={() => upd(d.id, x => ({ ...x, st: x.st + 1, log: [...x.log, `${t("Movido a", "Moved to")} ${cols[x.st + 1]}`] }))}>{t("Avanzar etapa", "Advance stage")} →</button>}
          <button type="button" className={s.demoBtn} onClick={() => upd(d.id, x => ({ ...x, log: [...x.log, t("Llamada registrada · tarea creada para mañana", "Call logged · task created for tomorrow")] }))}>{t("Registrar llamada", "Log a call")}</button>
        </div></div>}
    </div></div></div>;
}

/* 4 · AI Receptionist: three scripted call scenarios played turn by turn, ending in a CRM-ready summary. */
function Receptionist({ lang }: { lang: Lang }) {
  const t = useT(lang);
  const scen = [
    { k: t("Agendar cita", "Book appointment"), lines: [["c", t("Hola, quiero una cita para un corte este viernes.", "Hi, I'd like a haircut appointment this Friday.")], ["a", t("¡Claro! Tengo viernes a las 10:00 o 16:30. ¿Cuál prefieres?", "Sure! I have Friday at 10:00 or 4:30 pm. Which works?")], ["c", t("A las 16:30.", "4:30 please.")], ["a", t("Listo: viernes 16:30. Te envío confirmación por SMS.", "Done: Friday 4:30 pm. I'll text you a confirmation.")]], out: [t("Motivo: cita", "Reason: appointment"), t("Cita: viernes 16:30", "Booked: Friday 4:30 pm"), t("Contacto guardado en el CRM", "Contact saved to CRM")] },
    { k: t("Pregunta de precios", "Pricing question"), lines: [["c", t("¿Cuánto cuesta un mantenimiento de aire acondicionado?", "How much is an AC tune-up?")], ["a", t("El mantenimiento empieza en $120. ¿Quieres que un técnico te dé un presupuesto exacto?", "Tune-ups start at $120. Want a technician to give you an exact quote?")], ["c", t("Sí, por favor.", "Yes, please.")], ["a", t("Perfecto, te contactarán hoy. ¿Tu código postal?", "Great, they'll contact you today. Your ZIP code?")]], out: [t("Motivo: presupuesto", "Reason: quote"), t("Lead calificado · prioridad alta", "Qualified lead · high priority"), t("Tarea creada para el equipo", "Task created for the team")] },
    { k: t("Urgencia", "Emergency"), lines: [["c", t("Tengo una fuga de agua ahora mismo.", "I have a water leak right now.")], ["a", t("Entiendo que es urgente. Te paso con el técnico de guardia.", "I understand it's urgent. Transferring you to the on-call technician.")]], out: [t("Motivo: urgencia", "Reason: emergency"), t("Transferida a una persona", "Transferred to a person"), t("Aviso enviado al equipo", "Team alerted")] },
  ];
  const [sc, setSc] = useState(0); const [n, setN] = useState(0); const [run, setRun] = useState(false);
  const total = scen[sc].lines.length;
  useEffect(() => {
    if (!run) return; if (n >= total) { setRun(false); return; }
    const id = window.setTimeout(() => setN(x => x + 1), n === 0 ? 700 : 1300); return () => window.clearTimeout(id);
  }, [run, n, total]);
  const L = scen[sc].lines, finished = n >= L.length;
  const status = !run && !n ? t("Lista para recibir llamadas", "Ready for calls") : finished ? t("Llamada finalizada", "Call ended") : n === 0 ? t("Sonando…", "Ringing…") : t("En curso", "In progress");
  return <div className={s.app}><div className={s.screen}>
    <div className={s.chips}>{scen.map((x, i) => <button key={x.k} type="button" className={s.chip} aria-pressed={sc === i} onClick={() => { setSc(i); setN(0); setRun(false); }}>{x.k}</button>)}</div>
    <div className={s.callBar}><span className={s.pulse} data-on={run} />{status}<button type="button" className={s.demoPrimary} onClick={() => { setN(0); setRun(true); }}>{t("Simular llamada", "Simulate call")}</button></div>
    <div className={s.msgs} aria-live="polite">{L.slice(0, n).map(([w, x], i) => <div key={i} className={s.msg} data-from={w === "c" ? "user" : "bot"}><small>{w === "c" ? t("Cliente", "Caller") : t("Recepcionista IA", "AI receptionist")}</small>{x}</div>)}</div>
    {finished && n > 0 && <div className={s.summary}><b>{t("Resumen enviado al CRM", "Summary sent to CRM")}</b>{scen[sc].out.map(o => <span key={o}><Icon name="check" size={14} /> {o}</span>)}</div>}
    <p className={s.fine}>{t("Llamada simulada: no hay una línea telefónica conectada en esta demo.", "Simulated call: no phone line is connected in this demo.")}</p>
  </div></div>;
}

/* 5 · AI Chatbot: free text with intent matching, typing indicator, quick replies and lead capture. */
function Chatbots({ lang }: { lang: Lang }) {
  const t = useT(lang);
  const intents: [RegExp, string][] = [
    [/hora|abre|cierra|hour|open|close/i, t("Abrimos de lunes a sábado, 9:00–19:00.", "We're open Monday–Saturday, 9am–7pm.")],
    [/precio|cuesta|cost|price|cuánto|how much/i, t("Nuestros servicios empiezan en $49. ¿Te preparo un presupuesto? Escríbeme tu correo.", "Services start at $49. Want a quote? Type your email.")],
    [/cita|reserv|book|appoint/i, t("Tengo disponibilidad mañana 11:00 y 15:00. ¿Cuál prefieres?", "I have tomorrow at 11:00 and 3:00 pm. Which one?")],
    [/dónde|donde|ubica|direc|where|address|located/i, t("Estamos en el centro, Calle Principal 123. ¿Te envío el mapa?", "We're downtown, 123 Main St. Want the map?")],
    [/humano|persona|agente|human|person|agent/i, t("Te paso con una persona del equipo. Te escribirán en breve.", "Handing you to a team member. They'll reply shortly.")],
  ];
  const [msgs, setMsgs] = useState<[string, string][]>([["bot", t("Hola 👋 Soy el asistente de demostración. Pregúntame lo que quieras sobre horarios, precios, citas o ubicación.", "Hi 👋 I'm the demo assistant. Ask me about hours, prices, bookings or location.")]]);
  const [txt, setTxt] = useState(""); const [typing, setTyping] = useState(false); const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" }); }, [msgs, typing]);
  const ask = (q: string) => {
    if (!q.trim()) return; setMsgs(m => [...m, ["user", q]]); setTxt(""); setTyping(true);
    const email = /\S+@\S+\.\S+/.test(q);
    const a = email ? t("¡Gracias! Creé tu solicitud y un asesor te enviará la propuesta. (Lead de demostración, no se guardó)", "Thanks! I created your request and an advisor will send the proposal. (Demo lead, nothing was saved)")
      : intents.find(([r]) => r.test(q))?.[1] ?? t("Buena pregunta. Puedo ayudarte con horarios, precios, citas o ubicación, o pasarte con una persona.", "Good question. I can help with hours, prices, bookings or location — or hand you to a person.");
    window.setTimeout(() => { setTyping(false); setMsgs(m => [...m, ["bot", a]]); }, 900);
  };
  return <div className={s.app}><div className={s.screen}>
    <div className={s.msgs} ref={box} aria-live="polite">{msgs.map(([f, x], i) => <div key={i} className={s.msg} data-from={f}>{x}</div>)}{typing && <div className={s.msg} data-from="bot"><span className={s.dots}><i /><i /><i /></span></div>}</div>
    <div className={s.chips}>{[t("¿Cuál es su horario?", "What are your hours?"), t("¿Cuánto cuesta?", "How much is it?"), t("Quiero una cita", "I want to book"), t("Hablar con una persona", "Talk to a person")].map(q => <button key={q} type="button" className={s.chip} onClick={() => ask(q)}>{q}</button>)}</div>
    <form className={s.chatForm} onSubmit={e => { e.preventDefault(); ask(txt); }}><input value={txt} onChange={e => setTxt(e.target.value)} placeholder={t("Escribe un mensaje…", "Type a message…")} aria-label={t("Mensaje", "Message")} /><button type="submit" className={s.demoPrimary}>{t("Enviar", "Send")}</button></form>
  </div></div>;
}

/* 6 · Marketing planner: objective, budget and radius → illustrative weekly projection and live ad preview. */
function Marketing({ lang }: { lang: Lang }) {
  const t = useT(lang); const [obj, setObj] = useState(0); const [budget, setBudget] = useState(600); const [radius, setRadius] = useState(10);
  const [head, setHead] = useState(t("¿Tu aire acondicionado no enfría?", "Is your AC not cooling?"));
  const k = [1, .55, 1.8][obj], base = budget / 10;
  const weeks = [0, 1, 2, 3].map(w => Math.round(base * k * (0.7 + w * 0.18) * (1 + radius / 60)));
  const max = Math.max(...weeks);
  const unit = [t("solicitudes", "requests"), t("ventas", "sales"), t("visitas ×10", "visits ×10")][obj];
  return <div className={s.app}><div className={s.mkt}>
    <div className={s.screen}>
      <div className={s.seg}>{[t("Leads", "Leads"), t("Ventas", "Sales"), t("Tráfico", "Traffic")].map((x, i) => <button key={x} type="button" aria-pressed={obj === i} onClick={() => setObj(i)}>{x}</button>)}</div>
      <label className={s.slider}>{t("Presupuesto mensual (lo pagas a la plataforma)", "Monthly budget (paid to the platform)")}: <b>{money(budget)}</b><input type="range" min={200} max={3000} step={100} value={budget} onChange={e => setBudget(+e.target.value)} /></label>
      <label className={s.slider}>{t("Radio de la campaña", "Campaign radius")}: <b>{radius} mi</b><input type="range" min={3} max={40} value={radius} onChange={e => setRadius(+e.target.value)} /></label>
      <div className={s.bars} aria-label={t("Proyección ilustrativa", "Illustrative projection")}>{weeks.map((v, i) => <i key={i} style={{ height: `${(v / max) * 100}%` }}><span>{v}</span></i>)}</div>
      <p className={s.fine}>{t(`Proyección ilustrativa de ${unit} por semana. No es una promesa de resultados.`, `Illustrative ${unit} per week. Not a promise of results.`)}</p>
    </div>
    <div className={s.adCard}><small>{t("Vista previa del anuncio", "Ad preview")} · Meta</small><div className={s.adImg} /><input value={head} onChange={e => setHead(e.target.value)} aria-label={t("Titular del anuncio", "Ad headline")} /><span>{t("Servicio el mismo día · presupuesto gratis", "Same-day service · free quote")}</span><button type="button" className={s.demoPrimary}>{[t("Solicitar presupuesto", "Get a quote"), t("Comprar ahora", "Shop now"), t("Más información", "Learn more")][obj]}</button></div>
  </div></div>;
}

/* 7 · Funnel: animated flow + editable stage conversion → leads from 1,000 visitors. */
function Funnels({ lang }: { lang: Lang }) {
  const t = useT(lang); const names = [t("Anuncio", "Ad"), t("Landing", "Landing"), t("Formulario", "Form"), t("CRM", "CRM")];
  const [rates, setRates] = useState([40, 25, 80]);
  const vals = [1000]; rates.forEach(r => vals.push(Math.round(vals[vals.length - 1] * r / 100)));
  return <div className={s.app}><div className={s.screen}>
    <div className={s.funnel}>{vals.map((v, i) => <div key={i} className={s.fStage} style={{ width: `${40 + (vals[i] / 1000) * 60}%` }}><b>{v.toLocaleString()}</b><span>{names[i]}</span>{i < 3 && <span className={s.flowDots} aria-hidden="true"><i /><i /><i /></span>}</div>)}</div>
    <div className={s.rates}>{rates.map((r, i) => <label key={i} className={s.slider}>{names[i]} → {names[i + 1]}: <b>{r}%</b><input type="range" min={5} max={95} value={r} onChange={e => setRates(x => x.map((y, j) => j === i ? +e.target.value : y))} /></label>)}</div>
    <p className={s.fine}>{t(`Con estas tasas, 1.000 visitas generan ${vals[3]} oportunidades en tu CRM, cada una con su origen. Cifras de ejemplo.`, `With these rates, 1,000 visits create ${vals[3]} opportunities in your CRM, each with its source. Sample numbers.`)}</p>
  </div></div>;
}

/* 8 · Automations: pick a trigger and actions, run a test, watch nodes fire and a timestamped log. */
function Automation({ lang }: { lang: Lang }) {
  const t = useT(lang);
  const triggers = [t("Nuevo formulario web", "New web form"), t("Venta confirmada", "Sale confirmed"), t("Cita mañana", "Appointment tomorrow")];
  const actions = [t("Crear lead en el CRM", "Create CRM lead"), t("Enviar correo de bienvenida", "Send welcome email"), t("Notificar al equipo", "Notify the team"), t("Crear tarea de seguimiento", "Create follow-up task"), t("Recordatorio por SMS", "SMS reminder")];
  const [tr, setTr] = useState(0); const [on, setOn] = useState([true, true, true, false, false]); const [i, setI] = useState(-1); const [log, setLog] = useState<string[]>([]);
  const chosen = actions.filter((_, k) => on[k]);
  const run = () => {
    setLog([]); setI(0);
    const steps = [triggers[tr], ...chosen];
    steps.forEach((x, k) => window.setTimeout(() => { setI(k); setLog(l => [...l, `00:0${k}.${(k * 37) % 100} · ${k === 0 ? t("Disparador", "Trigger") : t("Acción", "Action")}: ${x} ✓`]); }, 500 * k));
    window.setTimeout(() => setI(steps.length), 500 * steps.length);
  };
  return <div className={s.app}><div className={s.autoGrid}>
    <div className={s.screen}>
      <p className={s.mini}>{t("Cuando…", "When…")}</p><div className={s.chips}>{triggers.map((x, k) => <button key={x} type="button" className={s.chip} aria-pressed={tr === k} onClick={() => setTr(k)}>{x}</button>)}</div>
      <p className={s.mini} style={{ marginTop: 14 }}>{t("Entonces…", "Then…")}</p><div className={s.checks}>{actions.map((x, k) => <label key={x}><input type="checkbox" checked={on[k]} onChange={() => setOn(o => o.map((y, j) => j === k ? !y : y))} />{x}</label>)}</div>
      <button type="button" className={s.demoPrimary} style={{ marginTop: 14 }} onClick={run} disabled={!chosen.length}>{t("Ejecutar prueba", "Run test")}</button>
    </div>
    <div className={s.screen}>
      <div className={s.flowCol}>{[triggers[tr], ...chosen].map((x, k) => <div key={x} className={s.node} data-on={i >= k}><span>{k === 0 ? "⚡" : "→"}</span>{x}</div>)}</div>
      <pre className={s.log} aria-live="polite">{log.join("\n") || t("Registro de ejecución…", "Run log…")}{i > chosen.length ? "\n" + t("Flujo completado (simulado)", "Flow completed (simulated)") : ""}</pre>
    </div></div></div>;
}

const DEMOS: Record<ServiceKey, (p: { lang: Lang }) => React.ReactNode> = {
  website: Website, ecommerce: Ecommerce, crm: Crm, receptionist: Receptionist, chatbots: Chatbots, marketing: Marketing, funnels: Funnels, automation: Automation,
};
const HOW: Record<ServiceKey, [string, string]> = {
  website: ["Cambia de página, color de marca y vista móvil. El botón crea un lead.", "Switch pages, brand color and mobile view. The button creates a lead."],
  ecommerce: ["Filtra, abre un producto, elige talla, añade al carrito y completa el checkout.", "Filter, open a product, pick a size, add to cart and check out."],
  crm: ["Busca, abre una oportunidad, avánzala de etapa o registra una llamada: los KPIs se actualizan.", "Search, open a deal, advance its stage or log a call: KPIs update."],
  receptionist: ["Elige un escenario y simula la llamada: termina con un resumen para el CRM.", "Pick a scenario and simulate the call: it ends with a CRM summary."],
  chatbots: ["Escribe lo que quieras o usa una respuesta rápida. Deja un correo para crear un lead.", "Type anything or use a quick reply. Leave an email to create a lead."],
  marketing: ["Elige objetivo, presupuesto y radio; edita el titular del anuncio.", "Choose goal, budget and radius; edit the ad headline."],
  funnels: ["Ajusta la conversión de cada etapa y mira cuántas oportunidades llegan al CRM.", "Tune each stage's conversion and see how many opportunities reach the CRM."],
  automation: ["Elige un disparador y acciones, y ejecuta una prueba con su registro.", "Pick a trigger and actions, then run a test with its log."],
};

export function Showroom({ lang }: { lang: Lang }) {
  const t = COPY[lang]; const [k, setK] = useState<ServiceKey>("crm"); const id = useId();
  const Demo = DEMOS[k]; const svc = t.services[k]; const v = VISUAL_FOR[k];
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
    <div className={s.panel2} id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${k}`} key={k}>
      <div className={s.panelText}>
        <span className={s.badge}>{t.show.badge}</span>
        <h3>{svc.name}</h3><p>{svc.short}</p>
        <p className={s.how}><Icon name="spark" size={16} />{HOW[k][lang === "es" ? 0 : 1]}</p>
        <ul className={s.benefits}>{svc.benefits.map(b => <li key={b}><Icon name="check" size={16} />{b}</li>)}</ul>
        <div className={s.panelMedia}><ProductVideo poster={v.small} video={v.video} alt={v.alt[lang]} w={v.w} h={v.h} /></div>
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
  return <><p className={s.how}><Icon name="spark" size={16} />{HOW[service][lang === "es" ? 0 : 1]}</p><div className={s.device}><Demo lang={lang} /></div></>;
}
