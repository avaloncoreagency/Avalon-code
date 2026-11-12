import Link from "next/link";
import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { PageHeader, Flash, DbNotice, Panel, Empty, param, type SearchParams } from "@/components/os/ui";
import { ProjectSettingsForm } from "@/components/os/projects";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { getProject } from "@/lib/os/data";
import { isUuid } from "@/lib/os/domain";

export const dynamic = "force-dynamic";
const BASE = "/admin/workspace/ai-chatbots";

export default async function ChatbotProjectPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const query = await searchParams;
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const project = await getProject(supabase, "chatbots", id);
  if (!project.error && !project.data) notFound();
  return (
    <Suite active="ai-chatbots">
      <PageHeader eyebrow="AI Chatbots" title={project.data?.name ?? "—"}
        description={project.data?.description || undefined}
        crumbs={[{ href: BASE, label: "AI Chatbots" }]} />
      <Flash lang={lang} ok={param(query, "ok")} error={param(query, "error")} />
      {project.error ? <DbNotice lang={lang} error={project.error} /> : project.data && <>
        <Panel title={pick(lang, "Constructor de chatbot", "Chatbot builder")} id="chatbot-builder">
          <Empty title={pick(lang, "Herramientas de IA pendientes", "AI tools pending")}
            body={pick(lang, "Esta es una ficha real del proyecto. Todavía no tiene entrenamiento, respuestas automáticas ni widget público. No se procesan mensajes.", "This is a real project record. Training, automated replies and public widget are not implemented. No messages are processed.")}>
            <Link href={`${BASE}/builder`}>{pick(lang, "Ver plan del Constructor", "View builder plan")}</Link>
          </Empty>
        </Panel>
        <Panel title={pick(lang, "Biblioteca y configuración", "Library and settings")} id="chatbot-project-settings">
          <ProjectSettingsForm lang={lang} project={project.data} />
        </Panel>
      </>}
    </Suite>
  );
}
