/**
 * Logical account buckets for Avalon OS. No provider OAuth or balance API is implied.
 * Owner-submitted readings are dated historical observations, never live balances.
 */
export const ACCOUNTS = [
  { key: "chatgpt_business", label: "ChatGPT Business / Codex", plan: "Workspace de 2 asientos", scope: "shared", description: "Dos cuotas de asiento y, si existe, un fondo común" },
  { key: "claude_miguel", label: "Claude Pro · Miguel", plan: "Claude Pro", scope: "personal", description: "Cuota personal, sin compartir con Samuel" },
  { key: "claude_samuel", label: "Claude Pro · Samuel", plan: "Claude Pro", scope: "personal", description: "Cuota personal, sin compartir con Miguel" },
  { key: "higgsfield_team", label: "Higgsfield · Avalon Agency", plan: "Team", scope: "shared", description: "Un fondo común; nunca duplicar por socio" },
] as const;

export type AccountKey = (typeof ACCOUNTS)[number]["key"];
export type SeatKey = "miguel" | "samuel" | null;
export type QuotaWindow = "session" | "weekly" | "monthly" | "other" | null;
export type MetricKey = "quota_used_pct" | "credits_available" | "tokens_used" |
  "api_spend_usd" | "extra_spend_usd" | "generations_available";
export type Snapshot = {
  id: string;
  account_key: AccountKey;
  seat_key: SeatKey;
  metric_key: MetricKey;
  quota_window: QuotaWindow;
  unit: "%" | "creditos" | "tokens" | "USD" | "generaciones";
  amount: number;
  limit_value: number | null;
  period_start: string | null;
  period_end: string | null;
  source_label: string;
  observed_at: string;
  mode: "manual";
};
export const METRICS: Record<MetricKey, { label: string; unit: Snapshot["unit"] }> = {
  quota_used_pct: { label: "Cuota utilizada (%)", unit: "%" },
  credits_available: { label: "Créditos disponibles", unit: "creditos" },
  tokens_used: { label: "Tokens utilizados", unit: "tokens" },
  api_spend_usd: { label: "Gasto API (USD)", unit: "USD" },
  extra_spend_usd: { label: "Gasto adicional (USD)", unit: "USD" },
  generations_available: { label: "Generaciones disponibles", unit: "generaciones" },
};
const RULES: Record<AccountKey, Partial<Record<MetricKey, SeatKey[]>>> = {
  chatgpt_business: {
    quota_used_pct: ["miguel", "samuel"],
    tokens_used: ["miguel", "samuel"],
    credits_available: [null],
    api_spend_usd: [null],
  },
  claude_miguel: {
    quota_used_pct: [null],
    tokens_used: [null],
    extra_spend_usd: [null],
  },
  claude_samuel: {
    quota_used_pct: [null],
    tokens_used: [null],
    extra_spend_usd: [null],
  },
  higgsfield_team: {
    credits_available: [null],
    generations_available: [null],
    api_spend_usd: [null],
  },
};
export function acceptedMetric(account: AccountKey, seat: SeatKey, metric: MetricKey) {
  return Boolean(RULES[account]?.[metric]?.includes(seat));
}
export function normalizeObservation(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Lectura inválida");
  const v = input as Record<string, unknown>;
  const account = v.account_key;
  const metric = v.metric_key;
  const seat = v.seat_key === "" || v.seat_key === undefined ? null : v.seat_key;
  if (!ACCOUNTS.some((a) => a.key === account) || !Object.hasOwn(METRICS, String(metric)) ||
      (seat !== null && seat !== "miguel" && seat !== "samuel") ||
      !acceptedMetric(account as AccountKey, seat as SeatKey, metric as MetricKey))
    throw new Error("Cuenta, cuota o titular incompatibles");
  const amount = v.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > 1e14)
    throw new Error("Introduce un valor numérico válido");
  if (metric === "quota_used_pct" && amount > 100)
    throw new Error("Un porcentaje no puede superar 100");
  const limit = v.limit_value === null || v.limit_value === undefined || v.limit_value === ""
    ? null : v.limit_value;
  if (limit !== null && (typeof limit !== "number" || !Number.isFinite(limit) ||
      limit < 0 || limit > 1e14 || (metric === "quota_used_pct" && limit !== 100)))
    throw new Error("Límite inválido");
  const quotaWindow = metric === "quota_used_pct" ? v.quota_window : null;
  if (metric === "quota_used_pct" && !["session","weekly","monthly","other"].includes(String(quotaWindow)))
    throw new Error("Especifica el tipo de cuota");
  if (metric !== "quota_used_pct" && v.quota_window != null && v.quota_window !== "")
    throw new Error("Esta métrica no admite un periodo de cuota");
  const source = v.source_label;
  if (typeof source !== "string" || source.trim().length < 1 || source.trim().length > 180)
    throw new Error("Indica la fuente oficial de la lectura");
  const instant = (value: unknown) => {
    if (value === "" || value === null || value === undefined) return null;
    if (typeof value !== "string" || !/(Z|[+-]\d\d:\d\d)$/.test(value) ||
        !Number.isFinite(Date.parse(value))) throw new Error("Periodo inválido");
    return new Date(value).toISOString();
  };
  const start = instant(v.period_start);
  const end = instant(v.period_end);
  if ((start === null) !== (end === null) || (start && end && start >= end))
    throw new Error("Especifica un periodo completo y válido");
  return {
    account_key: account as AccountKey,
    seat_key: seat as SeatKey,
    metric_key: metric as MetricKey,
    quota_window: quotaWindow as QuotaWindow,
    unit: METRICS[metric as MetricKey].unit,
    amount,
    limit_value: limit as number | null,
    period_start: start,
    period_end: end,
    source_label: source.trim(),
  };
}
/** No combined credit total across providers; latest snapshot per account/seat/metric only. */
export function latestSnapshots<T extends Pick<Snapshot, "account_key"|"seat_key"|"metric_key"|"quota_window"|"observed_at">>(rows: T[]): T[] {
  const latest = new Map<string,T>();
  for (const row of rows) {
    const key = [row.account_key, row.seat_key ?? "pool", row.metric_key, row.quota_window ?? "no-window"].join(":");
    const previous = latest.get(key);
    if (!previous || row.observed_at > previous.observed_at ||
        (row.observed_at === previous.observed_at && "id" in row && "id" in previous &&
          String(row.id) > String(previous.id))) latest.set(key,row);
  }
  return [...latest.values()];
}
