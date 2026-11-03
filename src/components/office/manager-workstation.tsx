"use client";

import { useEffect, useState } from "react";
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
type RunRecord = {
  run_key: string; manager: string; status: string; display_status: string;
  started_at: string; finished_at: string | null; lease_until: string;
  result: ManagerReport | null;
};
const empty = (): Status => ({ busy: false, result: null, error: null });

/** Real on-demand DB checks, never an assertion of autonomous background execution. */
export function ManagerWorkstation({ lang }: { lang: string }) {
  const en = lang === "en";
  const [status, setStatus] = useState<Record<ManagerCode, Status>>({
    ren: empty(), shin: empty(), haru: empty(), sora: empty(), kenji: empty(),
  });
  const [batch, setBatch] = useState(false);
  const [recent, setRecent] = useState<Partial<Record<ManagerCode, RunRecord>>>({});
  const [historyStatus, setHistoryStatus] = useState("not_loaded");
  const [queue, setQueue] = useState<Partial<Record<ManagerCode, string>>>({});
  const [queuing, setQueuing] = useState<ManagerCode | null>(null);
  const refreshHistory = async () => {
    try {
      const res = await fetch("/admin/workspace/crm/office/manager-work/history/api", {
        credentials: "same-origin", cache: "no-store",
      });
      if (!res.ok) throw new Error("no_history");
      const data = await res.json();
      setRecent(data.last ?? {});
      setHistoryStatus("loaded");
    } catch {
      setHistoryStatus("unavailable");
    }
  };
  useEffect(() => { void refreshHistory(); }, []);
  const queueCheck = async (manager: ManagerCode) => {
    setQueuing(manager);
    setQueue(prev => ({ ...prev, [manager]: "" }));
    try {
      const response = await fetch("/admin/workspace/crm/office/api", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "agent_request", agent: manager,
          body: "AVALON_MANAGER_CHECK_V1", ref_type: null, ref_id: null }),
      });
      if (!response.ok) throw new Error("queue_unavailable");
      setQueue(prev => ({ ...prev, [manager]: en
        ? "Request registered. It is not completed until a worker result appears below."
        : "Solicitud registrada. No está completada hasta que aparezca un resultado del ejecutor." }));
    } catch {
      setQueue(prev => ({ ...prev, [manager]: en
        ? "Could not register request. Verify Office staging migration."
        : "No se pudo registrar. Verifica la migración de Oficina en staging." }));
    } finally {
      setQueuing(null);
    }
  };
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
      ? "Manual checks run under your owner permissions. When the isolated staging runner is configured, its scheduled checks can run while this page is closed; none of these jobs edits code or calls AI."
      : "Las comprobaciones manuales usan tus permisos owner. Si está configurado el ejecutor aislado, sus consultas horarias pueden ejecutarse con la página cerrada; ninguna edita código ni llama a IA."}</p>
    <p role="note" style={{ opacity: 0.85 }}>{en
      ? "Only fixed diagnostic requests are eligible for the staging runner. Free-form messages and ChatGPT programming agents remain separate and are not executed from this Office."
      : "Solo las solicitudes de diagnóstico predefinidas se pueden ejecutar mediante este runner de staging. Los mensajes libres y los agentes programadores de ChatGPT siguen separados."}</p>
    <button type="button" onClick={() => void runAll()} disabled={batch || codes.some(c => status[c].busy)}
      style={{ padding: "10px 18px", margin: "14px 0 22px", cursor: "pointer" }}>
      {batch ? (en ? "Running checks…" : "Ejecutando consultas…") : (en ? "Run all five now" : "Ejecutar las cinco ahora")}
    </button>
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <strong>{en ? "Persisted hourly activity" : "Actividad horaria registrada"}</strong>
      <button type="button" onClick={() => void refreshHistory()}>
        {en ? "Refresh history" : "Actualizar historial"}
      </button>
      {historyStatus === "unavailable" && <small role="status">{en
        ? "No verified history. The staging migration or runner may be unavailable."
        : "Sin historial verificable. Puede faltar la migración o el ejecutor de staging."}</small>}
    </div>
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
          <button type="button" disabled={queuing !== null}
            onClick={() => void queueCheck(code)} style={{ padding: "8px 12px", cursor: "pointer", marginLeft: 8 }}>
            {queuing === code ? (en ? "Registering…" : "Registrando…")
              : en ? "Queue a staged check" : "Encolar comprobación"}
          </button>
          {queue[code] && <p role="status">{queue[code]}</p>}
          {recent[code] && <div style={{ padding: "10px 0", borderTop: "1px solid #566" }}>
            <strong>{en ? "Last recorded worker run" : "Última ejecución del worker"}</strong>
            <p>{recent[code]?.display_status} · {new Date(recent[code]!.started_at).toLocaleString(en ? "en-US" : "es-US")}</p>
            {recent[code]?.result?.status === "completed" && <>
              <p>{recent[code]?.result?.nextAction}</p>
              <dl>{recent[code]?.result?.metrics?.map(m => <div key={m.key}>
                <dt>{m.label}</dt><dd>{m.count}</dd>
              </div>)}</dl>
            </>}
          </div>}
          {!recent[code] && historyStatus === "loaded" && <p>{en
            ? "No scheduled execution recorded for this manager."
            : "Sin ejecución programada registrada para este manager."}</p>}
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
