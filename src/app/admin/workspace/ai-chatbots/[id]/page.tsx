import Link from "next/link";
import {notFound} from "next/navigation";
import {Suite} from "@/components/suite/suite";
import {PageHeader, Flash, DbNotice, Panel, param, type SearchParams} from "@/components/os/ui";
import {ProjectSettingsForm} from "@/components/os/projects";
import {requireOwner} from "@/lib/auth/session";
import {getLang} from "@/lib/i18n-server";
import {pick} from "@/lib/i18n";
import {getProject} from "@/lib/os/data";
import {isUuid} from "@/lib/os/domain";

export const dynamic="force-dynamic";
const BASE="/admin/workspace/ai-chatbots";
export default async function ChatbotProject({params,searchParams}:{params:Promise<{id:string}>;searchParams:SearchParams}) {
  const {id}=await params;
  if(!isUuid(id))notFound();
  const query=await searchParams;
  const {supabase}=await requireOwner();
  const lang=await getLang();
  const project=await getProject(supabase,"chatbots",id);
  if(!project.error&&!project.data)notFound();
  return <Suite active="ai-chatbots">
    <PageHeader eyebrow="AI Chatbots" title={project.data?.name??"—"}
      description={project.data?.description||undefined}
      crumbs={[{href:"/admin/workspace/ai-communications",label:"AI Communications Hub"},{href:BASE,label:"AI Chatbots"}]}
      actions={project.data?<Link href={`${BASE}/${id}/studio`}>{pick(lang,"Abrir Constructor","Open Builder")}</Link>:undefined}/>
    <Flash lang={lang} ok={param(query,"ok")} error={param(query,"error")}/>
    {project.error?<DbNotice lang={lang} error={project.error}/>:project.data&&<>
      <Panel title={pick(lang,"Constructor web","Web builder")}>
        <p>{pick(lang,"Puedes configurar y guardar el chatbot, sin activar respuestas automáticas ni un widget público.","You can configure and save the chatbot without activating automatic replies or a public widget.")}</p>
        <Link href={`${BASE}/${id}/studio`}>{pick(lang,"Editar el chatbot","Edit chatbot")}</Link>
      </Panel>
      <Panel title={pick(lang,"Proyecto y empresa","Project and company")}>
        <ProjectSettingsForm lang={lang} project={project.data}/>
      </Panel>
    </>}
  </Suite>;
}
