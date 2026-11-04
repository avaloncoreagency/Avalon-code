import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { decodePublicReport } from "@/lib/office/github-report";

export const dynamic = "force-dynamic";
const ISSUE_URL = "https://api.github.com/repos/avaloncoreagency/Avalon-code/issues/108";
const reply = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "private, no-store" },
});

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
