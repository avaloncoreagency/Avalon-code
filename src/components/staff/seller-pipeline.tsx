// Seller workspace inside the staff portal: own leads (create + work), own proposals and own sales.
// Every list comes from a brokered RPC that returns only the caller's records; another seller's data never arrives.
import Link from "next/link";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSellerLead, updateSellerLead } from "@/app/staff/seller-actions";
import { STATUS_LABEL } from "@/lib/quotes/text";
import { CONTRACT_LABEL, hhmm, money, type SellerLead, type SellerQuote, type SellerSale, type SellerStage } from "@/lib/staff/seller";
import { DEFAULT_TZ, dayKey, timeLabel } from "@/lib/staff/work";
import s from "@/components/sales/sales.module.css";

export async function SellerPipeline({ supabase, permissions }: { supabase: SupabaseClient; permissions: string[] }) {
  const [leadsR, stagesR, quotesR, salesR] = await Promise.all([
    supabase.rpc("staff_seller_leads"), supabase.rpc("staff_seller_stages"), supabase.rpc("staff_seller_quotes"), supabase.rpc("staff_seller_sales"),
  ]);
  if (leadsR.error || stagesR.error || quotesR.error || salesR.error)
    return <section className={s.panel} aria-labelledby="seller-leads"><h2 id="seller-leads">Mis ventas</h2>
      <p role="alert" className={s.flash}>El espacio de ventas aún no está activado en este entorno (migración pendiente). No se muestra información parcial.</p></section>;
  const leads = (leadsR.data ?? []) as SellerLead[];
  const stages = (stagesR.data ?? []) as SellerStage[];
  const quotes = (quotesR.data ?? []) as SellerQuote[];
  const sales = (salesR.data ?? []) as SellerSale[];
  const open = leads.filter(l => l.stage_kind === "open");
  const pipelineValue = open.reduce((sum, l) => sum + Number(l.value || 0), 0);

  return <>
    <section className={s.panel} aria-labelledby="seller-summary">
      <h2 id="seller-summary">Mi embudo de ventas</h2>
      <p className={s.muted}>Solo tus leads, propuestas y ventas. Nadie más del equipo los ve; la dirección (Miguel y Samuel) sí.</p>
      <div className={s.stats}>
        {([["Leads abiertos", open.length], ["Valor estimado abierto", money(pipelineValue)],
          ["Propuestas activas", quotes.filter(q => ["draft", "internal_review", "approved", "sent"].includes(q.status)).length],
          ["Por cerrar (aceptadas)", quotes.filter(q => q.status === "accepted" && !q.sale_id).length],
          ["Ventas cerradas", sales.filter(v => v.status === "confirmed").length],
          ["Vendido", money(sales.filter(v => v.status === "confirmed").reduce((a, v) => a + Number(v.total || 0), 0))]] as const)
          .map(([label, value]) => <div key={label} className={s.stat}><span>{label}</span><strong>{value}</strong></div>)}
      </div>
    </section>

    <section className={s.panel} aria-labelledby="seller-leads">
      <h2 id="seller-leads">Mis leads</h2>
      {permissions.includes("lead_create") && <details>
        <summary>+ Nuevo lead</summary>
        <form action={createSellerLead} className={s.form} aria-label="Nuevo lead">
          <input type="hidden" name="request_key" value={randomUUID()} />
          <div className={s.row}>
            <label className={s.field}>Empresa *<input name="company" required maxLength={200} /></label>
            <label className={s.field}>Contacto<input name="contact" maxLength={160} /></label>
            <label className={s.field}>Cargo<input name="contact_title" maxLength={120} /></label>
          </div>
          <div className={s.row}>
            <label className={s.field}>Correo<input type="email" name="email" maxLength={254} /></label>
            <label className={s.field}>Teléfono<input name="phone" maxLength={40} /></label>
            <label className={s.field}>Ciudad<input name="city" maxLength={120} /></label>
          </div>
          <div className={s.row}>
            <label className={s.field}>Sitio web<input name="website" maxLength={300} /></label>
            <label className={s.field}>Industria<input name="industry" maxLength={120} /></label>
            <label className={s.field}>Origen<input name="source" maxLength={200} placeholder="Ej.: referido, llamada, evento" /></label>
          </div>
          <div className={s.row}>
            <label className={s.field}>Valor estimado (USD)<input name="value" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" /></label>
            <label className={s.field}>Próxima acción<input name="next_action" maxLength={300} /></label>
            <label className={s.field}>Seguimiento<input type="date" name="follow_up_date" /></label>
            <label className={s.field}>Hora<input type="time" name="follow_up_time" /></label>
          </div>
          <button className={`${s.button} ${s.primary}`} type="submit">Guardar lead</button>
        </form>
      </details>}
      {leads.length === 0 ? <p>Aún no tienes leads. Crea el primero o pide a la dirección que te asigne uno.</p> :
        <ul className={s.list} aria-label="Mis leads">{leads.map(l => <li key={l.lead_id} data-lead={l.lead_id}>
          <strong>{l.company}</strong>{l.contact ? ` · ${l.contact}` : ""} · <span className={s.tag}>{l.stage_label}</span>
          {Number(l.value) > 0 && <> · {money(l.value)}</>}
          <br /><span className={s.muted}>{[l.email, l.phone, l.city].filter(Boolean).join(" · ") || "Sin datos de contacto"}
            {l.follow_up_at ? ` · Seguimiento: ${dayKey(l.follow_up_at, DEFAULT_TZ)} ${timeLabel(l.follow_up_at, DEFAULT_TZ, "es")}` : ""}
            {l.next_action ? ` · Próxima acción: ${l.next_action}` : ""} · {CONTRACT_LABEL[l.contract_status] ?? l.contract_status}</span>
          <div className={s.inline} style={{ gap: 8, flexWrap: "wrap" }}>
            {permissions.includes("quote_create") && l.stage_kind === "open" && <Link className={s.button} href={`/staff/quotes/new?lead=${l.lead_id}`}>Nueva propuesta</Link>}
            {permissions.includes("lead_edit") && <details><summary>Actualizar</summary>
              <form action={updateSellerLead} className={s.form} aria-label={`Actualizar ${l.company}`}>
                <input type="hidden" name="lead_id" value={l.lead_id} /><input type="hidden" name="version" value={l.version} />
                <div className={s.row}>
                  <label className={s.field}>Etapa<select name="stage_id" defaultValue={l.stage_id}>
                    {stages.filter(st => st.kind !== "won" || st.id === l.stage_id).map(st => <option key={st.id} value={st.id}>{st.label}</option>)}</select></label>
                  <label className={s.field}>Valor (USD)<input name="value" defaultValue={String(l.value ?? "")} inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" /></label>
                  <label className={s.field}>Próxima acción<input name="next_action" defaultValue={l.next_action} maxLength={300} /></label>
                </div>
                <div className={s.row}>
                  <label className={s.field}>Contacto<input name="contact" defaultValue={l.contact} maxLength={160} /></label>
                  <label className={s.field}>Cargo<input name="contact_title" defaultValue={l.contact_title} maxLength={120} /></label>
                  <label className={s.field}>Correo<input type="email" name="email" defaultValue={l.email ?? ""} maxLength={254} /></label>
                  <label className={s.field}>Teléfono<input name="phone" defaultValue={l.phone} maxLength={40} /></label>
                </div>
                <div className={s.row}>
                  <label className={s.field}>Sitio web<input name="website" defaultValue={l.website} maxLength={300} /></label>
                  <label className={s.field}>Ciudad<input name="city" defaultValue={l.city} maxLength={120} /></label>
                  <label className={s.field}>Seguimiento<input type="date" name="follow_up_date" defaultValue={l.follow_up_at ? dayKey(l.follow_up_at, DEFAULT_TZ) : ""} /></label>
                  <label className={s.field}>Hora<input type="time" name="follow_up_time" defaultValue={l.follow_up_at ? hhmm(l.follow_up_at, DEFAULT_TZ) : ""} /></label>
                </div>
                <label className={s.field}>Motivo si se pierde<input name="loss_reason" maxLength={1000} /></label>
                <button className={s.button} type="submit">Guardar cambios</button>
              </form>
            </details>}
          </div>
        </li>)}</ul>}
    </section>

    <section className={s.panel} aria-labelledby="seller-quotes">
      <h2 id="seller-quotes">Mis propuestas</h2>
      <p className={s.muted}>Creas y revisas tus propuestas; la dirección aprueba el precio. Luego las envías, registras la respuesta del cliente y cierras la venta.</p>
      {quotes.length === 0 ? <p>Aún no tienes propuestas. Ábrelas desde un lead con «Nueva propuesta».</p> :
        <ul className={s.list} aria-label="Mis propuestas">{quotes.map(q => <li key={q.quote_id} data-quote={q.quote_id} data-status={q.status}>
          <Link href={`/staff/quotes/${q.quote_id}`}><strong>{q.quote_number}</strong> · {q.title}</Link> · {q.company}
          <br /><span className={s.muted}><span className={s.tag}>{STATUS_LABEL[q.status]?.[0] ?? q.status}</span> v{q.current_version}
            {Number(q.one_time_total) > 0 ? ` · Pago único ${money(q.one_time_total)}` : ""}{Number(q.monthly_total) > 0 ? ` · Mensual ${money(q.monthly_total)}` : ""}
            {` · Válida hasta ${q.valid_until}`}{q.sale_number ? ` · Venta ${q.sale_number}` : ""}</span>
        </li>)}</ul>}
    </section>

    <section className={s.panel} aria-labelledby="seller-sales">
      <h2 id="seller-sales">Mis ventas cerradas</h2>
      <p className={s.muted}>Los pagos, reembolsos y comisiones los registra y verifica la dirección.</p>
      {sales.length === 0 ? <p>Aún no has cerrado ventas.</p> :
        <ul className={s.list} aria-label="Mis ventas">{sales.map(v => <li key={v.sale_id} data-sale={v.sale_id}>
          <strong>{v.sale_number}</strong> · {v.company ?? "Cliente"} · {v.sold_on} · {money(v.total)}
          {Number(v.recurring_monthly) > 0 ? ` + ${money(v.recurring_monthly)}/mes` : ""}
          <br /><span className={s.muted}>{v.status === "confirmed" ? "Confirmada" : v.status} · Cobrado y verificado: {money(v.paid_verified)}
            {v.quote_number ? ` · Propuesta ${v.quote_number}` : ""}</span>
        </li>)}</ul>}
    </section>
  </>;
}
