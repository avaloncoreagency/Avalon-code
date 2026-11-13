import { Suite } from "@/components/suite/suite";
import { PageHeader, Flash, param, type SearchParams } from "@/components/os/ui";
import { ProjectsIndex } from "@/components/os/projects";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { listProjects } from "@/lib/os/data";

export const dynamic = "force-dynamic";

export default async function CrmCreatorPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const showArchived = param(params, "archived") === "1";
  const pageRaw=Number(param(params,"page") || "1");
  const page=Number.isSafeInteger(pageRaw) && pageRaw>=1 && pageRaw<=1000?pageRaw:1;
  const projects = await listProjects(supabase, "crm_creator", { includeArchived: showArchived, page });
  return (
    <Suite active="crm-creator">
      <PageHeader eyebrow="CRM Creator" title={pick(lang, "Mis CRMs", "My Client CRMs")}
        description={pick(lang, "Registra CRMs externos creados con Claude o Codex. Abre su acceso autorizado, conserva entregas y lleva sus incidencias; no los construimos aquí.", "Register client CRMs built with Claude or Codex. Open authorized access, retain deliveries and track issues; they are not built here.")} />
      <Flash lang={lang} ok={param(params, "ok")} error={param(params, "error")} />
      <ProjectsIndex lang={lang} module="crm_creator" base="/admin/workspace/crm-creator" projects={projects} noun={{ es: "diseños de CRM", en: "CRM designs" }} showArchived={showArchived} page={page}
 />
    </Suite>
  );
}
