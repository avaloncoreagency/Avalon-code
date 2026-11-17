"use client";
/* eslint-disable @next/next/no-img-element -- pre-optimized local WebP layers; no image-optimization quota. */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Lang } from "../landing/copy";
import { INDUSTRIES, money } from "./industries";
import { useDemo } from "./store";
import t from "./tree.module.css";

/**
 * THE GROWTH TREE — one photoreal tree (Higgsfield master, docs/brand/HIGGSFIELD_MEDIA.md) that the visitor grows.
 * Layers, bottom to top:
 *   1. dormant plate (same photo, desaturated and dark): the business before it grows;
 *   2. living plate revealed by animated masks: the trunk rises with each watering, each branch lights up when its
 *      multiplier is activated (CSS @property transitions on mask gradients — no WebGL, cheap on phones);
 *   3. real apple sprites cut from the same master: bud → young → ripe, then harvested with gravity and bounce;
 *   4. one 2D canvas for water and gold particles, running only while something is animating.
 * All values are simulated and labelled as such; nothing here represents real earnings.
 */
type Spot = { x: number; y: number; r: number; branch: number; sprite: number };
// Apple centres and radii measured on the 2160×3840 master (fractions of width/height; r as a fraction of width).
const SPOTS: Spot[] = [
  { x: .1278, y: .2424, r: .0426, branch: 0, sprite: 4 }, { x: .2863, y: .2949, r: .0442, branch: 0, sprite: 6 },
  { x: .2405, y: .1755, r: .0412, branch: 1, sprite: 1 },
  { x: .3771, y: .1219, r: .0398, branch: 2, sprite: 0 },
  { x: .4606, y: .2346, r: .0431, branch: 3, sprite: 5 },
  { x: .6137, y: .1582, r: .0424, branch: 4, sprite: 2 }, { x: .8581, y: .1973, r: .0377, branch: 4, sprite: 3 },
  { x: .8688, y: .2926, r: .0414, branch: 5, sprite: 7 }, { x: .7049, y: .3286, r: .0412, branch: 5, sprite: 8 },
];
// Crown zones lit by each branch live in tree.module.css (.alive mask), aligned with SPOTS above.
const FLOOR = .585, SEED = { x: .5, y: .575 };

const COPY = {
  es: {
    eyebrow: "El árbol del crecimiento", title: "Haz crecer tu negocio.",
    lead: "Tu negocio es el árbol. El agua es tu trabajo y tu inversión. Las ramas son los multiplicadores que construimos contigo. Los frutos, las oportunidades que se convierten en ventas.",
    phases: [
      "Todo gran negocio comienza con una semilla.",
      "Riega tu negocio: invierte en crecimiento y observa cómo responde.",
      "El tronco ya es fuerte. Activa los multiplicadores: cada rama produce un resultado distinto.",
      "Nacen los frutos. Sigue regando para que maduren.",
      "Hay frutos maduros. Tócalos para cosecharlos.",
      "Cuando tu negocio crece, los resultados dan fruto.",
    ],
    water: "Regar el negocio", pouring: "Regando…", invest: "Inversión mensual simulada", work: "Acciones de trabajo por semana",
    perWater: (n: number) => `Cada riego: +${n} % de crecimiento (simulación)`,
    growth: "Crecimiento", branchesOn: "Multiplicadores", harvested: "Frutos cosechados", revenue: "Ingresos simulados",
    disclaimer: "Simulación ilustrativa. No representa ganancias reales ni resultados garantizados.",
    branches: [
      ["Atención continua", "Más consultas respondidas"], ["Reservas inteligentes", "Agenda con más trabajo"], ["Gestión de clientes", "Seguimiento comercial organizado"],
      ["Presencia digital", "Más oportunidades de contacto"], ["Comercio online", "Nuevas oportunidades de venta"], ["Marketing y crecimiento", "Mayor alcance y captación"],
    ],
    lockBranch: "Riega hasta el 50 % para activar ramas", active: "Activa",
    harvestApple: (b: string) => `Cosechar fruto maduro de «${b}»`, unripe: (b: string) => `Fruto creciendo en «${b}»`,
    labels: ["Venta conseguida", "Reserva completada", "Cliente convertido", "Ingreso generado"],
    explore: "Explora cómo funciona", solutions: "Descubre las soluciones", restart: "Reiniciar simulación",
    fromDemo: "Una venta de las demostraciones hizo madurar un fruto",
  },
  en: {
    eyebrow: "The growth tree", title: "Grow your business.",
    lead: "Your business is the tree. Water is your work and investment. The branches are the multipliers we build with you. The fruit is opportunities turning into sales.",
    phases: [
      "Every great business starts with a seed.",
      "Water your business: invest in growth and watch it respond.",
      "The trunk is strong. Activate the multipliers: each branch produces a different result.",
      "Fruit is forming. Keep watering so it ripens.",
      "There is ripe fruit. Tap it to harvest.",
      "When your business grows, results bear fruit.",
    ],
    water: "Water the business", pouring: "Watering…", invest: "Simulated monthly investment", work: "Work actions per week",
    perWater: (n: number) => `Each watering: +${n}% growth (simulation)`,
    growth: "Growth", branchesOn: "Multipliers", harvested: "Fruit harvested", revenue: "Simulated revenue",
    disclaimer: "Illustrative simulation. It does not represent real earnings or guaranteed results.",
    branches: [
      ["Always-on response", "More inquiries answered"], ["Smart booking", "A calendar full of work"], ["Customer management", "Organized sales follow-up"],
      ["Digital presence", "More chances to be contacted"], ["Online store", "New ways to sell"], ["Marketing & growth", "Wider reach and more leads"],
    ],
    lockBranch: "Water up to 50% to activate branches", active: "Active",
    harvestApple: (b: string) => `Harvest ripe fruit from “${b}”`, unripe: (b: string) => `Fruit growing on “${b}”`,
    labels: ["Sale closed", "Booking completed", "Customer converted", "Revenue generated"],
    explore: "See how it works", solutions: "Discover the solutions", restart: "Restart simulation",
    fromDemo: "A sale in the demos ripened a fruit",
  },
};

type Fx = { kind: "drop" | "splash" | "gold"; x: number; y: number; vx: number; vy: number; life: number; max: number; size: number };

export function GrowthTree({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  const { state, dispatch } = useDemo();
  const ticket = INDUSTRIES[state.industry].ticket;
  const [growth, setGrowth] = useState(0);
  const [branches, setBranches] = useState<boolean[]>(() => Array(6).fill(false));
  const [stage, setStage] = useState<number[]>(() => Array(SPOTS.length).fill(0));     // 0 none · 1 bud · 2 young · 3 ripe
  const [value, setValue] = useState<number[]>(() => Array(SPOTS.length).fill(0));    // money a ripe apple will produce
  const [falling, setFalling] = useState<number | null>(null);
  const [coins, setCoins] = useState<{ id: number; x: number; y: number; text: string }[]>([]);
  const [revenue, setRevenue] = useState(0), [shown, setShown] = useState(0), [harvested, setHarvested] = useState(0);
  const [invest, setInvest] = useState(1500), [work, setWork] = useState(8);
  const [pouring, setPouring] = useState(false), [notice, setNotice] = useState("");
  const box = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), apples = useRef<(HTMLButtonElement | null)[]>([]);
  const fx = useRef<Fx[]>([]), raf = useRef(0), visible = useRef(false), reduced = useRef(false), seq = useRef(0);

  const perWater = Math.round(12 + (invest / 5000) * 14 + (work / 20) * 14);
  const active = branches.filter(Boolean).length;
  const ripe = stage.filter(x => x === 3).length;
  const phase = growth === 0 ? 0 : growth < 50 ? 1 : active === 0 ? 2 : active === 6 && growth >= 100 && harvested >= 3 ? 5 : ripe > 0 ? 4 : 3;

  useEffect(() => { reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches; }, []);
  useEffect(() => {
    const node = box.current; if (!node) return;
    const io = new IntersectionObserver(([e]) => { visible.current = e.isIntersecting; }, { threshold: .15 }); io.observe(node);
    return () => { io.disconnect(); cancelAnimationFrame(raf.current); };
  }, []);

  // Count the revenue display up instead of jumping (a few frames, then stop).
  useEffect(() => {
    if (shown === revenue) return;
    const id = requestAnimationFrame(() => setShown(v => (Math.abs(revenue - v) < 2 ? revenue : v + Math.ceil((revenue - v) / 6))));
    return () => cancelAnimationFrame(id);
  }, [shown, revenue]);

  /* ── particle loop: runs only while particles exist and the tree is on screen ─────────────────────────── */
  const loop = useCallback(() => {
    const cv = canvas.current, node = box.current; if (!cv || !node) return;
    const w = node.clientWidth, h = node.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext("2d"); if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const dt = 1 / 60, list = fx.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i]; p.life += dt;
      p.vy += (p.kind === "gold" ? -120 : 1500) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === "drop" && p.y >= FLOOR * h) {           // water hits the roots: splash
        for (let k = 0; k < 3; k++) list.push({ kind: "splash", x: p.x, y: FLOOR * h, vx: (Math.random() - .5) * 140, vy: -Math.random() * 220, life: 0, max: .45, size: 1.6 });
        list.splice(i, 1); continue;
      }
      if (p.life > p.max) { list.splice(i, 1); continue; }
      const k = 1 - p.life / p.max;
      if (p.kind === "drop") {
        const grad = g.createLinearGradient(p.x, p.y - p.vy * .018, p.x, p.y);
        grad.addColorStop(0, "rgba(160,210,255,0)"); grad.addColorStop(1, `rgba(205,232,255,${.85 * k})`);
        g.strokeStyle = grad; g.lineWidth = p.size; g.lineCap = "round"; g.beginPath(); g.moveTo(p.x - p.vx * .018, p.y - p.vy * .018); g.lineTo(p.x, p.y); g.stroke();
      } else {
        const color = p.kind === "gold" ? `rgba(255,${180 + Math.round(40 * k)},90,${k})` : `rgba(190,225,255,${.8 * k})`;
        g.fillStyle = color; g.beginPath(); g.arc(p.x, p.y, p.size * (p.kind === "gold" ? .6 + k : 1), 0, Math.PI * 2); g.fill();
      }
    }
    if (list.length && visible.current) raf.current = requestAnimationFrame(loop);
    else { g.clearRect(0, 0, w, h); raf.current = 0; }
  }, []);
  const kick = useCallback(() => { if (!raf.current) raf.current = requestAnimationFrame(loop); }, [loop]);

  /* ── actions ─────────────────────────────────────────────────────────────────────────────────────────── */
  const ripen = useCallback((times: number) => {
    setStage(prev => {
      const next = [...prev];
      for (let n = 0; n < times; n++) {
        const i = next.findIndex((x, k) => x > 0 && x < 3 && branches[SPOTS[k].branch]);
        if (i < 0) break; next[i] += 1;
      }
      return next;
    });
  }, [branches]);

  const water = () => {
    if (pouring) return;
    setPouring(true);
    const node = box.current;
    if (node && !reduced.current) {
      const w = node.clientWidth, h = node.clientHeight, sx = .6 * w, sy = .43 * h;
      for (let k = 0; k < 70; k++) fx.current.push({ kind: "drop", x: sx + (Math.random() - .5) * 10, y: sy - Math.random() * 30, vx: -55 - Math.random() * 60, vy: 40 + Math.random() * 120 + k * 3, life: 0, max: 2, size: 1.2 + Math.random() * 1.3 });
      kick();
    }
    window.setTimeout(() => {
      setGrowth(v => Math.min(100, v + perWater));
      ripen(2);
      setPouring(false);
    }, reduced.current ? 0 : 900);
  };

  const activate = (b: number) => {
    if (growth < 50 || branches[b]) return;
    setBranches(prev => prev.map((x, i) => x || i === b));
    setStage(prev => prev.map((x, i) => (SPOTS[i].branch === b && x === 0 ? 1 : x)));
    setValue(prev => prev.map((x, i) => (SPOTS[i].branch === b && !x ? ticket : x)));
  };

  // Slow natural growth of fruit on active branches while the tree is visible (motion-safe).
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => { if (visible.current && growth >= 50) ripen(1); }, 2600);
    return () => window.clearInterval(id);
  }, [active, growth, ripen]);

  // A sale in any demo ripens one apple on the branch that produced it (activating the branch if needed).
  useEffect(() => {
    const f = state.fruitQueue[0]; if (!f) return;
    const amount = state.sales.find(s => s.id === f.id)?.amount ?? ticket;
    let i = stage.findIndex((x, k) => SPOTS[k].branch === f.branch && x < 3);
    if (i < 0) i = stage.findIndex(x => x < 3);
    setGrowth(v => Math.max(v, 60));
    setBranches(prev => prev.map((x, k) => x || k === f.branch));
    if (i >= 0) {
      setStage(prev => prev.map((x, k) => (k === i ? 3 : SPOTS[k].branch === f.branch && x === 0 ? 1 : x)));
      setValue(prev => prev.map((x, k) => (k === i ? amount : x || ticket)));
    }
    setNotice(c.fromDemo);
    dispatch({ type: "fruitTaken", id: f.id });
  }, [state.fruitQueue, state.sales, stage, dispatch, ticket, c.fromDemo]);

  const harvest = (i: number) => {
    if (stage[i] !== 3 || falling !== null) return;
    const node = box.current, el = apples.current[i]; if (!node || !el) return;
    const amount = value[i] || ticket, label = c.labels[seq.current++ % c.labels.length];
    const done = () => {
      const w = node.clientWidth, h = node.clientHeight, x = SPOTS[i].x * w + (Number(el.dataset.dx) || 0);
      for (let k = 0; k < 26; k++) fx.current.push({ kind: "gold", x, y: FLOOR * h - 6, vx: (Math.random() - .5) * 220, vy: -60 - Math.random() * 200, life: 0, max: .9 + Math.random() * .5, size: 1.6 + Math.random() * 2.2 });
      kick();
      const id = Date.now();
      setCoins(cs => [...cs, { id, x: x / w, y: FLOOR, text: `+${money(amount)} · ${label}` }]);
      window.setTimeout(() => setCoins(cs => cs.filter(k => k.id !== id)), 2400);
      setRevenue(r => r + amount); setHarvested(n => n + 1);
      el.style.transform = ""; el.style.opacity = ""; delete el.dataset.dx;
      setFalling(null);
      setStage(prev => prev.map((x, k) => (k === i ? (branches[SPOTS[i].branch] ? 1 : 0) : x)));   // the branch keeps producing
      setValue(prev => prev.map((x, k) => (k === i ? ticket : x)));
    };
    setFalling(i);
    if (reduced.current) { done(); return; }
    // Gravity with two damped bounces on the stone base, a little drift and spin.
    const h = node.clientHeight, ground = (FLOOR - SPOTS[i].y) * h;
    let y = 0, vy = -90, x = 0; const vx = (Math.random() - .5) * 80; let rot = 0, bounces = 0, last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(.033, (now - last) / 1000); last = now;
      vy += 2600 * dt; y += vy * dt; x += vx * dt; rot += vx * dt * 1.4;
      if (y >= ground) { y = ground; vy = -vy * .34; bounces++; }
      el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${rot}deg)`; el.dataset.dx = String(x);
      if (bounces >= 2 && Math.abs(vy) < 160) { el.style.opacity = "0"; done(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const restart = () => {
    setGrowth(0); setBranches(Array(6).fill(false)); setStage(Array(SPOTS.length).fill(0)); setValue(Array(SPOTS.length).fill(0));
    setRevenue(0); setShown(0); setHarvested(0); setNotice(""); setCoins([]);
  };

  const vars = useMemo(() => {
    const v: Record<string, string | number> = { "--g": growth, "--all": active === 6 && growth >= 100 ? 1 : 0 };
    branches.forEach((on, i) => { v[`--b${i}`] = on ? 1 : 0; });
    return v as CSSProperties;
  }, [growth, branches, active]);

  return (
    <div className={t.tree} data-phase={phase}>
      <div className={t.head}>
        <p className={t.eyebrow}>{c.eyebrow}</p>
        <h2 id="h-tree" className={t.title}>{c.title}</h2>
        <p className={t.lead}>{c.lead}</p>
        <p className={t.phase} aria-live="polite">{c.phases[phase]}</p>
      </div>

      <div className={t.panel}>
        <div className={t.controls}>
          <label className={t.range}><span>{c.invest}<b>{money(invest)}</b></span>
            <input type="range" min={200} max={5000} step={100} value={invest} onChange={e => setInvest(Number(e.target.value))} /></label>
          <label className={t.range}><span>{c.work}<b>{work}</b></span>
            <input type="range" min={1} max={20} step={1} value={work} onChange={e => setWork(Number(e.target.value))} /></label>
        </div>

        <ul className={t.branches} aria-label={c.branchesOn}>
          {c.branches.map(([name, result], b) => <li key={name}>
            <button type="button" aria-pressed={branches[b]} disabled={growth < 50 && !branches[b]} onClick={() => activate(b)} title={growth < 50 ? c.lockBranch : undefined}>
              <span className={t.bName}>{name}</span><span className={t.bResult}>→ {result}</span>
              {branches[b] && <span className={t.bOn}>{c.active}</span>}
            </button>
          </li>)}
        </ul>
        {growth < 50 && <p className={t.hint}>{c.lockBranch}</p>}
      </div>

      <div className={t.stageWrap}>
        <div className={t.stage}>
          <div ref={box} className={t.box} style={vars}>
            <img className={t.dormant} src="/brand/tree/plate-720.webp" srcSet="/brand/tree/plate-720.webp 720w, /brand/tree/plate-1080.webp 1080w" sizes="(max-width: 900px) 100vw, 520px" alt="" width={1080} height={1920} loading="lazy" decoding="async" />
            <img className={t.alive} src="/brand/tree/plate-720.webp" srcSet="/brand/tree/plate-720.webp 720w, /brand/tree/plate-1080.webp 1080w" sizes="(max-width: 900px) 100vw, 520px"
              alt={lang === "es" ? "Árbol escultórico de bronce y titanio con venas de luz azul" : "Sculpted bronze and titanium tree with blue light veins"} width={1080} height={1920} loading="lazy" decoding="async" />
            <span className={t.seed} aria-hidden="true" style={{ left: `${SEED.x * 100}%`, top: `${SEED.y * 100}%` }} />
            <span className={t.pulse} key={growth} aria-hidden="true" />
            <span className={t.can} data-on={pouring} aria-hidden="true">
              <svg viewBox="0 0 64 48" width="64" height="48"><defs><linearGradient id="can-m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f3f5fb" /><stop offset=".45" stopColor="#9aa3b8" /><stop offset="1" stopColor="#3b4256" /></linearGradient></defs>
                <path d="M14 14h26a4 4 0 0 1 4 4v18a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6Z" fill="url(#can-m)" /><path d="M44 22l16-10 2 3-15 12Z" fill="url(#can-m)" /><path d="M18 14a10 10 0 0 1 20 0" fill="none" stroke="#c9cfdd" strokeWidth="3" /></svg>
            </span>
            {SPOTS.map((sp, i) => {
              const branchName = c.branches[sp.branch][0];
              const st = stage[i];
              return <button key={i} ref={el => { apples.current[i] = el; }} type="button" className={t.apple} data-stage={st} data-falling={falling === i}
                style={{ left: `${sp.x * 100}%`, top: `${sp.y * 100}%`, width: `${sp.r * 2 * 1.45 * 100}%` }}
                disabled={st !== 3 || falling !== null} tabIndex={st === 0 ? -1 : 0} aria-hidden={st === 0}
                aria-label={st === 3 ? c.harvestApple(branchName) : c.unripe(branchName)} onClick={() => harvest(i)}>
                <img src={`/brand/tree/apple-${sp.sprite}.webp`} alt="" width={160} height={160} loading="lazy" decoding="async" draggable={false} />
              </button>;
            })}
            {coins.map(k => <span key={k.id} className={t.coin} style={{ left: `${k.x * 100}%`, top: `${k.y * 100}%` }}><i>$</i><em>{k.text}</em></span>)}
            <canvas ref={canvas} className={t.fx} aria-hidden="true" />
          </div>
        </div>

        <div className={t.actions}>
            <button type="button" className={t.water} onClick={water} disabled={pouring}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5c-.3 0-.6.2-.8.4C9.6 5 6 9.6 6 13.5a6 6 0 0 0 12 0c0-3.9-3.6-8.5-5.2-10.6a1 1 0 0 0-.8-.4Z" /></svg>
              {pouring ? c.pouring : c.water}
            </button>
            <p className={t.hint}>{c.perWater(perWater)}</p>
        </div>
        <dl className={t.hud}>
          <div><dt>{c.growth}</dt><dd><meter min={0} max={100} value={growth} aria-label={c.growth} /> {growth}%</dd></div>
          <div><dt>{c.branchesOn}</dt><dd>{active}/6</dd></div>
          <div><dt>{c.harvested}</dt><dd>{harvested}</dd></div>
          <div className={t.money}><dt>{c.revenue}</dt><dd>{money(shown)}</dd></div>
        </dl>
        {notice && <p className={t.notice} role="status">{notice}</p>}
        <p className={t.disclaimer}>{c.disclaimer}</p>
        {phase === 5 && <div className={t.final}>
          <a className={t.cta} href="#demos">{c.explore}</a>
          <a className={t.ghost} href="#soluciones">{c.solutions}</a>
          <button type="button" className={t.ghost} onClick={restart}>{c.restart}</button>
        </div>}
        {phase !== 5 && harvested > 0 && <button type="button" className={t.reset} onClick={restart}>{c.restart}</button>}
      </div>
    </div>
  );
}
