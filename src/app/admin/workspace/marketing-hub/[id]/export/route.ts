import { getOwnerSession } from "@/lib/auth/session";
import { getProject, run } from "@/lib/os/data";
import { isUuid, slugify } from "@/lib/os/domain";
import { toCsv } from "@/lib/os/exporters";
import { download, exportError, stamp } from "@/lib/os/export-route";

export const dynamic = "force-dynamic";
type Row = { title: string; channel: string; status: string; planned_for: string | null; body: string; asset_url: string; notes: string; updated_at: string };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getOwnerSession();
  if (!session) return exportError("unauthorized");
  if (!isUuid(id)) return exportError("not_found");
  const project = await getProject(session.supabase, "marketing", id);
  if (project.error) return exportError(project.error);
  if (!project.data) return exportError("not_found");
  const items = await run<Row[]>(session.supabase.from("os_marketing_items")
    .select("title,channel,status,planned_for,body,asset_url,notes,updated_at").eq("project_id", id)
    .order("planned_for", { ascending: true, nullsFirst: false }).limit(5000));
  if (items.error) return exportError(items.error);
  const csv = toCsv(
    ["planned_for", "title", "channel", "status", "body", "asset_url", "notes", "updated_at"],
    (items.data ?? []).map(i => [i.planned_for ?? "", i.title, i.channel, i.status, i.body, i.asset_url, i.notes, i.updated_at]),
  );
  return download(csv, `${slugify(project.data.name) || "campaign"}-content-${stamp()}.csv`, "text/csv; charset=utf-8");
}
