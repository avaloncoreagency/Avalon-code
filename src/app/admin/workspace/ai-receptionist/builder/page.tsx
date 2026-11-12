import Link from "next/link";
import {Suite} from "@/components/suite/suite";
import {requireOwner} from "@/lib/auth/session";
import {getLang} from "@/lib/i18n-server";
import {pick} from "@/lib/i18n";
import {listProjects} from "@/lib/os/data";
import {PageHeader,Panel,Empty,DbNotice} from "@/components/os/ui";

export const dynamic="force-dynamic";
export default async function ReceptionBuilder() {
  const {supabase}=await requireOwner();
  const lang=await getLang();
  const projects=await listProjects(supabase,"receptionist");
  return <Suite active="ai-receptionist">
    <PageHeader eyebrow="AI Communications / AI Receptionist" title={pick(lang,"Constructor de recepcionistas","Receptionist builder")}
      description={pick(lang,"Configura cada recepcionista existente: idiomas, horario, preguntas frecuentes y transferencia humana. La voz real no está conectada.","Configure each receptionist: languages, hours, FAQ and human handoff. Live voice is not connected.")}
      crumbs={[{href:"/admin/workspace/ai-communications",label:"AI Communications Hub"},{href:"/admin/workspace/ai-receptionist",label:"AI Receptionist"}]}/>
    <Panel title={pick(lang,"Proyectos de recepción","Reception projects")}>
      {projects.error?<DbNotice lang={lang} error={projects.error}/>:!projects.data?.length?
        <Empty title={pick(lang,"Sin recepcionistas","No receptionists yet")} body={pick(lang,"Crea primero un asistente desde la Biblioteca.","Create an assistant in the Library first.")}>
          <Link href="/admin/workspace/ai-receptionist#new">{pick(lang,"Crear asistente","Create assistant")}</Link>
        </Empty>:<ul>{projects.data.map(p=><li key={p.id}><Link href={`/admin/workspace/ai-receptionist/${p.id}`}>{p.name}</Link></li>)}</ul>}
    </Panel>
  </Suite>;
}
