import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { PageHeader, DbNotice } from "@/components/os/ui";
import { WebsiteStudio, type StudioPage } from "@/components/os/website-studio";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { getProject, run } from "@/lib/os/data";
import { isUuid, readBlocks } from "@/lib/os/domain";

export const dynamic = "force-dynamic";
const BASE = "/admin/workspace/website-designer";

/** Nova Website Designer (Codex UI) backed by the project's real pages: every reload rehydrates from Supabase. */
export default async function WebsiteStudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const project = await getProject(supabase, "website", id);
  if (!project.error && !project.data) notFound();
  const rows = project.data
    ? await run<{ id: string; title: string; blocks: unknown; version: number }[]>(
      supabase.from("os_website_pages").select("id,title,blocks,version").eq("project_id", id).order("position").order("created_at").limit(30))
    : null;
  const pages: StudioPage[] = (rows?.data ?? []).map(p => ({ id: p.id, title: p.title, blocks: readBlocks(p.blocks), version: p.version }));

  return (
    <Suite active="website-designer">
      <PageHeader eyebrow="Website Designer · Nova" title={project.data?.name ?? "—"}
        crumbs={[{ href: BASE, label: "Website Designer" }, { href: `${BASE}/${id}`, label: project.data?.name ?? "—" }]} />
      {project.error ? <DbNotice lang={lang} error={project.error} /> : rows?.error ? <DbNotice lang={lang} error={rows.error} /> : (
        <WebsiteStudio projectId={id} projectName={project.data?.name ?? ""} lang={lang} initialPages={pages} />
      )}
    </Suite>
  );
}
