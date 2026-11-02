import { getOwnerSession } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { getProject, run } from "@/lib/os/data";
import { isUuid } from "@/lib/os/domain";
import { pageToHtml } from "@/lib/os/exporters";
import { download, exportError } from "@/lib/os/export-route";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; pageId: string }> }) {
  const { id, pageId } = await params;
  const session = await getOwnerSession();
  if (!session) return exportError("unauthorized");
  if (!isUuid(id) || !isUuid(pageId)) return exportError("not_found");
  const project = await getProject(session.supabase, "website", id);
  if (project.error) return exportError(project.error);
  if (!project.data) return exportError("not_found");
  const page = await run<{ title: string; slug: string; seo_description: string; blocks: unknown } | null>(session.supabase
    .from("os_website_pages").select("title,slug,seo_description,blocks").eq("id", pageId).eq("project_id", id).maybeSingle());
  if (page.error) return exportError(page.error);
  if (!page.data) return exportError("not_found");
  return download(pageToHtml(page.data, await getLang()), `${page.data.slug}.html`, "text/html; charset=utf-8");
}
