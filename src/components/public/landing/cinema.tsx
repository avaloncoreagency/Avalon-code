"use client";
/* eslint-disable @next/next/no-img-element -- pre-optimized static WebP posters; avoids the image-optimization quota. */
import { useEffect, useRef, useState } from "react";
import type { Lang } from "./copy";
import c from "./cinema.module.css";

/**
 * AVALON · THE FILM — the four universes as photoreal Higgsfield films (Kling 3.0 pro, image-to-video from the 4K
 * masters in /public/brand/u). One stage, four chapters that play in sequence.
 *  - Nothing downloads until the stage is near the viewport (preload none, src assigned on intersection).
 *  - Plays muted and inline only while visible; pauses off-screen and when the tab is hidden.
 *  - Reduced motion or data saver: no autoplay; the poster is shown and the visitor may press play.
 *  - Portrait screens get the 9:16 cut, landscape the 16:9 cut.
 */
type Chapter = { key: "ignition" | "launch" | "engine" | "tree"; n: string; title: string; line: string };
const COPY: Record<Lang, { eyebrow: string; title: string; sub: string; play: string; pause: string; chapters: Chapter[] }> = {
  es: {
    eyebrow: "La película", title: "Avalon, en movimiento.",
    sub: "Cuatro universos, una misma idea: sistemas reales que encienden, aceleran y hacen crecer tu negocio.",
    play: "Reproducir", pause: "Pausar",
    chapters: [
      { key: "ignition", n: "I", title: "La Ignición", line: "Toda gran operación empieza con una idea que se enciende." },
      { key: "launch", n: "II", title: "El Despegue", line: "Tu negocio toma velocidad con sistemas que trabajan por ti." },
      { key: "engine", n: "III", title: "El Motor", line: "Seis módulos conectados alimentan cada oportunidad." },
      { key: "tree", n: "IV", title: "El Árbol", line: "Lo que hoy plantas, mañana da fruto." },
    ],
  },
  en: {
    eyebrow: "The film", title: "Avalon, in motion.",
    sub: "Four universes, one idea: real systems that ignite, accelerate and grow your business.",
    play: "Play", pause: "Pause",
    chapters: [
      { key: "ignition", n: "I", title: "The Ignition", line: "Every great operation starts with an idea that ignites." },
      { key: "launch", n: "II", title: "The Launch", line: "Your business picks up speed with systems that work for you." },
      { key: "engine", n: "III", title: "The Growth Engine", line: "Six connected modules feed every opportunity." },
      { key: "tree", n: "IV", title: "The Growth Tree", line: "What you plant today bears fruit tomorrow." },
    ],
  },
};

const src = (key: Chapter["key"], portrait: boolean) => `/brand/u/${key}${portrait ? "-m" : ""}.mp4`;
const poster = (key: Chapter["key"], portrait: boolean, big = false) =>
  portrait ? `/brand/u/${key}-m-${big ? 1080 : 720}.webp` : `/brand/u/${key}-${big ? 2400 : 1280}.webp`;

export function Cinema({ lang }: { lang: Lang }) {
  const t = COPY[lang];
  const stage = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null), bar = useRef<HTMLSpanElement>(null);
  const [idx, setIdx] = useState(0);
  const [portrait, setPortrait] = useState(false);
  const [visible, setVisible] = useState(false);
  const [armed, setArmed] = useState(false);       // first time near the viewport: from then on the source stays attached
  const [auto, setAuto] = useState(true);          // false with reduced motion / data saver until the visitor presses play
  const [playing, setPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-aspect-ratio: 1/1)"), rm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const saver = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    const sync = () => { setPortrait(mq.matches); setAuto(!rm.matches && !saver); };
    sync(); mq.addEventListener("change", sync); rm.addEventListener("change", sync);
    const node = stage.current; const obs: IntersectionObserver[] = [];
    if (node) {
      // Arm (attach the source) a little before it scrolls in; play only when a third of the frame is visible.
      obs.push(new IntersectionObserver(([e]) => { if (e.isIntersecting) setArmed(true); }, { rootMargin: "400px 0px" }));
      obs.push(new IntersectionObserver(([e]) => setVisible(e.isIntersecting && e.intersectionRatio >= 0.35), { threshold: [0, 0.35, 0.6] }));
      obs.forEach(o => o.observe(node));
    }
    return () => { mq.removeEventListener("change", sync); rm.removeEventListener("change", sync); obs.forEach(o => o.disconnect()); };
  }, []);

  // Play only while on screen, the tab is visible and the visitor has not paused (or explicitly asked to play).
  useEffect(() => {
    const v = video.current; if (!v) return;
    const want = visible && !userPaused && (auto || playing) && !document.hidden;
    if (want) { v.play().then(() => setPlaying(true)).catch(() => setPlaying(false)); } else { v.pause(); }
    const onVis = () => { if (document.hidden) v.pause(); else if (visible && !userPaused && (auto || playing)) void v.play().catch(() => {}); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [visible, userPaused, auto, playing, idx, portrait]);

  const ch = t.chapters[idx];
  const next = () => setIdx(i => (i + 1) % t.chapters.length);
  const toggle = () => {
    const v = video.current; if (!v) return;
    if (v.paused) { setUserPaused(false); setPlaying(true); void v.play().catch(() => {}); } else { setUserPaused(true); setPlaying(false); v.pause(); }
  };

  return (
    <div className={c.cinema}>
      <div className={c.head}>
        <p className={c.eyebrow}>{t.eyebrow}</p>
        <h2 id="h-film" className={c.title}>{t.title}</h2>
        <p className={c.sub}>{t.sub}</p>
      </div>
      <div ref={stage} className={c.stage} data-portrait={portrait}>
        {/* Static poster underneath: the frame is never empty, even before any video byte arrives. */}
        <img key={`p-${ch.key}-${portrait}`} className={c.poster} src={poster(ch.key, portrait)} srcSet={`${poster(ch.key, portrait)} 1x, ${poster(ch.key, portrait, true)} 2x`}
          alt="" width={portrait ? 720 : 1280} height={portrait ? 1280 : 720} loading="lazy" decoding="async" />
        <video key={`v-${ch.key}-${portrait}`} ref={video} className={c.video} muted playsInline preload="none"
          src={armed ? src(ch.key, portrait) : undefined} poster={poster(ch.key, portrait)}
          onPlay={() => setPlaying(true)} onEnded={next}
          onTimeUpdate={e => { const v = e.currentTarget; if (bar.current && v.duration) bar.current.style.transform = `scaleX(${v.currentTime / v.duration})`; }}
          aria-label={`${ch.n} · ${ch.title}`} />
        <div className={c.shade} aria-hidden="true" />
        <div className={c.caption} aria-live="polite">
          <span className={c.num}>{ch.n}</span>
          <div><h3>{ch.title}</h3><p>{ch.line}</p></div>
        </div>
        <button type="button" className={c.toggle} onClick={toggle} aria-pressed={playing && !userPaused} aria-label={playing && !userPaused ? t.pause : t.play}>
          {playing && !userPaused ? <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z" /></svg>}
        </button>
      </div>
      <ol className={c.chapters}>
        {t.chapters.map((x, i) => <li key={x.key}>
          <button type="button" aria-pressed={i === idx} onClick={() => { setIdx(i); setUserPaused(false); setPlaying(true); }}>
            <span className={c.cNum}>{x.n}</span><span className={c.cTitle}>{x.title}</span>
            <span className={c.track} aria-hidden="true">{i === idx && <span ref={bar} className={c.fill} />}</span>
          </button>
        </li>)}
      </ol>
    </div>
  );
}
