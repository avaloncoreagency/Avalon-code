"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { COPY, type Lang } from "./copy";
import { Icon } from "./icons";
import s from "./landing.module.css";

/**
 * Scroll reveal as pure CSS (animation-timeline: view()). Progressive enhancement: browsers without scroll-driven
 * animations simply show the content — nothing is ever hidden waiting for JavaScript or an observer.
 */
export function Reveal({ children, as: Tag = "div", className = "", delay = 0 }: { children: ReactNode; as?: "div" | "section" | "li"; className?: string; delay?: number }) {
  return <Tag className={`${className} ${s.reveal}`} style={delay ? { animationRange: `entry ${delay / 40}% cover 30%` } as React.CSSProperties : undefined}>{children}</Tag>;
}

/** Sticky header that gains a hairline once the page scrolls. */
export function HeaderShell({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return <header className={s.header} data-scrolled={scrolled}>{children}</header>;
}

/** Scroll storytelling: each step lights up as it crosses the middle of the viewport. */
export function Journey({ lang }: { lang: Lang }) {
  const steps = COPY[lang].journey.steps;
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);
  useEffect(() => {
    if (!("IntersectionObserver" in window)) { setActive(steps.length - 1); return; }
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i));
    }, { rootMargin: "-45% 0px -45% 0px" });
    refs.current.forEach(el => el && io.observe(el));
    return () => io.disconnect();
  }, [steps.length]);
  return <ol className={s.journey}>{steps.map(([h, p], i) =>
    <li key={h} ref={el => { refs.current[i] = el; }} data-i={i} className={s.jStep} data-on={i <= active}>
      <span className={s.jDot}>{String(i + 1).padStart(2, "0")}</span><div><h3>{h}</h3><p>{p}</p></div>
    </li>)}</ol>;
}

/** Industry selector: shows realistic tools for each sector. */
export function Industries({ lang }: { lang: Lang }) {
  const t = COPY[lang]; const [k, setK] = useState(0);
  const [key, name, text, tools] = t.ind.list[k];
  const q = lang === "en" ? "?lang=en" : "";
  return <>
    <div className={s.indTabs} role="tablist" aria-label={t.ind.title}>
      {t.ind.list.map(([id, n], i) => <button key={id} type="button" role="tab" className={s.indTab} aria-selected={k === i} onClick={() => setK(i)}>{n}</button>)}
    </div>
    <div className={s.indPanel} role="tabpanel" key={key} aria-label={name}>
      <div><h3>{name}</h3><p>{text}</p>{key === "barber" && <p className={s.pilot}>{t.ind.pilot}</p>}</div>
      <div><p className={s.groupTitle}>{t.ind.tools}</p>
        <div className={s.toolList}>{tools.map(svc => <a key={svc} className={s.tool} href={`/soluciones/${svc}${q}`}><span><Icon name={svc} size={20} /></span>{t.services[svc].name}</a>)}</div>
      </div>
    </div>
  </>;
}
