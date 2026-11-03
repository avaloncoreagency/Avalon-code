import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
const ISSUE_URL = "https://api.github.com/repos/avaloncoreagency/Avalon-code/issues/108";
const MARKER = "<!-- AVALON_OFFICE_GITHUB_FREE_V1 -->";
const MANAGERS = ["ren", "shin", "haru", "sora", "kenji"] as const;
const reply = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "private, no-store" },
});

type PublicReport = {
  schema_version: number; source: string; observed_at: string; run_id: string;
  managers: Record<string, { status: string; metrics: { label: string; count: number }[]; nextAction: string }>;
};

export function decodePublicReport(raw: string, now = new Date()) {
  if (typeof raw !== "string" || raw.length > 16000 || !raw.startsWith(MARKER))
    throw new Error("invalid_report_marker");
  const fence = raw.indexOf("```json\n");
  if (fence < MARKER.length || fence > MARKER.length + 8) throw new Error("invalid_report_format");
  const start = fence + "```json\n".length;
  const end = raw.indexOf("\n```", start);
  if (end < start || end - start > 14000) throw new Error("invalid_report_format");
  const data = JSON.parse(raw.slice(start, end)) as PublicReport;
  if (data?.schema_version !== 1 || data.source !== "github_actions_public_repo" ||
      !/^\d{1,30}$/.test(String(data.run_id)) ||
      typeof data.observed_at !== "string" || !Number.isFinite(Date.parse(data.observed_at)))
    throw new Error("invalid_report_data");
  const age = now.getTime() - Date.parse(data.observed_at);
  if (age < -120000 || !Number.isFinite(age)) throw new Error("invalid_report_timestamp");
  const last: Record<string, unknown> = {};
  for (const manager of MANAGERS) {
    const entry = data.managers?.[manager];
    if (entry?.status !== "completed" || !Array.isArray(entry.metrics) || entry.metrics.length > 6 ||
        !entry.metrics.every(m => typeof m.label === "string" && m.label.length <= 90 &&
          Number.isSafeInteger(m.count) && m.count >= 0) ||
        typeof entry.nextAction !== "string" || entry.nextAction.length > 350)
      throw new Error("invalid_manager_report");
    const display_status = age > 90 * 60000 ? "stale" : "completed";
    last[manager] = {
      run_key: "github:" + manager + ":" + data.run_id,
      manager, source: "github_actions_public_repo", status: "completed", display_status,
      started_at: data.observed_at, finished_at: data.observed_at, lease_until: data.observed_at,
      result: {
        manager, status: "completed", title: manager.toUpperCase() + " · GitHub",
        observedAt: data.observed_at, source: "github_actions_public_repo",
        metrics: entry.metrics.map((m, index) => ({ key: String(index), label: m.label, count: m.count })),
        nextAction: entry.nextAction,
        note: "Comprobación real de GitHub; no ejecutó programación automática ni datos CRM.",
      },
    };
  }
  return { last, observedAt: now.toISOString(), ledgerUrl:
    "https://github.com/avaloncoreagency/Avalon-code/issues/108" };
}

export async function GET() {
  const owner = await getOwnerSession();
  if (!owner) return reply({ error: "No autorizado" }, 403);
  try {
    const result = await fetch(ISSUE_URL, {
      method: "GET", headers: { "accept": "application/vnd.github+json" },
      next: { revalidate: 60 }, signal: AbortSignal.timeout(8000),
    });
    if (!result.ok) throw new Error("github_unavailable");
    const issue = await result.json() as { number?: number; body?: string };
    if (issue.number !== 108 || typeof issue.body !== "string") throw new Error("invalid_ledger");
    return reply(decodePublicReport(issue.body));
  } catch {
    return reply({ error: "No existe historial horario verificable; GitHub no respondió o el job no está activo" }, 503);
  }
}
