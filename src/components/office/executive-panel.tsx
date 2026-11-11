"use client";
// Executive view of Avalon HQ: only stored records. Missing sources are shown as "Sin datos" / "No verificado".
import { useEffect, useState } from "react";
import styles from "./executive-panel.module.css";

type Exec = {
  window_days: number;
  runs: { received: number; pending: number; active: number; completed: number; completed_with_evidence: number; failed_or_blocked: number; scheduled: number };
  by_manager: Record<string, { total: number; completed: number; failed: number }>;
  errors: { manager: string; title: string; code: string | null; at: string }[];
  recent: { manager: string; title: string; status: string; at: string }[];
  missions: { total: number; completed: number } | null;
  control: { kill_switch: boolean | null; automatic_enabled: boolean | null };
  ai: { requests: number; tokens: number; cost_usd: number; providers: string[] } | null;
};
const STATUS: Record<string, string> = { queued: "En cola", running: "En ejecución", completed: "Completada", failed: "Fallida", blocked: "Bloqueada" };
const fmt = (v: string) => new Date(v).toLocaleString("es", { dateStyle: "short", timeStyle: "short" });

export function ExecutivePanel() {
  const [d, setD] = useState<Exec | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => fetch("/admin/workspace/crm/office/executive", { cache: "no-store" })
      .then(async r => { if (!r.ok) throw new Error(); const j = await r.json(); if (alive) { setD(j); setErr(false); } })
      .catch(() => alive && setErr(true));
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const n = (v: number | null | undefined) => (v === null || v === undefined ? "Sin datos" : String(v));
  return (
    <section className={styles.exec} aria-labelledby="exec-title">
      <header><h2 id="exec-title">Vista ejecutiva</h2><p>Últimos {d?.window_days ?? 7} días · solo registros guardados</p></header>
      {err && <p role="alert" className={styles.muted}>Datos de ejecución no disponibles.</p>}
      <div className={styles.kpis}>
        {([
          ["Ejecuciones recibidas", d?.runs.received], ["Pendientes", d?.runs.pending], ["Activas", d?.runs.active],
          ["Completadas con evidencia", d?.runs.completed_with_evidence], ["Errores y bloqueos", d?.runs.failed_or_blocked], ["Programadas", d?.runs.scheduled],
        ] as const).map(([k, v]) => <div key={k} className={styles.kpi} data-tone={k === "Errores y bloqueos" && (v ?? 0) > 0 ? "danger" : undefined}><span>{k}</span><strong>{d ? n(v) : "…"}</strong></div>)}
      </div>
      <div className={styles.cols}>
        <div>
          <h3>Por manager</h3>
          <table className={styles.table}><thead><tr><th>Manager</th><th>Total</th><th>Completadas</th><th>Fallidas</th></tr></thead>
            <tbody>{Object.entries(d?.by_manager ?? {}).map(([k, v]) => <tr key={k}><td>{k.toUpperCase()}</td><td>{v.total}</td><td>{v.completed}</td><td>{v.failed}</td></tr>)}</tbody></table>
        </div>
        <div>
          <h3>Actividad reciente</h3>
          {d?.recent.length ? <ol className={styles.feed}>{d.recent.map((r, i) => <li key={i} data-status={r.status}><strong>{r.manager.toUpperCase()}</strong> {r.title}<small>{STATUS[r.status] ?? r.status} · {fmt(r.at)}</small></li>)}</ol> : <p className={styles.muted}>{d ? "Sin ejecuciones en el periodo." : "…"}</p>}
          {!!d?.errors.length && <><h3>Errores y bloqueos</h3><ul className={styles.feed}>{d.errors.map((e, i) => <li key={i} data-status="failed"><strong>{e.manager.toUpperCase()}</strong> {e.title}<small>{e.code ?? "sin código"} · {fmt(e.at)}</small></li>)}</ul></>}
        </div>
        <div>
          <h3>IA y costes</h3>
          {d?.ai ? (
            <dl className={styles.dl}><dt>Solicitudes</dt><dd>{d.ai.requests}</dd><dt>Tokens</dt><dd>{d.ai.tokens}</dd><dt>Proveedores</dt><dd>{d.ai.providers.join(", ") || "—"}</dd><dt>Coste registrado</dt><dd>${d.ai.cost_usd.toFixed(2)}</dd></dl>
          ) : (
            <p className={styles.muted}>No verificado desde la app: el registro de uso de IA (Groq/Cloudflare, coste $0) se guarda en GitHub Actions — Issue #134 — hasta aplicar la migración del AI Engine.</p>
          )}
          <h3>Integraciones y control</h3>
          <dl className={styles.dl}>
            <dt>Supabase</dt><dd>{err ? "No disponible" : d ? "Consultado ahora" : "…"}</dd>
            <dt>Misiones</dt><dd>{d?.missions ? `${d.missions.completed}/${d.missions.total} completadas` : "Sin datos"}</dd>
            <dt>Modo automático</dt><dd>{d?.control.automatic_enabled === null || !d ? "Sin datos" : d.control.automatic_enabled ? "Activado" : "Desactivado"}</dd>
            <dt>Interruptor</dt><dd>{d?.control.kill_switch === null || !d ? "Sin datos" : d.control.kill_switch ? "ACTIVO" : "Inactivo"}</dd>
            <dt>Órdenes (GitHub)</dt><dd><a href="https://github.com/avaloncoreagency/Avalon-code/issues?q=label%3Aavalon%3Atask" target="_blank" rel="noreferrer">No verificado aquí · ver Issues</a></dd>
          </dl>
        </div>
      </div>
    </section>
  );
}
