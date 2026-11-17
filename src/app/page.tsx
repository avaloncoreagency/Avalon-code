/* eslint-disable @next/next/no-img-element -- pre-optimized static WebP with srcset/sizes; avoids the Vercel image-optimization quota. */
import type { Metadata, Viewport } from "next";
import { QuoteForm } from "@/components/public/quote-form";
import { COPY, GROUPS, SERVICE_ORDER, type Lang } from "@/components/public/landing/copy";
import { Icon } from "@/components/public/landing/icons";
import { Effects } from "@/components/public/landing/effects";
import { GrowthExperience } from "@/components/public/growth/experience";
import { INTRO_GUARD, LaunchIntro } from "@/components/public/growth/intro";
import { Journey, Reveal } from "@/components/public/landing/interactive";
import { MEDIA } from "@/components/public/landing/media";
import { UNIVERSE } from "@/components/public/landing/universe/copy";
import u from "@/components/public/landing/universe/universe.module.css";
import { SiteChrome, qs } from "@/components/public/landing/site-chrome";
import s from "@/components/public/landing/landing.module.css";

/** Canonical public origin. Previews and the admin host never set it: only the production site is indexable. */
const SITE_ORIGIN = "https://avaloncoreagency.com";
const META = {
  es: {
    title: "Avalon Core Agency | Soluciones digitales para negocios",
    description: "Páginas web, CRM, marketing y recepcionistas con IA para contratistas, profesionales y empresas. Cuéntanos qué quieres mejorar.",
    og: "Más oportunidades. Menos tareas. Tu negocio, mejor conectado.", locale: "es_ES",
  },
  en: {
    title: "Avalon Core Agency | Websites, CRM & AI for Business",
    description: "Websites, CRM, marketing and AI receptionists for contractors, independent professionals and businesses. Tell us what you want to improve.",
    og: "More opportunities. Less busywork. A better-connected business.", locale: "en_US",
  },
} as const;

/**
 * Title, description and Open Graph locale follow the page language (?lang=en).
 * No canonical/hreflang here on purpose: Next.js strips the query string from `alternates`, which would point every
 * language at "/" and tell search engines the English page is a duplicate. The language relation is declared in
 * sitemap.xml instead, where the full URLs are kept.
 */
export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const lang = (await searchParams).lang === "en" ? "en" : "es";
  const m = META[lang];
  return {
    metadataBase: new URL(SITE_ORIGIN),
    title: m.title,
    description: m.description,
    robots: { index: true, follow: true },
    openGraph: { title: "Avalon Core Agency", description: m.og, type: "website", siteName: "Avalon Core Agency", locale: m.locale },
  };
}

export const viewport: Viewport = { themeColor: "#050610", colorScheme: "dark", viewportFit: "cover" };

const WORK_ART = ["/brand/devices-960.webp", "/brand/automation-720.webp", "/brand/ecommerce-720.webp"];

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const lang: Lang = params.lang === "en" ? "en" : "es";
  const rawServices = (Array.isArray(params.services) ? params.services.join(",") : params.services ?? "").slice(0, 160);
  const selected = new Set(rawServices.split(","));
  const initialServices = SERVICE_ORDER.filter(key => selected.has(key));
  const t = COPY[lang], q = qs(lang), U = UNIVERSE[lang];
  return (
    <SiteChrome lang={lang} scene="universe">
      <script dangerouslySetInnerHTML={{ __html: INTRO_GUARD }} />
      <LaunchIntro lang={lang} />
      <Effects />
      {/* I · THE IGNITION — the commercial message is server-rendered text (LCP); the 3D core lives in the backdrop. */}
      <section className={u.hero} data-universe-section="ignition" aria-labelledby="h-hero">
        <div className={u.heroInner}>
          <div className={u.heroCopy}>
            <p className={u.eyebrow}>{U.hero.eyebrow}</p>
            <h1 id="h-hero" className={u.title}><span>{U.hero.line1}</span> <span className={u.accent}>{U.hero.line2}</span></h1>
            <p className={u.sub}>{U.hero.sub}</p>
            <div className={u.heroCtas}>
              <a className={u.cta} data-magnet href="#arbol">{U.hero.primary}<Icon name="arrow" size={18} /></a>
              <a className={u.ctaGhost} href="#demos">{U.hero.secondary}</a>
            </div>
          </div>
        </div>
        <a className={u.scrollCue} href="#arbol"><span>{U.hero.scroll}</span><i aria-hidden="true" /></a>
      </section>

      {/* AVALON ULTIMATE 2.0 — the Business Growth Experience: tree → industry → demos → integrated journey. */}
      <GrowthExperience lang={lang} />

      {/* Services explained by the result they produce. */}
      <section id="soluciones" className={s.section} aria-labelledby="h-eco">
        <div className={s.wrap}>
          <Reveal className={s.head}><p className={s.eyebrow}>{t.eco.eyebrow}</p><h2 id="h-eco" className={s.h2}>{t.eco.title}</h2><p className={s.sub}>{t.eco.lead}</p></Reveal>
          <div className={s.groups}>{GROUPS.map(g => <div key={g.key}>
            <p className={s.groupTitle}>{t.eco.groups[g.key]}</p>
            <div className={s.cards}>{g.services.map((k, i) => { const v = t.services[k]; return (
              <Reveal key={k} className={s.card} delay={i * 80} spot>
                <span className={s.cardIcon}><Icon name={k} /></span>
                <h3>{v.name}</h3><p>{v.short}</p>
                <ul className={s.benefits}>{v.benefits.map(b => <li key={b}><Icon name="check" size={16} />{b}</li>)}</ul>
                <div className={s.cardLinks}><a href={`/soluciones/${k}${q}`}>{t.eco.explore}<Icon name="arrow" size={16} /></a><a href={`/?${lang === "en" ? "lang=en&" : ""}services=${k}#cotizacion`}>{t.eco.propose}</a></div>
              </Reveal>); })}</div>
          </div>)}</div>
        </div>
      </section>

      {/* Working with Avalon */}
      <section id="como-funciona" className={`${s.section} ${s.journeySec}`} aria-labelledby="h-journey">
        <div className={s.wrap}>
          <Reveal className={s.head}><p className={s.eyebrow}>{t.journey.eyebrow}</p><h2 id="h-journey" className={s.h2}>{t.journey.title}</h2></Reveal>
          <Journey lang={lang} />
        </div>
      </section>

      {/* Examples (clearly labelled until real, authorized cases exist) */}
      <section id="proyectos" className={s.section} aria-labelledby="h-work">
        <div className={s.wrap}>
          <Reveal className={s.head}><p className={s.eyebrow}>{t.work.eyebrow}</p><h2 id="h-work" className={s.h2}>{t.work.title}</h2><p className={s.sub}>{t.work.lead}</p></Reveal>
          <div className={s.workGrid}>{t.work.items.map(([h, p], i) => <Reveal key={h} className={s.work} delay={i * 90} spot>
            <div className={s.workArt}><img src={WORK_ART[i]} alt="" width={960} height={600} loading="lazy" decoding="async" /></div>
            <div className={s.workBody}><span className={s.badge}>{t.work.badge}</span><h3>{h}</h3><p>{p}</p></div>
          </Reveal>)}</div>
        </div>
      </section>

      {/* 07 · FAQ — native details keep the answers accessible without JavaScript. */}
      <section id="preguntas" className={s.section} aria-labelledby="h-faq">
        <div className={s.wrap}>
          <Reveal className={s.head}><p className={s.eyebrow}>{t.faq.eyebrow}</p><h2 id="h-faq" className={s.h2}>{t.faq.title}</h2></Reveal>
          <div className={s.faqGrid}>{t.faq.items.map(([question, answer]) => <details key={question} className={s.faqItem}>
            <summary>{question}</summary><p>{answer}</p>
          </details>)}</div>
        </div>
      </section>

      {/* 08 · Contact */}
      <section id="cotizacion" className={s.section} aria-labelledby="h-quote">
        <div className={s.wrap}>
          <div className={s.contact}>
            <picture>
              <source media="(max-aspect-ratio: 1/1)" srcSet="/brand/closing-m.webp" />
              <img className={s.contactBg} src={MEDIA.closing.src} alt="" width={1920} height={1080} loading="lazy" decoding="async" />
            </picture>
            <div className={s.contactGrid}>
              <div><p className={s.eyebrow}>{t.contact.eyebrow}</p><h2 id="h-quote" className={s.h2}>{t.contact.title}</h2><p className={s.lead}>{t.contact.lead}</p>
                <ul className={s.points}>{t.contact.points.map(x => <li key={x}><Icon name="check" size={18} />{x}</li>)}</ul>
                <p className={s.needs}>{t.contact.other}</p></div>
              <div className={s.formCard}><QuoteForm lang={lang} initialServices={initialServices} /></div>
            </div>
          </div>
        </div>
      </section>
    </SiteChrome>
  );
}
