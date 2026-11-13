import Link from "next/link";
import { requireOwner } from "@/lib/auth/session";
import { pick, type Lang } from "@/lib/i18n";
import { bridgeMessages } from "@/lib/project-bridge/messages";
import { CATEGORY_LABEL, CATEGORIES, type Category } from "@/lib/project-bridge/policy";
import { Importer, ProcessButton } from "@/components/library/importer";
import { Panel } from "./ui";
import s from "./os.module.css";

type DeliveryRow = { id: string; status: string; original_name: string; source_tool: string; project_id: string | null; created_at: string };
/** A single shared Project Bridge is presented inside its destination module, never as a global library. */
export async function ModuleDeliveryPanel({ lang, module }: { lang: Lang; module: Category }) {
  const { supabase } = await requireOwner();
  const rows = await supabase.from("os_project_imports")
    .select("id,status,original_name,source_tool,project_id,created_at")
    .eq("category",module).order("created_at",{ascending:false}).limit(25);
  const incoming = (rows.data ?? [] as DeliveryRow[]).filter(r =>
    ["received","failed"].includes(r.status) && r.project_id === null);
  return <div id="deliveries"><Panel title={pick(lang,"Recibir archivos y entregas","Receive files and deliveries")}>
    <p className={s.meta}>{pick(lang,
      "Primero registra el producto con su cliente y URL; después adjunta un ZIP desde Versiones. También puedes importar un ZIP nuevo aquí, pero quedará sin cliente hasta vincularlo.",
      "Register a product with its client and URL first; then attach its ZIP under Versions. A new ZIP may also be imported here and linked to its client afterward.")}</p>
    <p className={s.meta}>{pick(lang,
      `Destino: ${CATEGORY_LABEL[module].es}. Las entregas de API usan Project Bridge y necesitan una revisión autorizada.`,
      `Destination: ${CATEGORY_LABEL[module].en}. API deliveries use Project Bridge and require authorized review.`)}</p>
    <Importer lang={lang === "en" ? "en" : "es"} defaultCategory={module} lockedCategory={module} messages={bridgeMessages(lang === "en" ? "en" : "es")} />
    {rows.error && <p role="alert" className={s.meta}>{pick(lang,
      "No se pudo cargar la bandeja. Puede faltar la migración de Project Bridge o los permisos de esta sesión.",
      "Could not load the inbox. The Project Bridge migration or session permissions may be missing.")}</p>}
    {incoming.length > 0 && <div className={s.row}><h3>{pick(lang,"Entregas de IA pendientes","Pending AI deliveries")}</h3>
      <ul>{incoming.map(r => <li key={r.id}>
        {r.original_name} · {r.source_tool} · {r.status}{" "}
        <ProcessButton importId={r.id} label={pick(lang,"Revisar y registrar","Review and register")} />
      </li>)}</ul>
    </div>}
    {rows.data && rows.data.length > 0 && <p className={s.meta}>{pick(lang,"Historial reciente:","Recent history:")}{" "}
      {(rows.data as DeliveryRow[]).slice(0,6).map(r => <span key={r.id}>{r.original_name} ({r.status}){" "}
        {r.project_id ? <Link href={`/admin/workspace/products/${r.project_id}`}>{pick(lang,"Abrir","Open")}</Link> : null} · </span>)}
    </p>}
    <p className={s.meta}>{pick(lang,
      "Para Claude Code y Codex se reutiliza la API privada de Project Bridge. No se crean productos ni se ejecutan ZIP aquí.",
      "Claude Code and Codex use the existing private Project Bridge API. Products are not generated here and imported ZIPs are never executed.")}</p>
    <p><Link href="/admin/workspace/library/tokens">{pick(lang,"Credenciales limitadas de entrega","Scoped delivery credentials")}</Link></p>
  </Panel></div>;
}
