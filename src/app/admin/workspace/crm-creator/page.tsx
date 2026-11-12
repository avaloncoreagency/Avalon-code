import { Suite } from "@/components/suite/suite";
import { PageHeader, Flash, param, type SearchParams } from "@/components/os/ui";
import { ProjectsIndex } from "@/components/os/projects";
import { ModuleSectionTabs } from "@/components/os/module-sections";
import s from "@/components/os/os.module.css";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { listProjects } from "@/lib/os/data";
import { BLUEPRINT_TEMPLATES } from "@/lib/os/domain";

export const dynamic = "force-dynamic";

export default async function CrmCreatorPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const showArchived = param(params, "archived") === "1";
  const projects = await listProjects(supabase, "crm_creator", { includeArchived: showArchived });
  return (
    <Suite active="crm-creator">
      <PageHeader eyebrow="CRM Creator" title={pick(lang, "Diseñador de CRM para clientes", "CRM designer for clients")}
        description={pick(lang, "Define entidades, campos, pipelines, etapas y permisos por proyecto. Exporta la definición (JSON) y una vista previa SQL revisable. No ejecuta migraciones desde el navegador.", "Define entities, fields, pipelines, stages and permissions per project. Export the definition (JSON) and a reviewable SQL preview. No migrations are executed from the browser.")} />
      <ModuleSectionTabs base="/admin/workspace/crm-creator" lang={lang} active="library" />
      <Flash lang={lang} ok={param(params, "ok")} error={param(params, "error")} />
      <ProjectsIndex lang={lang} module="crm_creator" base="/admin/workspace/crm-creator" projects={projects} noun={{ es: "diseños de CRM", en: "CRM designs" }} showArchived={showArchived}
        createFields={
          <label className={s.field}><span>{pick(lang, "Plantilla inicial", "Starting template")}</span>
            <select className={s.select} name="template" defaultValue="">
              <option value="">{pick(lang, "En blanco", "Blank")}</option>
              {Object.entries(BLUEPRINT_TEMPLATES).map(([key, t]) => <option key={key} value={key}>{lang === "es" ? t.es : t.en}</option>)}
            </select>
          </label>
        } />
    </Suite>
  );
}
