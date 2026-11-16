"use client";
/* eslint-disable @next/next/no-img-element -- static pre-optimized WebP poster frame. */
import { useEffect, useRef, useState } from "react";
import type { Lang } from "./copy";
import s from "./landing.module.css";

/**
 * Scroll-scrubbed cinematic (Higgsfield fly-through rendered to 80 WebP frames). The first frame is a normal image, so
 * the section reads fine without JS. Frames load only when the section approaches the viewport (a lighter set on
 * small screens / data saver) and are drawn to a canvas as the user scrolls. With reduced motion the scrub is skipped
 * and the three chapters are shown as a static sequence.
 */
const N = 80;
const frame = (i: number, small: boolean) => `/brand/seq/fly-${small ? "s-" : ""}${String(i).padStart(3, "0")}.webp`;

const CH: Record<Lang, [string, string][]> = {
  es: [["Tus herramientas, por separado", "Web, CRM, IA, marketing y automatización suelen vivir en sistemas aislados."], ["Las conectamos en un solo núcleo", "Avalon une cada pieza para que la información fluya sin trabajo manual."], ["Y trabajan en cada pantalla", "Tu equipo y tus clientes lo usan desde el teléfono, la tablet o la computadora."]],
  en: [["Your tools, scattered", "Website, CRM, AI, marketing and automation usually live in isolated systems."], ["We connect them into one core", "Avalon links every piece so information flows without manual work."], ["Working on every screen", "Your team and customers use it from phone, tablet or desktop."]],
};

export function ScrollSequence({ lang }: { lang: Lang }) {
  const wrap = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null);
  const [p, setP] = useState(0); const [ready, setReady] = useState(false); const [still, setStill] = useState(false);
  useEffect(() => {
    const el = wrap.current, c = cv.current; if (!el || !c) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setStill(true); return; }
    const small = !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    const imgs: HTMLImageElement[] = []; let loaded = 0, raf = 0, last = -1, started = false;
    const ctx = c.getContext("2d");
    const draw = (i: number) => {
      const im = imgs[i]; if (!ctx || !im?.complete || !im.naturalWidth) return false;
      const w = c.clientWidth, h = c.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      // Landscape: cover. Portrait phones: a partial cover so the 16:9 film is not cropped to a sliver.
      const portrait = c.height > c.width, r = Math.max(c.width / im.naturalWidth, (c.height / im.naturalHeight) * (portrait ? .6 : 1));
      const dw = im.naturalWidth * r, dh = im.naturalHeight * r;
      ctx.fillStyle = "#eef0fb"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(im, (c.width - dw) / 2, (c.height - dh) * (portrait ? .36 : .5), dw, dh); return true;
    };
    const progress = () => { const r = el.getBoundingClientRect(); return Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - window.innerHeight))); };
    const tick = () => {
      raf = 0; const pr = progress(); setP(pr);
      let i = Math.round(pr * (N - 1));
      while (i > 0 && !imgs[i]?.complete) i--; // fall back to the nearest frame already decoded
      if (i !== last && draw(i)) last = i;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const start = () => {
      if (started) return; started = true;
      for (let i = 0; i < N; i++) {
        const im = new Image(); im.decoding = "async"; im.src = frame(i, small);
        im.onload = () => { void im.decode?.().catch(() => {}); loaded++; if (i === 0 || loaded === N) { setReady(true); last = -1; onScroll(); } };
        imgs.push(im);
      }
    };
    // Never compete with the first paint: wait for window load, then only fetch once the film is about to be seen.
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) start(); }, { rootMargin: "40% 0px" });
    const arm = () => io.observe(el);
    if (document.readyState === "complete") arm(); else window.addEventListener("load", arm, { once: true });
    const onResize = () => { last = -1; onScroll(); };
    window.addEventListener("scroll", onScroll, { passive: true }); window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("load", arm); io.disconnect(); window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onResize); cancelAnimationFrame(raf); };
  }, []);
  const ch = CH[lang]; const active = Math.min(2, Math.floor(p * 3));
  if (still) return <div className={s.seqStill}>{ch.map(([h, t], i) => <figure key={h}>
    <img src={frame([0, 40, 79][i], true)} alt="" width={720} height={405} loading="lazy" decoding="async" /><figcaption><b>{h}</b>{t}</figcaption></figure>)}</div>;
  return <div className={s.seq} ref={wrap}>
    <div className={s.seqSticky}>
      <img className={s.seqPoster} src={frame(0, true)} alt="" width={720} height={405} loading="lazy" decoding="async" data-hide={ready} />
      <canvas ref={cv} className={s.seqCanvas} aria-hidden="true" />
      <div className={s.seqShade} />
      <div className={s.seqCaps}>{ch.map(([h, t], i) => <div key={h} className={s.seqCap} data-on={i === active}>
        <span>{String(i + 1).padStart(2, "0")} / 03</span><h3>{h}</h3><p>{t}</p></div>)}</div>
      <div className={s.seqBar} aria-hidden="true"><i style={{ transform: `scaleX(${p})` }} /></div>
    </div>
  </div>;
}
