/** HARU 0352-C — UI-only contracts. No agent runner, auth, SQL, or write operations. */
export const MANAGER_KEYS = ["ren", "shin", "haru", "sora", "kenji"] as const;
export type ManagerKey = typeof MANAGER_KEYS[number];
export const MANAGER_ROLES: Record<ManagerKey, readonly [string, string]> = {
  ren: ["Coordinación y desarrollo", "Coordination & development"],
  shin: ["Seguridad y permisos", "Security & access"],
  haru: ["Producto y CRM", "Product & CRM"],
  sora: ["Integraciones y Radar", "Integrations & Radar"],
  kenji: ["Pruebas y calidad", "Testing & quality"],
};
const activityStates = ["idle", "queued", "running", "completed", "failed", "blocked", "stale"] as const;
export type ActivityState = typeof activityStates[number];

export type ActivityRow = {
  manager_key: ManagerKey;
  run_id: string | null;
  status: ActivityState;
  task_title: string | null;
  started_at: string | null;
  finished_at: string | null;
  result_summary: string | null;
  evidence_refs: { type: string; id: string; label?: string }[];
  error_code: string | null;
  updated_at: string | null;
};
export type ActivityFeed = {
  managers: ActivityRow[];
  meta: { executor_kind: "deterministic"; kill_switch: boolean; automatic_enabled: boolean; freshness_hours: number; generated_at: string };
};
export type LedgerEntry = {
  manager: ManagerKey; runId: string; commentId: number; publishedAt: string;
  action: string; status: string; result: string; evidence: string[];
  provider: string | null; runCostUSD: number | null;
};
export type OrderStage = "requested" | "running" | "verified" | "owner" | "diagnosed" |
  "implementation" | "implemented" | "blocked" | "failed";
export type PublicOrder = {
  number: number; title: string; stage: OrderStage; manager: ManagerKey | null;
  url: string; updatedAt: string | null;
};

export const LEDGER = "https://github.com/avaloncoreagency/Avalon-code/issues/134";
export const WORKFLOW_API = "https://api.github.com/repos/avaloncoreagency/Avalon-code/issues/134/comments?per_page=100";
export const ORDERS_API = "https://api.github.com/repos/avaloncoreagency/Avalon-code/issues?state=all&labels=avalon%3Atask&per_page=100";
export const ACTIVITY_API = "/admin/workspace/crm/office/manager-activity";

const isObj = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export const isManagerKey = (s: unknown): s is ManagerKey =>
  typeof s === "string" && (MANAGER_KEYS as readonly string[]).includes(s);
const validTime = (s: unknown): s is string => typeof s === "string" &&
  s.length < 80 && Number.isFinite(Date.parse(s));
const optionalTime = (s: unknown): s is string | null => s === null || validTime(s);
const optionalStr = (s: unknown, max: number): s is string | null =>
  s === null || typeof s === "string" && s.length <= max;

/** Fail closed on incorrect owner API contracts; never pretend data is available. */
export function readActivity(payload: unknown): ActivityFeed | null {
  if (!isObj(payload) || !isObj(payload.meta) || !Array.isArray(payload.managers) ||
      payload.meta.executor_kind !== "deterministic" ||
      typeof payload.meta.kill_switch !== "boolean" ||
      typeof payload.meta.automatic_enabled !== "boolean" ||
      typeof payload.meta.freshness_hours !== "number" ||
      !validTime(payload.meta.generated_at) || payload.managers.length !== 5) return null;
  const rows = payload.managers;
  for (let i = 0; i < MANAGER_KEYS.length; i++) {
    const r: unknown = rows[i];
    if (!isObj(r) || r.manager_key !== MANAGER_KEYS[i] ||
        !(activityStates as readonly string[]).includes(String(r.status)) ||
        !optionalStr(r.run_id, 80) || !optionalStr(r.task_title, 300) ||
        !optionalStr(r.result_summary, 2000) || !optionalStr(r.error_code, 150) ||
        !optionalTime(r.started_at) || !optionalTime(r.finished_at) || !optionalTime(r.updated_at) ||
        !Array.isArray(r.evidence_refs) || r.evidence_refs.length > 20 ||
        !r.evidence_refs.every(e => isObj(e) && typeof e.type === "string" && e.type.length <= 60 &&
          typeof e.id === "string" && e.id.length <= 160 &&
          (e.label === undefined || typeof e.label === "string" && e.label.length <= 200))) return null;
  }
  return payload as ActivityFeed;
}

const plain = (s: string, max = 600) => s
  .replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]*>/g, "")
  .replace(/[\x00-\x08\x0b-\x1f]/g, " ").replace(/\*\*/g, "").replace(/`/g, "")
  .trim().slice(0, max);

type RawComment = { id?: unknown; body?: unknown; created_at?: unknown; user?: { login?: unknown } };
/** Parse ONLY bot-authored public #134 ledger comments. Render as plain text, never HTML. */
export function parseLedgerComments(input: unknown): LedgerEntry[] {
  if (!Array.isArray(input)) return [];
  const collected: LedgerEntry[] = [];
  for (const item of input.slice(-100) as RawComment[]) {
    if (!isObj(item) || item.user?.login !== "github-actions[bot]" ||
        !Number.isSafeInteger(item.id) || Number(item.id) <= 0 ||
        typeof item.body !== "string" || item.body.length > 40000 ||
        !validTime(item.created_at)) continue;
    const match = item.body.match(/Ejecuci[oó]n:\s*https:\/\/github\.com\/avaloncoreagency\/Avalon-code\/actions\/runs\/(\d{1,20})/i);
    if (!match) continue;
    const runId = match[1];
    const cost = item.body.match(/coste de inferencia:\s*\*\*\$([0-9]+(?:\.[0-9]{1,4})?)/i);
    const runCostUSD = cost ? Number(cost[1]) : null;
    const lines = item.body.split("\n").filter(line => /^\|\s*(REN|SHIN|HARU|SORA|KENJI)\s*\|/i.test(line));
    for (const line of lines) {
      const cells = line.split("|").slice(1, -1).map(x => x.trim());
      if (cells.length !== 6) continue;
      const manager = cells[0].toLowerCase();
      if (!isManagerKey(manager)) continue;
      const evidence = plain(cells[4], 1200).split("\n").map(x => x.replace(/^✅\s*/, "").trim()).filter(Boolean).slice(0, 8);
      collected.push({
        manager, runId, commentId: Number(item.id), publishedAt: item.created_at as string,
        action: plain(cells[1], 120), status: plain(cells[2], 90),
        result: plain(cells[3], 550), evidence,
        provider: plain(cells[5], 120) || null,
        runCostUSD: runCostUSD !== null && Number.isFinite(runCostUSD) ? runCostUSD : null,
      });
    }
  }
  return collected.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || Number(b.commentId) - Number(a.commentId));
}

const ORDER_STATES: readonly [string, OrderStage][] = [
  ["avalon:needs-owner", "owner"], ["avalon:verified", "verified"],
  ["avalon:in-progress", "running"], ["avalon:failed", "failed"],
  ["avalon:blocked", "blocked"], ["avalon:needs-implementation", "implementation"],
  ["avalon:implemented", "implemented"], ["avalon:diagnosed", "diagnosed"],
];
/** Only signed issue labels may mark a task verified. A review or diagnosis is not completed work. */
export function orderStage(labels: readonly string[]): OrderStage {
  for (const [label, stage] of ORDER_STATES) if (labels.includes(label)) return stage;
  return "requested";
}

export function readPublicOrders(input: unknown): PublicOrder[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 100).flatMap((item): PublicOrder[] => {
    if (!isObj(item) || !Number.isSafeInteger(item.number) || Number(item.number) <= 0 ||
        typeof item.title !== "string" || !Array.isArray(item.labels) ||
        item.pull_request || !optionalTime(item.updated_at)) return [];
    const labels = item.labels.flatMap((x: unknown) => isObj(x) && typeof x.name === "string" ? [x.name] : []);
    if (!labels.includes("avalon:task")) return [];
    const managerLabel = labels.find((l: string) => /^manager:(ren|shin|haru|sora|kenji)$/.test(l));
    const manager = managerLabel?.slice(8) ?? null;
    const number = Number(item.number);
    return [{
      number, title: plain(item.title, 170), stage: orderStage(labels),
      manager: isManagerKey(manager) ? manager : null,
      url: `https://github.com/avaloncoreagency/Avalon-code/issues/${number}`,
      updatedAt: item.updated_at as string | null,
    }];
  });
}

export const activityLabel = (status: ActivityState, en: boolean): string => {
  const labels: Record<ActivityState, readonly [string,string]> = {
    idle: ["Sin actividad verificada", "No verified activity"],
    queued: ["En cola", "Queued"],
    running: ["En ejecución", "Running"],
    completed: ["Comprobación finalizada", "Check completed"],
    failed: ["Fallida", "Failed"],
    blocked: ["Bloqueada", "Blocked"],
    stale: ["Sin actividad reciente verificada", "No recent verified activity"],
  };
  return labels[status][en ? 1 : 0];
};
export const stageLabel = (status: OrderStage, en: boolean): string => {
  const labels: Record<OrderStage, readonly [string,string]> = {
    requested: ["Solicitada", "Requested"], running: ["En progreso", "In progress"],
    verified: ["Verificada", "Verified"], owner: ["Pendiente de aprobación", "Owner approval needed"],
    diagnosed: ["Diagnosticada (sin implementar)", "Diagnosed (not implemented)"],
    implementation: ["Pendiente de implementación", "Implementation needed"],
    implemented: ["Implementada (sin verificar)", "Implemented (unverified)"],
    blocked: ["Bloqueada", "Blocked"], failed: ["Fallida", "Failed"],
  };
  return labels[status][en ? 1 : 0];
};
export const safeDate = (s: string | null, lang: string) =>
  s && validTime(s) ? new Date(s).toLocaleString(lang === "en" ? "en-US" : "es-US", {
    year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"
  }) : (lang === "en" ? "Not recorded" : "No registrado");
