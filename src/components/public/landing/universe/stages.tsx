"use client";
import { useEffect, useRef, useState } from "react";
import type { Lang } from "../copy";
import { Icon } from "../icons";
import { universeBus } from "./bus";
import { UNIVERSE } from "./copy";
import u from "./universe.module.css";

/** Remove projected-only styles before returning to normal document flow. */
export function resetProjection(elements: (HTMLButtonElement | null)[]) {
  for (const el of elements) {
    if (!el) continue;
    for (const property of ["transform", "opacity", "z-index", "pointer-events"]) el.style.removeProperty(property);
    el.removeAttribute("tabindex");
  }
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * Projected 3D markers must be real, reliable hit targets. Two rules make that true:
 *  1. Stability: a marker follows its 3D object only while the scene is really moving (the camera travelling after a
 *     scroll, or the orbit turning to a newly selected module). At rest it is latched and moves again only if the
 *     object drifts beyond a dead band, so idle "breathing" never slides it away under a finger or cursor.
 *  2. Nothing on top: a marker that would sit under page UI (site header, stage heading, quick selector, panel) or
 *     under a nearer marker is hidden and made non-interactive, instead of silently passing the click to something else.
 * The stable quick selectors stay the primary keyboard / screen-reader path; markers are the direct pointer path.
 */
type Placement = { x: number; y: number; show: boolean; depth: number };
type Anchor = "below" | "center";
function createMarkerLayout(count: number, anchor: Anchor) {
  const placed = new Float32Array(count * 2).fill(Number.NaN);
  const last = new Array<string>(count).fill("");
  const raw = new Float32Array(count * 2).fill(Number.NaN);
  const shown = new Array<boolean>(count).fill(false);
  let lastT = Number.NaN, lastNow = 0, movedAt = 0;
  return function layout(stage: HTMLElement, els: (HTMLButtonElement | null)[], t: number, items: Placement[], drop: number, deadBand = 18) {
    const now = performance.now(), dt = Math.max(1, now - lastNow) / 1000;
    // Moving = the timeline still easing, or any shown object travelling faster than idle motion (~30 px/s).
    let moving = Number.isNaN(lastT) || Math.abs(t - lastT) > 0.00002;
    items.forEach((it, i) => {
      if (it.show && !Number.isNaN(raw[i * 2]) && Math.hypot(it.x - raw[i * 2], it.y - raw[i * 2 + 1]) / dt > 30) moving = true;
      raw[i * 2] = it.x; raw[i * 2 + 1] = it.y;
    });
    if (moving) movedAt = now;
    lastT = t; lastNow = now;
    const live = now - movedAt < 180;
    // Observable state for QA/automation: wait for "rest" instead of guessing with sleeps.
    const state = live ? "moving" : "rest"; if (stage.dataset.markers !== state) stage.dataset.markers = state;
    const box = stage.getBoundingClientRect();
    const blockers: DOMRect[] = [];
    stage.querySelectorAll<HTMLElement>("[data-occlude]").forEach(el => { const r = el.getBoundingClientRect(); if (r.width && r.height) blockers.push(r); });
    const header = document.querySelector<HTMLElement>("header"); if (header) blockers.push(header.getBoundingClientRect());
    // Nearest first, but a marker already on screen keeps priority (hysteresis): idle pulsing changes depth slightly and
    // must not make overlapping markers swap visibility every few frames.
    const order = items.map((_, i) => i).sort((a, b) => Number(shown[b]) - Number(shown[a]) || items[b].depth - items[a].depth);
    const taken: { l: number; t: number; r: number; b: number }[] = [];
    for (const i of order) {
      const el = els[i]; if (!el) continue;
      const it = items[i]; let px = placed[i * 2], py = placed[i * 2 + 1];
      if (live || Number.isNaN(px) || Math.hypot(it.x - px, it.y - py) > deadBand) { px = placed[i * 2] = Math.round(it.x); py = placed[i * 2 + 1] = Math.round(it.y); }
      const w = el.offsetWidth, h = el.offsetHeight;
      const l = box.left + px - w / 2, top = box.top + py + (anchor === "below" ? drop : -h / 2);
      const rect = { l, t: top, r: l + w, b: top + h };
      const inView = rect.l >= box.left - 1 && rect.r <= box.right + 1 && rect.t >= 0 && rect.b <= window.innerHeight;
      const covered = blockers.some(o => rect.l < o.right && rect.r > o.left && rect.t < o.bottom && rect.b > o.top);
      const crowded = taken.some(o => Math.max(0, Math.min(rect.r, o.r) - Math.max(rect.l, o.l)) * Math.max(0, Math.min(rect.b, o.b) - Math.max(rect.t, o.t)) > w * h * 0.2);
      const show = it.show && inView && !covered && !crowded;
      shown[i] = show;
      if (show) taken.push(rect);
      const transform = anchor === "below" ? `translate3d(${px}px, ${py}px, 0) translate(-50%, ${drop}px)` : `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%)`;
      const key = `${transform}|${show}`;
      if (key === last[i]) continue;
      last[i] = key;
      el.style.transform = transform; el.style.opacity = show ? "1" : "0"; el.style.pointerEvents = show ? "auto" : "none";
      el.style.zIndex = String(10 + Math.round(it.depth * 5)); el.tabIndex = -1;
    }
  };
}
const q = (lang: Lang) => (lang === "en" ? "?lang=en" : "");
const quoteHref = (lang: Lang, services: string) => `/?${lang === "en" ? "lang=en&" : ""}${services ? `services=${services}` : ""}#cotizacion`;

/** II · THE LAUNCH — three statements that change as the camera flies through the tunnel. */
export function LaunchStage({ lang }: { lang: Lang }) {
  const t = UNIVERSE[lang].launch; const [stage, setStage] = useState(0);
  useEffect(() => universeBus.onProgress(T => { const n = clamp(Math.floor(((T - 1) / 0.58) * 3), 0, 2); setStage(s => (s === n ? s : n)); }), []);
  return <section id="despegue" className={`${u.act} ${u.actLaunch}`} data-universe-section="launch" aria-labelledby="h-launch">
    <div className={u.stage}>
      <div className={u.launchInner}>
        <p className={u.eyebrow}>{t.eyebrow}</p>
        <h2 id="h-launch" className={u.launchTitle}>{t.title}</h2>
        <ol className={u.launchStages}>{t.stages.map(([h, p], i) => <li key={h} data-on={i === stage}>
          <span>{String(i + 1).padStart(2, "0")}</span><div><h3>{h}</h3><p>{p}</p></div></li>)}</ol>
        <p className={u.hint}>{t.hint}</p>
      </div>
    </div>
  </section>;
}

/** III · THE GROWTH ENGINE — six modules orbiting the core. Chips follow the 3D modules; the panel sells the service. */
export function EngineStage({ lang }: { lang: Lang }) {
  const t = UNIVERSE[lang].engine; const [active, setActive] = useState(0);
  const stage = useRef<HTMLDivElement>(null), chips = useRef<(HTMLButtonElement | null)[]>([]), scrollIdx = useRef(-1);
  const layout = useRef(createMarkerLayout(6, "below"));
  useEffect(() => universeBus.onProgress(T => {
    if (T < 1.9 || T > 2.75) return;
    const n = clamp(Math.floor(((T - 2) / 0.66) * 6), 0, 5);
    if (n !== scrollIdx.current) { scrollIdx.current = n; setActive(n); }   // scrolling moves the tour on; a click holds until then
  }), []);
  useEffect(() => { universeBus.engine(active); }, [active]);
  useEffect(() => universeBus.onReset(() => resetProjection(chips.current)), []);
  useEffect(() => universeBus.onFrame(f => {
    const node = stage.current; if (!node) return;
    const box = node.getBoundingClientRect(), items: Placement[] = [];
    for (let i = 0; i < 6; i++) {
      const el = chips.current[i], depth = f.engine[i * 4 + 3];
      // Keep every label fully on screen: clamp to the stage instead of letting side modules push it out.
      const half = (el?.offsetWidth ?? 0) / 2 + 8;
      items.push({ x: clamp(f.engine[i * 4] - box.left, half, Math.max(half, box.width - half)), y: f.engine[i * 4 + 1] - box.top, depth, show: depth > -1.5 && f.t > 1.85 && f.t < 3.05 });
    }
    layout.current(node, chips.current, f.t, items, box.width < 900 ? 34 : 56);
  }), []);
  const m = t.modules[active];
  return <section id="motor" className={`${u.act} ${u.actEngine}`} data-universe-section="engine" aria-labelledby="h-engine">
    <div className={u.stage} ref={stage}>
      <header className={u.stageHead} data-occlude><p className={u.eyebrow}>{t.eyebrow}</p><h2 id="h-engine" className={u.stageTitle}>{t.title}</h2><p className={u.stageLead}>{t.lead}</p></header>
      <div className={u.chips} aria-hidden="true">
        {t.modules.map((mod, i) => <button key={mod.key} type="button" ref={el => { chips.current[i] = el; }} className={u.chip} aria-pressed={active === i}
          onClick={() => { setActive(i); }} onPointerEnter={() => universeBus.engineHover(i)} onPointerLeave={() => universeBus.engineHover(null)}
          onFocus={() => universeBus.engineHover(i)} onBlur={() => universeBus.engineHover(null)}>
          <Icon name={mod.key} size={16} /><span>{mod.label}</span></button>)}
      </div>
      <div className={u.dock}>
      {/* Stable controls provide reliable touch and keyboard selection when orbiting 3D labels move. */}
      <div className={u.engineQuickNav} role="group" aria-label={t.pick} data-occlude>
        {t.modules.map((mod, i) => <button key={mod.key} type="button" className={u.engineOption} aria-pressed={active === i}
          onClick={() => setActive(i)} onFocus={() => universeBus.engineHover(i)} onBlur={() => universeBus.engineHover(null)}>
          <Icon name={mod.key} size={16} /><span>{mod.label}</span>
        </button>)}
      </div>
      <article className={u.panel} key={m.key} aria-live="polite" data-occlude>
        <p className={u.panelKicker}><Icon name={m.key} size={16} />{m.label}</p>
        <h3>{m.name}</h3>
        {m.availability && <p className={u.avail}>{m.availability}</p>}
        <dl className={u.pairs}>
          <div><dt>{t.problem}</dt><dd>{m.problem}</dd></div>
          <div><dt>{t.solution}</dt><dd>{m.solution}</dd></div>
        </dl>
        <p className={u.panelLabel}>{t.benefits}</p>
        <ul className={u.checks}>{m.benefits.map(b => <li key={b}><Icon name="check" size={15} />{b}</li>)}</ul>
        <div className={u.panelCtas}>
          <a className={u.cta} href={`/soluciones/${m.key}${q(lang)}`}>{t.open}<Icon name="arrow" size={16} /></a>
          <a className={u.ctaGhost} href={quoteHref(lang, m.also ? `${m.key},${m.also}` : m.key)}>{t.quote}</a>
        </div>
      </article>
      </div>
    </div>
  </section>;
}

/** IV · THE GROWTH TREE — the tree grows with the scroll; each crystal apple opens one opportunity. */
export function TreeStage({ lang }: { lang: Lang }) {
  const t = UNIVERSE[lang].tree; const [active, setActive] = useState<number | null>(null); const [hover, setHover] = useState<number | null>(null);
  const stage = useRef<HTMLDivElement>(null), dots = useRef<(HTMLButtonElement | null)[]>([]);
  const layout = useRef(createMarkerLayout(10, "center"));
  useEffect(() => { universeBus.apple(hover ?? active); }, [hover, active]);
  useEffect(() => universeBus.onReset(() => resetProjection(dots.current)), []);
  useEffect(() => universeBus.onFrame(f => {
    const node = stage.current; if (!node) return;
    const box = node.getBoundingClientRect(), items: Placement[] = [];
    for (let i = 0; i < 10; i++) {
      const s = f.tree[i * 3 + 2];
      items.push({ x: f.tree[i * 3] - box.left, y: f.tree[i * 3 + 1] - box.top, depth: s, show: s > 0.35 && f.t > 2.95 && f.t < 4.6 });
    }
    layout.current(node, dots.current, f.t, items, 0, 14);
  }), []);
  const a = active === null ? null : t.apples[active];
  return <section id="arbol" className={`${u.act} ${u.actTree}`} data-universe-section="tree" aria-labelledby="h-tree">
    <div className={u.stage} ref={stage}>
      <header className={u.stageHead} data-occlude><p className={u.eyebrow}>{t.eyebrow}</p><h2 id="h-tree" className={u.stageTitle}>{t.title}</h2><p className={u.stageLead}>{t.lead}</p></header>
      {/* A stable, touch-friendly selector must remain usable even when the 3D fruit markers overlap or drift. */}
      {/* Visual markers keep the direct 3D hit targets; keyboard/screen readers use the stable selector. */}
      <div className={u.apples} aria-hidden="true">
        {t.apples.map((ap, i) => <button key={ap.title} type="button" ref={el => { dots.current[i] = el; }} className={u.apple} aria-pressed={active === i} aria-label={ap.title}
          onClick={() => setActive(v => (v === i ? null : i))} onPointerEnter={e => { if (e.pointerType === "mouse") setHover(i); }} onPointerLeave={() => setHover(null)}
          onFocus={() => setHover(i)} onBlur={() => setHover(null)}><i aria-hidden="true" /><span>{ap.title}</span></button>)}
      </div>
      <div className={u.dock}>
      <div className={u.appleQuickNav} role="group" aria-label={t.hint} data-occlude>
        {t.apples.map((ap, i) => <button key={ap.title} type="button" className={u.appleOption} aria-pressed={active === i} onClick={() => setActive(v => (v === i ? null : i))} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
          <i className={u.appleDot} aria-hidden="true" /><span>{ap.title}</span>
        </button>)}
      </div>
      <article className={`${u.panel} ${u.treePanel}`} aria-live="polite" data-empty={a === null} data-occlude>
        {a ? <>
          <p className={u.panelKicker}><i className={u.appleDot} aria-hidden="true" />{String((active ?? 0) + 1).padStart(2, "0")} / 10</p>
          <h3>{a.title}</h3><p className={u.panelText}>{a.text}</p>
          <div className={u.panelCtas}>
            {a.service && <a className={u.cta} href={`/soluciones/${a.service}${q(lang)}`}>{t.open}<Icon name="arrow" size={16} /></a>}
            <a className={a.service ? u.ctaGhost : u.cta} href={quoteHref(lang, a.service ?? "")}>{t.quote}</a>
          </div>
          <button type="button" className={u.close} onClick={() => setActive(null)} aria-label={t.close}>×</button>
        </> : <p className={u.panelHint}><i className={u.appleDot} aria-hidden="true" />{t.hint}</p>}
        <p className={u.note}>{t.note}</p>
      </article>
      </div>
    </div>
  </section>;
}
