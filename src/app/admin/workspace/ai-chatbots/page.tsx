import { Suite } from "@/components/suite/suite";
import { PageHeader, Flash, param, type SearchParams } from "@/components/os/ui";
import { ProjectsIndex } from "@/components/os/projects";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { listProjects } from "@/lib/os/data";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ChatbotsLibrary({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const archived = param(query, "archived") === "1";
  const projects = await listProjects(supabase, "chatbots", { includeArchived: archived });
  return <Suite active="ai-chatbots">
    <PageHeader eyebrow="AI Communications / AI Chatbots"
      title={pick(lang, "Biblioteca de chatbots", "Chatbot library")}
      description={pick(lang,
        "Proyectos web independientes por cliente. Guarda configuración y conocimiento privado; las respuestas automáticas, el widget y los canales externos todavía no están conectados.",
        "Independent client web projects. Store private configuration and knowledge; automatic replies, the widget and external channels are not connected yet.")}
      actions={<Link href="/admin/workspace/ai-chatbots/builder">{pick(lang, "Abrir Constructor", "Open Builder")}</Link>}
      crumbs={[{href:"/admin/workspace/ai-communications",label:"AI Communications Hub"}]} />
    <Flash lang={lang} ok={param(query,"ok")} error={param(query,"error")} />
    <ProjectsIndex lang={lang} module="chatbots" base="/admin/workspace/ai-chatbots"
      projects={projects} noun={{es:"chatbots registrados",en:"registered chatbots"}} showArchived={archived} />
  </Suite>;
}
