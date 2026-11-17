import Link from "next/link";
import type { ReactNode } from "react";
import { COPY, SERVICE_ORDER, type Lang } from "./copy";
import { Icon } from "./icons";
import { HeaderShell } from "./interactive";
import { LivingUniverse } from "./universe/living-universe";
import s from "./landing.module.css";

export const qs = (lang: Lang) => (lang === "en" ? "?lang=en" : "");

function Logo() {
  return <svg viewBox="0 0 140 130" aria-hidden="true"><defs><linearGradient id="av-l" x1="0" y1="1" x2="1" y2="0"><stop stopColor="#3554ff" /><stop offset=".55" stopColor="#7a5cff" /><stop offset="1" stopColor="#19b8e6" /></linearGradient></defs>
    <path d="M70 12 131 112H99L70 62 40 112H9ZM70 79 91 115H49Z" fill="url(#av-l)" /></svg>;
}

/** Shared public chrome: header (desktop links, mobile <details> menu without JS), main and footer. */
export function SiteChrome({ lang, path = "/", scene = "ambient", children }: { lang: Lang; path?: string; scene?: "universe" | "ambient"; children: ReactNode }) {
  const t = COPY[lang], q = qs(lang), home = path === "/" ? "" : `/${q}`;
  const other = lang === "es" ? `${path}?lang=en` : path;
  const links: [string, string][] = [[`${home}#soluciones`, t.nav.solutions], [`${home}#showroom`, t.nav.showroom], [`${home}#industrias`, t.nav.industries], [`${home}#proyectos`, t.nav.work]];
  return <div className={s.root} data-landing lang={lang}>
    <LivingUniverse variant={scene} />
    <div className={s.progress} aria-hidden="true" />
    <a className="skip-link" href="#contenido">{lang === "es" ? "Saltar al contenido" : "Skip to content"}</a>
    <HeaderShell>
      <div className={`${s.wrap} ${s.headerIn}`}>
        <Link href={`/${q}`} className={s.logo} aria-label="Avalon Core Agency"><Logo /><span><strong>AVALON</strong><small>CORE AGENCY</small></span></Link>
        <nav className={s.navLinks} aria-label={lang === "es" ? "Principal" : "Main"}>{links.map(([h, l]) => <a key={h} href={h}>{l}</a>)}</nav>
        <div className={s.headerActions}>
          <Link className={s.lang} href={other} hrefLang={lang === "es" ? "en" : "es"} aria-label={t.nav.langLabel}>{t.nav.lang}</Link>
          <a className={`${s.btn} ${s.primary} ${s.small} ${s.headerQuote}`} href={`${home}#cotizacion`}>{t.nav.quote}<Icon name="arrow" size={16} /></a>
          <details className={s.menu}><summary aria-label={t.nav.menu}><span /></summary>
            <nav className={s.menuPanel} aria-label={t.nav.menu}>{links.map(([h, l]) => <a key={h} href={h}>{l}</a>)}<a href={`${home}#cotizacion`}>{t.nav.quote}</a></nav>
          </details>
        </div>
      </div>
    </HeaderShell>
    <main id="contenido">{children}</main>
    <footer className={s.footer}>
      <div className={`${s.wrap}`}>
        <div className={s.footerGrid}>
          <div><Link href={`/${q}`} className={s.logo} aria-label="Avalon Core Agency"><Logo /><span><strong>AVALON</strong><small>CORE AGENCY</small></span></Link><p>{t.footer.tagline}</p></div>
          <div><p className={s.footHead}>{t.nav.solutions}</p><ul>{SERVICE_ORDER.slice(0, 4).map(k => <li key={k}><Link href={`/soluciones/${k}${q}`}>{t.services[k].name}</Link></li>)}</ul></div>
          <div><p className={s.footHead} aria-hidden="true">&nbsp;</p><ul>{SERVICE_ORDER.slice(4).map(k => <li key={k}><Link href={`/soluciones/${k}${q}`}>{t.services[k].name}</Link></li>)}</ul></div>
        </div>
        <div className={s.legal}><span>© {new Date().getFullYear()} Avalon Core Agency. {t.footer.rights}</span><Link href="/admin/login">{t.footer.admin}</Link></div>
      </div>
    </footer>
  </div>;
}
