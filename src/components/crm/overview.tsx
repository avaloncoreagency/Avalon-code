"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CrmNavigation } from "./navigation";
import { CreditCenter } from "@/components/ai-credits/credit-center";
import s from "./crm.module.css";

type KpiPayload = {
  metrics?: { overdue?: number; pending?: number };
};
type OverviewData = {
  overdue: number;
  pending: number;
};
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
    fetch(`${api}?entity=kpis&page=0`, { signal: controller.signal })
      .then(async (kpiResponse) => {
        if (!kpiResponse.ok) throw new Error("No se pudo consultar el estado del CRM.");
        const kpi = (await kpiResponse.json()) as KpiPayload;
        const overdue = kpi.metrics?.overdue;
        const pending = kpi.metrics?.pending;
        if (!isNumber(overdue) || !isNumber(pending)) {
          throw new Error("Las métricas del CRM no están disponibles.");
        }

if (!controller.signal.aborted) {
          setData({
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
      <CrmNavigation />

      <section className={s.panel} aria-labelledby="usage-heading">
        <h2 id="usage-heading">Créditos y consumo de IA</h2>
        <p className={s.muted}>Un vistazo a lo que tenemos disponible para trabajar. Cuotas personales de Miguel y Samuel, recursos compartidos y últimas actualizaciones comprobables.</p>
        <CreditCenter />
        <p><Link href="/admin/workspace/crm/ai-usage" className={s.link}>Consultar los registros históricos de uso del CRM</Link></p>
      </section>

      <section className={s.panel} aria-labelledby="notifications-heading">
        <h2 id="notifications-heading">Notificaciones del CRM</h2>
        <p className={s.muted}>Indicadores de seguimiento de leads derivados de los registros actuales. Los avisos de ventas, entregas y tareas se guardan por propietario en el <Link className={s.link} href="/admin/workspace/crm/notifications">buzón de avisos</Link>, con confirmación de lectura.</p>
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
        <p>Consulta <Link className={s.link} href="/admin/workspace/crm/kpis">Estadísticas del CRM</Link>, las <Link className={s.link} href="/admin/workspace/crm/tasks">Tareas internas</Link> persistentes y asignables, y el <Link className={s.link} href="/admin/workspace/crm/activity">Centro de actividad</Link> con el historial auditado.</p>
      </section>
    </div>
  );
}
