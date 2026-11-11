import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { PageHeader, DbNotice } from "@/components/os/ui";
import { NovaSettingsStudio } from "@/components/os/nova-settings-studio";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { getProject } from "@/lib/os/data";
import { isUuid } from "@/lib/os/domain";
import { readChatbot } from "@/lib/os/nova-settings";

export const dynamic = "force-dynamic";
const BASE = "/admin/workspace/ai-receptionist";

/** Nova AI Chatbots (Codex UI) backed by the project's stored settings: every reload rehydrates from Supabase. */
export default async function NovaStudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const project = await getProject(supabase, "receptionist", id);
  if (!project.error && !project.data) notFound();
  return (
    <Suite active="ai-receptionist">
      <PageHeader eyebrow="AI Chatbots · Nova" title={project.data?.name ?? "—"}
        crumbs={[{ href: BASE, label: "AI Chatbots" }, { href: `${BASE}/${id}`, label: project.data?.name ?? "—" }]} />
      {project.error || !project.data ? <DbNotice lang={lang} error={project.error ?? "unavailable"} /> : (
        <NovaSettingsStudio kind="chatbot" projectId={id} projectName={project.data.name} version={project.data.version} lang={lang} initial={readChatbot(project.data.settings)} />
      )}
    </Suite>
  );
}
