"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { INITIAL_CAMERA, OFFICE_MIN_ZOOM, OFFICE_MAX_ZOOM, officeViewport, officePointerAnchor, zoomOfficeAt, panOfficeBy, type Camera } from "@/lib/office/scene-camera";
import s from "./iso-office.module.css";

/**
 * Live isometric HQ ("dollhouse" view from above). Everything is drawn in SVG from code: architecture,
 * furniture and people. People are real members (from the directory) and the five virtual AI managers;
 * every badge and screen value comes from stored data passed in as props. Nothing here is simulated.
 */
export type IsoPerson = {
  id: string; kind: "human" | "ai"; name: string; initials: string; subtitle: string; hue?: number;
  photo?: string | null; open: number; overdue: number; unread: number; recentMinutes: number | null; offline?: boolean;
};
type WorkerRun = { display_status: string; started_at: string; lease_until: string };
type WorkerHistory = { last: Record<string, WorkerRun>; observedAt: string };
type HistoryConnection = "checking" | "available" | "unavailable" | "not_installed";
const HISTORY_API = "/admin/workspace/crm/office/manager-work/github-history/api";
const MANAGER_IDS = ["ren", "shin", "haru", "sora", "kenji"] as const;

type Props = {
  people: IsoPerson[]; selected: string | null; onSelect: (id: string) => void; lang: "es" | "en";
  screen: { active: number | null; overdue: number | null; done: number | null; unread: number };
};

const S = 30; // px per world unit
const W = 28, D = 18, H = 5.2;
const K = 1.55; // character scale relative to furniture, for legibility (Sims-like proportions) // room size (x, y) and wall height
const COS = 0.8660254, SIN = 0.5;
const px = (x: number, y: number, z = 0): [number, number] => [(x - y) * COS * S, (x + y) * SIN * S - z * S];
const pts = (...p: [number, number, number][]) => p.map(([x, y, z]) => px(x, y, z).map(n => n.toFixed(1)).join(",")).join(" ");

type Item = { depth: number; node: ReactNode };

function box(key: string, x: number, y: number, z: number, w: number, d: number, h: number, c: { top: string; left: string; right: string; stroke?: string }, extra?: ReactNode): Item {
  return {
    depth: x + w + y + d,
    node: (
      <g key={key}>
        <polygon points={pts([x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h])} fill={c.left} stroke={c.stroke} strokeWidth={0.6} />
        <polygon points={pts([x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h])} fill={c.right} stroke={c.stroke} strokeWidth={0.6} />
        <polygon points={pts([x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h])} fill={c.top} stroke={c.stroke} strokeWidth={0.6} />
        {extra}
      </g>
    ),
  };
}
const WOOD = { top: "#5a4130", left: "#3a2a1f", right: "#4a3526", stroke: "#2a1d15" };
const TITAN = { top: "#c8d2e0", left: "#7f8a9c", right: "#a3aec0" };
const FABRIC = { top: "#3b4256", left: "#252b3b", right: "#2f3548" };
const CHAMP = { top: "#d6c4a8", left: "#8f7d63", right: "#bba88e" };

function plant(key: string, x: number, y: number, size = 1): Item {
  const [cx, cy] = px(x + 0.4, y + 0.4, 0.9 * size);
  const pot = box(`${key}-pot`, x, y, 0, 0.8, 0.8, 0.7 * size, { top: "#1b2130", left: "#c8d2e0", right: "#e3e8f0" });
  return {
    depth: x + y + 1.6,
    node: (
      <g key={key}>
        {pot.node}
        <g className={s.leaves}>
          {[[-10, -14, 15], [9, -18, 14], [0, -30, 16], [-14, -30, 11], [13, -34, 12], [2, -46, 12]].map(([dx, dy, r], i) => (
            <ellipse key={i} cx={cx + dx * size} cy={cy + dy * size} rx={r * size} ry={r * 0.82 * size} fill={i % 2 ? "#2f6b4f" : "#3f8a63"} opacity={0.95} />
          ))}
        </g>
      </g>
    ),
  };
}

function desk(key: string, x: number, y: number, accent: string, glow: boolean): Item[] {
  return [
    box(`${key}-desk`, x, y, 0.72, 2.4, 1.2, 0.08, WOOD),
    box(`${key}-leg1`, x + 0.05, y + 0.05, 0, 0.12, 1.1, 0.72, TITAN),
    box(`${key}-leg2`, x + 2.23, y + 0.05, 0, 0.12, 1.1, 0.72, TITAN),
    // Monitor faces the seated person (its back is towards the viewer), with a soft screen glow.
    box(`${key}-mon`, x + 0.7, y + 0.35, 0.8, 1.0, 0.06, 0.62, { top: "#0b0f18", left: glow ? accent : "#1a2030", right: "#0f1420" }),
    box(`${key}-kbd`, x + 0.8, y + 0.7, 0.8, 0.8, 0.25, 0.02, { top: "#9aa5b8", left: "#5b6578", right: "#6f7a8d" }),
  ].map(i => ({ ...i, depth: x + y + 3.5 }));
}

function chair(key: string, x: number, y: number): Item[] {
  return [
    box(`${key}-seat`, x, y, 0.42, 0.8, 0.8, 0.12, FABRIC),
    box(`${key}-back`, x, y - 0.05, 0.54, 0.8, 0.14, 0.8, FABRIC),
    box(`${key}-base`, x + 0.33, y + 0.33, 0, 0.14, 0.14, 0.42, TITAN),
  ].map(i => ({ ...i, depth: x + y + 0.5 }));
}

/** A seated person (human or AI manager) behind a desk, facing the viewer. */
function person(p: IsoPerson, x: number, y: number, selected: boolean, onSelect: (id: string) => void, lang: "es" | "en"): Item {
  const [fx0, fy0] = px(x, y, 0);
  const [hx, hy0] = px(x, y, 1.95);
  const hy = fy0 + (hy0 - fy0) * K;
  const [bx, by] = px(x, y, 1.1);
  const [fx, fy] = px(x, y, 0);
  const torso = p.kind === "ai" ? `hsl(${p.hue ?? 250} 38% ${p.offline ? 30 : 42}%)` : "#26324a";
  const label = `${p.name} · ${p.subtitle}${p.kind === "ai" ? (lang === "en" ? " · virtual AI manager" : " · manager virtual de IA") : ""} · ${p.open} ${p.kind === "ai" ? (lang === "en" ? "logged requests" : "solicitudes registradas") : (lang === "en" ? "open tasks" : "tareas abiertas")}${p.unread ? ` · ${p.unread} ${lang === "en" ? "unread" : "sin leer"}` : ""}`;
  const key = (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(p.id); } };
  const tagLabel = p.name + (p.kind === "ai" ? " · IA" : "");
  const half = Math.max(36, tagLabel.length * 3.7 + 18);
  const active = p.kind === "human" && p.recentMinutes !== null && p.recentMinutes <= 60;
  return {
    depth: x + y + 0.9,
    node: (
      <g key={`p-${p.id}`} className={s.person} data-kind={p.kind} data-selected={selected} data-offline={p.offline || undefined}
        role="button" tabIndex={0} aria-label={label} aria-pressed={selected} onClick={() => onSelect(p.id)} onKeyDown={key}>
        <ellipse cx={fx} cy={fy} rx={52} ry={26} className={s.ring} />
        <g transform={`translate(${fx0} ${fy0}) scale(${K}) translate(${-fx0} ${-fy0})`}><g className={s.body}>
          <path d={`M ${bx - 17} ${by + 18} Q ${bx - 18} ${by - 16} ${bx} ${by - 18} Q ${bx + 18} ${by - 16} ${bx + 17} ${by + 18} Z`} fill={torso} />
          <path className={s.arm} d={`M ${bx + 12} ${by - 8} Q ${bx + 28} ${by + 1} ${bx + 25} ${by + 12}`} fill="none" stroke={p.kind === "ai" ? "#a5a5da" : "#899db6"} strokeWidth={4.5} strokeLinecap="round" />
          <path d={`M ${bx - 5} ${by - 17} L ${bx} ${by - 6} L ${bx + 5} ${by - 17}`} fill="none" stroke={p.kind === "ai" ? "#e7e2ff" : "#bba88e"} strokeWidth={1.4} />
          <circle cx={hx} cy={hy0} r={13} fill={p.kind === "ai" ? `hsl(${p.hue ?? 250} 30% 24%)` : "#1b2236"} stroke={p.kind === "ai" ? `hsl(${p.hue ?? 250} 70% 75%)` : "#bba88e"} strokeWidth={1.4} />
          {p.photo
            ? <image href={p.photo} x={hx - 12} y={hy0 - 12} width={24} height={24} style={{ clipPath: "circle(12px at center)" }} preserveAspectRatio="xMidYMid slice" />
            : <text x={hx} y={hy0 + 4} textAnchor="middle" className={s.initials}>{p.initials}</text>}
        </g></g>
        <g className={s.tag} transform={`translate(${hx} ${hy - 36})`}>
          <rect x={-half} y={-12} width={half * 2} height={23} rx={11.5} className={s.tagBg} />
          {p.kind === "ai" && <circle cx={-half + 10} cy={-1} r={3.5} className={p.offline ? s.lampOff : s.lampOn} />}
          {p.kind === "human" && <circle cx={-half + 10} cy={-1} r={3.5} className={active ? s.lampOn : s.lampIdle} />}
          <text x={5} y={3.5} textAnchor="middle" className={s.tagText}>{tagLabel}</text>
          {(p.unread > 0 || p.overdue > 0) && (
            <g transform={`translate(${half + 4} -10)`}>
              <circle r={9} className={p.unread ? s.badgeMsg : s.badgeLate} />
              <text y={3.5} textAnchor="middle" className={s.badgeText}>{p.unread || p.overdue}</text>
            </g>
          )}
        </g>
      </g>
    ),
  };
}

/** Seats: humans in the executive / operations rows, AI managers in the front arc. Positions are seat centres. */
const HUMAN_SEATS: [number, number][] = [[9.8, 4.6], [14.2, 4.6], [8.1, 9.0], [13.1, 9.0], [18.3, 11.0], [4.5, 9.8], [23.8, 11.0], [24.2, 15.4]];
const AI_SEATS: [number, number][] = [[3.6, 16.2], [8.4, 15.2], [13.1, 14.8], [18.1, 15.1], [23.4, 16.0]];

export function IsoOffice({ people, selected, onSelect, lang, screen }: Props) {
  const t = useCallback((es: string, en: string) => (lang === "en" ? en : es), [lang]);
  const humans = useMemo(() => people.filter(p => p.kind === "human"), [people]);
  const agents = useMemo(() => people.filter(p => p.kind === "ai"), [people]);
  const [workerHistory, setWorkerHistory] = useState<WorkerHistory | null>(null);
  const [historyConnection, setHistoryConnection] = useState<HistoryConnection>("checking");
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  // Connected to the authenticated, owner-only GitHub-history endpoint introduced by PR #102.
  // It is not available in main yet: 404 shows "pending" rather than inventing worker activity.
  // 20 s polling only while this tab is visible; hourly GitHub reports are not continuous AI work.
  useEffect(() => {
    let mounted = true;
    let missingEndpoint = false;
    let active: AbortController | null = null;
    const refresh = async () => {
      if (!mounted || missingEndpoint || active || document.visibilityState !== "visible") return;
      const controller = new AbortController();
      active = controller;
      try {
        const response = await fetch(HISTORY_API, {
          credentials: "same-origin", cache: "no-store", signal: controller.signal,
        });
        if (response.status === 404) {
          missingEndpoint = true;
          if (mounted) { setHistoryConnection("not_installed"); setWorkerHistory(null); }
          return;
        }
        if (!response.ok) throw new Error("history_unavailable");
        const payload: unknown = await response.json();
        if (!payload || typeof payload !== "object" || !("last" in payload) || !("observedAt" in payload))
          throw new Error("history_invalid");
        const source = payload as { last: unknown; observedAt: unknown };
        if (!source.last || typeof source.last !== "object" || typeof source.observedAt !== "string")
          throw new Error("history_invalid");
        const result: Record<string, WorkerRun> = {};
        for (const id of MANAGER_IDS) {
          const raw = (source.last as Record<string, unknown>)[id];
          if (!raw || typeof raw !== "object") continue;
          const run = raw as Partial<WorkerRun>;
          if (typeof run.display_status !== "string" || typeof run.started_at !== "string" ||
              typeof run.lease_until !== "string") continue;
          if (!["running", "completed", "stalled", "stale", "failed"].includes(run.display_status)) continue;
          result[id] = run as WorkerRun;
        }
        if (mounted) {
          setWorkerHistory({ last: result, observedAt: source.observedAt });
          setCheckedAt(new Date().toISOString());
          setHistoryConnection("available");
        }
      } catch {
        if (mounted && !controller.signal.aborted) {
          setHistoryConnection("unavailable");
          setWorkerHistory(null);
        }
      } finally {
        if (active === controller) active = null;
      }
    };
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 20000);
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mounted = false;
      active?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const managerPeople = useMemo(() => agents.map(person => {
    const code = person.id.startsWith("ai:") ? person.id.slice(3) : "";
    const run = workerHistory?.last[code];
    const running = run?.display_status === "running" && Date.parse(run.lease_until) > Date.now();
    const description = !run ? person.subtitle :
      run.display_status === "completed" ? (lang === "es" ? "Última comprobación completada" : "Last check completed") :
      run.display_status === "running" && running ? (lang === "es" ? "Comprobación ejecutándose" : "Check running") :
      run.display_status === "stalled" ? (lang === "es" ? "Ejecución interrumpida" : "Execution stalled") :
      run.display_status === "failed" ? (lang === "es" ? "Comprobación fallida" : "Check failed") :
      (lang === "es" ? "Sin actividad reciente" : "No recent activity");
    return { ...person, subtitle: description, offline: !running };
  }), [agents, workerHistory, lang]);
  const activeWorkers = managerPeople.filter(p => !p.offline).length;
  const recentChecks = MANAGER_IDS.filter(code => workerHistory?.last[code]?.display_status === "completed").length;
  const hour = new Date().getHours();
  const night = hour >= 19 || hour < 7;

  // Multi-pointer camera: one finger drags at zoom >1; two fingers pinch from any zoom.
  // Only decorative animations are used; motion never implies a worker is running.
  const [camera, setCamera] = useState<Camera>(INITIAL_CAMERA);
  const svg = useRef<SVGSVGElement>(null);
  const activePointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    mode: "single" | "pinch"; startCamera: Camera; x: number; y: number;
    distance: number; anchor: { x: number; y: number }; captured: boolean;
  } | null>(null);
  const suppressClick = useRef(false);

  const minX = px(0, D)[0] - 20, maxX = px(W, 0)[0] + 20;
  const minY = px(0, 0, H)[1] - 30, maxY = px(W, D)[1] + 30;
  const bounds = { minX, minY, width: maxX - minX, height: maxY - minY };
  const viewport = officeViewport(camera, bounds);
  const viewBox = `${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`;
  const anchorAt = (x: number, y: number, c: Camera = camera) => svg.current
    ? officePointerAnchor(x, y, svg.current.getBoundingClientRect(), c, bounds)
    : { x: 0.5, y: 0.5 };
  const zoomBy = (step: number) => setCamera(c => zoomOfficeAt(c, bounds, c.zoom + step));
  const fullView = () => setCamera(INITIAL_CAMERA);

  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const pointers = activePointers.current;
    if (pointers.size === 0) suppressClick.current = false;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      gesture.current = { mode: "pinch", startCamera: camera, x, y, distance,
        anchor: anchorAt(x, y), captured: true };
      suppressClick.current = true;
      // Capture both touches so the pinch stays stable when fingers move outside SVG.
      for (const id of pointers.keys()) {
        try { e.currentTarget.setPointerCapture(id); } catch { /* unsupported pointer capture */ }
      }
    } else if (pointers.size === 1) {
      gesture.current = { mode: "single", startCamera: camera, x: e.clientX, y: e.clientY,
        distance: 0, anchor: { x: 0.5, y: 0.5 }, captured: false };
    }
  };

  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    const pointers = activePointers.current;
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current, element = svg.current;
    if (!g || !element) return;
    if (g.mode === "pinch" && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const targetZoom = g.startCamera.zoom * distance / g.distance;
      setCamera(zoomOfficeAt(g.startCamera, bounds, targetZoom, g.anchor,
        anchorAt(x, y, g.startCamera)));
      suppressClick.current = true;
    } else if (g.mode === "single" && pointers.size === 1 && g.startCamera.zoom > 1) {
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (Math.hypot(dx, dy) < 7 && !g.captured) return;
      if (!g.captured) {
        g.captured = true;
        suppressClick.current = true;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fallback to pointer events */ }
      }
      const previous = officeViewport(g.startCamera, bounds);
      const rect = element.getBoundingClientRect();
      const scale = Math.min(rect.width / previous.width, rect.height / previous.height);
      if (scale > 0) setCamera(panOfficeBy(g.startCamera, bounds, -dx / scale, -dy / scale));
    }
  };

  const up = (e: ReactPointerEvent<SVGSVGElement>) => {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size === 0) gesture.current = null;
    else if (activePointers.current.size === 1) {
      const remaining = [...activePointers.current.values()][0];
      gesture.current = { mode: "single", startCamera: camera, x: remaining.x, y: remaining.y,
        distance: 0, anchor: { x: 0.5, y: 0.5 }, captured: false };
    }
  };

  const items = useMemo(() => {
    const list: Item[] = [];
    // Lounge (back-left): rug, sofa, table, plants.
    list.push({ depth: 0.5, node: <polygon key="rug" points={pts([1.2, 1.4, 0.01], [7.6, 1.4, 0.01], [7.6, 6.4, 0.01], [1.2, 6.4, 0.01])} className={s.rug} /> });
    list.push(box("sofa-a", 1.4, 1.5, 0, 5.2, 1.1, 0.45, FABRIC), box("sofa-a-back", 1.4, 1.2, 0.45, 5.2, 0.35, 0.5, FABRIC));
    list.push(box("sofa-b", 1.3, 2.7, 0, 1.1, 3.2, 0.45, FABRIC));
    list.push(box("table-l", 3.4, 3.4, 0.3, 2.4, 1.4, 0.1, CHAMP), box("table-l-base", 4.2, 3.9, 0, 0.8, 0.4, 0.3, TITAN));
    list.push(plant("pl-1", 0.4, 0.4, 1.5), plant("pl-2", 8.4, 0.4, 1.2), plant("pl-3", 0.4, 7.4, 1.3), plant("pl-4", 0.4, 16.6, 1.4), plant("pl-5", 25.8, 16.6, 1.3), plant("pl-6", 15.2, 0.4, 1.1), plant("pl-7", 26.8, 9.6, 1.1), plant("pl-8", 26.8, 1.5, 1.4));
    // Meeting room (right): table + chairs; glass walls added on top with low opacity.
    list.push(box("m-table", 17.6, 3.0, 0.72, 4.6, 1.8, 0.09, WOOD), box("m-table-base", 19.4, 3.6, 0, 1.0, 0.6, 0.72, TITAN));
    // Welcome desk and team studio enlarge the HQ without inventing staff.
    list.push(box("welcome-counter", 1.8, 7.1, 0, 3.0, 0.9, 0.95, CHAMP));
    list.push(box("welcome-display", 2.5, 7.45, 0.96, 1.2, 0.18, 0.25, { top: "#6de6f1", left: "#123a58", right: "#10304c" }));
    list.push(box("studio-bench", 24.4, 2.4, 0, 2.0, 2.9, 0.42, FABRIC));
    list.push(box("studio-console", 24.5, 2.6, 0.48, 1.75, 2.4, 0.16, { top: "#374666", left: "#1c2e4d", right: "#253552" }));
    for (let i = 0; i < 4; i++) { list.push(...chair(`mc-a${i}`, 17.8 + i * 1.1, 2.0), ...chair(`mc-b${i}`, 17.8 + i * 1.1, 5.0)); }
    list.push({ depth: 23.8 + 8 + 0.1, node: (
      <g key="glass" className={s.glass}>
        <polygon points={pts([16.6, 8, 0], [23.8, 8, 0], [23.8, 8, 3], [16.6, 8, 3])} />
        <polygon points={pts([16.6, 0.2, 0], [16.6, 8, 0], [16.6, 8, 3], [16.6, 0.2, 3])} />
        <polyline points={pts([16.6, 0.2, 3], [16.6, 8, 3], [23.8, 8, 3])} className={s.glassEdge} />
      </g>
    ) });
    // Desks with chairs for humans and managers; seats without a person stay empty (no invented staff).
    humans.forEach((p, i) => {
      const [sx, sy] = HUMAN_SEATS[i % HUMAN_SEATS.length];
      list.push(...chair(`hc-${p.id}`, sx - 0.4, sy - 0.75), ...desk(`hd-${p.id}`, sx - 1.2, sy + 0.25, "#64d7f5", true), person(p, sx, sy - 0.35, selected === p.id, onSelect, lang));
    });
    managerPeople.forEach((p, i) => {
      const [sx, sy] = AI_SEATS[i % AI_SEATS.length];
      list.push(...chair(`ac-${p.id}`, sx - 0.4, sy - 0.75), ...desk(`ad-${p.id}`, sx - 1.2, sy + 0.25, `hsl(${p.hue ?? 250} 80% 70%)`, !p.offline), person(p, sx, sy - 0.35, selected === p.id, onSelect, lang));
    });
    return list.sort((a, b) => a.depth - b.depth);
  }, [humans, managerPeople, selected, onSelect, lang]);

  // Wall screen (left wall, x = 0): live counts from stored data, laid on the wall plane.
  const [sx0, sy0] = px(0, 13.4, 3.4);
  const screenLines: [string, number | null][] = [[t("Tareas activas", "Active tasks"), screen.active], [t("Vencidas", "Overdue"), screen.overdue], [t("Completadas", "Completed"), screen.done], [t("Mensajes sin leer", "Unread messages"), screen.unread]];

  return (
    <div className={s.wrap}>
      <svg ref={svg} className={s.svg} viewBox={viewBox} role="group" aria-label={t("Sede de Avalon en vista isométrica. Selecciona a una persona o manager.", "Avalon HQ, isometric view. Select a person or manager.")}
        data-zoomed={camera.zoom > 1} onPointerDown={down} onPointerMove={move}
        onPointerUp={up} onPointerCancel={up} onPointerLeave={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) up(e); }}
        onDoubleClick={e => { e.preventDefault(); setCamera(c => zoomOfficeAt(c, bounds, c.zoom + 0.6, anchorAt(e.clientX, e.clientY))); }}
        onClickCapture={e => { if (suppressClick.current) { e.stopPropagation(); e.preventDefault(); suppressClick.current = false; } }}>
        <defs>
          <linearGradient id="iso-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={night ? "#050911" : "#1a2347"} /><stop offset="0.7" stopColor={night ? "#141a36" : "#5b5fa8"} /><stop offset="1" stopColor={night ? "#2a2357" : "#b39bd6"} />
          </linearGradient>
          <linearGradient id="iso-floor" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#1a2132" /><stop offset="0.55" stopColor="#111827" /><stop offset="1" stopColor="#0b101b" />
          </linearGradient>
          <radialGradient id="iso-pool" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="rgba(183,233,255,0.16)" /><stop offset="1" stopColor="rgba(183,233,255,0)" /></radialGradient>
          <filter id="iso-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" /></filter>
        </defs>

        {/* Walls with floor-to-ceiling glass and the city behind. */}
        <polygon points={pts([0, 0, 0], [W, 0, 0], [W, 0, H], [0, 0, H])} fill="url(#iso-sky)" />
        <polygon points={pts([0, 0, 0], [0, D, 0], [0, D, H], [0, 0, H])} fill="url(#iso-sky)" />
        <Skyline wall="a" />
        <Skyline wall="b" />
        {Array.from({ length: Math.floor(W / 2) + 1 }, (_, i) => <polyline key={`ma${i}`} points={pts([i * 2, 0, 0.15], [i * 2, 0, H])} className={s.mullion} />)}
        {Array.from({ length: Math.floor(D / 2) + 1 }, (_, i) => <polyline key={`mb${i}`} points={pts([0, i * 2, 0.15], [0, i * 2, H])} className={s.mullion} />)}
        <polygon points={pts([0, 0, H], [W, 0, H], [W, 0, H + 0.35], [0, 0, H + 0.35])} className={s.lintel} />
        <polygon points={pts([0, 0, H], [0, D, H], [0, D, H + 0.35], [0, 0, H + 0.35])} className={s.lintel} />
        <polyline points={pts([0, D, H], [0, 0, H], [W, 0, H])} className={s.cove} filter="url(#iso-glow)" />
        <polyline points={pts([0, D, H], [0, 0, H], [W, 0, H])} className={s.coveLine} />

        {/* Live wall screen. */}
        <g transform={`matrix(${COS} ${-SIN} 0 1 ${sx0} ${sy0})`} className={s.screen}>
          <rect x={0} y={0} width={150} height={92} rx={4} className={s.screenBg} />
          <text x={10} y={16} className={s.screenTitle}>{t("Operación · registros", "Operations · records")}</text>
          {screenLines.map(([label, value], i) => (
            <g key={label} transform={`translate(10 ${32 + i * 15})`}>
              <text className={s.screenLabel}>{label}</text>
              <text x={130} textAnchor="end" className={s.screenValue}>{value === null ? "—" : value}</text>
            </g>
          ))}
        </g>

        {/* Floor: polished stone tiles and light pools. */}
        <polygon points={pts([0, 0, 0], [W, 0, 0], [W, D, 0], [0, D, 0])} fill="url(#iso-floor)" />
        {Array.from({ length: Math.floor(W / 2) }, (_, i) => <polyline key={`fx${i}`} points={pts([(i + 1) * 2, 0, 0], [(i + 1) * 2, D, 0])} className={s.tile} />)}
        {Array.from({ length: Math.floor(D / 2) }, (_, i) => <polyline key={`fy${i}`} points={pts([0, (i + 1) * 2, 0], [W, (i + 1) * 2, 0])} className={s.tile} />)}
        {[[12, 6], [12, 13], [23, 5], [4, 4]].map(([x, y], i) => { const [cx, cy] = px(x, y); return <ellipse key={`pool${i}`} cx={cx} cy={cy} rx={150} ry={75} fill="url(#iso-pool)" />; })}
        <polyline points={pts([0, D, 0], [W, D, 0], [W, 0, 0])} className={s.edge} />

        {/* Ambient control island: purely decorative glow, not simulated live execution. */}
        <g aria-hidden="true">
          <ellipse cx={px(11, 7.0, 0)[0]} cy={px(11, 7.0, 0)[1]} rx={84} ry={43} className={s.floorHalo} />
          <ellipse cx={px(11, 7.0, 0.65)[0]} cy={px(11, 7.0, 0.65)[1]} rx={29} ry={13} className={s.holoRing} />
          <ellipse cx={px(11, 7.0, 0.78)[0]} cy={px(11, 7.0, 0.78)[1]} rx={19} ry={8} className={s.holoCore} />
          <circle cx={px(11, 7.0, 1.04)[0]} cy={px(11, 7.0, 1.04)[1]} r={3} className={s.ambientLight} />
        </g>
        {items.map(i => i.node)}

        {/* Zone labels on the floor plane. */}
        {([[t("Recepción", "Reception"), 3.1, 8.5], [t("Lounge", "Lounge"), 4.4, 6.3], [t("Sala de reuniones", "Meeting room"), 20.2, 8.9], [t("Equipo", "Team"), 11.6, 2.2], [t("Estudio", "Studio"), 25.2, 6.5], [t("Managers virtuales", "Virtual managers"), 12.2, 17.7]] as [string, number, number][]).map(([label, x, y]) => {
          const [lx, ly] = px(x, y);
          return <text key={label} x={lx} y={ly} textAnchor="middle" className={s.zone}>{label}</text>;
        })}
      </svg>
      <div className={s.runtimeStatus} role="status" aria-live="polite">
        <span className={s.runtimeDot} data-recent={recentChecks === 5 && historyConnection === "available"} />
        <strong>{t("Managers · ejecuciones reales", "Managers · verified runs")}</strong>
        <span>{historyConnection === "available"
          ? `${recentChecks}/5 ${t("reportes recientes", "recent reports")} · ${activeWorkers} ${t("ejecutando ahora", "running now")} · ${t("última lectura", "last read")} ${checkedAt ? new Date(checkedAt).toLocaleTimeString(lang === "en" ? "en-US" : "es-US", { hour: "2-digit", minute: "2-digit" }) : "—"}`
          : historyConnection === "checking" ? t("Comprobando historial…", "Checking history…")
          : historyConnection === "not_installed" ? t("El ejecutor aún no está instalado", "Worker not installed yet")
          : t("Historial no disponible · sin reportes verificados", "History unavailable · no verified reports")}</span>
        <small>{t("GitHub comprueba cada hora si el workflow está activo. Esta pantalla consulta cada 20 s; animaciones decorativas.",
          "GitHub checks hourly when its workflow is enabled. This screen reads every 20 s; motion is decorative.")}</small>
      </div>
      <p className={s.gestureHint}>{t("Dos dedos para zoom · arrastra para recorrer · doble toque para acercar", "Pinch to zoom · drag to pan · double tap to zoom")}</p>
      <div className={s.controls} role="group" aria-label={t("Cámara", "Camera")}>
        <span className={s.zoomReadout} aria-live="off">{Math.round(camera.zoom * 100)}%</span>
        <button type="button" onClick={() => zoomBy(0.35)} aria-label={t("Acercar", "Zoom in")} disabled={camera.zoom >= OFFICE_MAX_ZOOM}>+</button>
        <button type="button" onClick={() => zoomBy(-0.35)} aria-label={t("Alejar", "Zoom out")} disabled={camera.zoom <= OFFICE_MIN_ZOOM}>−</button>
        <button type="button" onClick={fullView} aria-label={t("Vista completa", "Full view")} disabled={camera.zoom === OFFICE_MIN_ZOOM && camera.panX === 0 && camera.panY === 0}>⤢</button>
      </div>
    </div>
  );
}

/** Deterministic skyline on a wall plane (no randomness), seen through the glass. */
function Skyline({ wall }: { wall: "a" | "b" }) {
  const len = wall === "a" ? W : D;
  const towers = Array.from({ length: Math.floor(len / 1.1) }, (_, i) => ({ u: i * 1.1 + 0.1, w: 0.8 + ((i * 7) % 3) * 0.15, h: 1.2 + ((i * 13) % 7) * 0.42 }));
  const at = (u: number, z: number): [number, number, number] => (wall === "a" ? [u, 0, z] : [0, u, z]);
  return (
    <g className={s.city}>
      {towers.map((tw, i) => (
        <g key={i}>
          <polygon points={pts(at(tw.u, 0.15), at(tw.u + tw.w, 0.15), at(tw.u + tw.w, 0.15 + tw.h), at(tw.u, 0.15 + tw.h))} className={s.tower} />
          {Array.from({ length: Math.floor(tw.h / 0.4) }, (_, f) => ((f + i) % 3 === 0 ? (
            <polyline key={f} points={pts(at(tw.u + 0.12, 0.35 + f * 0.4), at(tw.u + tw.w - 0.12, 0.35 + f * 0.4))} className={s.window} />
          ) : null))}
        </g>
      ))}
    </g>
  );
}
