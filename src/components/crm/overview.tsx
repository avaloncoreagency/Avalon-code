"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { crmNavigation } from "@/lib/crm/domain";
import s from "./crm.module.css";

type UsageRow = {
  id?: string;
  provider?: string;
  amount?: number;
  unit?: string;
  source?: string;
  mode?: string;
  period_end?: string;
  created_at?: string;
};
type KpiPayload = {
  metrics?: { overdue?: number; pending?: number };
};
type UsagePayload = { rows?: UsageRow[] };
type OverviewData = {
  usage: UsageRow[];
  overdue: number;
  pending: number;
};
const providers = ["Codex", "Claude", "Higgsfield"] as const;
const api = "/admin/workspace/crm/api";

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function CrmOverview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch(`${api}?entity=usage&page=0`, { signal: controller.signal }),
      fetch(`${api}?entity=kpis&page=0`, { signal: controller.signal }),
    ])
      .then(async ([usageResponse, kpiResponse]) => {
        if (!usageResponse.ok || !kpiResponse.ok) {
          throw new Error("No se pudo consultar el estado del CRM.");
        }
        const usage = (await usageResponse.json()) as UsagePayload;
        const kpi = (await kpiResponse.json()) as KpiPayload;
        const overdue = kpi.metrics?.overdue;
        const pending = kpi.metrics?.pending;
        if (!isNumber(overdue) || !isNumber(pending)) {
          throw new Error("Las métricas del CRM no están disponibles.");
        }
        if (!Array.isArray(usage.rows)) {
          throw new Error("No se pudieron consultar los registros de consumo.");
        }
        if (!controller.signal.aborted) {
          setData({
            usage: usage.rows,
            overdue,
            pending,
          });
          setError("");
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setData(null);
          setError(reason instanceof Error ? reason.message : "No se pudo cargar el CRM.");
        }
      });
    return () => controller.abort();
  }, [revision]);

  return (
    <div className={s.wrap}>
      <header className={s.head}>
        <div>
          <p className={s.eyebrow}>Avalon OS / CRM</p>
          <h1 className={s.title}>Centro comercial de Avalon</h1>
          <p className={s.subtitle}>Un CRM para captar, calificar, vender y administrar clientes. El mantenimiento de la plataforma permanece fuera del CRM.</p>
        </div>
        <Link className={s.link} href="/admin/dashboard">← Dashboard principal</Link>
      </header>
      <nav aria-label="Flujo principal del CRM" className={s.tabs}>
        {crmNavigation.map((section) => (
          <Link key={section.slug} href={section.href} className={s.tab}>
            {section.label}
          </Link>
        ))}
      </nav>

      <section className={s.panel} aria-labelledby="usage-heading">
        <h2 id="usage-heading">Uso de tokens y costos</h2>
        <p className={s.muted}>Las API de consumo no están conectadas. Los valores registrados manualmente son históricos, no balances en tiempo real ni costos calculados.</p>
        <div className={s.cards}>
          {providers.map((provider) => {
            const rows = (data?.usage ?? []).filter((item) => item.provider === provider && item.mode === "manual");
            const latest = rows[0];
            return (
              <div className={s.card} key={provider}>
                <strong>{provider}</strong>
                <p className={s.muted}>Automático: no conectado</p>
                {!data && !error ? (
                  <p>Consultando registros…</p>
                ) : latest && isNumber(latest.amount) ? (
                  <p>Último registro manual: <strong>{latest.amount.toLocaleString("es")} {latest.unit || "unidades"}</strong></p>
                ) : <p>Sin registro manual disponible</p>}
              </div>
            );
          })}
        </div>
        <Link href="/admin/workspace/crm/ai-usage" className={s.link}>Ver registros manuales de consumo</Link>
      </section>

      <section className={s.panel} aria-labelledby="notifications-heading">
        <h2 id="notifications-heading">Notificaciones del CRM</h2>
        <p className={s.muted}>Indicadores derivados de los registros actuales. Aún no existe un buzón de notificaciones persistidas con confirmación de lectura o resolución.</p>
        {error ? (
          <p role="alert">{error} <button type="button" onClick={() => setRevision((n) => n + 1)}>Reintentar</button></p>
        ) : !data ? (
          <p role="status">Consultando datos autorizados del CRM…</p>
        ) : (
          <div className={s.grid}>
            <article className={s.card}>
              <h3>Urgentes</h3>
              <p><strong>{data.overdue}</strong> seguimientos de leads vencidos</p>
              <Link className={s.link} href="/admin/workspace/crm/leads">Revisar pipeline</Link>
            </article>
            <article className={s.card}>
              <h3>Normales</h3>
              <p><strong>{data.pending}</strong> actividades de leads pendientes</p>
              <Link className={s.link} href="/admin/workspace/crm/calendar">Revisar calendario</Link>
            </article>
          </div>
        )}
      </section>

      <section className={s.panel}>
        <h2>Herramientas adicionales</h2>
        <p>Consulta <Link className={s.link} href="/admin/workspace/crm/kpis">Estadísticas del CRM</Link>. La sección de <Link className={s.link} href="/admin/workspace/crm/tasks">Tareas internas</Link> todavía requiere persistencia y asignaciones verificables; no se muestran tareas de ejemplo como si fueran reales.</p>
      </section>
    </div>
  );
}
