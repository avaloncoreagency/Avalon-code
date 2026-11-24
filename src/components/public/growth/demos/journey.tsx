"use client";
import { useEffect, useRef, useState } from "react";
import type { Lang } from "../../landing/copy";
import { INDUSTRIES, money, tx } from "../industries";
import { useDemo, type DemoState } from "../store";
import d from "../demos.module.css";
import { DemoBadge, SOURCE_LABEL, useT } from "./shared";

/**
 * The integrated story: ad → lead → attended → booked → CRM stages → sale → revenue → a fruit on the tree.
 * Each step dispatches the same actions the demos use, so the CRM, calendar and tree really change.
 */
export function Journey({ lang }: { lang: Lang }) {
  const t = useT(lang); const { state, dispatch } = useDemo(); const ind = INDUSTRIES[state.industry];
  const [step, setStep] = useState(-1), [running, setRunning] = useState(false);
  const live = useRef<DemoState>(state); live.current = state;
  const leadId = useRef<number | null>(null), timers = useRef<number[]>([]);
  useEffect(() => {
    timers.current.forEach(x => window.clearTimeout(x)); timers.current = [];
    leadId.current = null; setStep(-1); setRunning(false);
    return () => timers.current.forEach(x => window.clearTimeout(x));
  }, [state.industry, state.resetEpoch]);

  const name = t("Visitante del anuncio", "Ad visitor");
  const steps = [
    t("Un visitante ve tu anuncio y hace clic", "A visitor sees your ad and clicks"),
    t("Se convierte en prospecto", "Becomes a lead"),
    t("Recibe atención inmediata", "Gets an immediate answer"),
    t("Reserva una cita", "Books an appointment"),
    t("Entra al CRM como «Cita»", "Enters the CRM as “Appointment”"),
    t("Recibe la cotización y negocia", "Receives the quote and negotiates"),
    t(`Se cierra: ${tx(lang, ind.wonLabel)}`, `Closed: ${tx(lang, ind.wonLabel)}`),
    t("Aparece el resultado económico", "The revenue shows up"),
    t("Una rama del árbol crece y da fruto", "A branch of the tree grows and bears fruit"),
  ];
  const actions: (() => void)[] = [
    () => dispatch({ type: "note", text: t("Anuncio: clic de un visitante", "Ad: a visitor clicked"), source: "ads" }),
    () => { dispatch({ type: "lead", name, need: tx(lang, ind.services[1].name), value: ind.ticket, source: "ads" }); },
    () => { leadId.current = live.current.leads.find(l => l.name === name && l.stage !== "won")?.id ?? null; dispatch({ type: "inquiry" }); dispatch({ type: "inquiry", answered: true }); if (leadId.current) dispatch({ type: "move", id: leadId.current, stage: "contacted" }); },
    () => {
      const b = live.current.bookings; let day = 0, slot = 0;
      outer: for (day = 0; day < 6; day++) for (slot = 0; slot < 10; slot++) if (!b.some(x => x.day === day && x.slot === slot)) break outer;
      dispatch({ type: "book", day, slot, service: 1, name, source: "chat" }); dispatch({ type: "inquiry", booked: true });
    },
    () => { if (leadId.current) dispatch({ type: "move", id: leadId.current, stage: "appointment" }); },
    () => { if (leadId.current) { dispatch({ type: "move", id: leadId.current, stage: "quote" }); dispatch({ type: "move", id: leadId.current, stage: "negotiation" }); } },
    () => { if (leadId.current) dispatch({ type: "move", id: leadId.current, stage: "won" }); },
    () => undefined,
    () => undefined,
  ];
  const run = () => {
    if (running) return; setRunning(true); setStep(-1); leadId.current = null;
    timers.current.forEach(x => window.clearTimeout(x)); timers.current = [];
    steps.forEach((_, i) => timers.current.push(window.setTimeout(() => { setStep(i); actions[i](); if (i === steps.length - 1) setRunning(false); }, 300 + i * 1100)));
  };
  const revenue = state.sales.reduce((a, s) => a + s.amount, 0);

  return <div className={d.journey}>
    <div className={d.journeyHead}>
      <p className={d.eyebrow}>{t("De la publicidad a la venta", "From ad to sale")}</p>
      <h2 id="h-journey-demo" className={d.h2}>{t("Mira cómo una oportunidad se convierte en ingreso", "Watch an opportunity turn into revenue")}</h2>
      <p className={d.sub}>{t("Un solo recorrido conecta todas las demostraciones: lo que pasa aquí cambia el CRM, la agenda y el árbol.", "One journey connects every demo: what happens here changes the CRM, the calendar and the tree.")}</p>
      <DemoBadge lang={lang} />
    </div>
    <div className={d.journeyGrid}>
      <ol className={d.steps}>{steps.map((s, i) => <li key={i} data-state={i < step ? "done" : i === step ? "now" : "todo"}><span>{i + 1}</span>{s}
        {i === 7 && step >= 7 && <b className={d.gold}> {money(revenue)}</b>}
        {i === 8 && step >= 8 && <a href="#arbol"> {t("Ver el árbol", "See the tree")}</a>}</li>)}</ol>
      <div className={d.feed}>
        <div className={d.feedHead}><b>{t("Actividad en vivo", "Live activity")}</b><span>{money(revenue)} · {state.sales.length} {t("ventas (demo)", "sales (demo)")}</span></div>
        <ul aria-live="polite">{state.feed.length ? state.feed.map(f => <li key={f.id}><i data-src={f.source}>{SOURCE_LABEL[lang][f.source]}</i>{f.text}</li>) : <li className={d.empty}>{t("Aún no hay actividad. Usa las demostraciones o ejecuta el recorrido.", "No activity yet. Use the demos or run the journey.")}</li>}</ul>
        <div className={d.journeyBtns}>
          <button type="button" className={d.primary} onClick={run} disabled={running}>{running ? t("Recorriendo…", "Running…") : t("Ejecutar el recorrido completo", "Run the full journey")}</button>
          <button type="button" className={d.ghostBtn} onClick={() => { dispatch({ type: "reset" }); setStep(-1); }}>{t("Reiniciar demostraciones", "Reset demos")}</button>
        </div>
      </div>
    </div>
  </div>;
}
