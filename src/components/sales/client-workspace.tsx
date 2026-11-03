import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { run } from "@/lib/os/data";
import { pick, formatDate, type Lang } from "@/lib/i18n";
import { money } from "@/lib/sales/domain";
import { saveClientWorkspace, createClientJournalEntry, reviseClientJournalEntry, appendClientCost } from "@/app/admin/workspace/crm/clients/workspace-actions";
import s from "./sales.module.css";

type Workspace = { client_id: string; package_name: string; development_stage: string; next_step: string; version: number };
type Journal = { id: string; kind: string; title: string; body: string; version: number; updated_at: string };
type Revision = { id: number; entry_id: string; version: number; before_value: unknown; after_value: unknown; edited_by: string; edited_at: string };
type WorkspaceRevision = { id: number; version: number; before_value: unknown; after_value: unknown; edited_by: string; edited_at: string };
type Cost = { id: string; amount: string; currency: string; category: string; memo: string; incurred_on: string; created_at: string };
type Sale = { id: string; sale_number: string; currency: string; total: string; recurring_monthly: string; crm_payments: { amount: string }[] };
type Line = { id: string; description: string; billing_type: string; quantity: string; line_total: string; crm_service_catalog: { name: string } | null };
const kinds: [string, string, string][] = [
  ["note","Nota","Note"],["meeting","Reunión","Meeting"],
  ["milestone","Hito","Milestone"],["decision","Decisión","Decision"]
];

export async function ClientWorkspace({ supabase, clientId, lang, sales, financeAllowed, demo }: {
  supabase: SupabaseClient; clientId: string; lang: Lang; sales: Sale[]; financeAllowed: boolean; demo: boolean;
}) {
  const [workspace, journal, costs, revisions, detailRevisions] = await Promise.all([
    run<Workspace | null>(supabase.from("crm_client_workspace").select("client_id,package_name,development_stage,next_step,version").eq("client_id",clientId).maybeSingle()),
    run<Journal[]>(supabase.from("crm_client_journal").select("id,kind,title,body,version,updated_at").eq("client_id",clientId).order("created_at",{ascending:false}).limit(100)),
    financeAllowed ? run<Cost[]>(supabase.from("crm_client_costs").select("id,amount,currency,category,memo,incurred_on,created_at").eq("client_id",clientId).order("incurred_on",{ascending:false}).limit(200)) : Promise.resolve({ data: [] as Cost[], error: null, count: null }),
    run<Revision[]>(supabase.from("crm_client_journal_revisions").select("id,entry_id,version,before_value,after_value,edited_by,edited_at").eq("client_id",clientId).order("id",{ascending:false}).limit(100)),
    run<WorkspaceRevision[]>(supabase.from("crm_client_workspace_revisions").select("id,version,before_value,after_value,edited_by,edited_at").eq("client_id",clientId).order("id",{ascending:false}).limit(50)),
  ]);
  const salesIds = financeAllowed ? sales.map(x=>x.id) : [];
  const lines = salesIds.length
    ? await run<Line[]>(supabase.from("crm_sale_lines").select("id,description,billing_type,quantity,line_total,crm_service_catalog(name)").in("sale_id",salesIds).limit(150))
    : { data: [] as Line[], error: null };
  const pending = [workspace,journal,costs,revisions,detailRevisions].some(x=>x.error==="schema_pending");
  const failed = [workspace,journal,costs,revisions,detailRevisions].some(x=>!!x.error && x.error!=="schema_pending");
  const revenue = new Map<string,{ contracted:number; collected:number; recurring:number; expenses:number }>();
  const ledger = (currency: string) => {
    const v = revenue.get(currency) ?? {contracted:0,collected:0,recurring:0,expenses:0};
    revenue.set(currency,v);return v;
  };
  for (const x of sales) {
    const v = ledger(x.currency);v.contracted+=Number(x.total);
    v.collected+=x.crm_payments.reduce((a,y)=>a+Number(y.amount),0);
    v.recurring+=Number(x.recurring_monthly);
  }
  for (const x of costs.data??[]) ledger(x.currency).expenses+=Number(x.amount);
  const w = workspace.data;
  return <section className={s.panel} id="internal-workspace" aria-label={pick(lang,"Expediente interno del cliente","Internal client dossier")}>
    <header><div><h2>{pick(lang,"Expediente interno · Staff","Internal dossier · Staff")}</h2>
      <p className={s.muted}>{pick(lang,
        "Los cobros provienen de ventas confirmadas; los gastos son registros internos acumulados. No se inventan costos ni pagos.",
        "Collections come from confirmed sales; expenses are cumulative internal entries. Costs and payments are never estimated.")}</p></div>
      <Link href="/admin/search">{pick(lang,"Finder global","Global finder")}</Link>
    </header>
    {demo && <section className={s.notice} aria-label={pick(lang,"Escenario comercial ilustrativo","Illustrative commercial scenario")}>
      <strong>{pick(lang,"DEMO · Propuesta comercial simulada — no contratada ni cobrada","DEMO · Simulated proposal — not contracted or collected")}</strong>
      <p>{pick(lang,"Chino Barber · Crecimiento Local: sitio web, reservas, SEO local y WhatsApp. Etapa sugerida: diagnóstico inicial.","Chino Barber · Local Growth: website, bookings, local SEO and WhatsApp. Suggested stage: discovery.")}</p>
      {financeAllowed && <div className={s.stats}>
        <div className={s.stat}><span>{pick(lang,"Implementación estimada","Estimated setup")}</span><strong>US$1,800</strong><small>{pick(lang,"Gasto ilustrativo US$550 · margen ilustrativo US$1,250","Illustrative cost US$550 · margin US$1,250")}</small></div>
        <div className={s.stat}><span>{pick(lang,"Mantenimiento estimado / mes","Estimated monthly maintenance")}</span><strong>US$250</strong><small>{pick(lang,"Gasto ilustrativo US$80 · margen ilustrativo US$170/mes","Illustrative cost US$80 · margin US$170/month")}</small></div>
      </div>}
      <p>{pick(lang,"Estos importes son exclusivamente ejemplos visuales: no se guardan como ventas, gastos, pagos o contratos.","These amounts are display-only examples: they are not posted as sales, expenses, payments or contracts.")}</p>
    </section>}
    {pending && <p role="status" className={s.notice}>{pick(lang,"La migración del expediente interno aún no está aplicada. No se muestran cifras incompletas.","The internal dossier migration has not been applied. Incomplete amounts are hidden.")}</p>}
    {failed && <p role="alert" className={s.notice}>{pick(lang,"No fue posible leer parte del expediente. Verifica los permisos y la base de datos.","Part of the dossier could not be loaded. Verify permissions and database.")}</p>}
    {!(pending||failed) && <>
      {financeAllowed && <div className={s.stats}>
        {[...revenue.entries()].map(([currency,totals])=><div key={currency} className={s.stat}>
          <span>{pick(lang,"Rentabilidad registrada","Recorded profitability")} · {currency}</span>
          <strong>{money(lang,totals.collected-totals.expenses,currency)}</strong>
          <small>{pick(lang,"Cobrado","Collected")}: {money(lang,totals.collected,currency)}</small>
          <small>{pick(lang,"Gastos","Expenses")}: {money(lang,totals.expenses,currency)}</small>
          <small>{pick(lang,"Contratado","Contracted")}: {money(lang,totals.contracted,currency)} · MRR {money(lang,totals.recurring,currency)}</small>
        </div>)}
        {revenue.size===0 && <p className={s.muted}>{pick(lang,"Sin movimientos financieros registrados.","No recorded financial transactions.")}</p>}
      </div>}
      <div className={s.columns}>
        <section aria-labelledby="workspace-package">
          <h3 id="workspace-package">{pick(lang,"Paquete y desarrollo","Package and development")}</h3>
          <form action={saveClientWorkspace} className={s.form}>
            <input type="hidden" name="client_id" value={clientId}/>
            <input type="hidden" name="version" value={w?.version??0}/>
            <label className={s.field}>{pick(lang,"Membresía / paquete contratado","Purchased membership / package")}
              <input name="package_name" maxLength={160} defaultValue={w?.package_name??""} placeholder={pick(lang,"Nombre del paquete confirmado","Verified package name")}/></label>
            <label className={s.field}>{pick(lang,"Etapa actual","Current stage")}
              <input name="development_stage" maxLength={100} defaultValue={w?.development_stage??""} placeholder={pick(lang,"Ej.: Implementación","E.g. Implementation")}/></label>
            <label className={s.field}>{pick(lang,"Dónde nos quedamos / próximo paso","Last progress / next step")}
              <textarea name="next_step" rows={3} maxLength={2000} defaultValue={w?.next_step??""}/></label>
            <button className={s.button}>{pick(lang,"Guardar y auditar cambios","Save and audit changes")}</button>
          </form>
          <h3>{pick(lang,"Servicios comprados","Purchased services")}</h3>
          {!financeAllowed ? <p className={s.muted}>{pick(lang,"Los importes y contratos se muestran únicamente al responsable financiero.","Amounts and contracts are available only to the finance administrator.")}</p> : lines.error ? <p className={s.muted}>{pick(lang,"Servicios no disponibles.","Services unavailable.")}</p> :
            lines.data.length===0 ? <p className={s.muted}>{pick(lang,"Sin servicios asociados a una venta.","No services linked to a sale.")}</p> :
            <ul className={s.list}>{lines.data.map(line=><li key={line.id}>
              <strong>{line.crm_service_catalog?.name??line.description}</strong>
              <span className={s.muted}>{line.billing_type} · {line.quantity} × {line.line_total} {pick(lang,"(total de línea)","(line total)")}</span>
            </li>)}</ul>}
        </section>
        {financeAllowed && <section aria-labelledby="workspace-costs">
          <h3 id="workspace-costs">{pick(lang,"Gastos reales del cliente","Actual client expenses")}</h3>
          <p className={s.muted}>{pick(lang,"No se eliminan movimientos. Para corregir uno, registra un ajuste negativo con explicación.","Entries cannot be deleted. Correct an entry with a documented negative adjustment.")}</p>
          <form action={appendClientCost} className={s.form}>
            <input type="hidden" name="client_id" value={clientId}/>
            <div className={s.row}>
              <label className={s.field}>{pick(lang,"Monto (negativo = ajuste)","Amount (negative = adjustment)")}<input name="amount" type="number" step="0.01" required/></label>
              <label className={s.field}>{pick(lang,"Moneda","Currency")}<input name="currency" maxLength={3} defaultValue={sales[0]?.currency??"USD"} required/></label>
            </div>
            <div className={s.row}>
              <label className={s.field}>{pick(lang,"Categoría","Category")}<input name="category" maxLength={100} required placeholder={pick(lang,"Personal, software, ads…","Staff, software, ads…")}/></label>
              <label className={s.field}>{pick(lang,"Fecha","Date")}<input name="incurred_on" type="date" required/></label>
            </div>
            <label className={s.field}>{pick(lang,"Detalle y justificación","Details and reason")}<textarea name="memo" maxLength={1000} required rows={2}/></label>
            <button className={s.button}>{pick(lang,"Registrar gasto / ajuste","Record expense / adjustment")}</button>
          </form>
          <ol className={s.timeline}>{(costs.data??[]).map(x=><li key={x.id}>
            <strong>{money(lang,Number(x.amount),x.currency)}</strong> · {x.category} · {formatDate(lang,x.incurred_on)}
            <div className={s.muted}>{x.memo}</div>
          </li>)}</ol>
        </section>}
      </div>
      <section aria-labelledby="workspace-journal">
        <h3 id="workspace-journal">{pick(lang,"Historial permanente y editable","Permanent, editable history")}</h3>
        <form action={createClientJournalEntry} className={s.form}>
          <input type="hidden" name="client_id" value={clientId}/>
          <div className={s.row}>
            <label className={s.field}>{pick(lang,"Tipo","Type")}<select name="kind">{kinds.map(([key,es,en])=><option key={key} value={key}>{pick(lang,es,en)}</option>)}</select></label>
            <label className={s.field}>{pick(lang,"Título","Title")}<input name="title" maxLength={160} required/></label>
          </div>
          <label className={s.field}>{pick(lang,"Descripción","Description")}<textarea name="journal_body" maxLength={4000} rows={3} required/></label>
          <button className={s.button}>{pick(lang,"Agregar registro","Add record")}</button>
        </form>
        <ol className={s.timeline}>{(journal.data??[]).map(item=><li key={item.id}>
          <strong>{item.title}</strong> · {item.kind}
          <div style={{whiteSpace:"pre-wrap"}}>{item.body}</div>
          <small className={s.muted}>{formatDate(lang,item.updated_at,true)} · v{item.version}</small>
          <details><summary>{pick(lang,"Editar (conserva versiones previas)","Edit (preserves previous versions)")}</summary>
            <form action={reviseClientJournalEntry} className={s.form}>
              <input type="hidden" name="client_id" value={clientId}/>
              <input type="hidden" name="entry_id" value={item.id}/>
              <input type="hidden" name="version" value={item.version}/>
              <label className={s.field}>{pick(lang,"Tipo","Type")}<select name="kind" defaultValue={item.kind}>{kinds.map(([key,es,en])=><option key={key} value={key}>{pick(lang,es,en)}</option>)}</select></label>
              <label className={s.field}>{pick(lang,"Título","Title")}<input name="title" defaultValue={item.title} maxLength={160} required/></label>
              <label className={s.field}>{pick(lang,"Nota","Note")}<textarea name="journal_body" defaultValue={item.body} maxLength={4000} rows={3} required/></label>
              <button className={s.button}>{pick(lang,"Guardar nueva versión","Save new version")}</button>
            </form>
          </details>
        </li>)}</ol>
      </section>
      <details><summary>{pick(lang,"Registro de auditoría (historial de ediciones)","Audit log (edit history)")}</summary>
        <ol className={s.timeline}>
          {(detailRevisions.data??[]).map(r=><li key={`w-${r.id}`}>
            <strong>{pick(lang,"Paquete / desarrollo","Package / progress")} · v{r.version}</strong>
            <div className={s.muted}>{formatDate(lang,r.edited_at,true)} · {r.edited_by}</div>
            <pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",fontSize:12}}>{JSON.stringify({before:r.before_value,after:r.after_value},null,2)}</pre>
          </li>)}
          {(revisions.data??[]).map(r=><li key={`j-${r.id}`}>
            <strong>{pick(lang,"Historial","Journal")} · v{r.version}</strong>
            <div className={s.muted}>{formatDate(lang,r.edited_at,true)} · {r.edited_by}</div>
            <pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",fontSize:12}}>{JSON.stringify({before:r.before_value,after:r.after_value},null,2)}</pre>
          </li>)}
        </ol>
      </details>
    </>}
  </section>;
}
