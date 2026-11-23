import { getOwnerSession } from "@/lib/auth/session";
import { loadLedger } from "@/lib/dev-bridge/ledger-server";
import { effectiveEntries, period, toCsv } from "@/lib/dev-bridge/ledger";

export const dynamic = "force-dynamic";

/** Private CSV export for owners (never public, never cached). Kinds: events | sessions | hours | commitments. */
export async function GET(req: Request) {
  const session = await getOwnerSession();
  if (!session) return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "events";
  const { from, to } = period(url.searchParams.get("period") ?? "30d");
  const l = await loadLedger(session.supabase, session.userId, from, to);
  if (l.state !== "ready") return new Response(l.state, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  const inRange = (iso: string) => { const t = Date.parse(iso); return t >= from && t < to; };
  const rows: Record<string, unknown>[] =
    kind === "sessions" ? l.sessions.map(s => ({ session_id: s.id, owner: s.owner, agent: s.agent_id, tool: s.tool, title: s.title, status: s.status, started_at_utc: s.started_at, ended_at_utc: s.ended_at ?? "", issue: s.issue_number ?? "", summary: s.summary, next_action: s.next_action }))
    : kind === "hours" ? effectiveEntries(l.entries).map(e => ({ owner: e.owner, work_date: e.work_date, minutes: e.minutes, description: e.description, issue: e.issue_number ?? "", evidence: "SELF_REPORTED", evidence_url: e.evidence_url ?? "", correction_of: e.supersedes ?? "", correction_reason: e.correction_reason }))
    : kind === "commitments" ? l.commitments.map(c => ({ owner: c.owner, title: c.title, status: c.status, agreed_on: c.agreed_on, target_date: c.target_date, accepted_at_utc: c.accepted_at ?? "", evidence_url: c.evidence_url ?? "", acceptance_criteria: c.acceptance_criteria }))
    : l.events.filter(e => inRange(e.occurred_at)).map(e => ({ occurred_at_utc: e.occurred_at, recorded_at_utc: e.recorded_at, owner: e.owner ?? "UNKNOWN", tool: e.tool ?? "", agent: e.agent_id ?? "", source: e.source, kind: e.kind, evidence: e.evidence, title: e.title, issue: e.issue_number ?? "", evidence_url: e.evidence_url ?? "", ref: e.ref ?? "" }));
  const name = `avalon-dev-bridge-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(toCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
