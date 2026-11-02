import { NextResponse, type NextRequest } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { getProject } from "@/lib/os/data";
import { blueprintToSql, isUuid, readBlueprint, slugify } from "@/lib/os/domain";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getOwnerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  const project = await getProject(session.supabase, "crm_creator", id);
  if (project.error) return NextResponse.json({ error: project.error }, { status: project.error === "schema_pending" ? 503 : 500, headers });
  if (!project.data) return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  const blueprint = readBlueprint(project.data.settings);
  const name = slugify(project.data.name) || "crm";
  if (request.nextUrl.searchParams.get("format") === "sql") {
    const prefix = name.replace(/-/g, "_").replace(/^[^a-z]+/, "").slice(0, 20) || "client";
    return new NextResponse(blueprintToSql(blueprint, prefix), {
      headers: { ...headers, "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${name}-preview.sql"` },
    });
  }
  const body = JSON.stringify({ format: "avalon-crm-blueprint", exportedAt: new Date().toISOString(), project: { id: project.data.id, name: project.data.name, version: project.data.version }, blueprint }, null, 2);
  return new NextResponse(body, {
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.json"` },
  });
}
