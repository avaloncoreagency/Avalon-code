"use client";
import { useEffect, useRef, useState } from "react";
import s from "./landing.module.css";

/**
 * Page-wide micro-interactions with one listener each (no per-card handlers):
 *  - cursor spotlight on anything marked [data-spot] (CSS reads --mx/--my);
 *  - magnetic pull on [data-magnet] buttons.
 * Fine pointers only, and nothing at all with reduced motion.
 */
export function Effects() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !window.matchMedia("(pointer: fine)").matches) return;
    let mag: HTMLElement | null = null, raf = 0, ev: PointerEvent | null = null;
    const frame = () => {
      raf = 0; if (!ev) return; const e = ev;
      const tgt = e.target as Element | null;
      const spot = tgt?.closest?.("[data-spot]") as HTMLElement | null;
      if (spot) { const r = spot.getBoundingClientRect(); spot.style.setProperty("--mx", `${e.clientX - r.left}px`); spot.style.setProperty("--my", `${e.clientY - r.top}px`); }
      const m = tgt?.closest?.("[data-magnet]") as HTMLElement | null;
      if (mag && mag !== m) { mag.style.transform = ""; mag = null; }
      if (m) { const r = m.getBoundingClientRect(); const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        m.style.transform = `translate(${dx * .18}px, ${dy * .28}px)`; mag = m; }
    };
    const on = (e: PointerEvent) => { ev = e; if (!raf) raf = requestAnimationFrame(frame); };
    document.addEventListener("pointermove", on, { passive: true });
    return () => { document.removeEventListener("pointermove", on); cancelAnimationFrame(raf); };
  }, []);
  return null;
}

/** Counts up to `to` the first time it scrolls into view. Server HTML already holds the final value. */
export function CountUp({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null); const [v, setV] = useState(to);
  useEffect(() => {
    const el = ref.current; if (!el || !("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return; io.disconnect();
      const t0 = performance.now(), d = 1400;
      const step = (t: number) => { const k = Math.min(1, (t - t0) / d); setV(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(step); };
      setV(0); raf = requestAnimationFrame(step);
    }, { threshold: .6 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to]);
  return <span ref={ref} className={s.count}>{v}{suffix}</span>;
}

/** Ambient Higgsfield loop behind a section: lazy, muted, paused off-screen, skipped with reduced motion/data saver. */
export function AmbientVideo({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLDivElement>(null); const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) setOn(true);
      const v = el.querySelector("video"); if (v) { if (e.isIntersecting) void v.play().catch(() => {}); else v.pause(); }
    }, { rootMargin: "100px 0px" });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <div className={s.ambient} ref={ref} aria-hidden="true" style={{ backgroundImage: `url(${poster})` }}>
    {on && <video src={src} muted loop playsInline autoPlay preload="none" onPlaying={e => e.currentTarget.setAttribute("data-on", "true")} />}
  </div>;
}
