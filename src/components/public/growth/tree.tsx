"use client";
/* eslint-disable @next/next/no-img-element -- pre-optimized local WebP layers; no image-optimization quota. */
import { rovingKeyDown } from "@/components/a11y/roving";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as RPointerEvent } from "react";
import type { Lang } from "../landing/copy";
import { INDUSTRIES, money } from "./industries";
import { useDemo } from "./store";
import t from "./tree.module.css";

/**
 * THE GROWTH TREE — one photoreal tree (Higgsfield master) living inside a full-bleed scene, not a picture in a card.
 *  · Ambient extension: the same master, enlarged and blurred, fills the whole section, so colour and light match
 *    the tree by construction; the tree layer is feathered on every side and its floor melts into the page.
 *  · Shared atmosphere: volumetric rays, a halo that grows with the business, dust drifting in the light, water and
 *    gold particles all drawn on one canvas that spans the scene. Pointer/scroll parallax gives it depth.
 *  · Game: hold (or tap) to water → the trunk rises with energy pulses → six multipliers light their part of the crown
 *    (nodes on the tree + an accessible rail) → real apple sprites bud, swell and ripen → harvest: the fruit falls with
 *    gravity, hits the stone, a shockwave and a spinning gold coin turn it into simulated revenue.
 * Everything is illustrative and labelled; nothing here represents real earnings.
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
  // More fruit: positions sampled on the master's real foliage (golden-leaf mask), spaced for touch (≥ 10.5 % of width).
  { x: 0.6921, y: 0.2185, r: .036, branch: 4, sprite: 0 },
  { x: 0.5642, y: 0.3425, r: .036, branch: 3, sprite: 1 },
  { x: 0.6433, y: 0.2791, r: .036, branch: 5, sprite: 2 },
  { x: 0.3973, y: 0.3070, r: .036, branch: 3, sprite: 3 },
  { x: 0.2523, y: 0.2342, r: .036, branch: 0, sprite: 4 },
  { x: 0.7535, y: 0.1093, r: .036, branch: 4, sprite: 5 },
  { x: 0.5084, y: 0.1646, r: .036, branch: 3, sprite: 6 },
  { x: 0.5681, y: 0.2379, r: .036, branch: 3, sprite: 7 },
  { x: 0.8481, y: 0.1382, r: .036, branch: 4, sprite: 8 },
  { x: 0.3667, y: 0.2077, r: .036, branch: 1, sprite: 0 },
  { x: 0.2015, y: 0.0846, r: .036, branch: 1, sprite: 1 },
  { x: 0.3816, y: 0.0604, r: .036, branch: 2, sprite: 2 },
  { x: 0.7497, y: 0.2739, r: .036, branch: 5, sprite: 3 },
  { x: 0.1392, y: 0.3024, r: .036, branch: 0, sprite: 4 },
  { x: 0.1362, y: 0.1828, r: .036, branch: 1, sprite: 5 },
  { x: 0.5499, y: 0.1101, r: .036, branch: 2, sprite: 6 },
  { x: 0.9274, y: 0.2435, r: .036, branch: 5, sprite: 7 },
];
// Branch nodes (where each multiplier attaches to the crown), same frame as SPOTS. Mask zones live in the CSS.
const NODES = [[.2, .265], [.27, .15], [.43, .085], [.5, .27], [.72, .14], [.78, .31]];
const FLOOR = .585, ROOT = { x: .5, y: .575 }, SPOUT = { x: .63, y: .44 };

const COPY = {
  es: {
    eyebrow: "El árbol del crecimiento", title: "Haz crecer tu negocio.",
    motto: "No vendemos herramientas. Vendemos multiplicadores de trabajo.",
    steps: ["Riega", "Activa herramientas", "Cosecha frutos", "Mira el resultado"],
    hints: [
      "Mantén pulsado «Regar» (o tócalo) para invertir trabajo y constancia.",
      "Sigue regando: el tronco necesita el 50 % para sostener ramas.",
      "Tu árbol ya es fuerte, pero sin herramientas no da frutos. Activa una: cada herramienta es lo que hace que dé dinero.",
      "Cada herramienta activa = más frutos, más rápido y de más valor. Riega para acelerar.",
      "¡Frutos maduros! Tócalos uno a uno o cosecha todo de una vez.",
      "Con todas las herramientas, tu negocio da frutos sin parar.",
    ],
    water: "Regar", waterLabel: "Regar el negocio", pouring: "Regando…", invest: "Inversión y esfuerzo",
    level: ["Constante", "Comprometido", "Ambicioso"],
    growth: "Crecimiento", tools: "Herramientas", harvested: "Cosechas", revenue: "Ingresos simulados",
    disclaimer: "Simulación ilustrativa. No representa ganancias reales ni resultados garantizados.",
    branches: [
      ["Atención de clientes", "Más consultas respondidas"], ["Reservas y agenda", "Agenda con más trabajo"], ["CRM y seguimiento", "Ninguna oportunidad se pierde"],
      ["Presencia digital", "Más clientes te encuentran"], ["Tienda online", "Ventas mientras duermes"], ["Marketing y campañas", "Más alcance, más prospectos"],
    ],
    lock: "Riega hasta el 50 %", activate: "Activar", active: "Activa",
    harvestApple: (b: string) => `Cosechar fruto maduro de «${b}»`, unripe: (b: string) => `Fruto creciendo en «${b}»`,
    labels: ["clientes nuevos", "reservas completadas", "ventas cerradas", "clientes convertidos"],
    harvestAll: (n: number) => `Cosechar todo (${n})`, harvestTotal: "Cosecha completa",
    demoSale: "venta de la demostración", mult: "Multiplicador de cosecha", multHint: "cada herramienta suma +50 % de frutos y de dinero", boost: "+50 % cosecha", noTools: "Sin herramientas: 0 frutos",
    explore: "Explora las demostraciones", solutions: "Descubre las soluciones", restart: "Reiniciar simulación",
    fromDemo: "Una venta de las demostraciones hizo madurar un fruto",
  },
  en: {
    eyebrow: "The growth tree", title: "Grow your business.",
    motto: "We don't sell tools. We sell work multipliers.",
    steps: ["Water", "Activate tools", "Harvest fruit", "See the result"],
    hints: [
      "Press and hold “Water” (or tap it) to invest work and consistency.",
      "Keep watering: the trunk needs 50% to carry branches.",
      "Your tree is strong, but without tools it bears no fruit. Activate one: tools are what make it produce money.",
      "Every active tool = more fruit, faster, and worth more. Water to speed it up.",
      "Ripe fruit! Tap them one by one or harvest everything at once.",
      "With every tool active, your business keeps bearing fruit.",
    ],
    water: "Water", waterLabel: "Water the business", pouring: "Watering…", invest: "Investment & effort",
    level: ["Steady", "Committed", "Ambitious"],
    growth: "Growth", tools: "Tools", harvested: "Harvests", revenue: "Simulated revenue",
    disclaimer: "Illustrative simulation. It does not represent real earnings or guaranteed results.",
    branches: [
      ["Customer response", "More inquiries answered"], ["Booking & calendar", "A calendar full of work"], ["CRM & follow-up", "No opportunity slips away"],
      ["Digital presence", "More customers find you"], ["Online store", "Sales while you sleep"], ["Marketing & campaigns", "More reach, more leads"],
    ],
    lock: "Water to 50%", activate: "Activate", active: "Active",
    harvestApple: (b: string) => `Harvest ripe fruit from “${b}”`, unripe: (b: string) => `Fruit growing on “${b}”`,
    labels: ["new customers", "bookings completed", "sales closed", "customers converted"],
    harvestAll: (n: number) => `Harvest all (${n})`, harvestTotal: "Full harvest",
    demoSale: "sale from the demos", mult: "Harvest multiplier", multHint: "each tool adds +50% fruit and money", boost: "+50% harvest", noTools: "No tools: 0 fruit",
    explore: "Explore the demos", solutions: "Discover the solutions", restart: "Restart simulation",
    fromDemo: "A sale in the demos ripened a fruit",
  },
};

type P = { kind: "dust" | "drop" | "splash" | "gold" | "spark"; x: number; y: number; vx: number; vy: number; life: number; max: number; size: number };
type Coin = { id: number; x: number; amount: string; label: string };
const MULT_STEP = .5;   // each active tool adds +50 % to fruit production, ripening speed and value

export function GrowthTree({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  const { state, dispatch } = useDemo();
  const ticket = INDUSTRIES[state.industry].ticket;
  const [growth, setGrowth] = useState(0);
  const [branches, setBranches] = useState<boolean[]>(() => Array(6).fill(false));
  const [stage, setStage] = useState<number[]>(() => Array(SPOTS.length).fill(0));   // 0 none · 1 bud · 2 young · 3 ripe
  const [value, setValue] = useState<number[]>(() => Array(SPOTS.length).fill(0));
  const [falling, setFalling] = useState<number[]>([]);
  const fallingRef = useRef(new Set<number>());
  const [boosts, setBoosts] = useState<{ id: number; b: number }[]>([]), [total, setTotal] = useState<{ id: number; amount: number } | null>(null);
  const [coins, setCoins] = useState<Coin[]>([]), [waves, setWaves] = useState<{ id: number; x: number }[]>([]);
  const [revenue, setRevenue] = useState(0), [shown, setShown] = useState(0), [harvested, setHarvested] = useState(0), [bump, setBump] = useState(0);
  const [effort, setEffort] = useState(1);                  // 0 steady · 1 committed · 2 ambitious
  const [pouring, setPouring] = useState(false), [notice, setNotice] = useState("");
  const scene = useRef<HTMLDivElement>(null), box = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), apples = useRef<(HTMLButtonElement | null)[]>([]);
  const fxLast = useRef(0);
  const fx = useRef<P[]>([]), raf = useRef(0), visible = useRef(false), reduced = useRef(false), seq = useRef(0);
  const pourTimer = useRef(0), pourStart = useRef(0), pourStop = useRef(0), held = useRef(false), ripenAcc = useRef(0);

  const rate = [16, 22, 30][effort];                         // % of growth per second of watering
  const active = branches.filter(Boolean).length;
  const mult = 1 + active * MULT_STEP;
  // Simulated value of one fruit = several customers × the industry's average ticket × the tools multiplier.
  const baseUnits = Math.min(8, Math.max(1, Math.round(240 / ticket)));
  const fruitValue = (bonus = 1) => { const units = Math.max(1, Math.round(baseUnits * mult * bonus)); return { units, amount: units * ticket }; };
  const ripe = stage.filter(x => x === 3).length;
  const phase = growth === 0 ? 0 : growth < 50 ? 1 : active === 0 ? 2 : active === 6 && growth >= 100 && harvested >= 3 ? 5 : ripe > 0 ? 4 : 3;
  const step = phase <= 1 ? 0 : phase === 2 ? 1 : phase < 5 ? 2 : 3;

  useEffect(() => { reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches; }, []);

  // Revenue counts up rather than jumping.
  useEffect(() => {
    if (shown === revenue) return;
    const id = requestAnimationFrame(() => setShown(v => (Math.abs(revenue - v) < 2 ? revenue : v + Math.ceil((revenue - v) / 7))));
    return () => cancelAnimationFrame(id);
  }, [shown, revenue]);

  /* ── one canvas for the whole scene: dust in the light, water, splashes, gold ───────────────────────────── */
  const loop = useCallback(() => {
    const cv = canvas.current, sc = scene.current, bx = box.current; if (!cv || !sc || !bx) { raf.current = 0; return; }
    const sr = sc.getBoundingClientRect(), br = bx.getBoundingClientRect();
    const w = sr.width, h = sr.height, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext("2d"); if (!g) { raf.current = 0; return; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const ox = br.left - sr.left, oy = br.top - sr.top, bw = br.width, bh = br.height, floorY = oy + FLOOR * bh;
    const now = performance.now(), dt = Math.min(.05, Math.max(.001, (now - (fxLast.current || now - 16)) / 1000)); fxLast.current = now;   // real time, not frames
    const list = fx.current;
    // Keep a quiet population of dust motes drifting through the skylight.
    if (!reduced.current && list.filter(p => p.kind === "dust").length < 46) list.push({ kind: "dust", x: ox + bw * (.2 + Math.random() * .6), y: h * (.05 + Math.random() * .7), vx: (Math.random() - .5) * 6, vy: -3 - Math.random() * 6, life: 0, max: 6 + Math.random() * 6, size: .6 + Math.random() * 1.4 });
    // While watering, keep the stream flowing from the spout.
    if (held.current && !reduced.current) for (let k = 0; k < 3; k++) list.push({ kind: "drop", x: ox + SPOUT.x * bw + (Math.random() - .5) * 6, y: oy + SPOUT.y * bh, vx: -48 - Math.random() * 40, vy: 30 + Math.random() * 60, life: 0, max: 2, size: 1.1 + Math.random() * 1.2 });
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i]; p.life += dt;
      if (p.kind === "dust") { p.x += p.vx * dt + Math.sin(p.life * 1.3 + p.size) * .15; p.y += p.vy * dt; }
      else { p.vy += (p.kind === "gold" ? 260 : p.kind === "spark" ? -90 : 1400) * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      if (p.kind === "drop" && p.y >= floorY) {
        for (let k = 0; k < 2; k++) list.push({ kind: "splash", x: p.x, y: floorY, vx: (Math.random() - .5) * 130, vy: -Math.random() * 190, life: 0, max: .45, size: 1.4 });
        if (Math.random() < .25) list.push({ kind: "spark", x: ox + ROOT.x * bw + (Math.random() - .5) * bw * .3, y: floorY - 4, vx: (Math.random() - .5) * 20, vy: -40 - Math.random() * 60, life: 0, max: 1.4, size: 1.2 });
        list.splice(i, 1); continue;
      }
      if (p.kind === "gold" && p.y > floorY + 2 && p.vy > 0) { p.y = floorY + 2; p.vy *= -.35; p.vx *= .6; }
      if (p.life > p.max) { list.splice(i, 1); continue; }
      const k = 1 - p.life / p.max;
      if (p.kind === "drop") {
        g.strokeStyle = `rgba(205,232,255,${.8 * k})`; g.lineWidth = p.size; g.lineCap = "round";
        g.beginPath(); g.moveTo(p.x - p.vx * .02, p.y - p.vy * .02); g.lineTo(p.x, p.y); g.stroke();
      } else if (p.kind === "dust") {
        const a = Math.sin(Math.PI * Math.min(1, p.life / p.max)) * .55;
        g.fillStyle = `rgba(255,236,205,${a})`; g.beginPath(); g.arc(p.x, p.y, p.size, 0, Math.PI * 2); g.fill();
      } else {
        const col = p.kind === "gold" ? `rgba(255,${190 + Math.round(50 * k)},${90 + Math.round(60 * k)},${k})` : p.kind === "spark" ? `rgba(120,200,255,${k})` : `rgba(190,225,255,${.8 * k})`;
        g.fillStyle = col; g.shadowColor = p.kind === "gold" ? "rgba(255,180,80,.9)" : "transparent"; g.shadowBlur = p.kind === "gold" ? 8 : 0;
        g.beginPath(); g.arc(p.x, p.y, p.size * (p.kind === "gold" ? .5 + k : 1), 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
      }
    }
    if (visible.current && (list.length || held.current)) raf.current = requestAnimationFrame(loop);
    else { g.clearRect(0, 0, w, h); raf.current = 0; fxLast.current = 0; }
  }, []);
  const kick = useCallback(() => { if (!raf.current && visible.current) raf.current = requestAnimationFrame(loop); }, [loop]);

  useEffect(() => {
    const node = scene.current; if (!node) return;
    const io = new IntersectionObserver(([e]) => { visible.current = e.isIntersecting; if (e.isIntersecting) kick(); }, { threshold: .05 }); io.observe(node);
    // Scroll parallax (works on touch devices too): the world drifts a little against the page.
    const onScroll = () => { if (!visible.current || reduced.current) return; const r = node.getBoundingClientRect(); node.style.setProperty("--sy", String(Math.max(-1, Math.min(1, (r.top + r.height / 2 - innerHeight / 2) / innerHeight)))); };
    window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
    return () => { io.disconnect(); window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf.current); window.clearInterval(pourTimer.current); };
  }, [kick]);

  const parallax = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || reduced.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
    e.currentTarget.style.setProperty("--my", (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
  };

  /* ── watering: hold to pour continuously, tap for one generous pour ─────────────────────────────────────── */
  const ripen = useCallback((times: number) => {
    setStage(prev => {
      const next = [...prev];
      for (let n = 0; n < times; n++) {
        const open = next.map((x, k) => (x > 0 && x < 3 && branches[SPOTS[k].branch] && !fallingRef.current.has(k) ? k : -1)).filter(k => k >= 0);
        if (!open.length) break; next[open[Math.floor(Math.random() * open.length)]] += 1;   // spread across the crown
      }
      return next;
    });
  }, [branches]);

  // Growth follows real elapsed time (not timer ticks), so a busy main thread never "waters less".
  const lastTick = useRef(0);
  const tickPour = useCallback(() => {
    const now = performance.now(), dt = Math.min(.5, Math.max(0, (now - (lastTick.current || now)) / 1000)); lastTick.current = now;
    setGrowth(v => Math.min(100, Math.round((v + rate * dt) * 10) / 10));
    ripenAcc.current += dt;
    if (ripenAcc.current >= .5) { ripenAcc.current = 0; ripen(Math.max(1, active)); }
  }, [rate, ripen, active]);

  // Every press (tap or hold) guarantees at least ~1.1 s of water from that press, so quick taps add up instead of
  // cutting a pour short; holding keeps the water flowing until release.
  const startPour = () => {
    pourStart.current = performance.now();
    window.clearTimeout(pourStop.current);
    if (held.current) return;
    held.current = true; setPouring(true); kick(); lastTick.current = performance.now();
    window.clearInterval(pourTimer.current); pourTimer.current = window.setInterval(tickPour, 120);
  };
  const endPour = (minMs = 1100) => {
    if (!held.current) return;
    const stop = () => { tickPour(); held.current = false; setPouring(false); window.clearInterval(pourTimer.current); };
    const remain = pourStart.current + minMs - performance.now();
    window.clearTimeout(pourStop.current);
    if (remain > 0) pourStop.current = window.setTimeout(stop, remain); else stop();
  };
  const keyPour = (e: KeyboardEvent<HTMLButtonElement>) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); startPour(); endPour(1100); } };

  const activate = (b: number) => {
    if (growth < 50 || branches[b]) return;
    setBranches(prev => prev.map((x, i) => x || i === b));
    setStage(prev => prev.map((x, i) => (SPOTS[i].branch === b && x === 0 ? 1 : x)));
    const id = Date.now(); setBoosts(bs => [...bs, { id, b }]); window.setTimeout(() => setBoosts(bs => bs.filter(k => k.id !== id)), 1800);
    const bx = box.current, sc = scene.current;
    if (bx && sc && !reduced.current) {   // a burst of energy where the branch attaches
      const sr = sc.getBoundingClientRect(), br = bx.getBoundingClientRect(), [nx, ny] = NODES[b];
      for (let k = 0; k < 18; k++) fx.current.push({ kind: "spark", x: br.left - sr.left + nx * br.width, y: br.top - sr.top + ny * br.height, vx: (Math.random() - .5) * 120, vy: (Math.random() - .5) * 120, life: 0, max: 1, size: 1.4 });
      kick();
    }
  };

  // Natural ripening on active branches while the scene is visible.
  useEffect(() => {
    if (!active) return;
    // More tools → more fruit ripens per tick: the multiplier is visible in how fast the tree fills up.
    const id = window.setInterval(() => { if (visible.current && growth >= 50) ripen(Math.ceil(active * mult / 2)); }, 1100);
    return () => window.clearInterval(id);
  }, [active, growth, ripen, mult]);

  // A sale in any demo ripens one apple on the branch that produced it.
  useEffect(() => {
    const f = state.fruitQueue[0]; if (!f) return;
    const amount = state.sales.find(s => s.id === f.id)?.amount ?? ticket;
    let i = stage.findIndex((x, k) => SPOTS[k].branch === f.branch && x < 3);
    if (i < 0) i = stage.findIndex(x => x < 3);
    setGrowth(v => Math.max(v, 60));
    setBranches(prev => prev.map((x, k) => x || k === f.branch));
    if (i >= 0) {
      setStage(prev => prev.map((x, k) => (k === i ? 3 : SPOTS[k].branch === f.branch && x === 0 ? 1 : x)));
      setValue(prev => prev.map((x, k) => (k === i ? amount : x)));
    }
    setNotice(c.fromDemo);
    dispatch({ type: "fruitTaken", id: f.id });
  }, [state.fruitQueue, state.sales, stage, dispatch, ticket, c.fromDemo]);

  /* ── harvest: gravity, two bounces, shockwave, gold burst, spinning coin, revenue ───────────────────────── */
  const harvest = (i: number, opts: { quiet?: boolean } = {}) => {
    if (stage[i] !== 3 || fallingRef.current.has(i)) return 0;
    const node = box.current, el = apples.current[i], sc = scene.current; if (!node || !el || !sc) return 0;
    const fv = value[i] ? { units: 0, amount: value[i] } : fruitValue(.85 + Math.random() * .4);
    const noun = c.labels[seq.current++ % c.labels.length];
    const label = fv.units ? `${fv.units} ${noun}` : c.demoSale;
    fallingRef.current.add(i); setFalling([...fallingRef.current]);
    const land = (dx: number) => {
      const sr = sc.getBoundingClientRect(), br = node.getBoundingClientRect();
      const x = br.left - sr.left + SPOTS[i].x * br.width + dx, y = br.top - sr.top + FLOOR * br.height;
      if (!reduced.current) {
        const n = opts.quiet ? 22 : 46;
        for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI; const sp = 120 + Math.random() * 260; fx.current.push({ kind: "gold", x, y: y - 4, vx: Math.cos(a) * sp * (Math.random() < .5 ? -1 : 1), vy: -Math.sin(a) * sp, life: 0, max: 1 + Math.random() * .8, size: 1.4 + Math.random() * 2.4 }); }
        kick();
      }
      const id = Date.now() + i * 7 + Math.random(), xr = (SPOTS[i].x * br.width + dx) / br.width;
      setWaves(ws => [...ws, { id, x: xr }]); window.setTimeout(() => setWaves(ws => ws.filter(k => k.id !== id)), 1300);
      setCoins(cs => [...cs.slice(-7), { id, x: xr, amount: `+${money(fv.amount)}`, label }]); window.setTimeout(() => setCoins(cs => cs.filter(k => k.id !== id)), 2600);
      setRevenue(r => r + fv.amount); setHarvested(n => n + 1); setBump(b => b + 1);
      el.style.transform = ""; el.style.opacity = "";
      fallingRef.current.delete(i); setFalling([...fallingRef.current]);
      setStage(prev => prev.map((x, k) => (k === i ? (branches[SPOTS[i].branch] ? 1 : 0) : x)));   // the branch keeps producing
      setValue(prev => prev.map((x, k) => (k === i ? 0 : x)));
    };
    if (reduced.current) { land(0); return fv.amount; }
    const ground = (FLOOR - SPOTS[i].y) * node.clientHeight;
    let y = 0, vy = -110, x = 0, rot = 0, bounces = 0, last = performance.now(), squash = 1;
    const vx = (Math.random() - .5) * 90;
    // Frame-rate independent: real elapsed time is integrated in small substeps, so a slow device (or a busy main
    // thread) shows fewer frames of the same fall instead of a slow-motion fall.
    const stepFall = (now: number) => {
      let left = Math.min(.5, (now - last) / 1000); last = now;
      while (left > 0) {
        const dt = Math.min(1 / 120, left); left -= dt;
        vy += 2700 * dt; y += vy * dt; x += vx * dt; rot += vx * dt * 1.6;
        squash += (1 - squash) * Math.min(1, dt * 15);
        if (y >= ground) { y = ground; vy = -vy * .33; bounces++; squash = .8; }
        if (bounces >= 2 && Math.abs(vy) < 170) { el.style.opacity = "0"; land(x); return; }
      }
      el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${rot}deg) scale(${1 / squash}, ${squash})`;
      requestAnimationFrame(stepFall);
    };
    requestAnimationFrame(stepFall);
    return fv.amount;
  };

  // Harvest everything that is ripe: a cascade of falling fruit, a rain of coins and one big total.
  const harvestAll = () => {
    const ripeIdx = stage.map((x, k) => (x === 3 && !fallingRef.current.has(k) ? k : -1)).filter(k => k >= 0);
    let sum = 0;
    ripeIdx.forEach((k, n) => { const amount = value[k] || fruitValue(1).amount; sum += amount; window.setTimeout(() => harvest(k, { quiet: true }), n * 130); });
    if (sum) { const id = Date.now(); setTotal({ id, amount: sum }); window.setTimeout(() => setTotal(tt => (tt?.id === id ? null : tt)), 3400); }
  };

  const restart = () => {
    setGrowth(0); setBranches(Array(6).fill(false)); setStage(Array(SPOTS.length).fill(0)); setValue(Array(SPOTS.length).fill(0));
    setRevenue(0); setShown(0); setHarvested(0); setNotice(""); setCoins([]); setWaves([]); setTotal(null);
  };

  const vars = useMemo(() => {
    const v: Record<string, string | number> = { "--g": growth, "--all": active === 6 && growth >= 100 ? 1 : 0, "--pour": pouring ? 1 : 0 };
    branches.forEach((on, i) => { v[`--b${i}`] = on ? 1 : 0; });
    return v as CSSProperties;
  }, [growth, branches, active, pouring]);

  return (
    <div className={t.wrap}>
      <div ref={scene} className={t.scene} data-phase={phase} style={vars} onPointerMove={parallax} onPointerLeave={e => { e.currentTarget.style.setProperty("--mx", "0"); e.currentTarget.style.setProperty("--my", "0"); }}>
        {/* Ambient extension of the same master: the room around the tree, so there is no edge to see. */}
        <div className={t.ambient} aria-hidden="true"><img src="/brand/tree/plate-720.webp" alt="" width={720} height={1280} loading="lazy" decoding="async" /></div>
        <div className={t.halo} aria-hidden="true" />
        <div className={t.rays} aria-hidden="true"><i /><i /><i /></div>

        <div className={t.world}>
          <div ref={box} className={t.box}>
            <div className={t.plates}>
              <img className={t.dormant} src="/brand/tree/plate-720.webp" srcSet="/brand/tree/plate-720.webp 720w, /brand/tree/plate-1080.webp 1080w" sizes="(max-width: 900px) 100vw, 640px" alt="" width={1080} height={1920} loading="lazy" decoding="async" />
              <img className={t.alive} src="/brand/tree/plate-720.webp" srcSet="/brand/tree/plate-720.webp 720w, /brand/tree/plate-1080.webp 1080w" sizes="(max-width: 900px) 100vw, 640px"
                alt={lang === "es" ? "Árbol escultórico de bronce y titanio con venas de luz azul" : "Sculpted bronze and titanium tree with blue light veins"} width={1080} height={1920} loading="lazy" decoding="async" />
            </div>
            <span className={t.roots} aria-hidden="true" />
            <span className={t.energy} aria-hidden="true" key={`e${Math.floor(growth / 8)}`} />
            <span className={t.seed} aria-hidden="true" style={{ left: `${ROOT.x * 100}%`, top: `${ROOT.y * 100}%` }} />
            <span className={t.can} data-on={pouring} aria-hidden="true">
              <svg viewBox="0 0 64 48" width="64" height="48"><defs><linearGradient id="can-m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f6f7fb" /><stop offset=".45" stopColor="#a9b1c6" /><stop offset="1" stopColor="#3b4256" /></linearGradient></defs>
                <path d="M14 14h26a4 4 0 0 1 4 4v18a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6Z" fill="url(#can-m)" /><path d="M44 22l16-10 2 3-15 12Z" fill="url(#can-m)" /><path d="M18 14a10 10 0 0 1 20 0" fill="none" stroke="#c9cfdd" strokeWidth="3" /></svg>
            </span>
            {NODES.map(([x, y], b) => <button key={b} type="button" tabIndex={-1} aria-hidden="true" className={t.node} data-state={branches[b] ? "on" : growth >= 50 ? "ready" : "locked"}
              style={{ left: `${x * 100}%`, top: `${y * 100}%` }} onClick={() => activate(b)}>
              <i /><span>{c.branches[b][0]}{!branches[b] && growth >= 50 && <small>{c.activate}</small>}{branches[b] && <small>{c.branches[b][1]}</small>}</span>
            </button>)}
            {SPOTS.map((sp, i) => {
              const st = stage[i], name = c.branches[sp.branch][0];
              return <button key={i} ref={el => { apples.current[i] = el; }} type="button" className={t.apple} data-stage={st} data-falling={falling.includes(i)}
                style={{ left: `${sp.x * 100}%`, top: `${sp.y * 100}%`, width: `${sp.r * 2 * 1.45 * 100}%`, ["--d" as string]: `${(i % 4) * -.7}s` }}
                disabled={st !== 3 || falling.includes(i)} tabIndex={st === 0 ? -1 : 0} aria-hidden={st === 0}
                aria-label={st === 3 ? c.harvestApple(name) : c.unripe(name)} onClick={() => harvest(i)}>
                <span className={t.fruit}><span className={t.glow} /><img src={`/brand/tree/apple-${sp.sprite}.webp`} alt="" width={160} height={160} loading="lazy" decoding="async" draggable={false} /><span className={t.spec} /></span>
              </button>;
            })}
            {waves.map(w => <span key={w.id} className={t.wave} style={{ left: `${w.x * 100}%`, top: `${FLOOR * 100}%` }} aria-hidden="true" />)}
            {coins.map(k => <span key={k.id} className={t.cash} style={{ left: `${k.x * 100}%`, top: `${FLOOR * 100}%` }} aria-hidden="true">
              <span className={t.coin}><b>$</b></span><strong>{k.amount}</strong><em>{k.label}</em></span>)}
            {boosts.map(k => <span key={k.id} className={t.boost} style={{ left: `${NODES[k.b][0] * 100}%`, top: `${NODES[k.b][1] * 100}%` }} aria-hidden="true">{c.boost}</span>)}
            {total && <span key={total.id} className={t.total} aria-hidden="true"><small>{c.harvestTotal}</small>+{money(total.amount)}</span>}
          </div>
        </div>
        <canvas ref={canvas} className={t.fx} aria-hidden="true" />
        <div className={t.fog} aria-hidden="true" />

        <header className={t.head}>
          <p className={t.eyebrow}>{c.eyebrow}</p>
          <h2 id="h-tree" className={t.title}>{c.title}</h2>
          <p className={t.motto}>{c.motto}</p>
          <ol className={t.steps}>{c.steps.map((s, i) => <li key={s} data-state={i < step ? "done" : i === step ? "now" : "todo"}><span>{i < step ? "✓" : i + 1}</span>{s}</li>)}</ol>
        </header>

        <div className={t.bank} data-bump={bump % 2} aria-live="polite">
          <span>{c.revenue}</span><b key={bump}>{money(shown)}</b>
          <small>{harvested} {c.harvested.toLowerCase()} · ×{mult.toFixed(1)}</small>
        </div>

        <div className={t.dock}>
          <p className={t.hint} aria-live="polite">{notice || c.hints[phase]}</p>
          {ripe >= 2 && <button type="button" className={t.harvestAll} onClick={harvestAll}>
            <span aria-hidden="true">$</span>{c.harvestAll(ripe)}
          </button>}
          <div className={t.controls}>
            <button type="button" className={t.water} aria-label={c.waterLabel} data-on={pouring}
              onPointerDown={e => { if (e.button === 0) { e.currentTarget.setPointerCapture?.(e.pointerId); startPour(); } }}
              onPointerUp={() => endPour()} onPointerCancel={() => endPour()} onKeyDown={keyPour} onClick={e => { if (e.detail === 0) { startPour(); endPour(1100); } }}
              onContextMenu={e => e.preventDefault()} style={{ ["--p" as string]: `${growth}%` }}>
              <span className={t.ring} aria-hidden="true" />
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5c-.3 0-.6.2-.8.4C9.6 5 6 9.6 6 13.5a6 6 0 0 0 12 0c0-3.9-3.6-8.5-5.2-10.6a1 1 0 0 0-.8-.4Z" /></svg>
              <span>{pouring ? c.pouring : c.water}</span><small>{Math.round(growth)}%</small>
            </button>
            <div className={t.effort} role="radiogroup" onKeyDown={e => rovingKeyDown(e, "radio")} aria-label={c.invest}>
              <span>{c.invest}</span>
              <div>{c.level.map((l, i) => <button key={l} type="button" role="radio" aria-checked={effort === i} tabIndex={(effort === i) ? 0 : -1} onClick={() => setEffort(i)}>{l}</button>)}</div>
            </div>
          </div>
          <div className={t.multi} aria-live="polite">
            <b>{c.mult} ×{mult.toFixed(1)}</b>
            <span className={t.segs} aria-hidden="true">{branches.map((on, b) => <i key={b} data-on={on} />)}</span>
            <small>{active ? c.multHint : c.noTools}</small>
          </div>
          <ul className={t.rail} aria-label={c.tools}>
            {c.branches.map(([name, result], b) => <li key={name}>
              <button type="button" aria-pressed={branches[b]} disabled={growth < 50 && !branches[b]} onClick={() => activate(b)}>
                <i aria-hidden="true" /><span><b>{name}</b><small>{branches[b] ? `${c.active} · ${result}` : growth < 50 ? c.lock : `${result} · ${c.boost}`}</small></span>
              </button>
            </li>)}
          </ul>
          {phase === 5 ? <div className={t.final}>
            <a className={t.cta} href="#demos">{c.explore}</a>
            <a className={t.ghost} href="#soluciones">{c.solutions}</a>
            <button type="button" className={t.ghost} onClick={restart}>{c.restart}</button>
          </div> : harvested > 0 && <button type="button" className={t.reset} onClick={restart}>{c.restart}</button>}
        </div>
      </div>
      <p className={t.disclaimer}>{c.disclaimer}</p>
    </div>
  );
}
