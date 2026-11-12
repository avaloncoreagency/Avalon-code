import "server-only";
import { NextResponse } from "next/server";

/** JSON reply that is never cached. */
export const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

/**
 * CSRF guard for cookie-authenticated JSON routes: the browser must say the request comes from this same origin.
 * (Server actions get this check from Next.js; plain route handlers must do it themselves.)
 */
export function sameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = req.headers.get("origin");
  if (!origin) return site === "same-origin";
  try { return new URL(origin).host === new URL(req.url).host; } catch { return false; }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Reads a JSON body with a hard size cap; anything else is rejected. */
export async function readJson(req: Request, maxBytes = 16_384): Promise<Record<string, unknown> | null> {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return null;
  const text = await req.text();
  if (text.length > maxBytes) return null;
  try { const v = JSON.parse(text); return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null; } catch { return null; }
}
export const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : null);
