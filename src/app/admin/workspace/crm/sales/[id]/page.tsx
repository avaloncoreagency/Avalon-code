import Link from "next/link";
import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, OkFlash, ErrorFlash, Tag, Unavailable, ownerName, q, UUID_RE, type Query } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { run } from "@/lib/os/data";
import { SERVICES, isService } from "@/lib/os/client-hud";
import { label, money, WORK_ORDER_STATUSES } from "@/lib/sales/domain";
import { readSalePaymentTerms, salePaymentMethodLabel, salePaymentScheduleLabel, installmentPreview, installmentSchedule, SALE_PAYMENT_METHODS, type SalePaymentMethod } from "@/lib/sales/payment-terms";
import { recordPayment, updateContract, updateWorkOrder } from "../actions";
import s from "@/components/sales/sales.module.css";
import { SaleCorePanels } from "@/components/sales/core-panels";
import { SaleSchedulePanel } from "@/components/sales/sale-schedule-panel";
import { SaleAgreementPanel } from "@/components/sales/sale-agreement-panel";
export const dynamic = "force-dynamic";

type Sale = { id: string; schedule_version?: number | null; status?: string; commercial_model?: string | null; sale_number: string; correlation_id: string; client_id: string; lead_id: string | null; sold_on: string; currency: string; subtotal: string; discount_total: string; tax_rate: string; tax_total: string; total: string; recurring_monthly: string; billing_mode: string; upfront_amount: string; seller_id: string; contract_status: string; delivery_status: string; notes: string; confirmed_at: string; crm_clients: { legal_name: string; client_code: string } | null };
type Line = { id: string; position: number; description: string; quantity: string; unit_price: string; discount: string; line_total: string; billing_type: string; crm_service_catalog: { name: string; name_en: string } | null };
type Order = { id: string; sale_line_id: string; department_id: string; project_id: string | null; assignee_id: string; recurrence: string; status: string; due_on: string | null; crm_departments: { label: string; os_module: string | null } | null; os_projects: { name: string; module: string } | null };
type Payment = { status?: string; id: string; amount: string; received_on: string; method: string; reference: string; installment_id?: string | null };
type Event = { id: number; event_type: string; module: string; detail: string; result: string; from_state: string | null; to_state: string | null; actor_id: string | null; created_at: string };

export default async function SaleDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Query> }) {
  const { supabase } = await requireOwner();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const lang = await getLang();
  const p = await searchParams;
  const sale = await run<Sale | null>(supabase.from("crm_sales").select("*,crm_clients(legal_name,client_code)").eq("id", id).maybeSingle());
  if (!sale.error && !sale.data) notFound();
  const [lines, orders, payments, owners, tasks, liveInstallments, receivable] = await Promise.all([
    run<Line[]>(supabase.from("crm_sale_lines").select("id,position,description,quantity,unit_price,discount,line_total,billing_type,crm_service_catalog(name,name_en)").eq("sale_id", id).order("position")),
    run<Order[]>(supabase.from("crm_work_orders").select("id,sale_line_id,department_id,project_id,assignee_id,recurrence,status,due_on,crm_departments(label,os_module),os_projects(name,module)").eq("sale_id", id).order("created_at").order("id")),
    run<Payment[]>(supabase.from("crm_payments").select("*").eq("sale_id", id).order("received_on")),
    run<{ user_id: string; email: string }[]>(supabase.rpc("crm_owner_directory")),
    run<{ work_order_id: string; status: string }[]>(supabase.from("crm_tasks").select("work_order_id,status").eq("sale_id", id).limit(1000)),
    // Finance-only via RLS; both are empty/errored (and ignored) without finance access or before migration 20261123150000.
    run<{ id: string; seq: number; kind: string; due_on: string; amount: string }[]>(supabase.from("crm_sale_installments").select("id,seq,kind,due_on,amount").eq("sale_id", id).eq("status", "scheduled").order("due_on").limit(120)),
    run<{ refunded: string; net_collected: string; balance: string } | null>(supabase.from("crm_sale_receivables").select("refunded,net_collected,balance").eq("sale_id", id).maybeSingle()),
  ]);
  const events = sale.data ? await run<Event[]>(supabase.from("crm_timeline").select("id,event_type,module,detail,result,from_state,to_state,actor_id,created_at").or(`correlation_id.eq.${sale.data.correlation_id},sale_id.eq.${id}`).order("id").limit(200)) : null;
  const ownerList = owners.data ?? [];
  const d = sale.data;
  const paymentTerms = readSalePaymentTerms(d?.notes);
  const installment = d && paymentTerms.terms?.schedule === "installments"
    ? installmentPreview(Number(d.total), Number(d.upfront_amount), paymentTerms.terms.installments) : null;
  const installmentRows = d && paymentTerms.terms?.schedule === "installments"
    ? installmentSchedule(Number(d.total), Number(d.upfront_amount), paymentTerms.terms) : null;
  const paid = (payments.data ?? []).filter(x=>x.status !== "reversed").reduce((sum, x) => sum + Number(x.amount), 0);
  // Net of refunds/chargebacks when the receivables view is available (finance access); recorded receipts otherwise.
  const net = !receivable.error && receivable.data ? Number(receivable.data.net_collected) : paid;
  const refunded = !receivable.error && receivable.data ? Number(receivable.data.refunded) : 0;
  // Balance from the receivables view (fixed total + VERIFIED variable settlements − net collected); fallback: total − net.
  const balanceDue = !receivable.error && receivable.data ? Number(receivable.data.balance) : (d ? Number(d.total) - net : 0);
  // The receipt form follows the DB cap (total + verified settlements − recorded receipts).
  const collectible = d ? Number(d.total) + Math.max(0, balanceDue + net - Number(d.total)) - paid : 0;
  const allocatedTo = (insId: string) => (payments.data ?? []).filter(x => x.status !== "reversed" && x.installment_id === insId).reduce((a, x) => a + Number(x.amount), 0);
  const openInstallments = (liveInstallments.error ? [] : liveInstallments.data ?? []).filter(i => Number(i.amount) - allocatedTo(i.id) > 0.004);
  const progress = (woId: string) => {
    const list = (tasks.data ?? []).filter(t => t.work_order_id === woId);
    return list.length ? `${list.filter(t => t.status === "done").length}/${list.filter(t => t.status !== "cancelled").length}` : "—";
  };
  return <Suite active="crm"><div className={s.hud}>
    <OpsHeader lang={lang} active="sales" crm="sales" eyebrow={`CRM / Ventas / ${d?.sale_number ?? ""}`} title={d ? `${d.sale_number} · ${d.crm_clients?.legal_name ?? ""}` : pick(lang, "Venta", "Sale")}
      lead={d ? `${formatDate(lang, d.sold_on)} · ${label(lang, d.billing_mode)} · ${pick(lang, "Vendedor", "Seller")}: ${ownerName(ownerList, d.seller_id)}` : undefined}
      actions={d && <><Link className={s.button} href={`/admin/workspace/crm/clients/${d.client_id}`}>{pick(lang, "Ficha 360° del cliente", "Client 360° profile")}</Link><Link className={s.button} href={`/admin/workspace/crm/clients/${d.client_id}/contracts`}>{pick(lang, "Contratos", "Agreements")}</Link><Link className={s.button} href={`/admin/workspace/crm/quotes?client=${d.client_id}`}>{pick(lang, "Cotizaciones del cliente", "Client quotes")}</Link><Link className={s.button} href={`/admin/workspace/crm/activity?sale=${d.id}`}>{pick(lang, "Auditoría", "Audit")}</Link></>} />
    <OkFlash lang={lang} code={q(p, "ok")} /><ErrorFlash lang={lang} code={q(p, "error")} />
    {sale.error ? <Unavailable lang={lang} code={sale.error} /> : d && <>
      <section className={s.stats}>
        <div className={s.stat}><span>{d.commercial_model === "commission" ? pick(lang, "Importe variable", "Variable amount") : pick(lang, "Total contratado", "Contracted total")}</span><strong>{d.commercial_model === "commission" ? pick(lang, "Según liquidación", "Per settlement") : money(lang, d.total, d.currency)}</strong>{d.commercial_model === "hybrid" && <small>{pick(lang, "+ componente variable pendiente de liquidación", "+ variable component pending settlement")}</small>}<small>Subtotal {money(lang, d.subtotal, d.currency)} · {pick(lang, "Desc.", "Disc.")} {money(lang, d.discount_total, d.currency)} · {pick(lang, "Imp.", "Tax")} {money(lang, d.tax_total, d.currency)} ({Number(d.tax_rate)}%)</small></div>
        <div className={s.stat}><span>{refunded > 0 ? pick(lang, "Cobrado neto", "Net collected") : pick(lang, "Cobrado", "Collected")}</span><strong>{money(lang, net, d.currency)}</strong><small>{pick(lang, "Saldo pendiente", "Balance due")}: {money(lang, balanceDue, d.currency)}{refunded > 0 ? ` · ${pick(lang, "reembolsado", "refunded")} ${money(lang, refunded, d.currency)}` : ""}</small></div>
        <div className={s.stat}><span>{pick(lang, "Pago inicial acordado", "Agreed upfront")}</span><strong>{money(lang, d.upfront_amount, d.currency)}</strong><small>{pick(lang, "Recurrente / mes", "Recurring / mo")}: {money(lang, d.recurring_monthly, d.currency)}</small></div>
        <div className={s.stat}><span>{pick(lang, "Contrato · Entrega", "Contract · Delivery")}</span><strong style={{ fontSize: 16, display: "flex", gap: 8, flexWrap: "wrap" }}><Tag lang={lang} value={d.contract_status} /><Tag lang={lang} value={d.delivery_status} /></strong>
          <form action={updateContract} className={s.inline} style={{ marginTop: 10 }}><input type="hidden" name="sale_id" value={d.id} />
            <label className={s.srOnly} htmlFor="contract_status">{pick(lang, "Estado del contrato", "Contract status")}</label>
            <select id="contract_status" name="contract_status" defaultValue={d.contract_status}>{["pending_signature", "signed", "cancelled"].map(x => <option key={x} value={x}>{label(lang, x)}</option>)}</select>
            <button className={s.button}>{pick(lang, "Guardar", "Save")}</button></form></div>
      </section>

      {paymentTerms.terms && <section className={s.panel} aria-labelledby="sale-payment-plan">
        <header><h2 id="sale-payment-plan">{pick(lang, "Plan de pago acordado", "Agreed payment plan")}</h2></header>
        <p className={s.muted}>{pick(lang, "Estas condiciones se registraron con la venta. No representan pagos recibidos, aprobación de financiación ni un débito automático.", "These terms were recorded with the sale. They are not received payments, financing approval or automatic debits.")}</p>
        <div className={s.row}>
          <p><strong>{pick(lang, "Método preferido", "Preferred method")}:</strong> {salePaymentMethodLabel(paymentTerms.terms.method, lang)}</p>
          <p><strong>{pick(lang, "Modalidad", "Arrangement")}:</strong> {salePaymentScheduleLabel(paymentTerms.terms.schedule, lang)}</p>
          <p><strong>{pick(lang, "Vence en", "Due in")}:</strong> {paymentTerms.terms.netDays} {pick(lang, "días", "days")}</p>
        </div>
        {installment && <div className={s.planSummary}>
          <p>{pick(lang, "Saldo previsto tras el anticipo", "Expected balance after deposit")}: <strong>{money(lang, installment.remaining, d.currency)}</strong> · {pick(lang, "NO se cuenta como cobrado", "NOT counted as collected")}</p>
          {installmentRows && <details>
            <summary>{pick(lang, "Calendario ilustrativo de cuotas", "Illustrative installment schedule")} ({installmentRows.length})</summary>
            <div className={s.tableWrap}><table className={s.table}>
              <thead><tr><th scope="col">#</th><th scope="col">{pick(lang, "Vencimiento previsto", "Proposed due date")}</th><th scope="col" className={s.num}>{pick(lang, "Cuota prevista", "Planned amount")}</th></tr></thead>
              <tbody>{installmentRows.map(row => <tr key={row.number}><td>{row.number}</td><td>{row.dueOn}</td><td className={s.num}>{money(lang, row.amount, d.currency)}</td></tr>)}</tbody>
            </table></div>
          </details>}
          <p className={s.muted}>{pick(lang, "Referencia interna, no es factura ni crédito aprobado. Consulta el contrato para plazos exigibles. Los cobros reales figuran por separado.", "Internal planning only, not an invoice or approved credit. Consult the contract for enforceable dates. Actual receipts are recorded separately.")}</p>
        </div>}
        {paymentTerms.terms.milestones && <p style={{whiteSpace:"pre-wrap"}}><strong>{pick(lang, "Hitos", "Milestones")}:</strong> {paymentTerms.terms.milestones}</p>}
        {paymentTerms.terms.externalProvider && <p><strong>{pick(lang, "Proveedor externo propuesto", "Proposed external provider")}:</strong> {paymentTerms.terms.externalProvider} · {pick(lang, "pendiente de aprobación", "approval pending")}</p>}
        {paymentTerms.terms.notes && <p style={{whiteSpace:"pre-wrap"}}><strong>{pick(lang, "Condiciones adicionales", "Additional terms")}:</strong> {paymentTerms.terms.notes}</p>}
      </section>}

      <SaleAgreementPanel db={supabase} lang={lang} saleId={d.id} currency={d.currency} />
      <SaleSchedulePanel db={supabase} lang={lang} sale={d} payments={payments.error ? [] : payments.data} terms={paymentTerms.terms} />

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

      <SaleCorePanels db={supabase} saleId={d.id} clientId={d.client_id} lang={lang} currency={d.currency} owners={ownerList}/>
      <div className={s.columns}>
        <section className={s.panel} aria-labelledby="timeline"><header><h2 id="timeline">{pick(lang, "Línea de tiempo de la operación", "Operation timeline")}</h2></header>
          {!events || events.error ? <Unavailable lang={lang} code={events?.error ?? "unavailable"} /> : <ol className={s.timeline}>{events.data.map(e => <li key={e.id} data-result={e.result}>
            <strong>{e.event_type}</strong> <span className={s.muted}>· {e.module} · {ownerName(ownerList, e.actor_id)} · {formatDate(lang, e.created_at, true)}</span>
            <div className={s.muted}>{[e.from_state && e.to_state ? `${e.from_state} → ${e.to_state}` : e.to_state, e.detail].filter(Boolean).join(" · ")}</div></li>)}</ol>}
        </section>
        <section className={s.panel} aria-labelledby="payments"><header><h2 id="payments">{pick(lang, "Cobros registrados", "Recorded payments")}</h2></header>
          {payments.error ? <Unavailable lang={lang} code={payments.error} /> : payments.data.length === 0 ? <p className={s.muted}>{pick(lang, "Sin cobros registrados. El pago inicial acordado no cuenta como cobrado.", "No payments recorded. The agreed upfront payment does not count as collected.")}</p> :
            <ul className={s.list}>{payments.data.map(x => {
              const tagged = /^\[([a-z_]+)\]\s*(.*)$/.exec(x.reference ?? "");
              const known = tagged && (SALE_PAYMENT_METHODS as readonly string[]).includes(tagged[1]) ? tagged[1] as SalePaymentMethod : null;
              const methodText = known ? salePaymentMethodLabel(known, lang) : label(lang, x.method);
              const detail = known ? tagged?.[2] : x.reference;
              return <li key={x.id}><strong>{money(lang, x.amount, d.currency)}</strong><span className={s.muted}>{formatDate(lang, x.received_on)} · {methodText}{detail ? ` · ${detail}` : ""}</span></li>;
            })}</ul>}
          {d.contract_status !== "cancelled" && collectible > 0.004 && <form action={recordPayment} className={s.form} style={{ marginTop: 14 }}><input type="hidden" name="sale_id" value={d.id} />
            <div className={s.row}>
              <label className={s.field}>{pick(lang, "Importe", "Amount")} ({d.currency})<input name="amount" required inputMode="decimal" pattern="\d{1,13}(\.\d{1,2})?" /></label>
              <label className={s.field}>{pick(lang, "Fecha de cobro", "Received on")}<input name="received_on" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
            </div>
            <div className={s.row}>
              <label className={s.field}>{pick(lang, "Canal de cobro recibido", "Received payment channel")}<select name="channel">{SALE_PAYMENT_METHODS.map(m => <option key={m} value={m}>{salePaymentMethodLabel(m, lang)}</option>)}</select><input type="hidden" name="method" value="other" /></label>
              <label className={s.field}>{pick(lang, "Referencia (sin datos bancarios)", "Reference (no bank details)")}<input name="reference" maxLength={120} /></label>
            </div>
            {openInstallments.length > 0 && <label className={s.field}>{pick(lang, "Aplicar a la cuota (opcional)", "Apply to installment (optional)")}
              <select name="installment_id" defaultValue=""><option value="">{pick(lang, "Sin cuota: se aplica a la más antigua pendiente", "No installment: covers the oldest open one")}</option>
                {openInstallments.map(i => <option key={i.id} value={i.id}>#{i.seq} · {label(lang, i.kind)} · {formatDate(lang, i.due_on)} · {pick(lang, "pendiente", "open")} {money(lang, Number(i.amount) - allocatedTo(i.id), d.currency)}</option>)}</select></label>}
            <button className={s.button}>{pick(lang, "Registrar cobro", "Record payment")}</button>
          </form>}
          {paymentTerms.notes && <><h3>{pick(lang, "Notas", "Notes")}</h3><p className={s.muted} style={{ whiteSpace: "pre-wrap" }}>{paymentTerms.notes}</p></>}
        </section>
      </div>
    </>}
  </div></Suite>;
}
