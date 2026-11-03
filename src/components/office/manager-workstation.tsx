"use client";

import { useState } from "react";
import { MANAGER_JOBS, type ManagerCode, type ManagerReport } from "@/lib/office/manager-work";

const codes: readonly ManagerCode[] = ["ren", "shin", "haru", "sora", "kenji"];
const hints: Record<ManagerCode, string> = {
  ren: "Coordinación y bloqueos pendientes",
  shin: "Membresías y solicitudes",
  haru: "Pipeline, ventas y tareas",
  sora: "Radar: aprobados y convertidos",
  kenji: "Órdenes bloqueadas y vencimientos",
};
type Status = { busy: boolean; result: ManagerReport | null; error: string | null };
const empty = (): Status => ({ busy: false, result: null, error: null });

/** Real on-demand DB checks, never an assertion of autonomous background execution. */
export function ManagerWorkstation({ lang }: { lang: string }) {
  const en = lang === "en";
  const [status, setStatus] = useState<Record<ManagerCode, Status>>({
    ren: empty(), shin: empty(), haru: empty(), sora: empty(), kenji: empty(),
  });
  const [batch, setBatch] = useState(false);
  const runOne = async (manager: ManagerCode) => {
    setStatus(prev => ({ ...prev, [manager]: { ...prev[manager], busy: true, error: null } }));
    try {
      const response = await fetch("/admin/workspace/crm/office/manager-work/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ manager }),
      });
      const data: unknown = await response.json();
      if (!data || typeof data !== "object" || !("status" in data)) throw new Error(en ? "Check unavailable" : "No se pudo realizar la consulta");
      const result = data as ManagerReport;
      if (result.status !== "completed" && result.status !== "unavailable") throw new Error("Invalid result");
      setStatus(prev => ({ ...prev, [manager]: { busy: false, result, error: null } }));
    } catch (e) {
      setStatus(prev => ({ ...prev, [manager]: {
        busy: false, result: null, error: e instanceof Error ? e.message : String(e),
      } }));
    }
  };
  const runAll = async () => {
    setBatch(true);
    try { for (const code of codes) await runOne(code); }
    finally { setBatch(false); }
  };
  return <section aria-labelledby="office-managers-work-title" style={{ padding: "24px", maxWidth: 1140, margin: "auto" }}>
    <h1 id="office-managers-work-title">{en ? "Manager workstations" : "Estaciones de trabajo de los managers"}</h1>
    <p>{en
      ? "These five checks execute real read-only database queries under your owner permissions. They do not run an AI model, create PRs or work while this page is closed."
      : "Estas cinco tareas ejecutan consultas reales y de solo lectura con tus permisos owner. No ejecutan un modelo de IA, no crean PRs ni trabajan mientras esta página está cerrada."}</p>
    <p role="note" style={{ opacity: 0.85 }}>{en
      ? "Hourly ChatGPT automations are independent and are not connected to this office. Registered free-form requests remain pending until a real worker is integrated."
      : "Las automatizaciones horarias de ChatGPT son independientes y todavía no están conectadas a esta Oficina. Las solicitudes libres registradas siguen pendientes hasta conectar un ejecutor real."}</p>
    <button type="button" onClick={() => void runAll()} disabled={batch || codes.some(c => status[c].busy)}
      style={{ padding: "10px 18px", margin: "14px 0 22px", cursor: "pointer" }}>
      {batch ? (en ? "Running checks…" : "Ejecutando consultas…") : (en ? "Run all five now" : "Ejecutar las cinco ahora")}
    </button>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(255px, 1fr))", gap: 14 }}>
      {codes.map(code => {
        const job = MANAGER_JOBS[code], s = status[code];
        return <article key={code} style={{ border: "1px solid var(--color-border, #526078)", borderRadius: 14, padding: 18, minWidth: 0 }}>
          <h2 style={{ fontSize: "1.1rem" }}>{job.title}</h2>
          <p style={{ opacity: 0.8 }}>{hints[code]}</p>
          <p aria-live="polite">{s.busy ? (en ? "Query in progress" : "Consulta en curso")
            : s.result?.status === "completed" ? (en ? "Check completed" : "Consulta completada")
            : s.result?.status === "unavailable" ? (en ? "Unavailable" : "No disponible")
            : en ? "Not run in this session" : "No ejecutado en esta sesión"}</p>
          <button type="button" disabled={s.busy || batch} onClick={() => void runOne(code)}
            style={{ padding: "8px 12px", cursor: "pointer", marginBottom: 12 }}>
            {en ? "Run check" : "Ejecutar comprobación"}
          </button>
          {s.error && <p role="alert">{s.error}</p>}
          {s.result && <div>
            <small>{en ? "Verified at:" : "Verificado:"} {new Date(s.result.observedAt).toLocaleString(en ? "en-US" : "es-US")}</small>
            {s.result.metrics.length > 0 && <dl>{s.result.metrics.map(metric =>
              <div key={metric.key} style={{ marginTop: 9 }}>
                <dt style={{ opacity: 0.8 }}>{metric.label}</dt>
                <dd style={{ marginLeft: 0, fontWeight: 700 }}>{metric.count}</dd>
              </div>)}</dl>}
            <p>{s.result.nextAction}</p>
            <small style={{ opacity: 0.75 }}>{s.result.note}</small>
          </div>}
        </article>;
      })}
    </div>
  </section>;
}
