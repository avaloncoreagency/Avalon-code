"use client";
import { useEffect, useRef } from "react";
import { universeBus } from "./bus";
import type { UniverseHandle } from "./scene";
import u from "./universe.module.css";

/**
 * The living backdrop: one fixed WebGL canvas behind the whole public page.
 *  - Scroll never gets hijacked: the page scrolls natively and only publishes a timeline value T.
 *  - The scene (three.js) is fetched after first paint, never with reduced motion or data saver, and never on the server.
 *  - Rendering pauses when the tab is hidden; everything is disposed on unmount.
 * "universe" = the four connected universes of the homepage; "ambient" = particles only (inner pages).
 */
export function LivingUniverse({ variant = "universe" }: { variant?: "universe" | "ambient" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const root = document.documentElement, off: (() => void)[] = [];
    const listen = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void, opt?: AddEventListenerOptions) => {
      window.addEventListener(type, fn, opt); off.push(() => window.removeEventListener(type, fn, opt));
    };

    // Timeline from native scroll: 0 hero · 1 launch · 2 engine · 3 tree · 4 tree released · 5 ambient.
    let marks: number[] = [], raf = 0;
    const measure = () => {
      const secs = Array.from(document.querySelectorAll<HTMLElement>("[data-universe-section]"));
      if (secs.length < 4) { marks = []; return; }
      const top = (el: HTMLElement) => el.getBoundingClientRect().top + window.scrollY;
      const tree = secs[3], end = top(tree) + Math.max(0, tree.offsetHeight - window.innerHeight);
      marks = [0, top(secs[1]), top(secs[2]), top(tree), end, end + window.innerHeight];
    };
    const publish = () => {
      raf = 0; if (!marks.length) { universeBus.publish(0); return; }
      const y = window.scrollY; let i = 0; while (i < marks.length - 2 && y >= marks[i + 1]) i++;
      const span = Math.max(1, marks[i + 1] - marks[i]);
      const T = Math.min(5, i + Math.min(1, Math.max(0, (y - marks[i]) / span)));
      // Past the universes the backdrop dims so long-form content stays easy to read; particles keep drifting behind it.
      canvas.parentElement?.style.setProperty("--veil", String(Math.min(0.62, Math.max(0, (T - 4.1) / 0.7) * 0.62)));
      universeBus.publish(T);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(publish); };
    measure(); publish();
    listen("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => { measure(); onScroll(); }); ro.observe(document.body); off.push(() => ro.disconnect());

    // The scene itself is optional.
    let handle: UniverseHandle | null = null, dead = false;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reduce = motionQuery.matches;
    let disabled = reduce;
    const deactivate = () => {
      disabled = true; universeBus.detach(); handle?.dispose(); handle = null;
      canvas.dataset.on = "false"; delete root.dataset.universe;
    };
    const motionChanged = () => { if (motionQuery.matches) deactivate(); };
    motionQuery.addEventListener("change", motionChanged); off.push(() => motionQuery.removeEventListener("change", motionChanged));
    canvas.addEventListener("webglcontextlost", deactivate); off.push(() => canvas.removeEventListener("webglcontextlost", deactivate));
    const saver = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    // WebGL must be hardware-accelerated: a software rasterizer (no GPU) would burn the main thread for a worse result.
    // QA can force the scene on such machines with window.__AVALON_FORCE_GL (screenshots only; never set in production).
    let gl = false;
    try {
      const probe = document.createElement("canvas"); const ctx = (probe.getContext("webgl2") || probe.getContext("webgl")) as WebGLRenderingContext | null;
      if (ctx) {
        const info = ctx.getExtension("WEBGL_debug_renderer_info"); const name = info ? String(ctx.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
        gl = !/swiftshader|llvmpipe|software|basic render/i.test(name) || (window as Window & { __AVALON_FORCE_GL?: boolean }).__AVALON_FORCE_GL === true;
        ctx.getExtension("WEBGL_lose_context")?.loseContext();
      }
    } catch { gl = false; }
    if (!reduce && !saver && gl) {
      const boot = async () => {
        try {
          const { createUniverse } = await import("./scene");
          if (dead || disabled) return;
          const mobile = window.matchMedia("(max-width: 820px), (pointer: coarse)").matches;
          const forced = (window as Window & { __AVALON_FORCE_GL?: boolean }).__AVALON_FORCE_GL === true;
          handle = createUniverse(canvas, { mobile, ambientOnly: variant === "ambient", onTooSlow: forced ? undefined : deactivate });
        } catch { handle = null; return; }
        universeBus.attach(handle); if (!document.hidden) handle.start();
        canvas.dataset.on = "true"; root.dataset.universe = variant === "universe" ? "live" : "ambient";
        listen("resize", () => handle?.resize());
        listen("pointermove", e => { if (e.pointerType === "mouse") handle?.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1); }, { passive: true });
        listen("pointerdown", e => handle?.pulse((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1)), { passive: true });
        const vis = () => { if (document.hidden) handle?.stop(); else handle?.start(); };
        document.addEventListener("visibilitychange", vis); off.push(() => document.removeEventListener("visibilitychange", vis));
      };
      // After first paint and when the main thread is idle: the hero copy is the LCP, not the canvas.
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
      if (w.requestIdleCallback) w.requestIdleCallback(() => { if (!dead && !disabled) void boot(); }, { timeout: 1500 }); else window.setTimeout(() => { if (!dead && !disabled) void boot(); }, 350);
    }
    return () => {
      dead = true; cancelAnimationFrame(raf); for (const f of off) f();
      universeBus.detach(); handle?.dispose(); delete root.dataset.universe;
    };
  }, [variant]);
  return <div className={u.cosmos} data-variant={variant} aria-hidden="true"><canvas ref={ref} /></div>;
}
