import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { PageHeader, Panel, Empty } from "@/components/os/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export default async function ConversationsIndex() {
  await requireOwner();
  const lang=await getLang();
  return <Suite active="ai-communications">
    <PageHeader eyebrow="AI Communications / Conversations"
      title={pick(lang,"Conversaciones","Conversations")}
      description={pick(lang,"Historial de conversaciones reales: pendiente de conexión. No hay mensajes, llamadas ni transcripciones creadas artificialmente.","Real conversation history: provider not connected. No fabricated messages, calls or transcripts.")}
      crumbs={[{href:"/admin/workspace/ai-communications",label:"AI Communications Hub"}]} />
    <Panel title={pick(lang,"Estado del canal","Channel status")}>
      <Empty title={pick(lang,"Sin canales conectados","No connected channels")}
        body={pick(lang,"Las configuraciones de AI Chatbots y AI Receptionist no envían ni reciben mensajes todavía.","AI Chatbots and AI Receptionist configurations do not send or receive messages yet.")}>
        <Link href="/admin/workspace/ai-chatbots">{pick(lang,"Configurar chatbots","Configure chatbots")}</Link>
        {" · "}<Link href="/admin/workspace/ai-receptionist">{pick(lang,"Configurar recepcionistas","Configure receptionists")}</Link>
      </Empty>
    </Panel>
    <Panel title={pick(lang,"Requisitos antes de conectar un proveedor","Before connecting a provider")}>
      <p>{pick(lang,"Proveedor aprobado, autenticación de webhooks, consentimiento para grabación o transcripción cuando aplique, retención limitada, protección de datos del cliente y transferencia humana verificable.","Approved provider, authenticated webhooks, consent for recording or transcription where required, limited retention, client data protection and verifiable human handoff.")}</p>
    </Panel>
  </Suite>;
}
