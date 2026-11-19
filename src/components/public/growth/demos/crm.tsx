"use client";
import { useState } from "react";
import type { Lang } from "../../landing/copy";
import { money } from "../industries";
import { STAGES, stageLabel, useDemo, type Stage } from "../store";
import d from "../demos.module.css";
import { Panel, SOURCE_LABEL, useT } from "./shared";

const NEXT: Record<"es" | "en", Record<Stage, string>> = {
  es: { new: "Responder hoy", contacted: "Proponer cita", appointment: "Atender y diagnosticar", quote: "Enviar cotización", negotiation: "Resolver dudas y cerrar", won: "Entregar y pedir reseña" },
  en: { new: "Reply today", contacted: "Offer an appointment", appointment: "Meet and assess", quote: "Send the quote", negotiation: "Answer questions and close", won: "Deliver and ask for a review" },
};

/** DEMO 3 · A CRM full of opportunities: drag (mouse) or step buttons (touch/keyboard) through the pipeline. */
export function CrmDemo({ lang }: { lang: Lang }) {
  const t = useT(lang); const { state, dispatch } = useDemo();
  const [drag, setDrag] = useState<number | null>(null), [over, setOver] = useState<Stage | null>(null);
  const move = (id: number, stage: Stage) => dispatch({ type: "move", id, stage });
  const pipeline = state.leads.filter(l => l.stage !== "won").reduce((a, l) => a + l.value, 0);
  const won = state.sales.reduce((a, s) => a + s.amount, 0);

  return <Panel lang={lang} services="crm" kicker={t("CRM lleno de oportunidades", "A CRM full of opportunities")} title={t("Cada oportunidad avanza hasta convertirse en venta", "Every opportunity moves until it becomes a sale")}
    note={t("CRM de demostración, aislado del CRM real de Avalon. Nombres y necesidades ficticios.", "Demo CRM, isolated from Avalon's real CRM. Names and needs are fictional.")}>
    <dl className={d.kpis}>
      <div><dt>{t("Oportunidades abiertas", "Open opportunities")}</dt><dd>{state.leads.filter(l => l.stage !== "won").length}</dd></div>
      <div><dt>{t("Valor en proceso", "Pipeline value")}</dt><dd>{money(pipeline)}</dd></div>
      <div><dt>{t("Ventas cerradas", "Closed sales")}</dt><dd>{state.sales.length}</dd></div>
      <div><dt>{t("Ingresos (demo)", "Revenue (demo)")}</dt><dd>{money(won)}</dd></div>
    </dl>
    <div className={d.board}>
      {STAGES.map((st, si) => {
        const cards = state.leads.filter(l => l.stage === st);
        return <section key={st} className={d.col} data-over={over === st} data-won={st === "won"} aria-label={stageLabel(lang, st)}
          onDragOver={e => { e.preventDefault(); setOver(st); }} onDragLeave={() => setOver(o => (o === st ? null : o))}
          onDrop={e => { e.preventDefault(); if (drag !== null) move(drag, st); setDrag(null); setOver(null); }}>
          <header><b>{stageLabel(lang, st)}</b><span>{cards.length} · {money(cards.reduce((a, l) => a + l.value, 0))}</span></header>
          <div className={d.cards}>
            {cards.map(l => <article key={l.id} className={d.card} draggable onDragStart={e => { setDrag(l.id); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDrag(null)} data-new={l.at > Date.now() - 4000}>
              <p className={d.cardName}>{l.name}<span>{money(l.value)}</span></p>
              <p className={d.cardNeed}>{l.need}</p>
              <p className={d.cardMeta}><span>{SOURCE_LABEL[lang][l.source]}</span>{NEXT[lang][l.stage]}</p>
              {st !== "won" && <div className={d.cardBtns}>
                {si > 0 && <button type="button" onClick={() => move(l.id, STAGES[si - 1])} aria-label={t(`Mover ${l.name} a ${stageLabel(lang, STAGES[si - 1])}`, `Move ${l.name} to ${stageLabel(lang, STAGES[si - 1])}`)}>◀</button>}
                <button type="button" className={d.adv} onClick={() => move(l.id, STAGES[si + 1])} aria-label={t(`Mover ${l.name} a ${stageLabel(lang, STAGES[si + 1])}`, `Move ${l.name} to ${stageLabel(lang, STAGES[si + 1])}`)}>{stageLabel(lang, STAGES[si + 1])} ▶</button>
              </div>}
            </article>)}
            {!cards.length && <p className={d.colEmpty}>{t("Arrastra aquí", "Drop here")}</p>}
          </div>
        </section>;
      })}
    </div>
    <p className={d.small}>{t("Al llegar a «Cerrado», la venta se registra y madura un fruto dorado en el árbol.", "When a card reaches “Won”, the sale is recorded and a golden fruit ripens on the tree.")}</p>
  </Panel>;
}
