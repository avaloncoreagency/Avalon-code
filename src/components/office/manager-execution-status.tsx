"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ManagerCode } from "@/lib/office/manager-work";

const names: Record<ManagerCode, string> = {
  ren: "REN", shin: "SHIN", haru: "HARU", sora: "SORA", kenji: "KENJI",
};
const codes = Object.keys(names) as ManagerCode[];
type RunSummary = { display_status: string; started_at: string; finished_at: string | null; source: string };
type History = { last: Partial<Record<ManagerCode, RunSummary>>; observedAt: string };

export function ManagerExecutionStatus({ lang }: { lang: string }) {
  const en = lang === "en";
  const [history, setHistory] = useState<History | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(false);
  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch("/admin/workspace/crm/office/manager-work/github-history/api", {
        credentials: "same-origin", cache: "no-store",
      });
      if (!response.ok) throw new Error("history_unavailable");
      const result = await response.json() as History;
      setHistory(result);
      setUnavailable(false);
    } catch {
      setUnavailable(true);
      setHistory(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void refresh(); }, []);
  return <section aria-labelledby="office-real-manager-work" style={{
    margin: "12px 20px", padding: "15px", borderRadius: "12px",
    border: "1px solid #41617b", background: "rgba(12,25,42,.75)",
  }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <h2 id="office-real-manager-work" style={{ fontSize: "1rem", margin: 0 }}>
        {en ? "Verified manager executions" : "Ejecuciones verificadas de los managers"}
      </h2>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button type="button" disabled={loading} onClick={() => void refresh()}>
          {loading ? (en ? "Checking…" : "Consultando…") : (en ? "Refresh" : "Actualizar")}
        </button>
        <Link href="/admin/workspace/crm/office/manager-work">
          {en ? "Open manager workstations" : "Abrir estaciones de trabajo"}
        </Link>
      </div>
    </div>
    <p style={{ fontSize: ".82rem", opacity: .8 }}>
      {en ? "Only actual stored work is displayed; no green status from a scheduler toggle."
        : "Solo se muestra trabajo realmente registrado; no se simula presencia por un interruptor activado."}
    </p>
    {unavailable && <p role="status">{en
      ? "No verifiable worker history. Staging migration or worker may not be configured."
      : "Sin historial verificable. Puede faltar la migración o la conexión del ejecutor."}</p>}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 9 }}>
      {codes.map(code => {
        const run = history?.last?.[code];
        const good = run?.display_status === "completed";
        const state = run?.display_status ?? "not_run";
        const label = state === "completed" ? (en ? "Completed" : "Completado")
          : state === "running" ? (en ? "Running" : "Trabajando")
          : state === "stale" ? (en ? "No recent activity" : "Sin actividad reciente")
          : state === "stalled" ? (en ? "Stalled" : "Interrumpido")
          : state === "failed" ? (en ? "Failed" : "Falló")
          : en ? "Not run" : "Sin ejecutar";
        return <div key={code} style={{
          borderRadius: 8, padding: "9px 10px",
          border: `1px solid ${good ? "#398a79" : "#5a6675"}`,
        }}>
          <strong>{names[code]}</strong>
          <div style={{ fontSize: ".83rem" }} role="status">{label}</div>
          {run && <small style={{ opacity: .75 }}>{new Date(run.started_at).toLocaleString(en ? "en-US" : "es-US")}</small>}
        </div>;
      })}
    </div>
  </section>;
}
