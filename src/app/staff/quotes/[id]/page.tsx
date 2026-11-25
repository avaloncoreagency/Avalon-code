import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSeller } from "@/lib/auth/staff";
import { REVISABLE, NOTE_REQUIRED, acceptanceBlockers } from "@/lib/quotes/model";
import { STATUS_LABEL, TRANSITION_UI } from "@/lib/quotes/text";
import { CONTRACT_LABEL, SELLER_MESSAGES, SELLER_TRANSITIONS, money, type SellerQuoteDetail } from "@/lib/staff/seller";
import { cancelQuoteDeletion, requestQuoteDeletion, closeSellerSale, transitionSellerQuote } from "../../seller-actions";
import s from "@/components/sales/sales.module.css";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOWNLOADABLE = ["approved", "sent", "accepted"];

export default async function SellerQuote({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { supabase, permissions } = await requireSeller();
  const { status, error } = await searchParams;
  const { data, error: readError } = await supabase.rpc("staff_seller_quote", { p_quote: id });
  if (readError) return <Shell title="Propuesta"><p role="alert" className={s.flash}>Las propuestas aún no están activadas en este entorno.</p></Shell>;
  const q = data as SellerQuoteDetail | null;
  if (!q) notFound();   // not this seller's proposal: indistinguishable from a missing one
  const {data: pending} = await supabase.from("crm_quote_deletion_requests").select("id").eq("quote_id", id).eq("status","pending").maybeSingle();
  const c = q.content;
  const grants = permissions.commercial_permissions;
  const steps: Record<string,string> = {draft:"quote_edit",internal_review:"quote_review",sent:"quote_send",accepted:"quote_accept"};
  const next = (SELLER_TRANSITIONS[q.status] ?? []).filter(step => grants.includes(steps[step]));
  const blockers = q.status === "sent" ? acceptanceBlockers(c) : [];
  const canClose = grants.includes("sale_close") && q.status === "accepted" && !q.sale_id;
  const contractOk = q.contract_status === "verified_signed";

  return <Shell title={`${q.quote_number} · ${c.title}`}>
    {status && SELLER_MESSAGES[status] && <p role="status" className={s.flash}>{SELLER_MESSAGES[status]}</p>}
    {error && <p role="alert" className={s.flash} data-tone="error">{SELLER_MESSAGES[error] ?? SELLER_MESSAGES.failed}</p>}
    <section className={s.panel} aria-labelledby="quote-summary">
      <h2 id="quote-summary">{q.company}</h2>
      <dl className={s.detail}>
        <div><dt>Estado</dt><dd><span className={s.tag}>{STATUS_LABEL[q.status]?.[0] ?? q.status}</span> · versión {q.current_version}</dd></div>
        <div><dt>Pago único</dt><dd>{money(q.one_time_total)}</dd></div>
        <div><dt>Mensual</dt><dd>{money(q.monthly_total)}</dd></div>
        <div><dt>Válida hasta</dt><dd>{q.valid_until}</dd></div>
        <div><dt>Contrato</dt><dd>{CONTRACT_LABEL[q.contract_status] ?? q.contract_status}</dd></div>
      </dl>
      <h3>Servicios</h3>
      <ul className={s.list}>{c.lines.map((l, i) => <li key={i}>{l.qty} × {l.name} · {money(l.unitPrice)} {l.kind === "monthly" ? "/mes" : ""}
        {l.description ? <><br /><span className={s.muted}>{l.description}</span></> : null}</li>)}</ul>
      <div className={s.inline} style={{ gap: 8, flexWrap: "wrap" }}>
        {grants.includes("quote_edit") && REVISABLE.includes(q.status) && <Link className={s.button} href={`/staff/quotes/${q.quote_id}/edit`}>Editar (nueva revisión)</Link>}
        {grants.includes("quote_send") && DOWNLOADABLE.includes(q.status) && <a className={s.button} href={`/staff/quotes/${q.quote_id}/pdf?v=${q.current_version}`}>Descargar PDF</a>}
        {grants.includes("quote_send") && DOWNLOADABLE.includes(q.status) && <a className={s.button} href={`/staff/quotes/${q.quote_id}/pdf?v=${q.current_version}&view=inline`} target="_blank" rel="noopener">Vista previa</a>}
        {!DOWNLOADABLE.includes(q.status) && <strong>Borrador interno · No autorizado para distribución</strong>}
      </div>
    </section>

    {(next.length > 0 || q.status === "internal_review") && <section className={s.panel} aria-labelledby="quote-next">
      <h2 id="quote-next">Siguiente paso</h2>
      {q.status === "internal_review" && <p className={s.muted}>Esperando que la dirección apruebe el precio. Puedes devolverla a borrador para editarla.</p>}
      {blockers.length > 0 && <p className={s.flash} data-tone="warn">Antes de registrar la aceptación hay que completar las condiciones variables (revísalas en una nueva versión).</p>}
      {next.map(to => { const ui = TRANSITION_UI[to]; const needsNote = NOTE_REQUIRED.includes(to); return <form key={to} action={transitionSellerQuote} className={s.form} aria-label={ui?.label[0] ?? to}>
        <input type="hidden" name="quote_id" value={q.quote_id} /><input type="hidden" name="expected_version" value={q.version} /><input type="hidden" name="to" value={to} />
        {to === "accepted" && <label className={s.field}>Nombre del representante autorizado del cliente<input name="signatory" required minLength={2} maxLength={160}/></label>}
        {needsNote && <label className={s.field}>{ui?.note?.[0] ?? "Nota"}<textarea name="note" required minLength={8} maxLength={to === "accepted" ? 700 : 1000} rows={2} /></label>}
        <button className={s.button} type="submit">{ui?.label[0] ?? to}</button>
      </form>; })}
    </section>}

    {(pending || grants.includes("quote_delete_request")) && q.status !== "accepted" && <section className={s.panel}><h2>Solicitud de eliminación</h2>
      <form action={pending ? cancelQuoteDeletion : requestQuoteDeletion} className={s.form}>
        <input type="hidden" name="quote_id" value={id} /><input type="hidden" name="version" value={q.version} />
        {pending ? <input type="hidden" name="request_id" value={pending.id}/> : <label>Motivo<textarea required name="reason" maxLength={500}/></label>}
        <button className={s.button}>{pending ? "Cancelar solicitud pendiente" : "Solicitar eliminación a la dirección"}</button>
      </form></section>}
    {canClose && <section className={s.panel} aria-labelledby="quote-close">
      <h2 id="quote-close">Cerrar la venta</h2>
      {!contractOk ? <p className={s.flash} data-tone="warn">El cliente aceptó. Falta que la dirección registre y verifique el contrato firmado; después podrás cerrar la venta aquí.</p> :
        <form action={closeSellerSale} className={s.form} aria-label="Cerrar la venta">
          <input type="hidden" name="quote_id" value={q.quote_id} /><input type="hidden" name="version_no" value={q.current_version} />
          <label className={s.field}>Fecha de la venta<input type="date" name="sold_on" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
          <p className={s.muted}>Se registra exactamente la versión aceptada, a tu nombre. Pagos y comisiones los verifica la dirección.</p>
          <button className={`${s.button} ${s.primary}`} type="submit">Cerrar venta</button>
        </form>}
    </section>}
    {q.sale_id && <p className={s.flash}>Venta cerrada. La ves en «Mis ventas cerradas».</p>}

    <section className={s.panel} aria-labelledby="quote-history">
      <h2 id="quote-history">Historial</h2>
      <ul className={s.list}>{q.events.map((e, i) => <li key={i}><span className={s.tag}>{STATUS_LABEL[e.to]?.[0] ?? e.to}</span> v{e.version} · {new Date(e.at).toLocaleString("es", { timeZone: "America/New_York" })}
        {e.note ? <><br /><span className={s.muted}>{e.note}</span></> : null}</li>)}</ul>
    </section>
  </Shell>;
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return <main className={s.hud} style={{ maxWidth: 1220, margin: "0 auto", padding: "20px 16px" }}>
    <header className={s.header}><div><p className={s.eyebrow}>AVALON / PORTAL DE EMPLEADOS / PROPUESTAS</p><h1>{title}</h1></div>
      <Link className={s.button} href="/staff#seller-quotes">Volver a mis propuestas</Link></header>
    {children}
  </main>;
}
