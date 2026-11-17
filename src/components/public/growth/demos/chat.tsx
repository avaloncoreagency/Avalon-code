"use client";
import { useEffect, useRef, useState } from "react";
import type { Lang } from "../../landing/copy";
import { INDUSTRIES, money, tx } from "../industries";
import { useDemo } from "../store";
import d from "../demos.module.css";
import { DAYS, Panel, SLOTS, pickName, useT } from "./shared";

type Msg = { id: number; from: "visitor" | "bot"; text: string };
type Step = "start" | "service" | "slot" | "done";

/** DEMO 1 · More customers attended: a scripted assistant that answers, offers real free slots and books them. */
export function ChatDemo({ lang }: { lang: Lang }) {
  const t = useT(lang); const { state, dispatch } = useDemo(); const ind = INDUSTRIES[state.industry];
  const [msgs, setMsgs] = useState<Msg[]>([]), [step, setStep] = useState<Step>("start"), [typing, setTyping] = useState(false);
  const [service, setService] = useState(0), [visitor, setVisitor] = useState(0);
  const log = useRef<HTMLDivElement>(null), n = useRef(0), timer = useRef(0);
  const name = pickName(visitor + 3);

  useEffect(() => { setMsgs([]); setStep("start"); }, [state.industry]);
  useEffect(() => { const el = log.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs, typing]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const say = (from: Msg["from"], text: string) => setMsgs(m => [...m, { id: ++n.current, from, text }]);
  const reply = (text: string, next: Step) => { setTyping(true); timer.current = window.setTimeout(() => { setTyping(false); say("bot", text); setStep(next); }, 750); };
  const free = (() => {
    const out: { day: number; slot: number }[] = [];
    for (let day = 0; day < 6 && out.length < 3; day++) for (let slot = 4; slot < SLOTS.length && out.length < 3; slot += 2)
      if (!state.bookings.some(b => b.day === day && b.slot === slot)) out.push({ day, slot });
    return out;
  })();

  const ask = (i: number) => {
    say("visitor", tx(lang, ind.prompts[i])); dispatch({ type: "inquiry" });
    reply(t(`¡Hola! Soy el asistente de ${tx(lang, ind.business)}. Con gusto te ayudo. ¿Qué servicio necesitas?`, `Hi! I'm the assistant for ${tx(lang, ind.business)}. Happy to help. Which service do you need?`), "service");
  };
  const choose = (i: number) => {
    setService(i); const sv = ind.services[i];
    say("visitor", tx(lang, sv.name)); dispatch({ type: "inquiry", answered: true });
    reply(t(`Perfecto: ${tx(lang, sv.name)} (${sv.minutes} min${sv.price ? ` · desde ${money(sv.price)}` : ""}). Estos son los próximos huecos libres:`, `Great: ${tx(lang, sv.name)} (${sv.minutes} min${sv.price ? ` · from ${money(sv.price)}` : ""}). Here are the next open slots:`), "slot");
  };
  const book = (day: number, slot: number) => {
    const when = `${DAYS[lang][day]} ${SLOTS[slot]}`, sv = ind.services[service];
    say("visitor", when);
    dispatch({ type: "lead", name, need: tx(lang, sv.name), value: sv.price || ind.ticket, source: "chat", stage: "appointment", note: t(`Atención: ${name} reservó por chat`, `Response: ${name} booked via chat`) });
    dispatch({ type: "book", day, slot, service, name, source: "chat" });
    dispatch({ type: "inquiry", booked: true });
    reply(t(`¡Listo, ${name}! Tu cita de ${tx(lang, sv.name)} quedó el ${when}. Te enviaremos un recordatorio (demo). La oportunidad ya está en el CRM y en la agenda.`, `All set, ${name}! Your ${tx(lang, sv.name)} is booked for ${when}. We'll send a reminder (demo). The opportunity is now in the CRM and the calendar.`), "done");
  };
  const fresh = () => { setMsgs([]); setStep("start"); setVisitor(v => v + 1); };
  const q = state.inquiries;

  return <Panel lang={lang} services="receptionist,chatbots" kicker={t("Más clientes atendidos", "More customers attended")} title={t("Tu negocio responde aunque estés ocupado", "Your business answers even when you're busy")}
    note={t("Conversación simulada con respuestas predefinidas. No hay llamadas, voz ni mensajes reales.", "Simulated conversation with scripted answers. No real calls, voice or messages.")}>
    <div className={d.chatWrap}>
      <div className={d.phone}>
        <div className={d.phoneBar}><b>{tx(lang, ind.business)}</b><span>{t("En línea · responde al instante", "Online · replies instantly")}</span></div>
        <div ref={log} className={d.log} aria-live="polite">
          {!msgs.length && <p className={d.empty}>{t(`Escribe como si fueras ${name}, un cliente nuevo:`, `Write as ${name}, a new customer:`)}</p>}
          {msgs.map(m => <p key={m.id} className={m.from === "visitor" ? d.me : d.bot}>{m.text}</p>)}
          {typing && <p className={d.bot} aria-label={t("Escribiendo", "Typing")}><span className={d.dots}><i /><i /><i /></span></p>}
        </div>
        <div className={d.quick}>
          {step === "start" && ind.prompts.map((p, i) => <button key={i} type="button" onClick={() => ask(i)} disabled={typing}>{tx(lang, p)}</button>)}
          {step === "service" && !typing && ind.services.map((sv, i) => <button key={i} type="button" onClick={() => choose(i)}>{tx(lang, sv.name)}</button>)}
          {step === "slot" && !typing && free.map(f => <button key={`${f.day}-${f.slot}`} type="button" onClick={() => book(f.day, f.slot)}>{DAYS[lang][f.day]} · {SLOTS[f.slot]}</button>)}
          {step === "done" && !typing && <button type="button" onClick={fresh}>{t("Nueva conversación", "New conversation")}</button>}
        </div>
      </div>
      <div className={d.side}>
        <p className={d.claim}>{t("Tu negocio puede seguir atendiendo oportunidades incluso cuando estás ocupado.", "Your business can keep attending opportunities even when you're busy.")}</p>
        <dl className={d.kpis}>
          <div><dt>{t("Consultas recibidas", "Inquiries received")}</dt><dd>{q.received}</dd></div>
          <div><dt>{t("Consultas atendidas", "Inquiries answered")}</dt><dd>{q.answered}</dd></div>
          <div><dt>{t("Reservas completadas", "Bookings completed")}</dt><dd>{q.booked}</dd></div>
          <div><dt>{t("Pendientes", "Pending")}</dt><dd>{Math.max(0, q.received - q.answered)}</dd></div>
        </dl>
        <p className={d.small}>{t("Cada reserva aparece en la Agenda y como oportunidad en el CRM de esta demostración.", "Every booking appears in the Calendar and as an opportunity in this demo's CRM.")}</p>
      </div>
    </div>
  </Panel>;
}
