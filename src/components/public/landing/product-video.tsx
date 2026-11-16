"use client";
/* eslint-disable @next/next/no-img-element -- pre-optimized static WebP poster with srcset. */
import { useEffect, useRef, useState } from "react";
import s from "./landing.module.css";

/**
 * Higgsfield product cinematic: the optimized still is always rendered (fast, accessible, works without JS); the muted
 * loop is attached only when the block is near the viewport, plays while visible, pauses off-screen, and is skipped
 * entirely with reduced motion or data saver. The video is decorative (aria-hidden); the still carries the alt text.
 */
export function ProductVideo({ poster, srcSet, video, alt, w, h, priority = false }:
  { poster: string; srcSet?: string; video?: string | null; alt: string; w: number; h: number; priority?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [load, setLoad] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !video || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) setLoad(true);
      const v = el.querySelector("video");
      if (v) { if (e.isIntersecting) void v.play().catch(() => {}); else v.pause(); }
    }, { rootMargin: "200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [video]);
  return (
    <div className={s.media} ref={ref}>
      <img src={poster} srcSet={srcSet} sizes="(max-width: 980px) 100vw, 50vw" width={w} height={h} alt={alt}
        loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined} decoding="async" />
      {load && video && <video src={video} muted loop playsInline autoPlay preload="metadata" aria-hidden="true"
        onPlaying={e => e.currentTarget.setAttribute("data-on", "true")} />}
    </div>
  );
}
