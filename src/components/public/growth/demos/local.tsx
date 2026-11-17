"use client";
import { useState } from "react";
import type { Lang } from "../../landing/copy";
import { INDUSTRIES, tx } from "../industries";
import { useDemo } from "../store";
import d from "../demos.module.css";
import { DAYS, Panel, SLOTS, pickName, useT } from "./shared";

/** DEMO 4 · Reputation and local visibility: improve a fictional listing and turn a "call" or "book" tap into a lead. */
export function LocalDemo({ lang }: { lang: Lang }) {
  const t = useT(lang); const { state, dispatch } = useDemo(); const ind = INDUSTRIES[state.industry];
  const items = [
    ["photos", t("Fotos reales del negocio", "Real photos of the business")], ["hours", t("Horario y servicios al día", "Up-to-date hours and services")],
    ["reviews", t("Reseñas respondidas", "Reviews answered")], ["book", t("Botón para reservar", "Booking button")], ["site", t("Sitio web rápido y claro", "Fast, clear website")],
  ] as const;
  const [on, setOn] = useState<Record<string, boolean>>({ hours: true }), [searched, setSearched] = useState(false), [n, setN] = useState(0), [msg, setMsg] = useState("");
  const score = Math.round((Object.values(on).filter(Boolean).length / items.length) * 100);
  const lead = (kind: "call" | "book") => {
    const name = pickName(n + 8); setN(v => v + 1);
    if (kind === "call") {
      dispatch({ type: "lead", name, need: t("Llamó desde la ficha local", "Called from the local listing"), value: ind.ticket, source: "search", stage: "contacted", note: t(`Búsqueda local: ${name} llamó`, `Local search: ${name} called`) });
      setMsg(t(`Llamada simulada de ${name}: registrada como oportunidad «Contactado».`, `Simulated call from ${name}: logged as a “Contacted” opportunity.`));
    } else {
      const day = (n + 2) % 6, slot = (n * 3 + 1) % SLOTS.length;
      dispatch({ type: "lead", name, need: tx(lang, ind.services[0].name), value: ind.services[0].price || ind.ticket, source: "search", stage: "appointment", note: t(`Búsqueda local: ${name} reservó`, `Local search: ${name} booked`) });
      dispatch({ type: "book", day, slot, service: 0, name, source: "search" });
      setMsg(t(`${name} reservó desde la ficha (${DAYS.es[day]} ${SLOTS[slot]}): ya está en Agenda y CRM.`, `${name} booked from the listing (${DAYS.en[day]} ${SLOTS[slot]}): now in Calendar and CRM.`));
    }
  };
  const stars = on.reviews ? "★★★★☆" : "★★★☆☆";

  return <Panel lang={lang} services="website,marketing" kicker={t("Reputación y visibilidad local", "Reputation and local visibility")} title={t("Que te encuentren y te contacten", "Get found, get contacted")}
    note={t("Interfaz ilustrativa inspirada en buscadores; no es una ficha real de Google ni de ningún cliente. No prometemos posiciones, estrellas ni resultados SEO.", "Illustrative interface inspired by search engines; not a real Google listing or any client's profile. We don't promise rankings, stars or SEO results.")}>
    <div className={d.localWrap}>
      <div className={d.search}>
        <form className={d.searchBar} onSubmit={e => { e.preventDefault(); setSearched(true); }}>
          <span aria-hidden="true">⌕</span><input aria-label={t("Búsqueda", "Search")} value={tx(lang, ind.search.query)} readOnly /><button type="submit">{t("Buscar", "Search")}</button>
        </form>
        {searched ? <div className={d.results}>
          <article className={d.listing} data-score={score}>
            <div className={d.listHead}><div><b>{tx(lang, ind.business)}</b><span>{tx(lang, ind.search.category)} · {stars} <small>({t("ejemplo", "example")})</small></span></div><em>{t("Abierto ahora", "Open now")}</em></div>
            {on.photos && <div className={d.photos} aria-label={t("Fotos del negocio (ilustrativas)", "Business photos (illustrative)")}><i /><i /><i /></div>}
            {on.hours && <p className={d.listLine}>{t("Lun–Sáb · 9:00–19:00 · ", "Mon–Sat · 9am–7pm · ")}{ind.services.map(s => tx(lang, s.name)).join(" · ")}</p>}
            {on.reviews && <p className={d.review}>“{t("Muy buena atención y puntualidad.", "Great service and on time.")}” <small>— {t("Respuesta del dueño: ¡Gracias por venir!", "Owner reply: Thanks for coming in!")}</small></p>}
            {on.site && <p className={d.listLine}>🌐 {t("Sitio web rápido · reserva y cotiza en línea", "Fast website · book and get quotes online")}</p>}
            <div className={d.listBtns}>
              <button type="button" onClick={() => lead("call")}>📞 {t("Llamar", "Call")}</button>
              {on.book && <button type="button" className={d.primary} onClick={() => lead("book")}>{t("Reservar", "Book")}</button>}
            </div>
          </article>
          {ind.search.rivals.map((r, i) => <article key={i} className={`${d.listing} ${d.rival}`}><div className={d.listHead}><div><b>{tx(lang, r)}</b><span>{tx(lang, ind.search.category)}</span></div></div></article>)}
        </div> : <p className={d.empty}>{t("Pulsa «Buscar» para ver cómo aparece el negocio a un cliente cercano.", "Press “Search” to see how the business appears to a nearby customer.")}</p>}
        {msg && <p className={d.toast} role="status">{msg}</p>}
      </div>
      <div className={d.side}>
        <p className={d.claim}>{t("Una buena presencia digital facilita que un cliente cercano te encuentre y te contacte.", "A strong digital presence makes it easier for a nearby customer to find and contact you.")}</p>
        <fieldset className={d.toggles}><legend>{t("Mejoras de presencia", "Presence improvements")}</legend>
          {items.map(([k, label]) => <label key={k}><input type="checkbox" checked={!!on[k]} onChange={e => setOn(v => ({ ...v, [k]: e.target.checked }))} />{label}</label>)}
        </fieldset>
        <div className={d.meterRow}><span>{t("Ficha completa", "Profile complete")}</span><b>{score}%</b></div>
        <div className={d.occ} aria-hidden="true"><i style={{ width: `${score}%` }} /></div>
      </div>
    </div>
  </Panel>;
}
