import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { listProjects } from "@/lib/os/data";
import { PageHeader, Panel, Empty, DbNotice } from "@/components/os/ui";

export const dynamic = "force-dynamic";

export default async function ChatbotBuilder() {
  const {supabase}=await requireOwner();
  const lang=await getLang();
  const projects=await listProjects(supabase,"chatbots");
  return <Suite active="ai-chatbots">
    <PageHeader eyebrow="AI Chatbots / Builder" title={pick(lang,"Constructor de chatbots","Chatbot builder")}
      description={pick(lang,"Edita instrucciones, bienvenida, apariencia y conocimiento de cada chatbot guardado. No se generan respuestas de IA ni se publican widgets.","Edit instructions, greetings, appearance and knowledge for saved chatbots. No AI replies or widgets are published.")}
      crumbs={[{href:"/admin/workspace/ai-communications",label:"AI Communications Hub"},{href:"/admin/workspace/ai-chatbots",label:"AI Chatbots"}]} />
    <Panel title={pick(lang,"Proyectos disponibles","Available projects")}>
      {projects.error?<DbNotice lang={lang} error={projects.error}/>:!projects.data?.length?
        <Empty title={pick(lang,"Sin chatbots","No chatbots yet")} body={pick(lang,"Crea uno primero en la Biblioteca.","Create one in the Library first.")}>
          <Link href="/admin/workspace/ai-chatbots#new">{pick(lang,"Crear chatbot","Create chatbot")}</Link>
        </Empty>:
        <ul>{projects.data.map(p=><li key={p.id}><Link href={`/admin/workspace/ai-chatbots/${p.id}/studio`}>{p.name}</Link></li>)}</ul>}
    </Panel>
    <p>{pick(lang,"Proveedor de inferencia: no conectado · Widget público: no conectado · Conversaciones: no disponibles","Inference provider: not connected · Public widget: not connected · Conversations: unavailable")}</p>
  </Suite>;
}
