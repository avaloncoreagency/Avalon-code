import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Suite } from "@/components/suite/suite";
import { modules } from "@/components/suite/modules";
import { pick, type Lang } from "@/lib/i18n";
import type { ModuleKey } from "@/lib/os/domain";
import { listProjects } from "@/lib/os/data";
import { DbNotice, Empty, PageHeader, Panel, Tabs } from "./ui";
import s from "./os.module.css";

/** Library = existing project index; Builder = distinct private entry point. */
export function ModuleSectionTabs({ base, lang, active }: { base: string; lang: Lang; active: "library" | "builder" }) {
  return <Tabs label={pick(lang, "Secciones del módulo", "Module sections")} active={active} items={[
    { key: "library", href: base, label: pick(lang, "Biblioteca", "Library") },
    { key: "builder", href: `${base}/builder`, label: pick(lang, "Constructor", "Builder") },
  ]} />;
}

type BuilderCopy = { current: [string, string]; next: [string, string] };
const COPY: Record<ModuleKey, BuilderCopy> = {
  website: {
    current: ["Editor actual de páginas y bloques dentro de cada proyecto web.", "Existing page and block editor within each website project."],
    next: ["Integración visual Puck pendiente: todavía no hay edición drag-and-drop.", "Puck visual integration pending: drag-and-drop editing is not yet available."],
  },
  ecommerce: {
    current: ["Editor de productos, catálogo, precios e inventario por tienda.", "Product, catalog, pricing and inventory editor for each store."],
    next: ["Diseñador visual de tiendas y checkout real pendientes; no se procesan pagos.", "Visual storefront designer and real checkout pending; no payments are processed."],
  },
  crm_creator: {
    current: ["Constructor de entidades, campos, etapas y permisos, con exportación revisable.", "Entity, field, stage and permission builder with reviewable exports."],
    next: ["Implementación automática de esquemas de clientes pendiente de seguridad y aprobación.", "Automatic client schema provisioning pending security review and approval."],
  },
  receptionist: {
    current: ["Configuración de asistentes, horarios, base de conocimiento y transferencia humana.", "Assistant settings, hours, knowledge base and human handoff."],
    next: ["Voz telefónica y proveedores externos aún no conectados; no hay llamadas en vivo.", "Telephony and external voice providers are not connected; no live calls."],
  },
  marketing: {
    current: ["Calendario editorial, borradores, campañas y planificación por canal.", "Editorial calendar, drafts, campaigns and channel planning."],
    next: ["Funnels visuales y publicación automática pendientes; no se envían campañas externas.", "Visual funnels and automatic publishing pending; no external campaigns are sent."],
  },
  chatbots: {
    current: ["Registro y ficha operativa de proyectos de chatbot por cliente.", "Client chatbot project register and operations record."],
    next: ["Entrenamiento, editor de flujos, widget embebible e inferencia pendientes; no hay chats reales.", "Knowledge training, flow builder, embeddable widget and inference pending; no live chats."],
  },
};

export async function ModuleBuilderLanding({ module, lang, supabase }: { module: ModuleKey; lang: Lang; supabase: SupabaseClient }) {
  const def = modules.find(m => m.key === module)!;
  const projects = await listProjects(supabase, module);
  const rows = projects.data ?? [];
  const copy = COPY[module];
  return (
    <Suite active={def.slug}>
      <PageHeader eyebrow={def.name} title={pick(lang, "Constructor", "Builder")}
        description={pick(lang, "Abre un proyecto para utilizar las herramientas disponibles. Las integraciones futuras aparecerán aquí después de comprobarlas.", "Open a project to use available tools. Future integrations will appear here after verification.")} />
      <ModuleSectionTabs base={def.href} lang={lang} active="builder" />
      <Panel title={pick(lang, "Herramientas disponibles", "Available tools")} id="builder-current">
        <p className={s.meta}>{pick(lang, ...copy.current)}</p>
        {projects.error ? <DbNotice lang={lang} error={projects.error} /> : rows.length === 0 ?
          <Empty title={pick(lang, "Sin proyectos todavía", "No projects yet")}
            body={pick(lang, "Crea un proyecto primero desde la Biblioteca. Aquí no se inventan proyectos.", "Create a project in the Library first. No sample projects are invented here.")}>
            <Link href={`${def.href}#new`}>{pick(lang, "Crear proyecto en Biblioteca", "Create project in Library")}</Link>
          </Empty> :
          <ul className={s.stack}>
            {rows.map(row => <li key={row.id}>
              <Link href={`${def.href}/${row.id}`}>{row.name}</Link>
              <span className={s.meta}> · {pick(lang, "Abrir ficha / herramientas existentes", "Open record / existing tools")}</span>
            </li>)}
          </ul>
        }
      </Panel>
      <Panel title={pick(lang, "Próxima integración", "Next integration")} id="builder-next">
        <p className={s.meta}>{pick(lang, ...copy.next)}</p>
      </Panel>
    </Suite>
  );
}
