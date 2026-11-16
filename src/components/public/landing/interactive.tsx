"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { COPY, type Lang } from "./copy";
import s from "./landing.module.css";

/**
 * Scroll reveal as pure CSS (animation-timeline: view()). Progressive enhancement: browsers without scroll-driven
 * animations simply show the content — nothing is ever hidden waiting for JavaScript or an observer.
 */
export function Reveal({ children, as: Tag = "div", className = "", delay = 0, spot = false }: { children: ReactNode; as?: "div" | "section" | "li"; className?: string; delay?: number; spot?: boolean }) {
  return <Tag data-spot={spot || undefined} className={`${className} ${s.reveal}${spot ? ` ${s.spot}` : ""}`} style={delay ? { animationRange: `entry ${delay / 40}% cover 30%` } as React.CSSProperties : undefined}>{children}</Tag>;
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
