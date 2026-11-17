"use client";
/* eslint-disable @next/next/no-img-element -- local optimized poster; no image-optimization quota. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "../landing/copy";
import i from "./intro.module.css";

/**
 * EL DESPEGUE — the official opening (≈4.5 s, once per browser session).
 *  1. Activation: the Higgsfield tunnel film starts dark and its lights come up.
 *  2. Acceleration: the camera pushes toward the golden light (film at 2.2×, plus a slow zoom).
 *  3. Birth: the light flares, particles converge and the authentic Avalon mark appears in polished metal.
 *  4. Transition: an iris opens from the light onto the homepage, which is already rendered underneath.
 * Never blocks content: the page is server-rendered below; Skip, Esc, scroll or a tap ends it at once.
 * Reduced motion, a repeat visit in the same session, or data saver → no intro (a short static fade on data saver).
 * A tiny inline script hides it before first paint for repeat visits, so it never flashes.
 */
const KEY = "avalon-intro-v2";
export const INTRO_GUARD = `try{if(sessionStorage.getItem("${KEY}")||matchMedia("(prefers-reduced-motion: reduce)").matches){var s=document.createElement("style");s.textContent="#avalon-intro{display:none!important}";document.head.appendChild(s)}}catch(e){}`;

/** The authentic Avalon Core Agency mark (same path as the site header), rendered as brushed metal with light. */
export function AvalonMark({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 140 130" aria-hidden="true">
    <defs>
      <linearGradient id="avm-metal" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f7f9ff" /><stop offset=".28" stopColor="#aab4cc" /><stop offset=".5" stopColor="#5b6a8f" />
        <stop offset=".62" stopColor="#c9d3ec" /><stop offset=".8" stopColor="#7f8db0" /><stop offset="1" stopColor="#2e3858" />
      </linearGradient>
      <linearGradient id="avm-brand" x1="0" y1="1" x2="1" y2="0"><stop stopColor="#3554ff" /><stop offset=".55" stopColor="#7a5cff" /><stop offset="1" stopColor="#19b8e6" /></linearGradient>
      <linearGradient id="avm-sheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".85" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
      <clipPath id="avm-clip"><path d="M70 12 131 112H99L70 62 40 112H9ZM70 79 91 115H49Z" /></clipPath>
    </defs>
    <path d="M70 12 131 112H99L70 62 40 112H9ZM70 79 91 115H49Z" fill="url(#avm-metal)" />
    <path d="M70 12 131 112H99L70 62 40 112H9ZM70 79 91 115H49Z" fill="url(#avm-brand)" opacity=".42" style={{ mixBlendMode: "color" }} />
    <g clipPath="url(#avm-clip)"><rect className="avm-sheen" x="-60" y="0" width="40" height="130" fill="url(#avm-sheen)" transform="skewX(-18)" /></g>
    <path d="M70 12 131 112H99L70 62 40 112H9ZM70 79 91 115H49Z" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth=".8" />
  </svg>;
}

export function LaunchIntro({ lang }: { lang: Lang }) {
  const [phase, setPhase] = useState<"idle" | "tunnel" | "birth" | "reveal" | "done">("idle");
  const [portrait, setPortrait] = useState(false);
  const [film, setFilm] = useState(true);
  const video = useRef<HTMLVideoElement>(null), timers = useRef<number[]>([]);

  const finish = useCallback(() => {
    timers.current.forEach(t => window.clearTimeout(t)); timers.current = [];
    try { sessionStorage.setItem(KEY, "1"); } catch { /* private mode */ }
    setPhase(p => (p === "done" ? p : "reveal"));
    timers.current.push(window.setTimeout(() => setPhase("done"), 700));
  }, []);

  useEffect(() => {
    let seen = false;
    try { seen = !!sessionStorage.getItem(KEY); } catch { /* ignore */ }
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (seen || rm) { setPhase("done"); return; }
    const saver = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    const slow = saver?.saveData === true || /(^|-)2g$/.test(saver?.effectiveType ?? "");
    setPortrait(window.matchMedia("(max-aspect-ratio: 1/1)").matches);
    setFilm(!slow);
    setPhase("tunnel");
    const at = (ms: number, f: () => void) => timers.current.push(window.setTimeout(f, ms));
    at(slow ? 900 : 2500, () => setPhase("birth"));
    at(slow ? 2200 : 4100, finish);
    const end = (e: Event) => { if (e.type !== "keydown" || (e as KeyboardEvent).key === "Escape") finish(); };
    window.addEventListener("keydown", end); window.addEventListener("wheel", end, { passive: true }); window.addEventListener("touchmove", end, { passive: true });
    return () => { timers.current.forEach(t => window.clearTimeout(t)); window.removeEventListener("keydown", end); window.removeEventListener("wheel", end); window.removeEventListener("touchmove", end); };
  }, [finish]);

  useEffect(() => {
    const v = video.current; if (!v || phase !== "tunnel" || !film) return;
    v.playbackRate = 2.2;
    v.play().catch(() => setFilm(false));     // autoplay refused → the still poster carries the shot
  }, [phase, film]);

  if (phase === "done") return null;
  const poster = portrait ? "/brand/u/launch-m-1080.webp" : "/brand/u/launch-2400.webp";
  return (
    <div id="avalon-intro" className={i.intro} data-phase={phase} role="presentation">
      <div className={i.tunnel} aria-hidden="true">
        <img className={i.poster} src={portrait ? "/brand/u/launch-m-720.webp" : "/brand/u/launch-1280.webp"} alt="" width={portrait ? 720 : 1280} height={portrait ? 1280 : 720} decoding="async" fetchPriority="high" />
        {film && phase !== "idle" && <video ref={video} className={i.film} src={portrait ? "/brand/u/launch-intro-m.mp4" : "/brand/u/launch-intro.mp4"} poster={poster} muted playsInline preload="auto" />}
      </div>
      <div className={i.flare} aria-hidden="true" />
      <div className={i.sparks} aria-hidden="true">{Array.from({ length: 18 }, (_, k) => <span key={k} style={{ ["--a" as string]: `${k * 20}deg`, ["--d" as string]: `${(k % 6) * 40}ms` }} />)}</div>
      <div className={i.brand} aria-hidden="true">
        <AvalonMark className={i.mark} />
        <p className={i.word}><strong>AVALON</strong><small>CORE AGENCY</small></p>
      </div>
      <button type="button" className={i.skip} onClick={finish}>{lang === "es" ? "Omitir intro" : "Skip intro"}</button>
    </div>
  );
}
