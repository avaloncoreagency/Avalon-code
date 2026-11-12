import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { PageHeader, Panel } from "@/components/os/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export default async function CommunicationsAppointments() {
  await requireOwner();
  const lang=await getLang();
  return <Suite active="ai-communications">
    <PageHeader eyebrow="AI Communications / Appointments"
      title={pick(lang,"Citas y solicitudes","Appointments and requests")}
      description={pick(lang,"El calendario de CRM es la única agenda operativa. Este Hub no crea una segunda base de citas.","The CRM calendar is the only operational scheduling tool. This Hub does not create a second appointment database.")}
      crumbs={[{href:"/admin/workspace/ai-communications",label:"AI Communications Hub"}]} />
    <Panel title={pick(lang,"Calendario compartido","Shared calendar")}>
      <p>{pick(lang,"Consulta citas, reuniones y seguimiento existentes. Los chatbots y recepcionistas no pueden prometer disponibilidad ni confirmar citas por sí mismos mientras no exista una integración autorizada.","View existing appointments, meetings and follow-ups. Chatbots and receptionists cannot promise availability or confirm appointments without an authorized integration.")}</p>
      <Link href="/admin/workspace/crm/calendar">{pick(lang,"Abrir calendario CRM","Open CRM calendar")}</Link>
    </Panel>
  </Suite>;
}
