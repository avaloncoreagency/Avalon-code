"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CrmNavigation, CrmTools } from "./navigation";
import { COMMON_UNITS, canonicalUnit, latestPerUnit } from "@/lib/crm/usage-units";
import { pick, type Lang } from "@/lib/i18n";
import s from "./crm.module.css";

type UsageRow = {
  id?: string;
  provider?: string;
  amount?: number;
  unit?: string;
  source?: string;
  mode?: string;
  period_start?: string;
  period_end?: string;
  created_at?: string;
  limit_value?: number | null;
  threshold?: number;
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
// Subscriptions/plans and API billing are different sources; manual records state which one they are.
const LABELS: Record<(typeof providers)[number], string> = { Codex: "ChatGPT / Codex", Claude: "Claude Code", Higgsfield: "Higgsfield" };
const api = "/admin/workspace/crm/api";

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function CrmOverview({ radarEnabled = false, lang = "es" }: { radarEnabled?: boolean; lang?: Lang } = {}) {
  const t = (es: string, en: string) => pick(lang, es, en);
  const num = (v: number) => v.toLocaleString(lang);
  const day = (v: string) => new Date(v).toLocaleDateString(lang);
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
          throw new Error(t("No se pudo consultar el estado del CRM.", "The CRM status could not be loaded."));
        }
        const usage = (await usageResponse.json()) as UsagePayload;
        const kpi = (await kpiResponse.json()) as KpiPayload;
        const overdue = kpi.metrics?.overdue;
        const pending = kpi.metrics?.pending;
        if (!isNumber(overdue) || !isNumber(pending)) {
          throw new Error(t("Las métricas del CRM no están disponibles.", "CRM metrics are unavailable."));
        }
        if (!Array.isArray(usage.rows)) {
          throw new Error(t("No se pudieron consultar los registros de consumo.", "Usage records could not be loaded."));
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
          setError(reason instanceof Error ? reason.message : t("No se pudo cargar el CRM.", "The CRM could not be loaded."));
        }
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t only formats error text
  }, [revision]);

  return (
    <div className={s.wrap}>
      <header className={s.head}>
        <div>
          <p className={s.eyebrow}>Avalon OS / CRM</p>
          <h1 className={s.title}>{t("Centro comercial de Avalon", "Avalon commercial center")}</h1>
          <p className={s.subtitle}>{t("Un CRM para captar, calificar, vender y administrar clientes. El mantenimiento de la plataforma permanece fuera del CRM.", "One CRM to capture, qualify, sell and manage clients. Platform maintenance stays outside the CRM.")}</p>
        </div>
        <Link className={s.link} href="/admin/dashboard">← {t("Dashboard principal", "Main dashboard")}</Link>
      </header>
      <CrmNavigation lang={lang} />
      <CrmTools active="overview" radar={radarEnabled} lang={lang} />

      <section className={s.panel} aria-labelledby="usage-heading">
        <h2 id="usage-heading">{t("Centro de consumo de IA · Uso de tokens y costos", "AI usage center · Token use and costs")}</h2>
        <p className={s.muted}>{t("Las API de consumo no están conectadas. Los valores registrados manualmente son históricos, no balances en tiempo real ni costos calculados. Nunca se muestra 0 cuando el valor es desconocido; suscripciones y facturación API se registran por separado indicando la fuente.", "Usage APIs are not connected. Manually recorded values are historical, not real-time balances or calculated costs. 0 is never shown when the value is unknown; subscriptions and API billing are recorded separately with their source.")}</p>
        <div className={s.cards}>
          {providers.map((provider) => {
            const rows = (data?.usage ?? []).filter((item) => item.provider === provider && item.mode === "manual" && isNumber(item.amount));
            const perUnit = latestPerUnit(rows);
            return (
              <div className={s.card} key={provider}>
                <strong>{LABELS[provider]}</strong>
                {!data && !error ? <p>{t("Consultando registros…", "Loading records…")}</p> : perUnit.length === 0 ? (
                  <><p className={s.muted}>{t("Estado: Sin datos", "Status: No data")}</p><p>{t("No disponible · registra un consumo manual desde el panel oficial del proveedor. Unidades habituales:", "Unavailable · record usage manually from the provider's official dashboard. Usual units:")} {COMMON_UNITS.join(", ")}.</p></>
                ) : perUnit.map((latest) => {
                  const unit = canonicalUnit(latest.unit) || t("unidades", "units");
                  const amount = latest.amount as number;
                  const limit = isNumber(latest.limit_value) ? latest.limit_value : null;
                  const pct = limit ? Math.round((amount / limit) * 100) : null;
                  const stale = latest.period_end ? new Date(latest.period_end).getTime() < Date.now() : false;
                  const alert = pct !== null && pct >= (latest.threshold ?? 80);
                  return <div key={unit} data-unit={unit}>
                    <p className={s.muted}>{t("Estado", "Status")}: {stale ? t("Fuente desactualizada (periodo cerrado)", "Stale source (period closed)") : t("Actualización manual", "Manual update")} · {t("Automático: no conectado", "Automatic: not connected")}</p>
                    <p>{t("Consumido", "Used")}: <strong>{num(amount)} {unit}</strong></p>
                    <p>{t("Límite", "Limit")}: {limit !== null ? `${num(limit)} ${unit}` : t("desconocido", "unknown")} · {t("Restante", "Remaining")}: {limit !== null ? `${num(Math.max(0, limit - amount))} ${unit}` : t("desconocido", "unknown")}</p>
                    {pct !== null && <>
                      <div className={s.meter} role="progressbar" aria-label={t(`${LABELS[provider]}: ${unit} usados`, `${LABELS[provider]}: ${unit} used`)} aria-valuenow={Math.min(100, Math.max(0, pct))} aria-valuemin={0} aria-valuemax={100} aria-valuetext={t(`${pct}% consumido de la cuota registrada manualmente`, `${pct}% of the manually recorded quota used`)}>
                        <div className={s.fill} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                      </div>
                      <p role={alert ? "alert" : undefined}>{alert ? "⚠ " : ""}{t(`${pct}% usado (umbral ${latest.threshold ?? 80}%)`, `${pct}% used (threshold ${latest.threshold ?? 80}%)`)}</p>
                    </>}
                    <p className={s.muted}>{t("Periodo", "Period")}: {latest.period_start ? day(latest.period_start) : "—"} – {latest.period_end ? day(latest.period_end) : "—"} · {t("Fuente", "Source")}: {latest.source || "—"}</p>
                  </div>;
                })}
              </div>
            );
          })}
        </div>
        <Link href="/admin/workspace/crm/ai-usage" className={s.link}>{t("Ver registros manuales de consumo", "View manual usage records")}</Link>
      </section>

      <section className={s.panel} aria-labelledby="notifications-heading">
        <h2 id="notifications-heading">{t("Notificaciones del CRM", "CRM notifications")}</h2>
        <p className={s.muted}>{t("Indicadores de seguimiento de leads derivados de los registros actuales. Los avisos de ventas, entregas y tareas se guardan por propietario en el", "Lead follow-up indicators derived from current records. Sales, delivery and task alerts are kept per owner in the")} <Link className={s.link} href="/admin/workspace/crm/notifications">{t("buzón de avisos", "alerts inbox")}</Link>{t(", con confirmación de lectura.", ", with read receipts.")}</p>
        {error ? (
          <p role="alert">{error} <button type="button" onClick={() => setRevision((n) => n + 1)}>{t("Reintentar", "Retry")}</button></p>
        ) : !data ? (
          <p role="status">{t("Consultando datos autorizados del CRM…", "Loading authorized CRM data…")}</p>
        ) : (
          <div className={s.grid}>
            <article className={s.card}>
              <h3>{t("Urgentes", "Urgent")}</h3>
              <p><strong>{data.overdue}</strong> {t("seguimientos de leads vencidos", "overdue lead follow-ups")}</p>
              <Link className={s.link} href="/admin/workspace/crm/leads">{t("Revisar pipeline", "Review pipeline")}</Link>
            </article>
            <article className={s.card}>
              <h3>{t("Normales", "Normal")}</h3>
              <p><strong>{data.pending}</strong> {t("actividades de leads pendientes", "pending lead activities")}</p>
              <Link className={s.link} href="/admin/workspace/crm/calendar">{t("Revisar calendario", "Review calendar")}</Link>
            </article>
          </div>
        )}
      </section>

      <section className={s.panel}>
        <h2>{t("Herramientas adicionales", "More tools")}</h2>
        <p>{t("Consulta", "See")} <Link className={s.link} href="/admin/workspace/crm/kpis">{t("Estadísticas del CRM", "CRM statistics")}</Link>, {t("las", "the persistent, assignable")} <Link className={s.link} href="/admin/workspace/crm/tasks">{t("Tareas internas", "internal tasks")}</Link>{t(" persistentes y asignables, y el", " and the")} <Link className={s.link} href="/admin/workspace/crm/activity">{t("Centro de actividad", "activity center")}</Link> {t("con el historial auditado.", "with the audited history.")}</p>
      </section>
    </div>
  );
}
