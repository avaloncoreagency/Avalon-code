"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Lang } from "../landing/copy";
import { AdsDemo } from "./demos/ads";
import { CalendarDemo } from "./demos/calendar";
import { ChatDemo } from "./demos/chat";
import { CrmDemo } from "./demos/crm";
import { Journey } from "./demos/journey";
import { LocalDemo } from "./demos/local";
import { ShopDemo } from "./demos/shop";
import { IndustryPicker, useT } from "./demos/shared";
import { DEMO_IDS, demoLink, readDemoLink } from "./share-link";
import { useDemo, DemoProvider } from "./store";
import { GrowthTree } from "./tree";
import d from "./demos.module.css";

/**
 * AVALON ULTIMATE 2.0 — The Business Growth Experience (client island). One synthetic world shared by:
 * the Growth Tree → industry selector → interactive showroom (6 demos) → integrated ad-to-sale journey.
 */
const TABS = DEMO_IDS;

function Showroom({ lang }: { lang: Lang }) {
  const t = useT(lang);
  const [tab, setTab] = useState<(typeof TABS)[number]>("chat");
  const { state } = useDemo();
  const [feedback, setFeedback] = useState<"" | "copied" | "failed">("");
  const [manualLink, setManualLink] = useState("");
  useEffect(() => { setTab(readDemoLink(window.location.search).demo); }, []);
  useEffect(() => { setFeedback(""); setManualLink(""); }, [tab, state.industry]);
  const copy = async () => {
    const url = window.location.origin + demoLink(lang, state.industry, tab);
    try { await navigator.clipboard.writeText(url); setFeedback("copied"); setManualLink(""); }
    catch { setFeedback("failed"); setManualLink(url); }
  };
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const labels: Record<(typeof TABS)[number], [string, string]> = {
    chat: [t("Más clientes atendidos", "More customers attended"), "01"], calendar: [t("Agenda con trabajo", "Calendar with work"), "02"],
    crm: [t("CRM de oportunidades", "Opportunity CRM"), "03"], local: [t("Visibilidad local", "Local visibility"), "04"],
    shop: [t("Tienda online", "Online store"), "05"], ads: [t("Publicidad → dinero", "Ads → money"), "06"],
  };
  const key = (e: KeyboardEvent, i: number) => {
    const n = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (!n) return;
    e.preventDefault(); const j = (i + n + TABS.length) % TABS.length; setTab(TABS[j]); refs.current[j]?.focus();
  };
  return <div className={d.showroom}>
    <div className={d.showHead}>
      <p className={d.eyebrow}>{t("Showroom de resultados", "Results showroom")}</p>
      <h2 id="h-demos" className={d.h2}>{t("Pruébalo: así trabaja un negocio que crece", "Try it: this is how a growing business works")}</h2>
      <p className={d.sub}>{t("Seis demostraciones que puedes tocar. Todas comparten los mismos clientes: lo que reservas en una aparece en las demás.", "Six demos you can touch. They share the same customers: what you book in one shows up in the others.")}</p>
    </div>
    <div className={d.panelFoot}>
      <button type="button" className={d.ctaLink} onClick={copy}>{t("Copiar enlace de demostración", "Copy demo link")}</button>
      <a href={demoLink("es", state.industry, tab)} lang="es">Español</a>
      <a href={demoLink("en", state.industry, tab)} lang="en">English</a>
      <span role="status">{feedback === "copied" ? t("Enlace copiado", "Link copied") : feedback === "failed" ? t("No se pudo copiar. Selecciona el enlace para copiarlo manualmente.", "Could not copy. Select the link to copy it manually.") : ""}</span>
      {manualLink && <input aria-label={t("Enlace de demostración", "Demo link")} readOnly value={manualLink} onFocus={e => e.target.select()} />}
    </div>
    <div className={d.tabs} role="tablist" aria-label={t("Demostraciones", "Demos")}>
      {TABS.map((k, i) => <button key={k} ref={el => { refs.current[i] = el; }} type="button" role="tab" id={`tab-${k}`} aria-controls={`panel-${k}`} aria-selected={tab === k} tabIndex={tab === k ? 0 : -1}
        onClick={() => setTab(k)} onKeyDown={e => key(e, i)}><span>{labels[k][1]}</span>{labels[k][0]}</button>)}
    </div>
    <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className={d.tabPanel}>
      {tab === "chat" && <ChatDemo lang={lang} />}
      {tab === "calendar" && <CalendarDemo lang={lang} />}
      {tab === "crm" && <CrmDemo lang={lang} />}
      {tab === "local" && <LocalDemo lang={lang} />}
      {tab === "shop" && <ShopDemo lang={lang} />}
      {tab === "ads" && <AdsDemo lang={lang} />}
    </div>
  </div>;
}

export function GrowthExperience({ lang }: { lang: Lang }) {
  return <DemoProvider key={lang} lang={lang}>
    <section id="arbol" aria-labelledby="h-tree"><GrowthTree lang={lang} /></section>
    <section id="industria" className={d.band} aria-labelledby="h-industry"><IndustryPicker lang={lang} /></section>
    <section id="demos" aria-labelledby="h-demos"><Showroom lang={lang} /></section>
    <section id="recorrido" className={d.engineBand} aria-labelledby="h-journey-demo"><Journey lang={lang} /></section>
  </DemoProvider>;
}
