import { Suite } from "@/components/suite/suite";
import { PageHeader, Flash, param, type SearchParams } from "@/components/os/ui";
import { ProjectsIndex } from "@/components/os/projects";
import { ModuleSectionTabs } from "@/components/os/module-sections";
import s from "@/components/os/os.module.css";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { listProjects } from "@/lib/os/data";
import { CURRENCIES } from "@/lib/os/domain";

export const dynamic = "force-dynamic";

export default async function EcommerceDesignerPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const showArchived = param(params, "archived") === "1";
  const projects = await listProjects(supabase, "ecommerce", { includeArchived: showArchived });
  return (
    <Suite active="ecommerce-designer">
      <PageHeader eyebrow="E-commerce Designer" title={pick(lang, "Tiendas en línea", "Online stores")}
        description={pick(lang, "Gestiona catálogos de proyectos de tienda: productos, categorías, precios, inventario e imágenes. Sin pagos reales y sin tocar la tienda pública actual.", "Manage store project catalogs: products, categories, pricing, inventory and images. No real payments and no changes to the current public store.")} />
      <ModuleSectionTabs base="/admin/workspace/ecommerce-designer" lang={lang} active="library" />
      <Flash lang={lang} ok={param(params, "ok")} error={param(params, "error")} />
      <ProjectsIndex lang={lang} module="ecommerce" base="/admin/workspace/ecommerce-designer" projects={projects} noun={{ es: "tiendas", en: "stores" }} showArchived={showArchived}
        createFields={
          <label className={s.field}><span>{pick(lang, "Moneda", "Currency")}</span>
            <select className={s.select} name="currency" defaultValue="USD">{CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
          </label>
        } />
    </Suite>
  );
}
