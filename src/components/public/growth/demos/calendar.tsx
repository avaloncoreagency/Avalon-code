"use client";
import { rovingKeyDown } from "@/components/a11y/roving";
import { useState } from "react";
import type { Lang } from "../../landing/copy";
import { INDUSTRIES, money, tx } from "../industries";
import { useDemo } from "../store";
import d from "../demos.module.css";
import { DAYS, Panel, SLOTS, pickName, useT } from "./shared";

/** DEMO 2 · A calendar full of work: book, move and cancel; occupancy responds to what the visitor does. */
export function CalendarDemo({ lang }: { lang: Lang }) {
  const t = useT(lang); const { state, dispatch } = useDemo(); const ind = INDUSTRIES[state.industry];
  const [service, setService] = useState(0), [day, setDay] = useState(0), [sel, setSel] = useState<number | null>(null), [moving, setMoving] = useState(false), [n, setN] = useState(0);
  const total = DAYS.es.length * SLOTS.length, used = state.bookings.length, pct = Math.round((used / total) * 100);
  const at = (dd: number, s: number) => state.bookings.find(b => b.day === dd && b.slot === s);
  const selected = state.bookings.find(b => b.id === sel) ?? null;
  const revenue = state.bookings.reduce((a, b) => a + (ind.services[b.service]?.price || 0), 0);

  const click = (dd: number, s: number) => {
    const b = at(dd, s);
    if (b) { setSel(b.id === sel ? null : b.id); setMoving(false); return; }
    if (moving && selected) { dispatch({ type: "rebook", id: selected.id, day: dd, slot: s }); setMoving(false); setSel(null); return; }
    const name = pickName(n + 5); setN(v => v + 1);
    const sv = ind.services[service];
    dispatch({ type: "lead", name, need: tx(lang, sv.name), value: sv.price || ind.ticket, source: "calendar", stage: "appointment", note: t(`Agenda: ${name} reservó ${tx(lang, sv.name)}`, `Calendar: ${name} booked ${tx(lang, sv.name)}`) });
    dispatch({ type: "book", day: dd, slot: s, service, name });
  };
  const cell = (dd: number, s: number) => {
    const b = at(dd, s), label = `${DAYS[lang][dd]} ${SLOTS[s]}`;
    return <button key={`${dd}-${s}`} type="button" className={d.slot} data-busy={!!b} data-sel={b?.id === sel} data-target={moving && !b}
      aria-label={b ? `${label}: ${b.name} · ${tx(lang, ind.services[b.service].name)}` : `${label}: ${moving ? t("mover aquí", "move here") : t("libre, reservar", "free, book")}`} onClick={() => click(dd, s)}>
      {b ? <><b>{b.name}</b><small>{tx(lang, ind.services[b.service].name)}</small></> : <small>{moving ? t("Mover aquí", "Move here") : "+"}</small>}
    </button>;
  };

  return <Panel lang={lang} services="crm,automation" kicker={t("Agenda con trabajo", "A calendar with work")} title={t("Reservas que se organizan solas", "Bookings that organize themselves")}
    note={t("Agenda de demostración de un negocio ficticio. Los cambios solo existen en tu navegador.", "Demo calendar for a fictional business. Changes only exist in your browser.")}>
    <div className={d.calTop}>
      <div className={d.seg} role="radiogroup" onKeyDown={e => rovingKeyDown(e, "radio")} aria-label={t("Servicio", "Service")}>{ind.services.map((sv, i) =>
        <button key={i} type="button" role="radio" aria-checked={service === i} tabIndex={(service === i) ? 0 : -1} onClick={() => setService(i)}>{tx(lang, sv.name)}<small>{sv.minutes} min{sv.price ? ` · ${money(sv.price)}` : ""}</small></button>)}</div>
      <dl className={d.kpis}>
        <div><dt>{t("Ocupación", "Occupancy")}</dt><dd>{pct}%</dd></div>
        <div><dt>{t("Citas", "Appointments")}</dt><dd>{used}</dd></div>
        <div><dt>{t("Huecos libres", "Open slots")}</dt><dd>{total - used}</dd></div>
        <div><dt>{t("Valor agendado", "Booked value")}</dt><dd>{money(revenue)}</dd></div>
      </dl>
    </div>
    <div className={d.occ} aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
    {selected && <div className={d.selBar} role="status">
      <span><b>{selected.name}</b> · {DAYS[lang][selected.day]} {SLOTS[selected.slot]} · {tx(lang, ind.services[selected.service].name)}</span>
      <button type="button" onClick={() => setMoving(m => !m)} aria-pressed={moving}>{moving ? t("Elige un hueco libre…", "Pick a free slot…") : t("Mover cita", "Move")}</button>
      <button type="button" onClick={() => { dispatch({ type: "cancel", id: selected.id }); setSel(null); setMoving(false); }}>{t("Cancelar cita", "Cancel")}</button>
    </div>}
    {/* Wide screens: the whole week. Phones: one day at a time. */}
    <div className={d.week}>
      <div className={d.weekHead}><span />{DAYS[lang].map(x => <b key={x}>{x}</b>)}</div>
      {SLOTS.map((s, si) => <div key={s} className={d.weekRow}><span>{s}</span>{DAYS[lang].map((_, di) => cell(di, si))}</div>)}
    </div>
    <div className={d.dayView}>
      <div className={d.seg} role="radiogroup" onKeyDown={e => rovingKeyDown(e, "radio")} aria-label={t("Día", "Day")}>{DAYS[lang].map((x, i) => <button key={x} type="button" role="radio" aria-checked={day === i} tabIndex={(day === i) ? 0 : -1} onClick={() => setDay(i)}>{x}</button>)}</div>
      <div className={d.dayList}>{SLOTS.map((s, si) => <div key={s} className={d.dayRow}><span>{s}</span>{cell(day, si)}</div>)}</div>
    </div>
  </Panel>;
}
