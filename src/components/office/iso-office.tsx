"use client";
import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import s from "./iso-office.module.css";

/**
 * Live isometric HQ ("dollhouse" view from above). Everything is drawn in SVG from code: architecture,
 * furniture and people. People are real members (from the directory) and the five virtual AI managers;
 * every badge and screen value comes from stored data passed in as props. Nothing here is simulated.
 */
export type IsoPerson = {
  id: string; kind: "human" | "ai"; name: string; initials: string; subtitle: string; hue?: number;
  photo?: string | null; open: number; overdue: number; unread: number; recentMinutes: number | null; offline?: boolean; presence?: "active" | "busy" | "inactive";
};
type Props = {
  people: IsoPerson[]; selected: string | null; onSelect: (id: string) => void; lang: "es" | "en";
  screen: { active: number | null; overdue: number | null; done: number | null; unread: number };
};

const S = 30; // px per world unit
const W = 24, D = 16, H = 4.6;
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
  const stateText = p.presence === "active" ? (lang === "en" ? "Active" : "Activo") : p.presence === "busy" ? (lang === "en" ? "Busy" : "Ocupado") : (lang === "en" ? "Inactive" : "Inactivo");
  const label = `${p.name} · ${p.subtitle}${p.kind === "human" ? ` · ${stateText} (horario/calendario)` : ""}${p.kind === "ai" ? (lang === "en" ? " · virtual AI manager" : " · manager virtual de IA") : ""} · ${p.open} ${p.kind === "ai" ? (lang === "en" ? "logged requests" : "solicitudes registradas") : (lang === "en" ? "open tasks" : "tareas abiertas")}${p.unread ? ` · ${p.unread} ${lang === "en" ? "unread" : "sin leer"}` : ""}`;
  const key = (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(p.id); } };
  const tagLabel = p.name + (p.kind === "ai" ? " · IA" : "");
  const half = Math.max(36, tagLabel.length * 3.7 + 18);
  const humanLamp = p.presence === "active" ? s.lampOn : p.presence === "busy" ? s.lampBusy : s.lampInactive;
  return {
    depth: x + y + 0.9,
    node: (
      <g key={`p-${p.id}`} className={s.person} data-kind={p.kind} data-selected={selected} data-offline={p.offline || undefined}
        role="button" tabIndex={0} aria-label={label} aria-pressed={selected} onClick={() => onSelect(p.id)} onKeyDown={key}>
        <ellipse cx={fx} cy={fy} rx={52} ry={26} className={s.ring} />
        <g transform={`translate(${fx0} ${fy0}) scale(${K}) translate(${-fx0} ${-fy0})`}><g className={s.body}>
          <path d={`M ${bx - 17} ${by + 18} Q ${bx - 18} ${by - 16} ${bx} ${by - 18} Q ${bx + 18} ${by - 16} ${bx + 17} ${by + 18} Z`} fill={torso} />
          <path d={`M ${bx - 5} ${by - 17} L ${bx} ${by - 6} L ${bx + 5} ${by - 17}`} fill="none" stroke={p.kind === "ai" ? "#e7e2ff" : "#bba88e"} strokeWidth={1.4} />
          <circle cx={hx} cy={hy0} r={13} fill={p.kind === "ai" ? `hsl(${p.hue ?? 250} 30% 24%)` : "#1b2236"} stroke={p.kind === "ai" ? `hsl(${p.hue ?? 250} 70% 75%)` : "#bba88e"} strokeWidth={1.4} />
          {p.photo
            ? <image href={p.photo} x={hx - 12} y={hy0 - 12} width={24} height={24} style={{ clipPath: "circle(12px at center)" }} preserveAspectRatio="xMidYMid slice" />
            : <text x={hx} y={hy0 + 4} textAnchor="middle" className={s.initials}>{p.initials}</text>}
        </g></g>
        <g className={s.tag} transform={`translate(${hx} ${hy - 36})`}>
          <rect x={-half} y={-12} width={half * 2} height={23} rx={11.5} className={s.tagBg} />
          {p.kind === "ai" && <circle cx={-half + 10} cy={-1} r={3.5} className={p.offline ? s.lampOff : s.lampOn} />}
          {p.kind === "human" && <circle cx={-half + 10} cy={-1} r={3.5} className={humanLamp} />}
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
const HUMAN_SEATS: [number, number][] = [[9.6, 4.4], [13.6, 4.4], [8.0, 8.4], [12.0, 8.4], [15.6, 10.6], [4.2, 9.6], [19.6, 11.0], [22.0, 14.2]];
const AI_SEATS: [number, number][] = [[3.4, 14.2], [7.2, 13.2], [11.2, 12.8], [15.2, 13.6], [19.0, 14.8]];

export function IsoOffice({ people, selected, onSelect, lang, screen }: Props) {
  const t = useCallback((es: string, en: string) => (lang === "en" ? en : es), [lang]);
  const humans = people.filter(p => p.kind === "human");
  const agents = people.filter(p => p.kind === "ai");
  const hour = new Date().getHours();
  const night = hour >= 19 || hour < 7;

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<[number, number]>([0, 0]);
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  // Scene bounds in screen space.
  const minX = px(0, D)[0] - 20, maxX = px(W, 0)[0] + 20, minY = px(0, 0, H)[1] - 30, maxY = px(W, D)[1] + 30;
  const fullW = maxX - minX, fullH = maxY - minY;
  const vw = fullW / zoom, vh = fullH / zoom;
  const clampPan = useCallback((x: number, y: number, z: number): [number, number] => {
    const mx = (fullW - fullW / z) / 2, my = (fullH - fullH / z) / 2;
    return [Math.max(-mx, Math.min(mx, x)), Math.max(-my, Math.min(my, y))];
  }, [fullW, fullH]);
  const viewBox = `${minX + (fullW - vw) / 2 + pan[0]} ${minY + (fullH - vh) / 2 + pan[1]} ${vw} ${vh}`;
  const setZ = (z: number) => { const nz = Math.max(1, Math.min(2.6, z)); setZoom(nz); setPan(p => clampPan(p[0], p[1], nz)); };

  const down = (e: ReactPointerEvent<SVGSVGElement>) => { if (zoom > 1) drag.current = { x: e.clientX, y: e.clientY, px: pan[0], py: pan[1], moved: false }; };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current, el = svg.current;
    if (!d || !el) return;
    const k = vw / el.clientWidth, dx = (e.clientX - d.x) * k, dy = (e.clientY - d.y) * k;
    if (Math.abs(dx) + Math.abs(dy) > 4) { d.moved = true; el.setPointerCapture(e.pointerId); }
    setPan(clampPan(d.px - dx, d.py - dy, zoom));
  };
  const up = () => { drag.current = null; };

  const items = useMemo(() => {
    const list: Item[] = [];
    // Lounge (back-left): rug, sofa, table, plants.
    list.push({ depth: 0.5, node: <polygon key="rug" points={pts([1.2, 1.4, 0.01], [7.6, 1.4, 0.01], [7.6, 6.4, 0.01], [1.2, 6.4, 0.01])} className={s.rug} /> });
    list.push(box("sofa-a", 1.4, 1.5, 0, 5.2, 1.1, 0.45, FABRIC), box("sofa-a-back", 1.4, 1.2, 0.45, 5.2, 0.35, 0.5, FABRIC));
    list.push(box("sofa-b", 1.3, 2.7, 0, 1.1, 3.2, 0.45, FABRIC));
    list.push(box("table-l", 3.4, 3.4, 0.3, 2.4, 1.4, 0.1, CHAMP), box("table-l-base", 4.2, 3.9, 0, 0.8, 0.4, 0.3, TITAN));
    list.push(plant("pl-1", 0.4, 0.4, 1.5), plant("pl-2", 8.4, 0.4, 1.2), plant("pl-3", 0.4, 7.4, 1.3), plant("pl-4", 0.4, 14.6, 1.4), plant("pl-5", 22.8, 14.8, 1.3), plant("pl-6", 15.2, 0.4, 1.1), plant("pl-7", 22.8, 9.6, 1.1));
    // Meeting room (right): table + chairs; glass walls added on top with low opacity.
    list.push(box("m-table", 17.6, 3.0, 0.72, 4.6, 1.8, 0.09, WOOD), box("m-table-base", 19.4, 3.6, 0, 1.0, 0.6, 0.72, TITAN));
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
    agents.forEach((p, i) => {
      const [sx, sy] = AI_SEATS[i % AI_SEATS.length];
      list.push(...chair(`ac-${p.id}`, sx - 0.4, sy - 0.75), ...desk(`ad-${p.id}`, sx - 1.2, sy + 0.25, `hsl(${p.hue ?? 250} 80% 70%)`, !p.offline), person(p, sx, sy - 0.35, selected === p.id, onSelect, lang));
    });
    return list.sort((a, b) => a.depth - b.depth);
  }, [humans, agents, selected, onSelect, lang]);

  // Wall screen (left wall, x = 0): live counts from stored data, laid on the wall plane.
  const [sx0, sy0] = px(0, 13.4, 3.4);
  const screenLines: [string, number | null][] = [[t("Tareas activas", "Active tasks"), screen.active], [t("Vencidas", "Overdue"), screen.overdue], [t("Completadas", "Completed"), screen.done], [t("Mensajes sin leer", "Unread messages"), screen.unread]];

  return (
    <div className={s.wrap}>
      <svg ref={svg} className={s.svg} viewBox={viewBox} role="group" aria-label={t("Sede de Avalon en vista isométrica. Selecciona a una persona o manager.", "Avalon HQ, isometric view. Select a person or manager.")}
        data-zoomed={zoom > 1} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
        onClickCapture={e => { if (drag.current?.moved) { e.stopPropagation(); e.preventDefault(); } }}>
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
          <text x={10} y={16} className={s.screenTitle}>{t("Operación en vivo", "Live operations")}</text>
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

        {items.map(i => i.node)}

        {/* Zone labels on the floor plane. */}
        {([[t("Lounge", "Lounge"), 4.4, 7.2], [t("Sala de reuniones", "Meeting room"), 20.2, 8.9], [t("Equipo", "Team"), 11.6, 2.2], [t("Managers de IA · virtuales", "AI managers · virtual"), 11.2, 16.2]] as [string, number, number][]).map(([label, x, y]) => {
          const [lx, ly] = px(x, y);
          return <text key={label} x={lx} y={ly} textAnchor="middle" className={s.zone}>{label}</text>;
        })}
      </svg>
      <div className={s.controls} role="group" aria-label={t("Cámara", "Camera")}>
        <button type="button" onClick={() => setZ(zoom + 0.4)} aria-label={t("Acercar", "Zoom in")}>+</button>
        <button type="button" onClick={() => setZ(zoom - 0.4)} aria-label={t("Alejar", "Zoom out")} disabled={zoom <= 1}>−</button>
        <button type="button" onClick={() => { setZoom(1); setPan([0, 0]); }} aria-label={t("Vista completa", "Full view")} disabled={zoom === 1}>⤢</button>
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
