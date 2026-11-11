import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { PageHeader, DbNotice } from "@/components/os/ui";
import { NovaSettingsStudio } from "@/components/os/nova-settings-studio";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { getProject } from "@/lib/os/data";
import { isUuid } from "@/lib/os/domain";
import { readCrm } from "@/lib/os/nova-settings";

export const dynamic = "force-dynamic";
const BASE = "/admin/workspace/crm-creator";

/** Nova CRM Creator (Codex UI) backed by the project's stored settings: every reload rehydrates from Supabase. */
export default async function NovaStudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const project = await getProject(supabase, "crm_creator", id);
  if (!project.error && !project.data) notFound();
  return (
    <Suite active="crm-creator">
      <PageHeader eyebrow="CRM Creator · Nova" title={project.data?.name ?? "—"}
        crumbs={[{ href: BASE, label: "CRM Creator" }, { href: `${BASE}/${id}`, label: project.data?.name ?? "—" }]} />
      {project.error || !project.data ? <DbNotice lang={lang} error={project.error ?? "unavailable"} /> : (
        <NovaSettingsStudio kind="crm" projectId={id} projectName={project.data.name} version={project.data.version} lang={lang} initial={readCrm(project.data.settings)} />
      )}
    </Suite>
  );
}
