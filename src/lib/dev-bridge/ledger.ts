/**
 * Dev Bridge 3.0 — pure ledger logic (no I/O). The database is the source of truth; this module only derives numbers
 * with documented formulas and never invents time:
 *
 *  - DECLARED hours: sum of the owner's own time entries, excluding entries that a later correction superseded.
 *  - OBSERVED session time: for each session, the intervals between server-recorded START/RESUME and the next
 *    PAUSE/BLOCKED/INTERRUPTED/STOP/COMPLETED. A session that is still open counts only up to its LAST recorded event
 *    (never "until now"); time after the last event is UNKNOWN.
 *  - COVERED time per owner: the UNION of that owner's session intervals, so two agents working at the same time are
 *    not counted twice. Per-tool sums are shown separately and labelled as such.
 *  - Commits, messages or tests are never converted into hours. Activity counts are counts, not effort or quality.
 */
export type Owner = "miguel" | "samuel";
export type Evidence = "VERIFIED" | "SELF_REPORTED" | "IMPORTED" | "INFERRED" | "UNKNOWN";
export type LedgerEvent = {
  id: string; source: string; agent_id: string | null; owner: Owner | null; tool: string | null; session_id: string | null;
  kind: string; occurred_at: string; recorded_at: string; evidence: Evidence; title: string; detail?: string;
  evidence_url: string | null; ref?: string; department?: string; issue_number: number | null;
};
export type LedgerSession = {
  id: string; agent_id: string; owner: Owner; tool: string; title: string; status: string; started_at: string;
  ended_at: string | null; department: string; issue_number: number | null; summary: string; next_action: string;
};
export type TimeEntry = { id: string; owner: Owner; work_date: string; minutes: number; description: string; supersedes: string | null; correction_reason: string; issue_number: number | null; evidence_url: string | null; created_at: string };
export type Commitment = { id: string; owner: Owner; title: string; status: string; target_date: string; agreed_on: string; evidence_url: string | null; accepted_at: string | null; version: number; acceptance_criteria: string };
export type Interval = { start: number; end: number };

const OPEN = new Set(["session_start", "session_resume"]);
const CLOSE = new Set(["session_pause", "session_blocked", "session_interrupted", "session_stop", "session_completed"]);

/** Active intervals of ONE session from its server-recorded lifecycle events. */
export function sessionIntervals(events: Pick<LedgerEvent, "kind" | "recorded_at">[]): { intervals: Interval[]; open: boolean } {
  const sorted = [...events].filter(e => e.kind.startsWith("session_")).sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at));
  const intervals: Interval[] = [];
  let start: number | null = null, last: number | null = null;
  for (const e of sorted) {
    const t = Date.parse(e.recorded_at);
    if (!Number.isFinite(t)) continue;
    if (OPEN.has(e.kind)) { if (start === null) start = t; }
    else if (CLOSE.has(e.kind)) { if (start !== null) { intervals.push({ start, end: t }); start = null; } }
    last = t;
  }
  // Still open: count only up to the last observed event (a checkpoint), never until "now".
  if (start !== null && last !== null && last > start) intervals.push({ start, end: last });
  return { intervals, open: start !== null };
}

export const totalMs = (xs: Interval[]) => xs.reduce((s, i) => s + Math.max(0, i.end - i.start), 0);

/** Union of intervals (no double counting of concurrent sessions). */
export function union(xs: Interval[]): Interval[] {
  const sorted = xs.filter(i => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const prev = out[out.length - 1];
    if (prev && i.start <= prev.end) prev.end = Math.max(prev.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

/** Clip intervals to a period [from, to). */
export const clip = (xs: Interval[], from: number, to: number) => xs.map(i => ({ start: Math.max(i.start, from), end: Math.min(i.end, to) })).filter(i => i.end > i.start);

/** Declared entries that are currently valid (not superseded by a later correction). */
export function effectiveEntries(entries: TimeEntry[]): TimeEntry[] {
  const superseded = new Set(entries.map(e => e.supersedes).filter((x): x is string => Boolean(x)));
  return entries.filter(e => !superseded.has(e.id));
}

export type OwnerStats = {
  owner: Owner;
  declaredMinutes: number;
  coveredSessionMs: number;
  byTool: Record<string, { sessions: number; sessionMs: number }>;
  openSessions: number;
  activity: Record<string, number>;
  evidence: Record<Evidence, number>;
  commitments: Record<string, number>;
};

export function ownerStats(owner: Owner, input: { events: LedgerEvent[]; sessions: LedgerSession[]; entries: TimeEntry[]; commitments: Commitment[] }, from: number, to: number): OwnerStats {
  const inRange = (iso: string) => { const t = Date.parse(iso); return t >= from && t < to; };
  const byTool: OwnerStats["byTool"] = {};
  const all: Interval[] = [];
  let openSessions = 0;
  for (const s of input.sessions.filter(s => s.owner === owner)) {
    const { intervals, open } = sessionIntervals(input.events.filter(e => e.session_id === s.id));
    const clipped = clip(intervals, from, to);
    if (!clipped.length && !inRange(s.started_at)) continue;
    if (open) openSessions++;
    const slot = (byTool[s.tool] ??= { sessions: 0, sessionMs: 0 });
    slot.sessions++; slot.sessionMs += totalMs(clipped);
    all.push(...clipped);
  }
  const activity: Record<string, number> = {};
  const evidence = { VERIFIED: 0, SELF_REPORTED: 0, IMPORTED: 0, INFERRED: 0, UNKNOWN: 0 } as Record<Evidence, number>;
  for (const e of input.events) {
    if (e.owner !== owner || !inRange(e.occurred_at) || e.kind.startsWith("session_")) continue;
    activity[e.kind] = (activity[e.kind] ?? 0) + 1;
    evidence[e.evidence]++;
  }
  const commitments: Record<string, number> = {};
  for (const c of input.commitments.filter(c => c.owner === owner)) commitments[c.status] = (commitments[c.status] ?? 0) + 1;
  const declaredMinutes = effectiveEntries(input.entries).filter(e => e.owner === owner && inRange(`${e.work_date}T12:00:00Z`)).reduce((s, e) => s + e.minutes, 0);
  return { owner, declaredMinutes, coveredSessionMs: totalMs(union(all)), byTool, openSessions, activity, evidence, commitments };
}

/** "3 h 05 min" style; under a minute is "<1 min" (never rounded up to a minute, never down to zero). */
export function duration(ms: number): string {
  if (!(ms > 0)) return "0 min";
  // Under a minute is shown as such: never rounded up to a full minute (that would overstate time) nor down to zero.
  if (ms < 60000) return "<1 min";
  const min = Math.round(ms / 60000);
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}

/** Period presets in America/New_York calendar days, returned as UTC ms [from, to). */
export function period(preset: string, now = new Date()): { from: number; to: number; label: [string, string] } {
  const day = 86400000;
  const nyMidnight = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? "01";
    const guess = Date.parse(`${get("year")}-${get("month")}-${get("day")}T05:00:00Z`);
    // Correct for DST: midnight in New York is 04:00 or 05:00 UTC.
    const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false }).format(new Date(guess)));
    return guess - (h % 24) * 3600000;
  };
  const today = nyMidnight(now);
  if (preset === "today") return { from: today, to: today + day, label: ["Hoy", "Today"] };
  if (preset === "30d") return { from: today - 29 * day, to: today + day, label: ["Últimos 30 días", "Last 30 days"] };
  if (preset === "all") return { from: 0, to: today + day, label: ["Todo el historial", "All history"] };
  return { from: today - 6 * day, to: today + day, label: ["Últimos 7 días", "Last 7 days"] };
}

/** Owner-facing CSV (private export). Values are quoted; formulas are neutralised (CSV injection). */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [cols.join(","), ...rows.map(r => cols.map(c => cell(r[c])).join(","))].join("\n") + "\n";
}

/** Standard department handoff text (from a ChatGPT project chat) → structured fields. Unknown lines are ignored. */
export type Handoff = { owner?: string; department?: string; date?: string; task?: string; decisions?: string; work?: string; documents?: string; evidence?: string; status?: string; next?: string };
const HANDOFF_KEYS: Record<string, keyof Handoff> = {
  propietario: "owner", owner: "owner", departamento: "department", department: "department", fecha: "date", date: "date",
  tarea: "task", task: "task", decisiones: "decisions", decisions: "decisions", "trabajo realizado": "work", "work done": "work",
  documentos: "documents", documents: "documents", evidencia: "evidence", evidencias: "evidence", evidence: "evidence",
  estado: "status", status: "status", "próximo paso": "next", "proximo paso": "next", "next step": "next", "next action": "next",
};
export function parseHandoff(text: string): Handoff {
  const out: Handoff = {};
  let current: keyof Handoff | null = null;
  for (const raw of text.split(/\r?\n/).slice(0, 200)) {
    const m = /^\s*[-*]?\s*([A-Za-zÁÉÍÓÚáéíóúñÑ ]{3,20})\s*:\s*(.*)$/.exec(raw);
    const key = m ? HANDOFF_KEYS[m[1].trim().toLowerCase()] : undefined;
    if (key) { current = key; out[key] = m![2].trim(); }
    else if (current && raw.trim()) out[current] = `${out[current] ?? ""}\n${raw.trim()}`.trim();
  }
  for (const k of Object.keys(out) as (keyof Handoff)[]) out[k] = out[k]!.slice(0, 2000);
  return out;
}

/** Map a Dev Bridge 2.0 GitHub snapshot to ledger events. Attribution only from an owner:* Issue label (INFERRED). */
export type GithubLike = {
  issues: { number: number; owner: Owner | null; title: string; url: string; updated_at: string }[];
  pulls: { number: number; title: string; url: string; head_sha: string; issues: number[]; updated_at?: string }[];
  commits: { sha: string; date: string; url: string }[];
};
export function githubEvents(g: GithubLike) {
  const ownerOf = (issues: number[]) => {
    const owners = [...new Set(issues.map(n => g.issues.find(i => i.number === n)?.owner).filter(Boolean))];
    return owners.length === 1 ? owners[0] : null; // ambiguous → UNKNOWN
  };
  return [
    ...g.commits.filter(c => /^[0-9a-f]{40}$/.test(c.sha) && c.date).map(c => ({ key: `commit:${c.sha}`, kind: "commit", occurred_at: c.date, title: `Commit ${c.sha.slice(0, 12)}`, url: c.url, ref: c.sha })),
    ...g.pulls.filter(p => p.updated_at).map(p => ({ key: `pr:${p.number}:${p.head_sha}`, kind: "pull_request", occurred_at: p.updated_at!, title: `PR #${p.number}: ${p.title}`.slice(0, 300), url: p.url, ref: p.head_sha, owner: ownerOf(p.issues), issue_number: p.issues.length === 1 ? p.issues[0] : null })),
  ].filter(e => /^https:\/\//.test(e.url));
}

export const EVIDENCE_LABEL: Record<Evidence, [string, string]> = {
  VERIFIED: ["Verificado", "Verified"], SELF_REPORTED: ["Declarado", "Self-reported"], IMPORTED: ["Importado con enlace", "Imported with link"],
  INFERRED: ["Inferido", "Inferred"], UNKNOWN: ["Desconocido", "Unknown"],
};
export const SESSION_LABEL: Record<string, [string, string]> = {
  session_start: ["Inicio de sesión", "Session started"], session_pause: ["Pausa", "Paused"], session_resume: ["Reanudación", "Resumed"],
  session_checkpoint: ["Checkpoint", "Checkpoint"], session_blocked: ["Bloqueada", "Blocked"], session_interrupted: ["Interrumpida", "Interrupted"],
  session_stop: ["Sesión cerrada", "Session closed"],
};
export const TOOL_LABEL: Record<string, [string, string]> = {
  claude_code: ["Claude Code", "Claude Code"], codex: ["Codex", "Codex"], chatgpt: ["ChatGPT", "ChatGPT"], github: ["GitHub", "GitHub"], manual: ["Manual", "Manual"],
};
export const COMMITMENT_LABEL: Record<string, [string, string]> = {
  pending: ["Pendiente", "Pending"], in_progress: ["En progreso", "In progress"], blocked: ["Bloqueado", "Blocked"],
  ready_for_review: ["Listo para revisión", "Ready for review"], completed: ["Completado", "Completed"], verified: ["Verificado", "Verified"], cancelled: ["Cancelado", "Cancelled"],
};
