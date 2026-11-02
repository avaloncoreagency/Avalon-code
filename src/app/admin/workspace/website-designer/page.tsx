import { Suite } from "@/components/suite/suite";
import { PageHeader, Flash, param, type SearchParams } from "@/components/os/ui";
import { ProjectsIndex } from "@/components/os/projects";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { listProjects } from "@/lib/os/data";

export const dynamic = "force-dynamic";

export default async function WebsiteDesignerPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const showArchived = param(params, "archived") === "1";
  const projects = await listProjects(supabase, "website", { includeArchived: showArchived });
  return (
    <Suite active="website-designer">
      <PageHeader eyebrow="Website Designer" title={pick(lang, "Proyectos web", "Web projects")}
        description={pick(lang, "Gestiona webs de clientes, responsables, repositorios y tareas. Las páginas locales son recursos de Avalon; editar o publicar un sitio externo requiere su conexión autorizada.", "Manage client websites, owners, repositories and tasks. Local pages are Avalon resources; editing or publishing an external site requires its authorized connection.")} />
      <Flash lang={lang} ok={param(params, "ok")} error={param(params, "error")} />
      <ProjectsIndex lang={lang} module="website" base="/admin/workspace/website-designer" projects={projects} noun={{ es: "proyectos web", en: "web projects" }} showArchived={showArchived} />
    </Suite>
  );
}
