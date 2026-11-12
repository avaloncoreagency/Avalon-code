import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { PageHeader, Flash, param, type SearchParams } from "@/components/os/ui";
import { ProjectsIndex } from "@/components/os/projects";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { listProjects } from "@/lib/os/data";

export const dynamic = "force-dynamic";

export default async function AiReceptionistPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const showArchived = param(params, "archived") === "1";
  const projects = await listProjects(supabase, "receptionist", { includeArchived: showArchived });
  return (
    <Suite active="ai-receptionist">
      <PageHeader eyebrow="AI Receptionist" title={pick(lang, "Asistentes de recepción", "Reception assistants")}
        description={pick(lang, "Configura nombre, personalidad, horarios, preguntas frecuentes, base de conocimiento y reglas de transferencia a una persona. Ningún proveedor de IA, voz o mensajería está conectado: no se generan ni simulan conversaciones.", "Configure name, personality, hours, FAQ, knowledge base and human handoff rules. No AI, voice or messaging provider is connected: no conversations are generated or simulated.")} />
      <p><Link href="/admin/workspace/ai-communications">AI Communications Hub</Link> · <Link href="/admin/workspace/ai-receptionist/builder">{pick(lang,"Constructor","Builder")}</Link></p>
      <Flash lang={lang} ok={param(params, "ok")} error={param(params, "error")} />
      <ProjectsIndex lang={lang} module="receptionist" base="/admin/workspace/ai-receptionist" projects={projects} noun={{ es: "asistentes", en: "assistants" }} showArchived={showArchived} />
    </Suite>
  );
}
