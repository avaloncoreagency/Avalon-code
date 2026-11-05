"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CrmNavigation } from "./navigation";
import { COMMON_UNITS, canonicalUnit, latestPerUnit } from "@/lib/crm/usage-units";
import s from "./crm.module.css";
import { loadCrmOverview, type CrmOverviewSnapshot } from "@/lib/crm/overview-data";

const providers = ["Codex", "Claude", "Higgsfield"] as const;
// Subscriptions/plans and API billing are different sources; manual records state which one they are.
const LABELS: Record<(typeof providers)[number], string> = { Codex: "ChatGPT / Codex", Claude: "Claude Code", Higgsfield: "Higgsfield" };

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function CrmOverview() {
  const [data, setData] = useState<CrmOverviewSnapshot | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    loadCrmOverview(fetch, controller.signal)
      .then(snapshot => { if (!controller.signal.aborted) setData(snapshot); })
      .catch(() => {
        if (!controller.signal.aborted) setData({
          usage: null, overdue: null, pending: null,
          usageError: "No se pudieron cargar los registros de consumo.",
          kpiError: "Las métricas del CRM no están disponibles.",
        });
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
      <CrmNavigation />

      <section className={s.panel} aria-labelledby="usage-heading">
        <h2 id="usage-heading">Centro de consumo de IA · Uso de tokens y costos</h2>
        <p className={s.muted}>Las API de consumo no están conectadas. Los valores registrados manualmente son históricos, no balances en tiempo real ni costos calculados. Nunca se muestra 0 cuando el valor es desconocido; suscripciones y facturación API se registran por separado indicando la fuente.</p>
        {data?.usageError && <p role="alert">{data.usageError} <button type="button" onClick={() => setRevision((n) => n + 1)}>Reintentar</button></p>}
        <div className={s.cards}>
          {providers.map((provider) => {
            const rows = (data?.usage ?? []).filter((item) => item.provider === provider && item.mode === "manual" && isNumber(item.amount));
            const perUnit = latestPerUnit(rows);
            return (
              <div className={s.card} key={provider}>
                <strong>{LABELS[provider]}</strong>
                {!data ? <p>Consultando registros…</p> : data.usageError ? <p className={s.muted}>Estado: No disponible por un error de consulta.</p> : perUnit.length === 0 ? (
                  <><p className={s.muted}>Estado: Sin datos</p><p>No disponible · registra un consumo manual desde el panel oficial del proveedor. Unidades habituales: {COMMON_UNITS.join(", ")}.</p></>
                ) : perUnit.map((latest) => {
                  const unit = canonicalUnit(latest.unit) || "unidades";
                  const amount = latest.amount as number;
                  const limit = isNumber(latest.limit_value) ? latest.limit_value : null;
                  const pct = limit ? Math.round((amount / limit) * 100) : null;
                  const stale = latest.period_end ? new Date(latest.period_end).getTime() < Date.now() : false;
                  const alert = pct !== null && pct >= (latest.threshold ?? 80);
                  return <div key={unit} data-unit={unit}>
                    <p className={s.muted}>Estado: {stale ? "Fuente desactualizada (periodo cerrado)" : "Actualización manual"} · Automático: no conectado</p>
                    <p>Consumido: <strong>{amount.toLocaleString("es")} {unit}</strong></p>
                    <p>Límite: {limit !== null ? `${limit.toLocaleString("es")} ${unit}` : "desconocido"} · Restante: {limit !== null ? `${Math.max(0, limit - amount).toLocaleString("es")} ${unit}` : "desconocido"}</p>
                    {pct !== null && <p role={alert ? "alert" : undefined}>{alert ? "⚠ " : ""}{pct}% usado (umbral {latest.threshold ?? 80}%)</p>}
                    <p className={s.muted}>Periodo: {latest.period_start ? new Date(latest.period_start).toLocaleDateString("es") : "—"} – {latest.period_end ? new Date(latest.period_end).toLocaleDateString("es") : "—"} · Fuente: {latest.source || "—"}</p>
                  </div>;
                })}
              </div>
            );
          })}
        </div>
        <Link href="/admin/workspace/crm/ai-usage" className={s.link}>Ver registros manuales de consumo</Link>
      </section>

      <section className={s.panel} aria-labelledby="notifications-heading">
        <h2 id="notifications-heading">Notificaciones del CRM</h2>
        <p className={s.muted}>Indicadores de seguimiento de leads derivados de los registros actuales. Los avisos de ventas, entregas y tareas se guardan por propietario en el <Link className={s.link} href="/admin/workspace/crm/notifications">buzón de avisos</Link>, con confirmación de lectura.</p>
        {!data ? (
          <p role="status">Consultando datos autorizados del CRM…</p>
        ) : data.kpiError ? (
          <p role="alert">{data.kpiError} <button type="button" onClick={() => setRevision((n) => n + 1)}>Reintentar</button></p>
        ) : (
          <div className={s.grid}>
            <article className={s.card}>
              <h3>Urgentes</h3>
              <p><strong>{data.overdue ?? "—"}</strong> seguimientos de leads vencidos</p>
              <Link className={s.link} href="/admin/workspace/crm/leads">Revisar pipeline</Link>
            </article>
            <article className={s.card}>
              <h3>Normales</h3>
              <p><strong>{data.pending ?? "—"}</strong> actividades de leads pendientes</p>
              <Link className={s.link} href="/admin/workspace/crm/calendar">Revisar calendario</Link>
            </article>
          </div>
        )}
      </section>

      <section className={s.panel}>
        <h2>Herramientas adicionales</h2>
        <p>Consulta <Link className={s.link} href="/admin/workspace/crm/kpis">Estadísticas del CRM</Link>, las <Link className={s.link} href="/admin/workspace/crm/tasks">Tareas internas</Link> persistentes y asignables, y el <Link className={s.link} href="/admin/workspace/crm/activity">Centro de actividad</Link> con el historial auditado.</p>
      </section>
    </div>
  );
}
