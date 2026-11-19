"use client";

import { useMemo, useState } from "react";
import s from "@/components/sales/sales.module.css";
import w from "./quotes.module.css";
import {
  BILLING_MODELS, SETTLEMENTS, formatUsd, quoteTotals, validateQuote,
  type BillingModel, type QuoteCommission, type QuoteContent, type QuoteInternal, type QuoteLine,
} from "@/lib/quotes/model";

export type CatalogItem = { code: string; name: string; deliverables: string; billing: "one_time" | "monthly" | "annual"; approvedPrice: string | null; approvedMonthly: string | null };

type Props = {
  lang: "es" | "en";
  mode: "create" | "revise";
  action: (form: FormData) => void | Promise<void>;
  hidden: Record<string, string>;
  initial: QuoteContent;
  initialInternal: QuoteInternal;
  catalog: CatalogItem[];
};

const blankCommission = (): QuoteCommission => ({
  status: "to_negotiate", pct: "", base: "gross_revenue", baseNote: "", trigger: "", attributionWindowDays: 30,
  evidence: "", settlement: "monthly", exclusions: "", refunds: "", expiry: "",
});

/** Guided five-step quote builder. Validation mirrors the server and database; nothing is saved until "Guardar". */
export function QuoteWizard({ lang, mode, action, hidden, initial, initialInternal, catalog }: Props) {
  const es = lang === "es";
  const t = (a: string, b: string) => (es ? a : b);
  const [step, setStep] = useState(0);
  const [c, setC] = useState<QuoteContent>(initial);
  const [internal, setInternal] = useState<QuoteInternal>(initialInternal);
  const [note, setNote] = useState("");
  const set = <K extends keyof QuoteContent>(k: K, v: QuoteContent[K]) => setC(prev => ({ ...prev, [k]: v }));
  const setLine = (i: number, patch: Partial<QuoteLine>) => set("lines", c.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const errors = useMemo(() => { try { return validateQuote(c); } catch { return ["lines"]; } }, [c]);
  const totals = useMemo(() => { try { return quoteTotals(c); } catch { return null; } }, [c]);
  const steps = [t("Prospecto", "Prospect"), t("Servicios y precios", "Services and pricing"), t("Modelo de cobro", "Billing model"), t("Alcance y condiciones", "Scope and terms"), t("Revisión", "Review")];
  const stepErrors = [
    errors.filter(e => /^(title|issueDate|validUntil|client\.|issuer\.|seller|lang)/.test(e)),
    errors.filter(e => e.startsWith("lines")),
    errors.filter(e => e.startsWith("model") || e.startsWith("commission")),
    errors.filter(e => /^(objectives|problem|solution|scope|deliverables|exclusions|dependencies|timeline|support|terms|notes|thirdPartyCosts)$/.test(e)),
    errors,
  ];
  const label = (e: string) => ({
    title: t("Título de la cotización", "Quote title"), validUntil: t("Fecha de vencimiento (después de la emisión)", "Valid-until date (after issue date)"),
    issueDate: t("Fecha de emisión", "Issue date"), "client.company": t("Empresa del prospecto", "Prospect company"), "client.email": t("Correo del contacto", "Contact e-mail"),
    "issuer.name": t("Nombre del emisor", "Issuer name"), "issuer.email": t("Correo del emisor", "Issuer e-mail"), solution: t("Solución propuesta", "Proposed solution"),
    "model.fixed": t("Precio fijo: solo conceptos de pago único, sin mensualidad ni comisión", "Fixed price: one-time items only, no monthly fee or commission"),
    "model.monthly": t("Suscripción: agrega al menos un concepto mensual y sin comisión", "Subscription: add at least one monthly item and no commission"),
    "model.commission": t("Comisión: completa las condiciones de la comisión", "Commission: complete the commission terms"),
    "model.hybrid": t("Híbrido: combina al menos dos componentes (pago único, mensualidad o comisión)", "Hybrid: combine at least two components (one-time, monthly or commission)"),
    "commission.pct": t("Porcentaje de comisión (0–100, o déjalo «por acordar»)", "Commission percentage (0–100, or leave it «to be agreed»)"),
    "commission.trigger": t("Qué evento genera la comisión", "What earns the commission"), "commission.evidence": t("Evidencia requerida", "Required evidence"),
    "commission.baseNote": t("Describe la otra base de cálculo", "Describe the other calculation base"), "lines.zero": t("Los importes suman cero", "Amounts add up to zero"),
  } as Record<string, string>)[e] ?? (e.startsWith("lines.") ? t("Revisa el concepto ", "Check item ") + (Number(e.split(".")[1]) + 1) + ` (${e.split(".")[2] ?? ""})` : e);

  const addCatalog = (item: CatalogItem) => {
    const monthly = item.billing === "monthly";
    const price = monthly ? item.approvedMonthly ?? item.approvedPrice : item.approvedPrice;
    set("lines", [...c.lines, { code: item.code, name: item.name, description: item.deliverables.slice(0, 300), kind: monthly ? "monthly" : "one_time", qty: 1, unitPrice: price ?? "" }]);
  };
  const setModel = (m: BillingModel) => setC(prev => ({ ...prev, model: m, commission: m === "commission" || m === "hybrid" ? prev.commission ?? blankCommission() : null }));
  const cm = c.commission;
  const setCm = (patch: Partial<QuoteCommission>) => cm && set("commission", { ...cm, ...patch });
  const area = (k: "objectives" | "problem" | "solution" | "scope" | "deliverables" | "exclusions" | "dependencies" | "timeline" | "support" | "terms" | "notes" | "thirdPartyCosts", es1: string, en1: string, hint?: string) => (
    <label className={s.field}>{t(es1, en1)}{hint && <small className={w.hint}>{hint}</small>}
      <textarea value={c[k]} maxLength={4000} rows={k === "solution" || k === "scope" ? 4 : 2} onChange={e => set(k, e.target.value)} /></label>
  );

  return (
    <form action={action} className={s.form} aria-describedby="quote-steps">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input type="hidden" name="content" value={JSON.stringify(c)} />
      <input type="hidden" name="internal" value={JSON.stringify(internal)} />

      <ol id="quote-steps" className={w.steps} aria-label={t("Pasos de la cotización", "Quote steps")}>
        {steps.map((name, i) => (
          <li key={name}><button type="button" onClick={() => setStep(i)} aria-current={step === i ? "step" : undefined} data-done={i < 4 && stepErrors[i].length === 0}>
            <span>{i + 1}</span>{name}</button></li>
        ))}
      </ol>

      {step === 0 && <fieldset className={s.fieldset}><legend>{steps[0]}</legend>
        <label className={s.field}>{t("Título de la propuesta", "Proposal title")}<input value={c.title} maxLength={200} required onChange={e => set("title", e.target.value)} /></label>
        <div className={s.row}>
          <label className={s.field}>{t("Empresa", "Company")}<input value={c.client.company} maxLength={200} onChange={e => set("client", { ...c.client, company: e.target.value })} /></label>
          <label className={s.field}>{t("Persona de contacto", "Contact person")}<input value={c.client.contact} maxLength={200} onChange={e => set("client", { ...c.client, contact: e.target.value })} /></label>
        </div>
        <div className={s.row}>
          <label className={s.field}>{t("Correo del contacto", "Contact e-mail")}<input type="email" value={c.client.email} maxLength={200} onChange={e => set("client", { ...c.client, email: e.target.value })} /></label>
          <label className={s.field}>{t("Teléfono", "Phone")}<input type="tel" value={c.client.phone} maxLength={200} onChange={e => set("client", { ...c.client, phone: e.target.value })} /></label>
          <label className={s.field}>{t("Dirección", "Address")}<input value={c.client.address} maxLength={200} onChange={e => set("client", { ...c.client, address: e.target.value })} /></label>
        </div>
        <div className={s.row}>
          <label className={s.field}>{t("Emitida", "Issued")}<input type="date" value={c.issueDate} onChange={e => set("issueDate", e.target.value)} /></label>
          <label className={s.field}>{t("Válida hasta", "Valid until")}<input type="date" value={c.validUntil} min={c.issueDate} onChange={e => set("validUntil", e.target.value)} /></label>
          <label className={s.field}>{t("Idioma del PDF", "PDF language")}<select value={c.lang} onChange={e => set("lang", e.target.value as "es" | "en")}><option value="es">Español</option><option value="en">English</option></select></label>
        </div>
        <div className={s.row}>
          <label className={s.field}>{t("Emisor (nombre que verá el cliente)", "Issuer (name the client sees)")}<input value={c.issuer.name} maxLength={200} onChange={e => set("issuer", { ...c.issuer, name: e.target.value })} /></label>
          <label className={s.field}>{t("Correo del emisor", "Issuer e-mail")}<input type="email" value={c.issuer.email} maxLength={200} onChange={e => set("issuer", { ...c.issuer, email: e.target.value })} /></label>
          <label className={s.field}>{t("Teléfono del emisor", "Issuer phone")}<input type="tel" value={c.issuer.phone} maxLength={200} onChange={e => set("issuer", { ...c.issuer, phone: e.target.value })} /></label>
        </div>
        <label className={s.field}>{t("Responsable comercial (aparece como contacto)", "Account owner (shown as contact)")}<input value={c.seller} maxLength={200} onChange={e => set("seller", e.target.value)} /></label>
      </fieldset>}

      {step === 1 && <fieldset className={s.fieldset}><legend>{steps[1]}</legend>
        <p className={w.hint}>{t("Elige servicios del catálogo o agrega un concepto personalizado. Solo se precarga un precio si el catálogo lo tiene aprobado; si no, escríbelo tú.", "Pick catalog services or add a custom item. A price is prefilled only when the catalog has an approved one; otherwise type it in.")}</p>
        <div className={w.catalog} role="group" aria-label={t("Catálogo de servicios", "Service catalog")}>
          {catalog.map(item => <button key={item.code} type="button" className={s.button} onClick={() => addCatalog(item)}>+ {item.name}{item.approvedPrice || item.approvedMonthly ? "" : " · " + t("sin precio aprobado", "no approved price")}</button>)}
          <button type="button" className={s.button} onClick={() => set("lines", [...c.lines, { code: null, name: "", description: "", kind: "one_time", qty: 1, unitPrice: "" }])}>+ {t("Concepto personalizado", "Custom item")}</button>
        </div>
        {c.lines.length === 0 && <p className={s.empty}>{t("Todavía no hay conceptos. Una cotización solo de comisión puede no tener conceptos con precio.", "No items yet. A commission-only quote may have no priced items.")}</p>}
        {c.lines.map((l, i) => (
          <div key={i} className={s.line} data-filled={!!l.name && !!l.unitPrice}>
            <div className={s.row}>
              <label className={s.field}>{t("Concepto", "Item")}<input value={l.name} maxLength={200} onChange={e => setLine(i, { name: e.target.value })} /></label>
              <label className={s.field}>{t("Tipo", "Type")}<select value={l.kind} onChange={e => setLine(i, { kind: e.target.value as QuoteLine["kind"] })}>
                <option value="one_time">{t("Pago único", "One-time")}</option><option value="monthly">{t("Mensual", "Monthly")}</option></select></label>
              <label className={s.field}>{t("Cantidad", "Qty")}<input type="number" inputMode="numeric" min={1} max={999} value={l.qty} onChange={e => setLine(i, { qty: Math.max(1, Math.min(999, Math.trunc(Number(e.target.value) || 1))) })} /></label>
              <label className={s.field}>{t("Precio unitario (USD)", "Unit price (USD)")}<input inputMode="decimal" placeholder="0.00" value={l.unitPrice} onChange={e => setLine(i, { unitPrice: e.target.value.replace(/[^0-9.]/g, "") })} /></label>
            </div>
            <label className={s.field}>{t("Descripción visible para el cliente", "Description visible to the client")}<input value={l.description} maxLength={1000} onChange={e => setLine(i, { description: e.target.value })} /></label>
            <div className={s.inline}>
              <button type="button" className={s.button} disabled={i === 0} onClick={() => { const n = [...c.lines]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; set("lines", n); }}>{t("Subir", "Move up")}</button>
              <button type="button" className={s.button} onClick={() => set("lines", c.lines.filter((_, j) => j !== i))}>{t("Quitar", "Remove")}</button>
            </div>
          </div>
        ))}
      </fieldset>}

      {step === 2 && <fieldset className={s.fieldset}><legend>{steps[2]}</legend>
        <div className={s.choice} role="radiogroup" aria-label={steps[2]}>
          {BILLING_MODELS.map(m => <label key={m}><input type="radio" name="model-choice" checked={c.model === m} onChange={() => setModel(m)} />
            {{ fixed: t("Precio fijo", "Fixed price"), monthly: t("Suscripción mensual", "Monthly subscription"), commission: t("Comisión por resultados", "Performance commission"), hybrid: t("Híbrido", "Hybrid") }[m]}</label>)}
        </div>
        {cm && <div className={w.commission}>
          <div className={s.choice} role="radiogroup" aria-label={t("Estado del porcentaje", "Percentage status")}>
            <label><input type="radio" name="cm-status" checked={cm.status === "to_negotiate"} onChange={() => setCm({ status: "to_negotiate", pct: "" })} />{t("Porcentaje por acordar", "Percentage to be agreed")}</label>
            <label><input type="radio" name="cm-status" checked={cm.status === "proposed"} onChange={() => setCm({ status: "proposed" })} />{t("Porcentaje propuesto", "Proposed percentage")}</label>
          </div>
          {cm.status === "to_negotiate" && <p className={w.hint}>{t("Una cotización con porcentaje por acordar puede enviarse, pero no puede marcarse como aceptada.", "A quote with a percentage to be agreed can be sent but cannot be marked as accepted.")}</p>}
          <div className={s.row}>
            {cm.status === "proposed" && <label className={s.field}>{t("Porcentaje (%)", "Percentage (%)")}<input inputMode="decimal" value={cm.pct} onChange={e => setCm({ pct: e.target.value.replace(/[^0-9.]/g, "") })} /></label>}
            <label className={s.field}>{t("Base de cálculo", "Calculation base")}<select value={cm.base} onChange={e => setCm({ base: e.target.value as QuoteCommission["base"] })}>
              <option value="gross_revenue">{t("Ingresos brutos atribuibles cobrados", "Attributable gross revenue collected")}</option>
              <option value="gross_profit">{t("Utilidad bruta atribuible", "Attributable gross profit")}</option>
              <option value="other">{t("Otra", "Other")}</option></select></label>
            <label className={s.field}>{t("Ventana de atribución (días)", "Attribution window (days)")}<input type="number" min={1} max={730} value={cm.attributionWindowDays ?? ""} onChange={e => setCm({ attributionWindowDays: e.target.value ? Math.trunc(Number(e.target.value)) : null })} /></label>
            <label className={s.field}>{t("Liquidación", "Settlement")}<select value={cm.settlement} onChange={e => setCm({ settlement: e.target.value as QuoteCommission["settlement"] })}>
              {SETTLEMENTS.map(x => <option key={x} value={x}>{{ weekly: t("Semanal", "Weekly"), biweekly: t("Quincenal", "Biweekly"), monthly: t("Mensual", "Monthly"), quarterly: t("Trimestral", "Quarterly") }[x]}</option>)}</select></label>
          </div>
          {cm.base === "other" && <label className={s.field}>{t("Describe la base", "Describe the base")}<input value={cm.baseNote} maxLength={2000} onChange={e => setCm({ baseNote: e.target.value })} /></label>}
          <label className={s.field}>{t("Qué genera el derecho a comisión", "What earns the commission")}<input value={cm.trigger} maxLength={2000} placeholder={t("Ej.: cita atribuida a la campaña y efectivamente cobrada", "E.g. booking attributed to the campaign and actually paid")} onChange={e => setCm({ trigger: e.target.value })} /></label>
          <label className={s.field}>{t("Evidencia requerida", "Required evidence")}<input value={cm.evidence} maxLength={2000} placeholder={t("Ej.: reporte del sistema de reservas y comprobante de cobro", "E.g. booking system report and payment receipt")} onChange={e => setCm({ evidence: e.target.value })} /></label>
          <div className={s.row}>
            <label className={s.field}>{t("Exclusiones", "Exclusions")}<input value={cm.exclusions} maxLength={2000} onChange={e => setCm({ exclusions: e.target.value })} /></label>
            <label className={s.field}>{t("Reembolsos y contracargos", "Refunds and chargebacks")}<input value={cm.refunds} maxLength={2000} onChange={e => setCm({ refunds: e.target.value })} /></label>
            <label className={s.field}>{t("Vencimiento de la comisión", "Commission end")}<input value={cm.expiry} maxLength={2000} onChange={e => setCm({ expiry: e.target.value })} /></label>
          </div>
        </div>}
        {area("thirdPartyCosts", "Costos de terceros pagados por el cliente (publicidad, licencias…)", "Third-party costs paid by the client (ads, licenses…)", t("Nunca se suman como ingreso de Avalon.", "Never counted as Avalon revenue."))}
      </fieldset>}

      {step === 3 && <fieldset className={s.fieldset}><legend>{steps[3]}</legend>
        {area("objectives", "Objetivos del cliente", "Client objectives")}
        {area("problem", "Situación actual / problema", "Current situation / problem")}
        {area("solution", "Solución propuesta (obligatoria)", "Proposed solution (required)")}
        {area("scope", "Alcance", "Scope")}
        {area("deliverables", "Entregables", "Deliverables")}
        {area("exclusions", "Exclusiones", "Exclusions")}
        {area("dependencies", "Dependencias del cliente", "Client dependencies")}
        {area("timeline", "Plazo estimado", "Estimated timeline")}
        {area("support", "Soporte incluido", "Included support")}
        {area("terms", "Condiciones comerciales", "Commercial terms")}
        {area("notes", "Notas para el cliente", "Notes for the client")}
        <details className={w.internal}>
          <summary>{t("Información interna de Avalon (nunca aparece en el PDF)", "Avalon internal information (never in the PDF)")}</summary>
          {(["directCosts", "marginNote", "confidential"] as const).map(k => (
            <label key={k} className={s.field}>{{ directCosts: t("Costos directos estimados", "Estimated direct costs"), marginNote: t("Margen y contingencia", "Margin and contingency"), confidential: t("Notas confidenciales", "Confidential notes") }[k]}
              <textarea rows={2} maxLength={4000} value={internal[k]} onChange={e => setInternal({ ...internal, [k]: e.target.value })} /></label>
          ))}
        </details>
      </fieldset>}

      {step === 4 && <fieldset className={s.fieldset}><legend>{steps[4]}</legend>
        {errors.length ? <div className={s.flash} data-tone="warn" role="alert"><div>
          <strong>{t("Antes de guardar, corrige:", "Before saving, fix:")}</strong>
          <ul>{errors.map(e => <li key={e}>{label(e)}</li>)}</ul></div></div>
          : <p className={s.flash} data-tone="ok" role="status">{t("Todo listo. Al guardar se crea una versión inmutable; podrás ver el PDF antes de descargarlo.", "All set. Saving creates an immutable version; you can preview the PDF before downloading it.")}</p>}
        <dl className={w.review}>
          <div><dt>{t("Prospecto", "Prospect")}</dt><dd>{c.client.company || "—"}</dd></div>
          <div><dt>{t("Modelo", "Model")}</dt><dd>{c.model}</dd></div>
          <div><dt>{t("Conceptos", "Items")}</dt><dd>{c.lines.length}</dd></div>
          <div><dt>{t("Válida hasta", "Valid until")}</dt><dd>{c.validUntil}</dd></div>
        </dl>
        {mode === "revise" && <label className={s.field}>{t("¿Qué cambió en esta revisión?", "What changed in this revision?")}<input name="note" value={note} maxLength={1000} onChange={e => setNote(e.target.value)} /></label>}
      </fieldset>}

      <div className={s.summary}>
        <dl>
          <div><dt>{t("Pago único", "One-time")}</dt><dd>{totals ? formatUsd(totals.oneTimeCents, lang) : "—"}</dd></div>
          <div><dt>{t("Mensual", "Monthly")}</dt><dd>{totals ? formatUsd(totals.monthlyCents, lang) : "—"}</dd></div>
          {cm && <div><dt>{t("Comisión", "Commission")}</dt><dd>{cm.status === "proposed" && cm.pct ? cm.pct + "%" : t("por acordar", "to be agreed")}</dd></div>}
        </dl>
        <div className={s.inline}>
          {step > 0 && <button type="button" className={s.button} onClick={() => setStep(step - 1)}>{t("Atrás", "Back")}</button>}
          {step < 4 && <button type="button" className={`${s.button} ${s.primary}`} onClick={() => setStep(step + 1)}>{t("Siguiente", "Next")}</button>}
          {step === 4 && <button type="submit" className={`${s.button} ${s.primary}`} disabled={errors.length > 0}>
            {mode === "create" ? t("Guardar cotización", "Save quote") : t("Guardar nueva revisión", "Save new revision")}</button>}
        </div>
      </div>
    </form>
  );
}
