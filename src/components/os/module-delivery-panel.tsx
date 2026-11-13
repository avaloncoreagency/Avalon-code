import Link from "next/link";
import { requireOwner } from "@/lib/auth/session";
import { pick, type Lang } from "@/lib/i18n";
import { bridgeMessages } from "@/lib/project-bridge/messages";
import { CATEGORY_LABEL, bridgeCategoryEnabled, type Category } from "@/lib/project-bridge/policy";
import { Importer, ProcessButton } from "@/components/library/importer";
import { assignPendingImport } from "@/app/admin/workspace/product-delivery-actions";
import { Panel } from "./ui";
import s from "./os.module.css";

type DeliveryRow = { id: string; status: string; original_name: string; source_tool: string; project_id: string | null; created_at: string };
type ProductOption = { id: string; name: string };

/** Shared Bridge, separate module portfolios. Extended categories are disabled pending reviewed SQL approval. */
export async function ModuleDeliveryPanel({ lang, module }: { lang: Lang; module: Category }) {
  const { supabase } = await requireOwner();
  const enabled = bridgeCategoryEnabled(module,process.env.AVALON_PRODUCT_CONTROL_EXTENDED_UPLOADS === "true");
  const [rows, projects] = await Promise.all([
    supabase.from("os_project_imports").select("id,status,original_name,source_tool,project_id,created_at")
      .eq("category",module).order("created_at",{ascending:false}).limit(30),
    supabase.from("os_projects").select("id,name").eq("module",module).neq("status","archived")
      .order("updated_at",{ascending:false}).limit(100),
  ]);
  const pending = ((rows.data ?? []) as DeliveryRow[]).filter(r => ["received","failed"].includes(r.status));
  const t=(es:string,en:string)=>pick(lang,es,en);
  return <div id={`deliveries-${module}`}><Panel title={t("Importaciones y entregas","Imports and deliveries")}>
    <p className={s.meta}>{t(
      "Registra primero el producto con su cliente y URL. Desde su ficha puedes adjuntar versiones. Para nuevas entregas de API, aprueba una importación o vincúlala primero al producto existente.",
      "Register the product with its client and URL first. Attach versions from its record. For incoming API deliveries, approve a new import or link it to an existing product first.")}</p>
    <p className={s.meta}>{t("Destino del módulo","Module destination")}: {CATEGORY_LABEL[module][lang==="es"?"es":"en"]}</p>
    {enabled ? <Importer lang={lang==="en"?"en":"es"} lockedCategory={module} defaultCategory={module} messages={bridgeMessages(lang==="en"?"en":"es")} /> :
      <p className={s.meta} role="status">{t(
        "La importación ZIP de esta categoría está preparada, pero inactiva hasta aprobar y aplicar la ampliación SQL de Project Bridge y habilitarla en el servidor. El registro manual de URL sí está disponible.",
        "ZIP imports for this category are prepared but disabled until the Project Bridge SQL extension is reviewed and applied, then enabled server-side. Manual URL registration remains available.")}</p>}
    {rows.error && <p role="alert" className={s.meta}>{t("Bandeja no disponible: verificar esquema y permisos de Project Bridge.","Inbox unavailable: check Project Bridge schema and permissions.")}</p>}
    {pending.length>0&&<div className={s.row}>
      <h3>{t("Entregas pendientes de revisión","Deliveries awaiting review")}</h3>
      <ul>{pending.map(r=><li key={r.id}>
        <strong>{r.original_name}</strong> · {r.source_tool} · {r.status}
        {!r.project_id && (projects.data??[]).length>0&&<form action={assignPendingImport} className={s.form}>
          <input type="hidden" name="import_id" value={r.id}/><input type="hidden" name="category" value={module}/>
          <label>{t("Actualizar un producto existente (opcional)","Update existing product (optional)")}
            <select name="project_id" required defaultValue="">
              <option value="">{t("Seleccionar producto","Select product")}</option>
              {((projects.data??[]) as ProductOption[]).map(p=><option key={p.id} value={p.id}>{p.name} ({p.id.slice(0,8)})</option>)}
            </select>
          </label><button className={s.btnPrimary} type="submit">{t("Vincular esta entrega","Link this delivery")}</button>
        </form>}
        {r.project_id&&<p><Link href={`/admin/workspace/products/${r.project_id}`}>{t("Producto vinculado","Linked product")}</Link></p>}
        <ProcessButton importId={r.id} label={r.project_id?t("Validar y añadir versión","Validate and add version"):t("Validar como nuevo producto sin vincular","Validate as new unlinked product")}/>
      </li>)}</ul>
    </div>}
    {rows.data && rows.data.length>0&&<p className={s.meta}>{t("Últimas entregas","Recent deliveries")}:{" "}
      {((rows.data??[]) as DeliveryRow[]).slice(0,5).map(r=><span key={r.id}>{r.original_name} ({r.status}){" "}
        {r.project_id?<Link href={`/admin/workspace/products/${r.project_id}`}>{t("Abrir","Open")}</Link>:null} · </span>)}
    </p>}
    <p className={s.meta}>{t(
      "Claude Code y Codex pueden usar el token limitado de Project Bridge. La recepción no ejecuta ZIP ni publica nada. Los agentes externos y los clientes se validan antes de activar servicios.",
      "Claude Code and Codex can use scoped Project Bridge tokens. Incoming ZIPs are never executed or published. External agents and clients require verification before activation.")}</p>
    <p><Link href="/admin/workspace/library/tokens">{t("Credenciales de entrega","Delivery credentials")}</Link></p>
  </Panel></div>;
}
