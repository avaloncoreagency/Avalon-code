/* eslint-disable @next/next/no-img-element -- pre-optimized static WebP with srcset/sizes; avoids the Vercel image-optimization quota. */
import type { Metadata, Viewport } from "next";
import { QuoteForm } from "@/components/public/quote-form";
import { COPY, GROUPS, type Lang } from "@/components/public/landing/copy";
import { HeroScene } from "@/components/public/landing/hero-scene";
import { Icon } from "@/components/public/landing/icons";
import { AmbientVideo, CountUp, Effects } from "@/components/public/landing/effects";
import { AnyIndustry } from "@/components/public/landing/industries";
import { Journey, Reveal } from "@/components/public/landing/interactive";
import { ProductVideo } from "@/components/public/landing/product-video";
import { ScrollSequence } from "@/components/public/landing/scroll-sequence";
import { MEDIA } from "@/components/public/landing/media";
import { Showroom } from "@/components/public/landing/showroom";
import { SiteChrome, qs } from "@/components/public/landing/site-chrome";
import s from "@/components/public/landing/landing.module.css";

/** Canonical public origin. Previews and the admin host never set it: only the production site is indexable. */
const SITE_ORIGIN = "https://avaloncoreagency.com";
const META = {
  es: {
    title: "Avalon Core Agency · IA, webs, CRM y automatización para empresas",
    description: "Desarrollo web, e-commerce, CRM personalizados, recepcionistas de IA, marketing y automatización empresarial. Solicita tu cotización.",
    og: "IA. Personas. Sistemas. Un mañana más brillante.", locale: "es_ES",
  },
  en: {
    title: "Avalon Core Agency · AI, websites, CRM and automation for businesses",
    description: "Web development, e-commerce, custom CRMs, AI receptionists, marketing and business automation. Request a quote.",
    og: "AI. People. Systems. A brighter tomorrow.", locale: "en_US",
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

export const viewport: Viewport = { themeColor: "#f7f8fd", colorScheme: "light", viewportFit: "cover" };

/** Hero facts: only claims we can stand behind (count of solutions, example industries in the composer, AI availability). */
const STATS: Record<Lang, [number, string, string][]> = {
  es: [[8, "", "soluciones conectadas"], [60, "+", "industrias de ejemplo"], [24, "/7", "atención con IA"]],
  en: [[8, "", "connected solutions"], [60, "+", "example industries"], [24, "/7", "AI-assisted response"]],
};

const WORK_ART = ["/brand/devices-960.webp", "/brand/automation-720.webp", "/brand/ecommerce-720.webp"];

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const lang: Lang = (await searchParams).lang === "en" ? "en" : "es";
  const t = COPY[lang], q = qs(lang);
  return (
    <SiteChrome lang={lang}>
      <Effects />
      {/* 01 · Hero */}
      <section className={s.hero} aria-labelledby="h-hero">
        <div className={`${s.wrap} ${s.heroGrid}`}>
          <div className={s.heroIntro}>
            <p className={s.eyebrow}>{t.hero.eyebrow}</p>
            <h1 id="h-hero" className={s.h1}>{lang === "es" ? <>El sistema digital que <em>impulsa</em> tu negocio.</> : <>The digital system that <em>powers</em> your business.</>}</h1>
            <p className={s.lead}>{t.hero.lead}</p>
            <div className={s.ctas}>
              <a className={`${s.btn} ${s.primary}`} data-magnet href="#soluciones">{t.hero.primary}<Icon name="arrow" size={18} /></a>
              <a className={`${s.btn} ${s.ghost}`} href="#experiencia"><Icon name="play" size={16} />{t.hero.secondary}</a>
            </div>
            <dl className={s.stats}>{STATS[lang].map(([n, suf, l]) => <div key={l}><dt className={s.srOnly}>{l}</dt><dd><CountUp to={n} suffix={suf} /><span>{l}</span></dd></div>)}</dl>
          </div>
          <div className={s.heroArtIn}><HeroScene lang={lang} /></div>
        </div>
      </section>

      {/* 02 · Cinematic scroll story (Higgsfield fly-through) */}
      <section id="experiencia" className={s.seqSection} aria-labelledby="h-seq">
        <h2 id="h-seq" className={s.srOnly}>{lang === "es" ? "Cómo Avalon conecta tu negocio" : "How Avalon connects your business"}</h2>
        <ScrollSequence lang={lang} />
      </section>

      {/* 03 · Ecosystem */}
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
                <div className={s.cardLinks}><a href={`/soluciones/${k}${q}`}>{t.eco.explore}<Icon name="arrow" size={16} /></a><a href="#cotizacion">{t.eco.propose}</a></div>
              </Reveal>); })}</div>
          </div>)}</div>
        </div>
      </section>

      {/* 03 · Showroom */}
      <section id="showroom" className={s.section} aria-labelledby="h-show">
        <div className={s.wrap}>
          <Reveal className={s.head}><p className={s.eyebrow}>{t.show.eyebrow}</p><h2 id="h-show" className={s.h2}>{t.show.title}</h2><p className={s.sub}>{t.show.lead}</p></Reveal>
          <Showroom lang={lang} />
        </div>
      </section>

      {/* 04 · How it works together */}
      <section id="como-funciona" className={`${s.section} ${s.journeySec}`} aria-labelledby="h-journey">
        <AmbientVideo src={MEDIA.network.video} poster={MEDIA.network.poster} />
        <div className={s.wrap}>
          <Reveal className={s.head}><p className={s.eyebrow}>{t.journey.eyebrow}</p><h2 id="h-journey" className={s.h2}>{t.journey.title}</h2></Reveal>
          <Journey lang={lang} />
        </div>
      </section>

      {/* 05 · Industries */}
      <section id="industrias" className={s.section} aria-labelledby="h-ind">
        <div className={s.wrap}>
          <Reveal className={s.head}><p className={s.eyebrow}>{t.ind.eyebrow}</p><h2 id="h-ind" className={s.h2}>{t.ind.title}</h2><p className={s.sub}>{t.ind.lead}</p></Reveal>
          <AnyIndustry lang={lang} />
        </div>
      </section>

      {/* Brand statement: Higgsfield glass sculpture of the Avalon mark */}
      <section className={s.section} aria-labelledby="h-core">
        <div className={`${s.wrap} ${s.core}`}>
          <Reveal className={s.coreArt}><ProductVideo poster={MEDIA.logo.small} srcSet={`${MEDIA.logo.small} 960w, ${MEDIA.logo.src} 1920w`} video={MEDIA.logo.video} alt={MEDIA.logo.alt[lang]} w={1920} h={1080} /></Reveal>
          <Reveal className={s.coreText}>
            <p className={s.eyebrow}>Avalon Core</p>
            <h2 id="h-core" className={s.h2}>{lang === "es" ? <>Un núcleo. <em className={s.gradText}>Todo tu negocio.</em></> : <>One core. <em className={s.gradText}>Your whole business.</em></>}</h2>
            <p className={s.sub}>{lang === "es" ? "Diseño, software e inteligencia artificial construidos por el mismo equipo y conectados entre sí. Sin piezas sueltas ni proveedores que no se hablan." : "Design, software and AI built by the same team and connected to each other. No loose pieces, no vendors that don't talk."}</p>
            <a className={`${s.btn} ${s.primary}`} data-magnet href="#cotizacion" style={{ marginTop: 26 }}>{t.nav.quote}<Icon name="arrow" size={18} /></a>
          </Reveal>
        </div>
      </section>

      {/* 06 · Work (conceptual until real, authorized cases exist) */}
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
            <img className={s.contactBg} src={MEDIA.closing.src} alt="" width={1920} height={1080} loading="lazy" decoding="async" />
            <div className={s.contactGrid}>
              <div><p className={s.eyebrow}>{t.contact.eyebrow}</p><h2 id="h-quote" className={s.h2}>{t.contact.title}</h2><p className={s.lead}>{t.contact.lead}</p>
                <ul className={s.points}>{t.contact.points.map(x => <li key={x}><Icon name="check" size={18} />{x}</li>)}</ul>
                <p className={s.needs}>{t.contact.other}</p></div>
              <div className={s.formCard}><QuoteForm lang={lang} /></div>
            </div>
          </div>
        </div>
      </section>
    </SiteChrome>
  );
}
