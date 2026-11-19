"use client";
import { useEffect, useState } from "react";
import type { Lang } from "../../landing/copy";
import { INDUSTRIES, money, tx } from "../industries";
import { useDemo } from "../store";
import d from "../demos.module.css";
import { Panel, pickName, useT } from "./shared";

const CTR = 0.025; // fixed, visible assumption: 2.5 % of impressions become clicks

/** Pure funnel model; every number on screen comes from these explicit formulas. */
export function funnel(budget: number, cpc: number, leadRate: number, bookRate: number, closeRate: number, ticket: number) {
  const clicks = budget / cpc, impressions = clicks / CTR, leads = clicks * leadRate, bookings = leads * bookRate, sales = bookings * closeRate, revenue = sales * ticket;
  return { impressions, clicks, leads, bookings, sales, revenue, roas: budget ? revenue / budget : 0, net: revenue - budget };
}

/** DEMO 6 · Ads → customers → money: move the levers and the whole funnel recalculates; push the leads into the CRM. */
export function AdsDemo({ lang }: { lang: Lang }) {
  const t = useT(lang); const { state, dispatch } = useDemo(); const ind = INDUSTRIES[state.industry];
  const [budget, setBudget] = useState(1000), [cpc, setCpc] = useState(2.5), [lr, setLr] = useState(8), [br, setBr] = useState(45), [cr, setCr] = useState(35), [ticket, setTicket] = useState(ind.ticket);
  const [sent, setSent] = useState(0), [burst, setBurst] = useState(0);
  useEffect(() => { setTicket(INDUSTRIES[state.industry].ticket); }, [state.industry]);
  const f = funnel(budget, cpc, lr / 100, br / 100, cr / 100, ticket);
  const steps = [
    [t("Impresiones", "Impressions"), f.impressions], [t("Clics", "Clicks"), f.clicks], [t("Prospectos", "Leads"), f.leads],
    [t("Reservas", "Bookings"), f.bookings], [t("Ventas", "Sales"), f.sales],
  ] as const;
  const max = Math.log10(Math.max(10, f.impressions));
  const push = () => {
    const k = Math.max(1, Math.min(5, Math.round(f.leads)));
    for (let i = 0; i < k; i++) dispatch({ type: "lead", name: pickName(sent + i + 1), need: `${t("Anuncio", "Ad")} · ${tx(lang, ind.services[i % ind.services.length].name)}`, value: Math.round(ticket), source: "ads", note: t("Publicidad: nuevo prospecto", "Ads: new lead") });
    setSent(v => v + k); setBurst(b => b + 1);
  };
  const slider = (label: string, val: number, set: (n: number) => void, min: number, max: number, step: number, fmt: (n: number) => string) =>
    <label className={d.range}><span>{label}<b>{fmt(val)}</b></span><input type="range" min={min} max={max} step={step} value={val} onChange={e => set(Number(e.target.value))} /></label>;

  return <Panel lang={lang} services="marketing,funnels" kicker={t("Publicidad → clientes → dinero", "Ads → customers → money")} title={t("Cada etapa de tu proceso comercial suma ingresos", "Every stage of your sales process adds revenue")}
    note={t("Simulador ilustrativo con supuestos editables. No es una predicción ni representa resultados de clientes reales.", "Illustrative simulator with editable assumptions. It is not a forecast and does not represent real client results.")}>
    <div className={d.adsWrap}>
      <div className={d.levers}>
        {slider(t("Presupuesto mensual", "Monthly budget"), budget, setBudget, 200, 10000, 100, money)}
        {slider(t("Costo por clic", "Cost per click"), cpc, setCpc, 0.5, 12, 0.5, n => `$${n.toFixed(2)}`)}
        {slider(t("Clic → prospecto", "Click → lead"), lr, setLr, 1, 30, 1, n => `${n}%`)}
        {slider(t("Prospecto → reserva", "Lead → booking"), br, setBr, 5, 90, 5, n => `${n}%`)}
        {slider(t("Reserva → venta", "Booking → sale"), cr, setCr, 5, 90, 5, n => `${n}%`)}
        {slider(t("Ticket promedio", "Average ticket"), ticket, setTicket, 20, 20000, 10, money)}
      </div>
      <div className={d.flow}>
        {steps.map(([label, v], i) => <div key={label} className={d.step}>
          <span>{label}</span>
          <div className={d.bar}><i style={{ width: `${Math.max(4, (Math.log10(Math.max(1, v)) / max) * 100)}%`, animationDelay: `${i * 120}ms` }} /><em className={d.dotsFlow} aria-hidden="true" /></div>
          <b>{Math.round(v).toLocaleString("en-US")}</b>
        </div>)}
        <dl className={d.kpis}>
          <div><dt>{t("Ingresos", "Revenue")}</dt><dd className={d.gold}>{money(f.revenue)}</dd></div>
          <div><dt>{t("Gasto publicitario", "Ad spend")}</dt><dd>{money(budget)}</dd></div>
          <div><dt>{t("Retorno (ROAS)", "Return (ROAS)")}</dt><dd>{f.roas.toFixed(1)}×</dd></div>
          <div><dt>{t("Resultado neto", "Net result")}</dt><dd className={f.net >= 0 ? d.gold : d.neg}>{f.net >= 0 ? "" : "−"}{money(Math.abs(f.net))}</dd></div>
        </dl>
        {f.sales >= 1 && <div key={`${burst}-${Math.round(f.sales)}`} className={d.rain} aria-hidden="true">{Array.from({ length: Math.min(12, Math.round(f.sales)) }, (_, i) => <i key={i} style={{ left: `${8 + ((i * 37) % 84)}%`, animationDelay: `${i * 90}ms` }}>$</i>)}</div>}
        <button type="button" className={d.primary} onClick={push}>{t(`Enviar ${Math.max(1, Math.min(5, Math.round(f.leads)))} prospectos al CRM`, `Send ${Math.max(1, Math.min(5, Math.round(f.leads)))} leads to the CRM`)}</button>
        {sent > 0 && <p className={d.small} role="status">{t(`${sent} prospectos de publicidad ya están en «Nuevo» en el CRM. Llévalos hasta «Cerrado».`, `${sent} ad leads are now in “New” in the CRM. Take them to “Won”.`)}</p>}
        <details className={d.formulas}><summary>{t("Fórmulas y supuestos", "Formulas and assumptions")}</summary>
          <ul>
            <li>{t("Clics = Presupuesto ÷ Costo por clic", "Clicks = Budget ÷ Cost per click")}</li>
            <li>{t(`Impresiones = Clics ÷ ${CTR * 100}% (tasa de clic supuesta)`, `Impressions = Clicks ÷ ${CTR * 100}% (assumed click-through rate)`)}</li>
            <li>{t("Prospectos = Clics × Clic→prospecto", "Leads = Clicks × Click→lead")}</li>
            <li>{t("Reservas = Prospectos × Prospecto→reserva", "Bookings = Leads × Lead→booking")}</li>
            <li>{t("Ventas = Reservas × Reserva→venta", "Sales = Bookings × Booking→sale")}</li>
            <li>{t("Ingresos = Ventas × Ticket promedio · ROAS = Ingresos ÷ Presupuesto", "Revenue = Sales × Average ticket · ROAS = Revenue ÷ Budget")}</li>
          </ul>
        </details>
      </div>
    </div>
  </Panel>;
}
