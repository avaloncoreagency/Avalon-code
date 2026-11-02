import Link from "next/link";
import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, OkFlash, ErrorFlash, Tag, Unavailable, ownerName, q, UUID_RE, type Query } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { run } from "@/lib/os/data";
import { SERVICES, isService } from "@/lib/os/client-hud";
import { label, money, PAYMENT_METHODS, WORK_ORDER_STATUSES } from "@/lib/sales/domain";
import { recordPayment, updateContract, updateWorkOrder } from "../actions";
import { createStripeInvoiceDraft, sendStripeInvoice } from "../stripe-actions";
import { stripeSandboxReady } from "@/lib/stripe/avalon";
import s from "@/components/sales/sales.module.css";
export const dynamic = "force-dynamic";

type Sale = { id: string; status: string; sale_number: string; correlation_id: string; client_id: string; lead_id: string | null; sold_on: string; currency: string; subtotal: string; discount_total: string; tax_rate: string; tax_total: string; total: string; recurring_monthly: string; billing_mode: string; upfront_amount: string; seller_id: string; contract_status: string; delivery_status: string; notes: string; confirmed_at: string; crm_clients: { legal_name: string; client_code: string } | null };
type Line = { id: string; position: number; description: string; quantity: string; unit_price: string; discount: string; line_total: string; billing_type: string; crm_service_catalog: { name: string; name_en: string } | null };
type Order = { id: string; sale_line_id: string; department_id: string; project_id: string | null; assignee_id: string; recurrence: string; status: string; due_on: string | null; crm_departments: { label: string; os_module: string | null } | null; os_projects: { name: string; module: string } | null };
type Payment = { id: string; amount: string; received_on: string; method: string; reference: string };
type StripeCrmInvoice = { id: string; sale_id: string; stripe_invoice_id: string | null; status: string; amount_minor: string | number; currency: string; needs_review: boolean; review_reason: string; hosted_invoice_url: string | null; created_at: string };
type Event = { id: number; event_type: string; module: string; detail: string; result: string; from_state: string | null; to_state: string | null; actor_id: string | null; created_at: string };

export default async function SaleDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Query> }) {
  const { supabase } = await requireOwner();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const lang = await getLang();
  const p = await searchParams;
  const sale = await run<Sale | null>(supabase.from("crm_sales").select("*,crm_clients(legal_name,client_code)").eq("id", id).maybeSingle());
  if (!sale.error && !sale.data) notFound();
  const [lines, orders, payments, owners, tasks, invoiceRows] = await Promise.all([
    run<Line[]>(supabase.from("crm_sale_lines").select("id,position,description,quantity,unit_price,discount,line_total,billing_type,crm_service_catalog(name,name_en)").eq("sale_id", id).order("position")),
    run<Order[]>(supabase.from("crm_work_orders").select("id,sale_line_id,department_id,project_id,assignee_id,recurrence,status,due_on,crm_departments(label,os_module),os_projects(name,module)").eq("sale_id", id).order("created_at").order("id")),
    run<Payment[]>(supabase.from("crm_payments").select("id,amount,received_on,method,reference").eq("sale_id", id).order("received_on")),
    run<{ user_id: string; email: string }[]>(supabase.rpc("crm_owner_directory")),
    run<{ work_order_id: string; status: string }[]>(supabase.from("crm_tasks").select("work_order_id,status").eq("sale_id", id).limit(1000)),
    run<StripeCrmInvoice[]>(supabase.from("crm_stripe_invoices").select("id,sale_id,stripe_invoice_id,status,amount_minor,currency,needs_review,review_reason,hosted_invoice_url,created_at").eq("sale_id", id).order("created_at", { ascending: false }).limit(50)),
  ]);
  const events = sale.data ? await run<Event[]>(supabase.from("crm_timeline").select("id,event_type,module,detail,result,from_state,to_state,actor_id,created_at").or(`correlation_id.eq.${sale.data.correlation_id},sale_id.eq.${id}`).order("id").limit(200)) : null;
  const ownerList = owners.data ?? [];
  const d = sale.data;
  const paid = (payments.data ?? []).reduce((sum, x) => sum + Number(x.amount), 0);
  const progress = (woId: string) => {
    const list = (tasks.data ?? []).filter(t => t.work_order_id === woId);
    return list.length ? `${list.filter(t => t.status === "done").length}/${list.filter(t => t.status !== "cancelled").length}` : "—";
  };
  return <Suite active="crm"><div className={s.hud}>
    <OpsHeader lang={lang} active="sales" crm="sales" eyebrow={`CRM / Ventas / ${d?.sale_number ?? ""}`} title={d ? `${d.sale_number} · ${d.crm_clients?.legal_name ?? ""}` : pick(lang, "Venta", "Sale")}
      lead={d ? `${formatDate(lang, d.sold_on)} · ${label(lang, d.billing_mode)} · ${pick(lang, "Vendedor", "Seller")}: ${ownerName(ownerList, d.seller_id)}` : undefined}
      actions={d && <><Link className={s.button} href={`/admin/workspace/crm/clients/${d.client_id}`}>{pick(lang, "Ficha 360° del cliente", "Client 360° profile")}</Link><Link className={s.button} href={`/admin/workspace/crm/activity?sale=${d.id}`}>{pick(lang, "Auditoría", "Audit")}</Link></>} />
    <OkFlash lang={lang} code={q(p, "ok")} /><ErrorFlash lang={lang} code={q(p, "error")} />
    {sale.error ? <Unavailable lang={lang} code={sale.error} /> : d && <>
      <section className={s.stats}>
        <div className={s.stat}><span>{pick(lang, "Total contratado", "Contracted total")}</span><strong>{money(lang, d.total, d.currency)}</strong><small>Subtotal {money(lang, d.subtotal, d.currency)} · {pick(lang, "Desc.", "Disc.")} {money(lang, d.discount_total, d.currency)} · {pick(lang, "Imp.", "Tax")} {money(lang, d.tax_total, d.currency)} ({Number(d.tax_rate)}%)</small></div>
        <div className={s.stat}><span>{pick(lang, "Cobrado", "Collected")}</span><strong>{money(lang, paid, d.currency)}</strong><small>{pick(lang, "Saldo pendiente", "Balance due")}: {money(lang, Number(d.total) - paid, d.currency)}</small></div>
        <div className={s.stat}><span>{pick(lang, "Pago inicial acordado", "Agreed upfront")}</span><strong>{money(lang, d.upfront_amount, d.currency)}</strong><small>{pick(lang, "Recurrente / mes", "Recurring / mo")}: {money(lang, d.recurring_monthly, d.currency)}</small></div>
        <div className={s.stat}><span>{pick(lang, "Contrato · Entrega", "Contract · Delivery")}</span><strong style={{ fontSize: 16, display: "flex", gap: 8, flexWrap: "wrap" }}><Tag lang={lang} value={d.contract_status} /><Tag lang={lang} value={d.delivery_status} /></strong>
          <form action={updateContract} className={s.inline} style={{ marginTop: 10 }}><input type="hidden" name="sale_id" value={d.id} />
            <label className={s.srOnly} htmlFor="contract_status">{pick(lang, "Estado del contrato", "Contract status")}</label>
            <select id="contract_status" name="contract_status" defaultValue={d.contract_status}>{["pending_signature", "signed", "cancelled"].map(x => <option key={x} value={x}>{label(lang, x)}</option>)}</select>
            <button className={s.button}>{pick(lang, "Guardar", "Save")}</button></form></div>
      </section>

      <section className={s.panel} aria-labelledby="orders"><header><h2 id="orders">{pick(lang, "Servicios, órdenes de trabajo y proyectos", "Services, work orders and projects")}</h2></header>
        {lines.error || orders.error ? <Unavailable lang={lang} code={(lines.error ?? orders.error)!} /> :
        <div className={s.tableWrap}><table className={s.table}><thead><tr><th>#</th><th>{pick(lang, "Servicio", "Service")}</th><th>{pick(lang, "Departamento / proyecto", "Department / project")}</th><th className={s.num}>{pick(lang, "Importe", "Amount")}</th><th>{pick(lang, "Tareas", "Tasks")}</th><th>{pick(lang, "Vence", "Due")}</th><th>{pick(lang, "Estado y responsable", "Status and assignee")}</th></tr></thead>
          <tbody>{(lines.data ?? []).map(line => { const wo = (orders.data ?? []).find(o => o.sale_line_id === line.id); const mod = wo?.os_projects?.module; return <tr key={line.id}>
            <td>{line.position}</td>
            <td><strong>{pick(lang, line.crm_service_catalog?.name ?? "", line.crm_service_catalog?.name_en || line.crm_service_catalog?.name || "")}</strong><br /><span className={s.muted}>{line.description || "—"}</span><br /><Tag lang={lang} value={line.billing_type} /></td>
            <td>{wo?.crm_departments?.label ?? "—"}{wo?.project_id && mod && isService(mod) ? <><br /><Link href={`/admin/workspace/products/${wo.project_id}`}>{wo.os_projects?.name}</Link> · <Link href={`/admin/workspace/${SERVICES[mod].slug}/${wo.project_id}`}>{SERVICES[mod].name}</Link></> : <><br /><span className={s.muted}>{pick(lang, "Sin proyecto de módulo (equipo comercial)", "No module project (sales team)")}</span></>}</td>
            <td className={s.num}>{money(lang, line.line_total, d.currency)}<br /><span className={s.muted}>{Number(line.quantity)} × {money(lang, line.unit_price, d.currency)}{Number(line.discount) > 0 ? ` − ${money(lang, line.discount, d.currency)}` : ""}</span></td>
            <td>{wo ? <Link href={`/admin/workspace/crm/tasks?work_order=${wo.id}`}>{progress(wo.id)}</Link> : "—"}</td>
            <td>{wo?.due_on ? formatDate(lang, wo.due_on) : "—"}{wo && wo.recurrence !== "none" && <><br /><Tag lang={lang} value={wo.recurrence} /></>}</td>
            <td>{wo && <form action={updateWorkOrder} className={s.inline}><input type="hidden" name="sale_id" value={d.id} /><input type="hidden" name="work_order_id" value={wo.id} />
              <label className={s.srOnly} htmlFor={`st-${wo.id}`}>{pick(lang, "Estado", "Status")}</label>
              <select id={`st-${wo.id}`} name="status" defaultValue={wo.status}>{WORK_ORDER_STATUSES.map(x => <option key={x} value={x}>{label(lang, x)}</option>)}</select>
              <label className={s.srOnly} htmlFor={`as-${wo.id}`}>{pick(lang, "Responsable", "Assignee")}</label>
              <select id={`as-${wo.id}`} name="assignee_id" defaultValue={wo.assignee_id}>{ownerList.map(o => <option key={o.user_id} value={o.user_id}>{o.email.split("@")[0]}</option>)}</select>
              <button className={s.button}>{pick(lang, "Guardar", "Save")}</button></form>}</td>
          </tr>; })}</tbody></table></div>}
      </section>

      <div className={s.columns}>
        <section className={s.panel} aria-labelledby="timeline"><header><h2 id="timeline">{pick(lang, "Línea de tiempo de la operación", "Operation timeline")}</h2></header>
          {!events || events.error ? <Unavailable lang={lang} code={events?.error ?? "unavailable"} /> : <ol className={s.timeline}>{events.data.map(e => <li key={e.id} data-result={e.result}>
            <strong>{e.event_type}</strong> <span className={s.muted}>· {e.module} · {ownerName(ownerList, e.actor_id)} · {formatDate(lang, e.created_at, true)}</span>
            <div className={s.muted}>{[e.from_state && e.to_state ? `${e.from_state} → ${e.to_state}` : e.to_state, e.detail].filter(Boolean).join(" · ")}</div></li>)}</ol>}
        </section>
        <section className={s.panel} aria-labelledby="stripe-invoices">
          <header><h2 id="stripe-invoices">{pick(lang, "Facturas · Stripe Sandbox", "Invoices · Stripe Sandbox")}</h2></header>
          <p className={s.muted}>{pick(lang, "Facturas vinculadas a esta venta. Un borrador no es un cobro; solo los pagos confirmados se suman a «Cobrado».", "Invoices linked to this sale. A draft is not a payment; only confirmed payments count as collected.")}</p>
          {q(p,"stripe_error") && <p role="alert" className={s.muted}>{pick(lang,
            q(p,"stripe_error") === "test_email_required" ? "Utiliza un contacto principal con correo sintético (.example.test o .example.invalid) en el Sandbox." :
            q(p,"stripe_error") === "not_configured" ? "El Stripe Sandbox de Preview todavía no está configurado." :
            "No se pudo completar la operación Stripe. Revisa la configuración, el saldo pendiente y el historial de la factura.",
            q(p,"stripe_error") === "test_email_required" ? "A synthetic test email is required for sandbox use." :
            q(p,"stripe_error") === "not_configured" ? "Stripe Sandbox is not configured in Preview." :
            "Stripe could not complete the operation. Check settings, balance and invoice history.")}</p>}
          {q(p,"stripe_ok") && <p role="status">{pick(lang, "Operación de factura de prueba completada. Verifica su estado abajo.", "Sandbox invoice action completed. Verify its status below.")}</p>}
          {invoiceRows.error ? <Unavailable lang={lang} code={invoiceRows.error} /> : <>
            {(invoiceRows.data ?? []).length === 0 ? <p className={s.muted}>{pick(lang, "Esta venta todavía no tiene facturas Stripe.", "No Stripe invoices for this sale yet.")}</p> :
              <ul className={s.list}>{(invoiceRows.data ?? []).map(inv => <li key={inv.id}>
                <strong>{money(lang, Number(inv.amount_minor) / 100, inv.currency)} · <Tag lang={lang} value={inv.status} /></strong>
                <span className={s.muted}>{inv.stripe_invoice_id ?? pick(lang, "Preparando borrador", "Preparing draft")} · {formatDate(lang, inv.created_at, true)}</span>
                {inv.needs_review && <span role="alert" className={s.muted}>{pick(lang, "Requiere revisión de Miguel o Samuel", "Owner review required")}: {inv.review_reason}</span>}
                {inv.hosted_invoice_url?.startsWith("https://invoice.stripe.com/") &&
                  <a href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer">{pick(lang, "Abrir factura Stripe", "Open Stripe invoice")}</a>}
                {inv.status === "creating" && stripeSandboxReady() &&
                  <form action={createStripeInvoiceDraft}><input type="hidden" name="sale_id" value={d.id} />
                    <button className={s.button}>{pick(lang, "Reintentar preparación", "Retry draft preparation")}</button></form>}
                {["draft", "open"].includes(inv.status) && !inv.hosted_invoice_url && !inv.needs_review && stripeSandboxReady() && process.env.STRIPE_ALLOW_TEST_SEND === "true" &&
                  <form action={sendStripeInvoice}><input type="hidden" name="sale_id" value={d.id}/><input type="hidden" name="invoice_id" value={inv.id}/>
                    <button className={s.button}>{pick(lang, "Autorizar envío de factura de prueba", "Approve sending test invoice")}</button></form>}
              </li>)}</ul>}
            {stripeSandboxReady() && d.status === "confirmed" && d.contract_status !== "cancelled" && d.currency === "USD" &&
              Number(d.total) > paid && !(invoiceRows.data ?? []).some(x => ["creating","draft","open","uncollectible","review"].includes(x.status)) &&
              <form action={createStripeInvoiceDraft} className={s.form} style={{ marginTop: 14 }}>
                <input type="hidden" name="sale_id" value={d.id}/>
                <button className={s.button}>{pick(lang, "Crear borrador de factura Stripe", "Create Stripe invoice draft")}</button>
              </form>}
            {!stripeSandboxReady() && <p className={s.muted}>{pick(lang, "Pendiente de configurar claves de prueba en Vercel Preview. No se aceptan pagos reales.", "Waiting for test credentials in Vercel Preview. Live payments are disabled.")}</p>}
          </>}
        </section>
        <section className={s.panel} aria-labelledby="payments"><header><h2 id="payments">{pick(lang, "Cobros registrados", "Recorded payments")}</h2></header>
          {payments.error ? <Unavailable lang={lang} code={payments.error} /> : payments.data.length === 0 ? <p className={s.muted}>{pick(lang, "Sin cobros registrados. El pago inicial acordado no cuenta como cobrado.", "No payments recorded. The agreed upfront payment does not count as collected.")}</p> :
            <ul className={s.list}>{payments.data.map(x => <li key={x.id}><strong>{money(lang, x.amount, d.currency)}</strong><span className={s.muted}>{formatDate(lang, x.received_on)} · {label(lang, x.method)}{x.reference ? ` · ${x.reference}` : ""}</span></li>)}</ul>}
          {d.contract_status !== "cancelled" && Number(d.total) - paid > 0 && <form action={recordPayment} className={s.form} style={{ marginTop: 14 }}><input type="hidden" name="sale_id" value={d.id} />
            <div className={s.row}>
              <label className={s.field}>{pick(lang, "Importe", "Amount")} ({d.currency})<input name="amount" required inputMode="decimal" pattern="\d{1,13}(\.\d{1,2})?" /></label>
              <label className={s.field}>{pick(lang, "Fecha de cobro", "Received on")}<input name="received_on" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
            </div>
            <div className={s.row}>
              <label className={s.field}>{pick(lang, "Método", "Method")}<select name="method">{PAYMENT_METHODS.map(m => <option key={m} value={m}>{label(lang, m)}</option>)}</select></label>
              <label className={s.field}>{pick(lang, "Referencia (sin datos bancarios)", "Reference (no bank details)")}<input name="reference" maxLength={120} /></label>
            </div>
            <button className={s.button}>{pick(lang, "Registrar cobro", "Record payment")}</button>
          </form>}
          {d.notes && <><h3>{pick(lang, "Notas", "Notes")}</h3><p className={s.muted} style={{ whiteSpace: "pre-wrap" }}>{d.notes}</p></>}
        </section>
      </div>
    </>}
  </div></Suite>;
}
