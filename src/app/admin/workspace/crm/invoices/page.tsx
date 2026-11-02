import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, Tag, Unavailable, q, type Query } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { run } from "@/lib/os/data";
import { money } from "@/lib/sales/domain";
import s from "@/components/sales/sales.module.css";

export const dynamic = "force-dynamic";

type InvoiceRow = {
  id: string; stripe_invoice_id: string | null; status: string;
  currency: string; amount_minor: string | number; created_at: string;
  needs_review: boolean; review_reason: string; hosted_invoice_url: string | null;
  sale_id: string; client_id: string;
  crm_sales: { sale_number: string } | null;
  crm_clients: { legal_name: string } | null;
};
const STATUS = ["creating","draft","open","paid","void","uncollectible","review"];
const PAGE = 25;

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const p = await searchParams;
  const filter = q(p,"status") ?? "all";
  const selected = STATUS.includes(filter) ? filter : "all";
  const page = Math.min(Number(/^\d{1,4}$/.test(q(p,"page") ?? "") ? q(p,"page") : 0), 2000);
  let query = supabase.from("crm_stripe_invoices")
    .select("id,stripe_invoice_id,status,currency,amount_minor,created_at,needs_review,review_reason,hosted_invoice_url,sale_id,client_id,crm_sales(sale_number),crm_clients(legal_name)", { count:"exact" });
  if (selected !== "all") query = query.eq("status",selected);
  const invoices = await run<InvoiceRow[]>(query.order("created_at", { ascending:false }).range(PAGE*page,PAGE*page+PAGE-1));
  const base = "/admin/workspace/crm/invoices";
  return <Suite active="crm"><div className={s.hud}>
    <OpsHeader lang={lang} active="invoices" crm="sales" eyebrow="Avalon OS / CRM / Invoices"
      title={pick(lang,"Facturas y cobros","Invoices and payments")}
      lead={pick(lang,
        "Facturas de prueba vinculadas a ventas reales del CRM. Una factura no es dinero cobrado: los cobros se confirman mediante webhooks firmados.",
        "Sandbox invoices linked to CRM sales. Invoices are not collected revenue: signed webhooks confirm actual payment.")}/>
    <div className={s.actions} aria-label={pick(lang,"Filtrar facturas","Filter invoices")}>
      {["all",...STATUS].map(v => <Link key={v} className={s.button} href={v==="all"?base:`${base}?status=${v}`}
        aria-current={selected===v?"page":undefined}>{v==="all" ? pick(lang,"Todas","All") : v.replaceAll("_"," ")}</Link>)}
    </div>
    <section className={s.panel} aria-labelledby="invoice-table"><header><h2 id="invoice-table">{pick(lang,"Facturas registradas","Recorded invoices")}</h2></header>
      {invoices.error ? <Unavailable lang={lang} code={invoices.error}/> :
       invoices.data.length === 0 ? <p className={s.muted}>{pick(lang,"Sin facturas en esta categoría. Crea la primera desde una venta del CRM.","No invoices for this filter. Create the first one from a CRM sale.")}</p> :
       <div className={s.tableWrap}><table className={s.table} data-mobile-cards><thead><tr>
         <th>{pick(lang,"Factura","Invoice")}</th><th>{pick(lang,"Cliente","Client")}</th><th>{pick(lang,"Venta","Sale")}</th>
         <th>{pick(lang,"Importe","Amount")}</th><th>{pick(lang,"Estado","Status")}</th><th>{pick(lang,"Fecha","Date")}</th>
       </tr></thead><tbody>{invoices.data.map(i=><tr key={i.id}>
         <td data-label={pick(lang,"Factura","Invoice")}>
           <Link href={`/admin/workspace/crm/sales/${i.sale_id}#stripe-invoices`}>{i.stripe_invoice_id ?? i.id.slice(0,8)}</Link>
           {i.hosted_invoice_url?.startsWith("https://invoice.stripe.com/") && <>
             <br/><a target="_blank" rel="noopener noreferrer" href={i.hosted_invoice_url}>{pick(lang,"Abrir en Stripe","Open in Stripe")}</a></>}
         </td>
         <td data-label={pick(lang,"Cliente","Client")}><Link href={`/admin/workspace/crm/clients/${i.client_id}`}>{i.crm_clients?.legal_name ?? "—"}</Link></td>
         <td data-label={pick(lang,"Venta","Sale")}><Link href={`/admin/workspace/crm/sales/${i.sale_id}`}>{i.crm_sales?.sale_number ?? "—"}</Link></td>
         <td data-label={pick(lang,"Importe","Amount")}>{money(lang,Number(i.amount_minor)/100,i.currency)}</td>
         <td data-label={pick(lang,"Estado","Status")}><Tag lang={lang} value={i.status}/>
           {i.needs_review && <span className={s.muted} role="alert"> · {pick(lang,"Revisar","Review")}: {i.review_reason}</span>}</td>
         <td data-label={pick(lang,"Fecha","Date")}>{formatDate(lang,i.created_at,true)}</td>
       </tr>)}</tbody></table></div>}
      {!invoices.error && <div className={s.actions} style={{marginTop:14}}>
        {page>0 && <Link className={s.button} href={`${base}?status=${selected}&page=${page-1}`}>{pick(lang,"Anterior","Previous")}</Link>}
        {(page+1)*PAGE<(invoices.count??0) && <Link className={s.button} href={`${base}?status=${selected}&page=${page+1}`}>{pick(lang,"Siguiente","Next")}</Link>}
      </div>}
    </section>
    <p className={s.muted}>{pick(lang,
      "Stripe Tax está desactivado hasta verificar obligaciones fiscales y registros activos. Los reembolsos y disputas requieren revisión; nunca se contabilizan automáticamente sin conciliación.",
      "Stripe Tax is disabled until tax registrations are confirmed. Refunds and disputes require review before reconciliation.")}</p>
  </div></Suite>;
}
