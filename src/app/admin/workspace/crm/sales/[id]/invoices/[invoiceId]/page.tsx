import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { loadInvoiceDoc } from "@/lib/sales/invoice-server";
import { STATE_LABEL, closingText, invoiceState, money } from "@/lib/sales/invoice";
import { PrintButton } from "@/components/sales/print-button";
import v from "./invoice.module.css";

export const dynamic = "force-dynamic";
const cents = (x: string) => Math.round(Number(x) * 100);

/** Client-facing invoice view. Read-only: viewing, printing or downloading never writes or renumbers anything. */
export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string; invoiceId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireOwner();
  const lang = await getLang();
  const t = (es: string, en: string) => lang === "es" ? es : en;
  const { id, invoiceId } = await params;
  const justIssued = (await searchParams).ok === "invoiced";
  const r = await loadInvoiceDoc(session.supabase, id, invoiceId, lang);
  if (!r.ok) notFound();
  const d = r.doc, today = new Date().toISOString().slice(0, 10), st = invoiceState(d, today);
  const fmt = (c: number) => money(c, d.currency, lang);
  const date = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString(lang === "es" ? "es-US" : "en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  const whole = cents(d.amount) === cents(d.saleTotal);
  return <div className={v.page}>
    <nav className={v.toolbar} aria-label={t("Acciones de la factura", "Invoice actions")}>
      <Link href={`/admin/workspace/crm/sales/${id}`}>← {t("Volver a la venta", "Back to sale")}</Link>
      <span className={v.spacer} />
      <PrintButton className={v.btn} label={t("Imprimir factura", "Print invoice")} />
      <a className={v.btn} href={`/admin/workspace/crm/sales/${id}/invoices/${invoiceId}/pdf`} download>{t("Descargar PDF", "Download PDF")}</a>
      <Link className={v.btn} href={`/admin/workspace/crm/clients/${r.clientId}`}>{t("Cliente 360°", "Client 360°")}</Link>
    </nav>
    {justIssued && <p className={v.note} role="status" data-invoice-issued>{t("Factura emitida. Descarga el PDF o imprímela para enviarla por correo al cliente.", "Invoice issued. Download the PDF or print it to email it to the client.")}</p>}
    <p className={v.note}>{t("Vista del documento para el cliente. Imprimir o descargar no crea otra factura, no registra pagos ni modifica importes.", "Client-facing document view. Printing or downloading never creates another invoice, records payments or changes amounts.")}</p>
    <article className={v.sheet} aria-label={t("Factura", "Invoice") + " " + d.number} data-invoice-state={st.state}>
      <header className={v.head}>
        <div><div className={v.brand}>AVALON</div><div className={v.sub}>CORE AGENCY</div></div>
        <div className={v.title}><strong>{t("FACTURA", "INVOICE")}</strong><span>{d.number}</span></div>
      </header>
      <section className={v.parties}>
        <div><h2>{t("Emisor", "From")}</h2><p><strong>{d.issuer.name}</strong>{d.issuer.email && <><br />{d.issuer.email}</>}{d.issuer.phone && <><br />{d.issuer.phone}</>}</p></div>
        <div><h2>{t("Facturar a", "Bill to")}</h2><p><strong>{d.client.legalName}</strong>
          {d.client.tradeName && d.client.tradeName !== d.client.legalName && <><br />{d.client.tradeName}</>}
          {d.client.contactName && <><br />{d.client.contactName}</>}{d.client.contactEmail && <><br />{d.client.contactEmail}</>}
          {(d.client.location || d.client.country) && <><br />{[d.client.location, d.client.country].filter(Boolean).join(", ")}</>}</p></div>
        <dl>
          <dt>{t("Emisión", "Issued")}</dt><dd>{date(d.issuedOn)}</dd>
          <dt>{t("Vencimiento", "Due")}</dt><dd>{d.dueOn ? date(d.dueOn) : "—"}</dd>
          <dt>{t("Venta", "Sale")}</dt><dd>{d.saleNumber}</dd>
          {d.quoteRef && <><dt>{t("Cotización", "Quote")}</dt><dd>{d.quoteRef}</dd></>}
          <dt>{t("Responsable", "Sales rep")}</dt><dd data-invoice-seller>{d.seller || "—"}</dd>
          <dt>{t("Moneda", "Currency")}</dt><dd>{d.currency}</dd>
        </dl>
      </section>
      <p className={v.state} data-tone={st.state}>{t(...STATE_LABEL[st.state])}{d.status === "void" && d.voidReason ? ` — ${d.voidReason}` : ""}</p>
      <p className={v.small} data-invoice-closing={d.closing.model}><strong>{closingText(d, lang)}</strong> · {t("Responsable de la venta", "Sales representative")}: {d.seller || "—"}</p>
      <table className={v.lines}>
        <thead><tr><th scope="col">{t("Servicio / descripción", "Service / description")}</th><th scope="col">{t("Cant.", "Qty")}</th><th scope="col">{t("Precio unit.", "Unit price")}</th><th scope="col">{t("Importe", "Amount")}</th></tr></thead>
        <tbody>{d.lines.map((l, i) => <tr key={i}><td>{l.description}</td><td>{Number(l.quantity)}</td><td>{fmt(cents(l.unitPrice))}</td><td>{fmt(cents(l.total))}</td></tr>)}</tbody>
      </table>
      <table className={v.totals}><tbody>
        <tr><th scope="row">{t("Subtotal de la venta", "Sale subtotal")}</th><td>{fmt(cents(d.saleSubtotal))}</td></tr>
        {cents(d.saleDiscount) > 0 && <tr><th scope="row">{t("Descuento", "Discount")}</th><td>- {fmt(cents(d.saleDiscount))}</td></tr>}
        {cents(d.saleTax) > 0 && <tr><th scope="row">{t("Impuestos", "Tax")} ({Number(d.saleTaxRate)}%)</th><td>{fmt(cents(d.saleTax))}</td></tr>}
        {!whole && <tr><th scope="row">{t("Total de la venta", "Sale total")}</th><td>{fmt(cents(d.saleTotal))}</td></tr>}
        <tr className={v.strong}><th scope="row">{whole ? t("Total facturado", "Total invoiced") : t("Importe de esta factura", "This invoice amount")}</th><td data-invoice-amount>{fmt(cents(d.amount))}</td></tr>
        {st.verifiedCents > 0 && <tr><th scope="row">{t("Pagos verificados", "Verified payments")}</th><td>- {fmt(st.verifiedCents)}</td></tr>}
        {st.recordedCents > st.verifiedCents && <tr><th scope="row">{t("Pagos registrados sin verificar", "Recorded, unverified payments")}</th><td>{fmt(st.recordedCents - st.verifiedCents)}</td></tr>}
        <tr className={v.strong}><th scope="row">{t("Saldo pendiente", "Balance due")}</th><td data-invoice-balance>{fmt(st.balanceCents)}</td></tr>
      </tbody></table>
      {d.payments.length > 0 && <section><h2>{t("Pagos aplicados a esta factura", "Payments applied to this invoice")}</h2>
        <ul className={v.payments}>{d.payments.map((p, i) => <li key={i}>{date(p.receivedOn)} · {p.method} · {p.status === "verified" ? t("verificado", "verified") : t("registrado", "recorded")}<span>{fmt(cents(p.amount))}</span></li>)}</ul></section>}
      {d.acceptedMethods.length > 0 ? <p className={v.small} data-invoice-methods>{t("Métodos de pago aceptados", "Accepted payment methods")}: {d.acceptedMethods.join(", ")}</p>
        : d.agreedMethod && <p className={v.small}>{t("Método de pago acordado", "Agreed payment method")}: {d.agreedMethod}</p>}
      <footer className={v.foot}>Avalon Core Agency · {d.number}</footer>
    </article>
  </div>;
}
