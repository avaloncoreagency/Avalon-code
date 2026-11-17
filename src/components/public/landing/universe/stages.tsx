"use client";
import { useEffect, useRef, useState } from "react";
import type { Lang } from "../copy";
import { Icon } from "../icons";
import { universeBus } from "./bus";
import { UNIVERSE } from "./copy";
import u from "./universe.module.css";

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
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
  useEffect(() => universeBus.onProgress(T => {
    if (T < 1.9 || T > 2.75) return;
    const n = clamp(Math.floor(((T - 2) / 0.66) * 6), 0, 5);
    if (n !== scrollIdx.current) { scrollIdx.current = n; setActive(n); }   // scrolling moves the tour on; a click holds until then
  }), []);
  useEffect(() => { universeBus.engine(active); }, [active]);
  useEffect(() => universeBus.onFrame(f => {
    const box = stage.current?.getBoundingClientRect(); if (!box) return;
    for (let i = 0; i < 6; i++) {
      const el = chips.current[i]; if (!el) continue;
      const x = f.engine[i * 4] - box.left, y = f.engine[i * 4 + 1] - box.top, depth = f.engine[i * 4 + 3];
      const show = depth > -1.5 && f.t > 1.85 && f.t < 3.05;
      // Keep every label fully on screen: clamp to the stage instead of letting side modules push it out.
      const half = el.offsetWidth / 2 + 8, cx = clamp(x, half, Math.max(half, box.width - half)), drop = box.width < 900 ? 34 : 56;
      el.style.transform = `translate3d(${cx.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, ${drop}px) scale(${(0.88 + (depth + 1) * 0.06).toFixed(3)})`;
      el.style.opacity = show ? String(0.5 + (depth + 1) * 0.25) : "0"; el.style.zIndex = String(10 + Math.round(depth * 5));
      el.style.pointerEvents = show ? "auto" : "none";
    }
  }), []);
  const m = t.modules[active];
  return <section id="motor" className={`${u.act} ${u.actEngine}`} data-universe-section="engine" aria-labelledby="h-engine">
    <div className={u.stage} ref={stage}>
      <header className={u.stageHead}><p className={u.eyebrow}>{t.eyebrow}</p><h2 id="h-engine" className={u.stageTitle}>{t.title}</h2><p className={u.stageLead}>{t.lead}</p></header>
      <div className={u.chips} role="group" aria-label={t.pick}>
        {t.modules.map((mod, i) => <button key={mod.key} type="button" ref={el => { chips.current[i] = el; }} className={u.chip} aria-pressed={active === i}
          onClick={() => { setActive(i); }} onPointerEnter={() => universeBus.engineHover(i)} onPointerLeave={() => universeBus.engineHover(null)}
          onFocus={() => universeBus.engineHover(i)} onBlur={() => universeBus.engineHover(null)}>
          <Icon name={mod.key} size={16} /><span>{mod.label}</span></button>)}
      </div>
      <article className={u.panel} key={m.key} aria-live="polite">
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
  </section>;
}

/** IV · THE GROWTH TREE — the tree grows with the scroll; each crystal apple opens one opportunity. */
export function TreeStage({ lang }: { lang: Lang }) {
  const t = UNIVERSE[lang].tree; const [active, setActive] = useState<number | null>(null); const [hover, setHover] = useState<number | null>(null);
  const stage = useRef<HTMLDivElement>(null), dots = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => { universeBus.apple(hover ?? active); }, [hover, active]);
  useEffect(() => universeBus.onFrame(f => {
    const box = stage.current?.getBoundingClientRect(); if (!box) return;
    for (let i = 0; i < 10; i++) {
      const el = dots.current[i]; if (!el) continue;
      const s = f.tree[i * 3 + 2], show = s > 0.35 && f.t > 2.95 && f.t < 4.6;
      el.style.transform = `translate3d(${(f.tree[i * 3] - box.left).toFixed(1)}px, ${(f.tree[i * 3 + 1] - box.top).toFixed(1)}px, 0) translate(-50%, -50%)`;
      el.style.opacity = show ? "1" : "0"; el.style.pointerEvents = show ? "auto" : "none";
    }
  }), []);
  const a = active === null ? null : t.apples[active];
  return <section id="arbol" className={`${u.act} ${u.actTree}`} data-universe-section="tree" aria-labelledby="h-tree">
    <div className={u.stage} ref={stage}>
      <header className={u.stageHead}><p className={u.eyebrow}>{t.eyebrow}</p><h2 id="h-tree" className={u.stageTitle}>{t.title}</h2><p className={u.stageLead}>{t.lead}</p></header>
      <div className={u.apples} role="group" aria-label={t.hint}>
        {t.apples.map((ap, i) => <button key={ap.title} type="button" ref={el => { dots.current[i] = el; }} className={u.apple} aria-pressed={active === i} aria-label={ap.title}
          onClick={() => setActive(v => (v === i ? null : i))} onPointerEnter={e => { if (e.pointerType === "mouse") setHover(i); }} onPointerLeave={() => setHover(null)}
          onFocus={() => setHover(i)} onBlur={() => setHover(null)}><i aria-hidden="true" /><span>{ap.title}</span></button>)}
      </div>
      <article className={`${u.panel} ${u.treePanel}`} aria-live="polite" data-empty={a === null}>
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
  </section>;
}
