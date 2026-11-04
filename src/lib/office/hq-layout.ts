// Avalon HQ 3D — station layout and truthful status mapping (pure; no React, no three.js).
// Zone A: the five software managers (deterministic executors, NOT AI models).
// Zone B: five workstations RESERVED for future human members of Samuel's team: no person, no account, no automation.
import type { ManagerActivity, ManagerKey, ManagerStatus } from "@/lib/agents/policy";

export type StationKind = "manager" | "reserved";
export type Station = {
  id: string; kind: StationKind; zone: "A" | "B"; label: string; role: string;
  manager?: ManagerKey; x: number; z: number; facing: number;
};

const ROLES: Record<ManagerKey, string> = {
  ren: "Dirección de operaciones · coordina misiones",
  shin: "Seguridad · revisión de privilegios y RLS",
  haru: "CRM · seguimientos y tareas internas",
  sora: "Radar · cola de oportunidades con evidencia",
  kenji: "Calidad · datos, consumo y costes",
};
const MANAGERS: ManagerKey[] = ["ren", "shin", "haru", "sora", "kenji"];

/** Two arcs facing the central operations table: managers in front (z<0), reserved team behind (z>0). */
export const HQ_STATIONS: readonly Station[] = [
  ...MANAGERS.map((m, i): Station => {
    const a = Math.PI * (0.18 + 0.16 * i);
    return { id: m, kind: "manager", zone: "A", label: m.toUpperCase(), role: ROLES[m], manager: m, x: Math.round(-Math.cos(a) * 900) / 100, z: Math.round(-Math.sin(a) * 700) / 100, facing: Math.atan2(Math.cos(a) * 9, Math.sin(a) * 7) };
  }),
  ...[0, 1, 2, 3, 4].map((i): Station => {
    const a = Math.PI * (0.18 + 0.16 * i);
    return { id: `samuel-${i + 1}`, kind: "reserved", zone: "B", label: `Estación ${6 + i}`, role: "Próxima incorporación — Equipo de Samuel", x: Math.round(-Math.cos(a) * 900) / 100, z: Math.round(Math.sin(a) * 700) / 100, facing: Math.atan2(Math.cos(a) * 9, -Math.sin(a) * 7) };
  }),
];

export type StationView = {
  status: ManagerStatus | "reserved"; animate: boolean; color: number; headline: string; detail: string;
  run_id: string | null; error_code: string | null; finished_at: string | null;
};

const COLOR: Record<StationView["status"], number> = {
  idle: 0x47507a, queued: 0x8f7cff, running: 0x22e6ff, completed: 0x2fd39a, failed: 0xff5a6e, blocked: 0xffb347, stale: 0x9aa3c7, reserved: 0xc04bd9,
};
const LABEL: Record<StationView["status"], string> = {
  idle: "Sin ejecuciones", queued: "En cola", running: "Ejecutando ahora", completed: "Completado", failed: "Falló", blocked: "Bloqueado", stale: "Resultado antiguo", reserved: "Próxima incorporación — Equipo de Samuel",
};

/** Only a run that is genuinely `running` animates. Reserved seats never show activity. */
export function stationView(station: Station, activity: ManagerActivity[] | null): StationView {
  if (station.kind === "reserved") {
    return { status: "reserved", animate: false, color: COLOR.reserved, headline: LABEL.reserved,
      detail: "Estación vacía. Sin cuenta, sin IA y sin automatizaciones. Se asigna al incorporar a una persona mediante invitación.", run_id: null, error_code: null, finished_at: null };
  }
  const a = activity?.find(x => x.manager_key === station.manager) ?? null;
  const status: ManagerStatus = a?.status ?? "idle";
  return {
    status, animate: status === "running", color: COLOR[status], headline: LABEL[status],
    detail: a?.result_summary || (activity ? "Todavía no hay resultados registrados para este manager." : "Estado no disponible: no se pudo leer la actividad."),
    run_id: a?.run_id ?? null, error_code: a?.error_code ?? null, finished_at: a?.finished_at ?? null,
  };
}

export const statusLabel = (s: StationView["status"]) => LABEL[s];
