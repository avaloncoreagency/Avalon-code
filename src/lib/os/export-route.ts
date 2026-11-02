import "server-only";
import { NextResponse } from "next/server";
import type { DbErrorCode } from "./data";

export const EXPORT_HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } as const;

export function exportError(error: DbErrorCode | "unauthorized" | "not_found") {
  const status = error === "unauthorized" ? 401 : error === "not_found" ? 404 : error === "schema_pending" ? 503 : error === "denied" ? 403 : 500;
  return NextResponse.json({ error }, { status, headers: EXPORT_HEADERS });
}

export function download(body: string, filename: string, contentType: string) {
  return new NextResponse(body, {
    headers: { ...EXPORT_HEADERS, "Content-Type": contentType, "Content-Disposition": `attachment; filename="${filename}"` },
  });
}

export const stamp = () => new Date().toISOString().slice(0, 10);
