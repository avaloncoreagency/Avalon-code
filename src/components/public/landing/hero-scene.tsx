"use client";
import { useEffect, useRef, useState } from "react";
import type { Lang } from "./copy";
import { MEDIA } from "./media";
import s from "./landing.module.css";

/**
 * Hero art: Higgsfield-produced render (vertical composition on phones, wide on desktop) with an optional ambient
 * Higgsfield loop layered on top once it can play. The image is the LCP element and loads eagerly; the video loads
 * lazily, never on reduced-motion or data-saver, and never blocks the headline. Pointer tilt (mouse only) and a
 * scroll-linked zoom/parallax are applied through CSS custom properties in a single rAF.
 */
export function HeroScene({ lang }: { lang: Lang }) {
  const ref = useRef<HTMLDivElement>(null);
  const [video, setVideo] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (!reduced && !saveData && (MEDIA.hero.video || MEDIA.hero.videoMobile)) setVideo(true);
    if (reduced) return;
    let raf = 0, px = 0, py = 0;
    const apply = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height)));
      el.style.setProperty("--rx", `${(-py * 5).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${(px * 7).toFixed(2)}deg`);
      el.style.setProperty("--zoom", (1 + p * 0.12).toFixed(3));
      el.style.setProperty("--lift", `${(p * -40).toFixed(1)}px`);
    };
    const tick = () => { if (!raf) raf = requestAnimationFrame(apply); };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      px = e.clientX / window.innerWidth - 0.5; py = e.clientY / window.innerHeight - 0.5; tick();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", tick, { passive: true });
    tick();
    // Battery/data: play the ambient loop only while the hero is on screen.
    const io = new IntersectionObserver(([e]) => {
      const v = el.querySelector("video");
      if (!v) return;
      if (e.isIntersecting) void v.play().catch(() => {}); else v.pause();
    });
    io.observe(el);
    return () => { io.disconnect(); window.removeEventListener("pointermove", onMove); window.removeEventListener("scroll", tick); cancelAnimationFrame(raf); };
  }, []);
  const d = MEDIA.hero.desktop, m = MEDIA.hero.mobile;
  return (
    <div className={s.heroArt} ref={ref}>
      <div className={s.heroLayer}>
        <picture>
          <source media="(max-width: 640px)" srcSet={`/brand/hero-mobile-640.webp 640w, ${m.src} 1080w`} sizes="100vw" />
          <img className={s.heroImg} src={d.src} srcSet={`/brand/hero-desktop-1200.webp 1200w, ${d.src} 2400w`}
            sizes="(max-width: 980px) 100vw, 60vw" width={d.w} height={d.h} alt={d.alt[lang]} fetchPriority="high" decoding="async" />
        </picture>
        {video && (
          <video className={s.heroVideo} autoPlay muted loop playsInline preload="none" aria-hidden="true"
            poster={d.src} onPlaying={e => e.currentTarget.setAttribute("data-on", "true")}>
            {MEDIA.hero.videoMobile && <source src={MEDIA.hero.videoMobile} media="(max-width: 640px)" type="video/mp4" />}
            {MEDIA.hero.video && <source src={MEDIA.hero.video} type="video/mp4" />}
          </video>
        )}
      </div>
      <div className={s.heroGlow} aria-hidden="true" />
    </div>
  );
}
