import {notFound} from "next/navigation";
import {Suite} from "@/components/suite/suite";
import {PageHeader,DbNotice} from "@/components/os/ui";
import {NovaSettingsStudio} from "@/components/os/nova-settings-studio";
import {requireOwner} from "@/lib/auth/session";
import {getLang} from "@/lib/i18n-server";
import {getProject} from "@/lib/os/data";
import {isUuid} from "@/lib/os/domain";
import {readChatbot} from "@/lib/os/nova-settings";

export const dynamic="force-dynamic";
export default async function ChatbotStudio({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  if(!isUuid(id))notFound();
  const {supabase}=await requireOwner();
  const lang=await getLang();
  const project=await getProject(supabase,"chatbots",id);
  if(!project.error&&!project.data)notFound();
  return <Suite active="ai-chatbots">
    <PageHeader eyebrow="AI Chatbots / Nova"
      title={project.data?.name??"—"}
      crumbs={[{href:"/admin/workspace/ai-communications",label:"AI Communications Hub"},{href:"/admin/workspace/ai-chatbots",label:"AI Chatbots"},{href:`/admin/workspace/ai-chatbots/${id}`,label:project.data?.name??"—"}]}/>
    {project.error||!project.data?<DbNotice lang={lang} error={project.error??"unavailable"}/>:
      <NovaSettingsStudio kind="chatbot_product" projectId={id} projectName={project.data.name} version={project.data.version} lang={lang} initial={readChatbot(project.data.settings)}/>}
  </Suite>;
}
