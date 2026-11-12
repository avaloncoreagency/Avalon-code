import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { PageHeader, Panel, Empty, DbNotice } from "@/components/os/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { listProjects, run } from "@/lib/os/data";
import { readChatbot } from "@/lib/os/nova-settings";
import s from "@/components/os/os.module.css";

export const dynamic = "force-dynamic";
type ReceptionKnowledge = { id: string; project_id: string; kind: "knowledge" | "faq"; question: string };

export default async function KnowledgeIndex() {
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const [bots, receptionists, entries] = await Promise.all([
    listProjects(supabase, "chatbots"),
    listProjects(supabase, "receptionist"),
    run<ReceptionKnowledge[]>(supabase.from("os_receptionist_entries")
      .select("id,project_id,kind,question").in("kind", ["knowledge","faq"])
      .order("created_at", { ascending: false }).limit(300)),
  ]);
  const known = (bots.data ?? []).length + (receptionists.data ?? []).length;
  return <Suite active="ai-communications">
    <PageHeader eyebrow="AI Communications / Knowledge Base"
      title={pick(lang,"Biblioteca central de conocimiento","Central knowledge index")}
      description={pick(lang,"Consulta fuentes de chatbots y recepcionistas por proyecto. Este índice NO comparte automáticamente contenido entre clientes ni publica información.","Find chatbot and receptionist sources by project. This index does NOT automatically share content between clients or publish information.")}
      crumbs={[{href:"/admin/workspace/ai-communications",label:"AI Communications Hub"}]} />
    <div className={s.stack}>
      {(bots.error || receptionists.error || entries.error) &&
        <p role="alert">{pick(lang,"Una fuente no está disponible; revisa los avisos de cada sección.","A source is unavailable; check the notices in each section.")}</p>}
      <Panel title="AI Chatbots">
        {bots.error ? <DbNotice lang={lang} error={bots.error} /> :
          !bots.data?.length ? <Empty title={pick(lang,"Sin chatbots","No chatbots yet")} body={pick(lang,"Registra uno en su Biblioteca.","Create one from its Library.")}><Link href="/admin/workspace/ai-chatbots">{pick(lang,"Abrir Biblioteca","Open Library")}</Link></Empty> :
          <ul>{bots.data.map(project => <li key={project.id}>
            <strong>{project.name}</strong> — {readChatbot(project.settings).knowledge.length} {pick(lang,"entradas guardadas","saved entries")}.
            {" "}<Link href={"/admin/workspace/ai-chatbots/" + project.id + "/studio"}>{pick(lang,"Editar fuentes","Edit sources")}</Link>
          </li>)}</ul>}
      </Panel>
      <Panel title="AI Receptionist">
        {receptionists.error ? <DbNotice lang={lang} error={receptionists.error} /> :
          entries.error ? <DbNotice lang={lang} error={entries.error} /> :
          !receptionists.data?.length ? <Empty title={pick(lang,"Sin recepcionistas","No receptionists yet")}><Link href="/admin/workspace/ai-receptionist">{pick(lang,"Abrir Biblioteca","Open Library")}</Link></Empty> :
          <ul>{receptionists.data.map(project => <li key={project.id}>
            <strong>{project.name}</strong> — {(entries.data ?? []).filter(e => e.project_id === project.id).length}
            {" "}{pick(lang,"FAQ y entradas visibles","visible FAQs and knowledge entries")}.
            {" "}<Link href={"/admin/workspace/ai-receptionist/" + project.id + "#knowledge"}>{pick(lang,"Administrar fuentes","Manage sources")}</Link>
          </li>)}</ul>}
      </Panel>
      <p className={s.meta}>{pick(lang,
        "Se muestran hasta 100 proyectos recientes de cada producto y 300 entradas recientes de recepción. No interpretes esos límites como totales. La reutilización entre productos exige permiso del cliente y control de versiones.",
        "Shows up to 100 recent projects of each product and 300 recent reception entries. These limits are not totals. Cross-product reuse requires client permission and version control.")}</p>
      {known > 0 && <p className={s.meta}>{pick(lang,"Los proyectos con contenido se administran en su constructor original. Ninguna fuente se activa para inferencia automáticamente.","Projects with content are managed in their original builder. No source is activated for inference automatically.")}</p>}
    </div>
  </Suite>;
}
