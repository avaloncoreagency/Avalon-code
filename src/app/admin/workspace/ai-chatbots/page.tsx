import { Suite } from "@/components/suite/suite";
import { PageHeader, Flash, param, type SearchParams, Panel } from "@/components/os/ui";
import { ProjectsIndex } from "@/components/os/projects";
import { ModuleSectionTabs } from "@/components/os/module-sections";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { listProjects } from "@/lib/os/data";
import s from "@/components/os/os.module.css";

export const dynamic = "force-dynamic";

export default async function ChatbotsLibrary({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const showArchived = param(query, "archived") === "1";
  const projects = await listProjects(supabase, "chatbots", { includeArchived: showArchived });
  return (
    <Suite active="ai-chatbots">
      <PageHeader eyebrow="AI Chatbots" title={pick(lang, "Biblioteca de chatbots", "Chatbot library")}
        description={pick(lang, "Registra los bots de cada cliente y su relación con el CRM. La inferencia, la base de conocimiento y el widget se implementarán en etapas siguientes.", "Register client bots and their CRM relationship. Inference, knowledge base and the widget will be implemented in later phases.")} />
      <ModuleSectionTabs base="/admin/workspace/ai-chatbots" lang={lang} active="library" />
      <Flash lang={lang} ok={param(query, "ok")} error={param(query, "error")} />
      <Panel title={pick(lang, "Estado del módulo", "Module status")} id="chatbots-status">
        <p className={s.meta}>{pick(lang, "La biblioteca requiere la migración de AI Chatbots preparada en este PR. No se genera ni se simula ninguna conversación.", "The library needs the AI Chatbots migration prepared in this PR. No conversations are generated or simulated.")}</p>
      </Panel>
      <ProjectsIndex lang={lang} module="chatbots" base="/admin/workspace/ai-chatbots" projects={projects}
        noun={{ es: "chatbots registrados", en: "registered chatbots" }} showArchived={showArchived} />
    </Suite>
  );
}
