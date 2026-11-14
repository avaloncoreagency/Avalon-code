/**
 * Independent, owner-authenticated CRM overview reads.
 * A disconnected AI usage endpoint must not hide otherwise valid commercial KPIs,
 * nor may a KPI error turn unknown usage into a misleading "0".
 * This module holds no credentials and never writes to the CRM.
 */
export type OverviewUsageRow = {
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

export type CrmOverviewSnapshot = {
  usage: OverviewUsageRow[] | null;
  overdue: number | null;
  pending: number | null;
  usageError: string | null;
  kpiError: string | null;
};

const API = "/admin/workspace/crm/api";
const validCount = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0;

async function usageRecords(fetcher: typeof fetch, signal?: AbortSignal): Promise<OverviewUsageRow[]> {
  const response = await fetcher(`${API}?entity=usage&page=0`, { signal });
  if (!response.ok) throw new Error("usage_api");
  const body: unknown = await response.json();
  if (!body || typeof body !== "object") throw new Error("usage_payload");
  const rows = (body as { rows?: unknown }).rows;
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== "object" || Array.isArray(row)))
    throw new Error("usage_payload");
  return rows as OverviewUsageRow[];
}

async function leadCounts(fetcher: typeof fetch, signal?: AbortSignal):
  Promise<{ overdue: number; pending: number }> {
  const response = await fetcher(`${API}?entity=kpis&page=0`, { signal });
  if (!response.ok) throw new Error("kpi_api");
  const body: unknown = await response.json();
  if (!body || typeof body !== "object") throw new Error("kpi_payload");
  const metrics = (body as { metrics?: { overdue?: unknown; pending?: unknown } }).metrics;
  if (!validCount(metrics?.overdue) || !validCount(metrics.pending))
    throw new Error("kpi_payload");
  return { overdue: metrics.overdue, pending: metrics.pending };
}

/** Fetch both sections concurrently, isolating their errors without inventing fallback values. */
export async function loadCrmOverview(fetcher: typeof fetch, signal?: AbortSignal):
  Promise<CrmOverviewSnapshot> {
  const [usage, kpis] = await Promise.allSettled([
    usageRecords(fetcher, signal),
    leadCounts(fetcher, signal),
  ]);
  return {
    usage: usage.status === "fulfilled" ? usage.value : null,
    overdue: kpis.status === "fulfilled" ? kpis.value.overdue : null,
    pending: kpis.status === "fulfilled" ? kpis.value.pending : null,
    usageError: usage.status === "rejected" ? "No se pudieron cargar los registros de consumo." : null,
    kpiError: kpis.status === "rejected" ? "Las métricas del CRM no están disponibles." : null,
  };
}
