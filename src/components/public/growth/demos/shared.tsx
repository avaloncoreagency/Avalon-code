"use client";
import { rovingKeyDown } from "@/components/a11y/roving";
import type { ReactNode } from "react";
import type { Lang } from "../../landing/copy";
import { INDUSTRIES, INDUSTRY_ORDER, tx } from "../industries";
import { useDemo, type Source } from "../store";
import d from "../demos.module.css";

export type T = (es: string, en: string) => string;
export const useT = (lang: Lang): T => (es, en) => (lang === "es" ? es : en);

export const DAYS = { es: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"], en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] };
export const SLOTS = ["9:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
export const NAMES = ["Ana P.", "Carlos M.", "Jordan B.", "Valentina R.", "Sam W.", "Isabel T.", "Mateo G.", "Olivia K.", "Rafael D.", "Grace L.", "Bruno F.", "Nora H."];
export const pickName = (n: number) => NAMES[n % NAMES.length];

export const SOURCE_LABEL: Record<Lang, Record<Source, string>> = {
  es: { seed: "Cartera", ads: "Publicidad", chat: "Atención", calendar: "Agenda", search: "Búsqueda local", shop: "Tienda online", journey: "Recorrido" },
  en: { seed: "Pipeline", ads: "Ads", chat: "Response", calendar: "Calendar", search: "Local search", shop: "Online store", journey: "Journey" },
};

export function DemoBadge({ lang, children }: { lang: Lang; children?: ReactNode }) {
  return <p className={d.badge}><i aria-hidden="true" />{children ?? (lang === "es" ? "Demostración · datos ficticios" : "Demo · fictional data")}</p>;
}

/** Every demo ends in a real next step: the quote form with the services that produce this result preselected. */
export function Panel({ title, kicker, lang, children, note, services }: { title: string; kicker: string; lang: Lang; children: ReactNode; note?: string; services: string }) {
  return <div className={d.panel}>
    <div className={d.panelHead}><div><p className={d.kicker}>{kicker}</p><h3>{title}</h3></div><DemoBadge lang={lang} /></div>
    {children}
    <div className={d.panelFoot}>
      {note && <p className={d.note}>{note}</p>}
      <a className={d.ctaLink} href={`/?${lang === "en" ? "lang=en&" : ""}services=${services}#cotizacion`}>{lang === "es" ? "Quiero esto para mi negocio" : "I want this for my business"} →</a>
    </div>
  </div>;
}

/** Industry selector: re-seeds every demo with the language, people and services of that kind of business. */
export function IndustryPicker({ lang }: { lang: Lang }) {
  const { state, dispatch } = useDemo(); const t = useT(lang);
  return <div className={d.picker}>
    <div className={d.pickerHead}>
      <p className={d.eyebrow}>{t("Tu negocio", "Your business")}</p>
      <h2 id="h-industry" className={d.h2}>{t("¿Qué tipo de negocio tienes?", "What kind of business do you run?")}</h2>
      <p className={d.sub}>{t("Elige tu sector y todas las demostraciones cambian: clientes, servicios, agenda y oportunidades de tu día a día.", "Pick your industry and every demo adapts: customers, services, calendar and the opportunities you see every day.")}</p>
    </div>
    <div className={d.chips} role="radiogroup" onKeyDown={e => rovingKeyDown(e, "radio")} aria-labelledby="h-industry">
      {INDUSTRY_ORDER.map(k => <button key={k} type="button" role="radio" aria-checked={state.industry === k} tabIndex={(state.industry === k) ? 0 : -1} className={d.chip} onClick={() => dispatch({ type: "industry", industry: k })}>
        <span aria-hidden="true">{INDUSTRIES[k].icon}</span>{tx(lang, INDUSTRIES[k].label)}
      </button>)}
    </div>
    <p className={d.pickerNow} aria-live="polite">{t("Viendo:", "Showing:")} <b>{tx(lang, INDUSTRIES[state.industry].business)}</b></p>
  </div>;
}
