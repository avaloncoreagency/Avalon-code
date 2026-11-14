"use client";
import { useActionState, useState, useCallback, useMemo, useRef, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { confirmSale, type SaleFormState } from "@/app/admin/workspace/crm/sales/actions";
import { MAX_CONTACTS, MAX_LINES, money, previewTotals, saleErrorText, label } from "@/lib/sales/domain";
import type { Lang } from "@/lib/i18n";
import s from "./sales.module.css";

export type CatalogService = { code: string; name: string; name_en: string; billing_type: string; suggested_price: string | null; department: string };
type Option = { id: string; label: string };
const t = (lang: Lang, es: string, en: string) => (lang === "es" ? es : en);

function Submit({ lang }: { lang: Lang }) {
  const { pending } = useFormStatus();
  return <button className={`${s.button} ${s.primary}`} type="submit" disabled={pending} aria-busy={pending}>
    {pending ? t(lang, "Confirmando…", "Confirming…") : t(lang, "Confirmar venta e iniciar trabajo", "Confirm sale and start work")}
  </button>;
}

export function SaleForm({ lang, idempotencyKey, services, clients, leads, owners, me, defaults, initialDate }: {
  lang: Lang; idempotencyKey: string; initialDate: string; services: CatalogService[]; clients: Option[]; leads: Option[]; owners: Option[]; me: string;
  defaults: { client_id?: string; lead_id?: string; legal_name?: string };
}) {
  const [state, action] = useActionState<SaleFormState, FormData>(confirmSale, { error: null, values: {} });
  const v = (name: string, fallback = "") => state.values[name] ?? fallback;
  // React 19 resets a form after its action; selects and radios do not pick up new defaults after mount. Remount the
  // form for every server answer so everything the owner typed (service lines, client choice…) is shown again.
  const lastState = useRef(state), attempts = useRef(0);
  if (lastState.current !== state) { lastState.current = state; attempts.current += 1; }
  const attempt = attempts.current;
  const [mode, setMode] = useState<"existing" | "new">(defaults.client_id ? "existing" : (state.values.client_mode as "existing" | "new") || (defaults.lead_id ? "new" : (clients.length ? "existing" : "new")));
  const [totals, setTotals] = useState(() => previewTotals([]));
  const [currency, setCurrency] = useState("USD");
  const [filled, setFilled] = useState<boolean[]>(() => Array.from({ length: MAX_LINES }, (_, i) => i === 0));
  const byCode = useMemo(() => new Map(services.map(x => [x.code, x])), [services]);

  const recompute = useCallback((e: FormEvent<HTMLFormElement>) => {
    const f = new FormData(e.currentTarget);
    const lines = Array.from({ length: MAX_LINES }, (_, i) => ({ code: String(f.get(`line_${i}_service`) ?? ""), i }))
      .filter(l => l.code).map(({ code, i }) => ({
        quantity: String(f.get(`line_${i}_qty`) ?? ""), unit_price: String(f.get(`line_${i}_price`) || byCode.get(code)?.suggested_price || ""),
        discount: String(f.get(`line_${i}_discount`) ?? ""), billing: byCode.get(code)?.billing_type,
      }));
    setFilled(Array.from({ length: MAX_LINES }, (_, i) => Boolean(f.get(`line_${i}_service`))));
    setCurrency(String(f.get("currency") || "USD").toUpperCase().slice(0, 3));
    const valid = lines.every(l => /^\d*(\.\d{0,2})?$/.test(l.unit_price) && /^\d*(\.\d{0,2})?$/.test(l.quantity) && /^\d*(\.\d{0,2})?$/.test(l.discount));
    if (valid) setTotals(previewTotals(lines, String(f.get("discount") ?? "0"), String(f.get("tax_rate") ?? "0")));
  }, [byCode]);

  const fmt = (n: number) => /^[A-Z]{3}$/.test(currency) ? money(lang, n, currency) : n.toFixed(2);
  const ownerOptions = owners.map(o => <option key={o.id} value={o.id}>{o.label}</option>);

  return <form key={attempt} action={action} className={s.form} onChange={recompute} noValidate={false}>
    <input type="hidden" name="idempotency_key" value={idempotencyKey} />
    {state.error && <div className={s.flash} data-tone="error" role="alert">
      <span>{saleErrorText(lang, state.error)}</span>
      {state.existingClientId && <button type="button" className={s.button} onClick={() => setMode("existing")}>{t(lang, "Usar cliente existente", "Use existing client")}</button>}
    </div>}

    <fieldset className={s.fieldset}>
      <legend>{t(lang, "1 · Cliente", "1 · Client")}</legend>
      <div className={s.choice} role="radiogroup" aria-label={t(lang, "Tipo de cliente", "Client type")}>
        <label><input type="radio" name="client_mode" value="existing" checked={mode === "existing"} onChange={() => setMode("existing")} disabled={!clients.length} />{t(lang, "Cliente existente", "Existing client")}</label>
        <label><input type="radio" name="client_mode" value="new" checked={mode === "new"} onChange={() => setMode("new")} />{t(lang, "Cliente nuevo", "New client")}</label>
      </div>
      {mode === "existing" ? <label className={s.field}>{t(lang, "Cliente", "Client")}
        <select name="client_id" required defaultValue={state.existingClientId ?? v("client_id", defaults.client_id ?? "")}>
          <option value="">{t(lang, "Selecciona…", "Select…")}</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select></label>
      : <>
        <div className={s.row}>
          <label className={s.field}>{t(lang, "Nombre de empresa *", "Company name *")}<input name="legal_name" required maxLength={200} defaultValue={v("legal_name", defaults.legal_name ?? "")} autoComplete="organization" /></label>
          <label className={s.field}>{t(lang, "Nombre comercial", "Trade name")}<input name="trade_name" maxLength={200} defaultValue={v("trade_name")} /></label>
          <label className={s.field}>{t(lang, "Web (https://)", "Website (https://)")}<input name="website" type="url" inputMode="url" maxLength={500} placeholder="https://" defaultValue={v("website")} /></label>
        </div>
        <div className={s.row}>
          <label className={s.field}>{t(lang, "Industria", "Industry")}<input name="industry" maxLength={120} defaultValue={v("industry")} /></label>
          <label className={s.field}>{t(lang, "País", "Country")}<input name="country" maxLength={80} defaultValue={v("country")} autoComplete="country-name" /></label>
          <label className={s.field}>{t(lang, "Ubicación", "Location")}<input name="location" maxLength={200} defaultValue={v("location")} /></label>
          <label className={s.field}>{t(lang, "Fuente de captación", "Acquisition source")}<input name="source" maxLength={200} defaultValue={v("source")} placeholder={t(lang, "Referido, web, evento…", "Referral, web, event…")} /></label>
        </div>
        <label className={s.field}>{t(lang, "Notas del cliente", "Client notes")}<textarea name="client_notes" maxLength={4000} rows={2} defaultValue={v("client_notes")} /></label>
      </>}
      <label className={s.field}>{t(lang, "Oportunidad de origen (opcional)", "Source opportunity (optional)")}
        <select name="lead_id" defaultValue={v("lead_id", defaults.lead_id ?? "")}>
          <option value="">{t(lang, "Sin oportunidad vinculada", "No linked opportunity")}</option>
          {leads.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select></label>
      <details open={Boolean(v("contact_0_name"))}>
        <summary>{t(lang, "Contactos (se añaden sin duplicar correos)", "Contacts (added without duplicating e-mails)")}</summary>
        {Array.from({ length: MAX_CONTACTS }, (_, i) => <div className={s.row} key={i}>
          <label className={s.field}>{t(lang, "Nombre", "Name")}<input name={`contact_${i}_name`} maxLength={160} defaultValue={v(`contact_${i}_name`)} /></label>
          <label className={s.field}>Email<input name={`contact_${i}_email`} type="email" maxLength={254} defaultValue={v(`contact_${i}_email`)} /></label>
          <label className={s.field}>{t(lang, "Teléfono", "Phone")}<input name={`contact_${i}_phone`} type="tel" maxLength={40} defaultValue={v(`contact_${i}_phone`)} /></label>
          <label className={s.field}>{t(lang, "Cargo", "Role")}<input name={`contact_${i}_role`} maxLength={120} defaultValue={v(`contact_${i}_role`)} /></label>
        </div>)}
      </details>
    </fieldset>

    <fieldset className={s.fieldset}>
      <legend>{t(lang, "2 · Servicios vendidos", "2 · Sold services")}</legend>
      <p className={s.muted}>{t(lang, "Cada línea crea su orden de trabajo y, según el departamento, un proyecto con tareas iniciales.", "Each line creates its work order and, per department, a project with starter tasks.")}</p>
      {Array.from({ length: MAX_LINES }, (_, i) => (i === 0 || filled[i - 1] || filled[i] || v(`line_${i}_service`)) && <div className={s.line} key={i} data-filled={filled[i] || undefined}>
        <div className={s.row}>
          <label className={s.field}>{t(lang, `Servicio ${i + 1}`, `Service ${i + 1}`)}
            <select name={`line_${i}_service`} required={i === 0} defaultValue={v(`line_${i}_service`)}>
              <option value="">{i === 0 ? t(lang, "Selecciona…", "Select…") : t(lang, "— Ninguno —", "— None —")}</option>
              {services.map(x => <option key={x.code} value={x.code}>{t(lang, x.name, x.name_en || x.name)} · {x.department} · {label(lang, x.billing_type)}</option>)}
            </select></label>
          <label className={s.field}>{t(lang, "Precio", "Price")}<input name={`line_${i}_price`} inputMode="decimal" pattern="\d{1,13}(\.\d{1,2})?" placeholder="0.00" defaultValue={v(`line_${i}_price`)} /></label>
          <label className={s.field}>{t(lang, "Cantidad", "Qty")}<input name={`line_${i}_qty`} inputMode="decimal" pattern="\d{1,7}(\.\d{1,2})?" placeholder="1" defaultValue={v(`line_${i}_qty`)} /></label>
          <label className={s.field}>{t(lang, "Descuento", "Discount")}<input name={`line_${i}_discount`} inputMode="decimal" pattern="\d{1,13}(\.\d{1,2})?" placeholder="0.00" defaultValue={v(`line_${i}_discount`)} /></label>
        </div>
        <div className={s.row}>
          <label className={s.field}>{t(lang, "Responsable", "Assignee")}<select name={`line_${i}_assignee`} defaultValue={v(`line_${i}_assignee`)}><option value="">{t(lang, "Por defecto del servicio / vendedor", "Service default / seller")}</option>{ownerOptions}</select></label>
          <label className={s.field}>{t(lang, "Inicio", "Start")}<input name={`line_${i}_start`} type="date" defaultValue={v(`line_${i}_start`)} /></label>
        </div>
        <label className={s.field}>{t(lang, "Alcance", "Scope")}<textarea name={`line_${i}_description`} maxLength={2000} rows={2} defaultValue={v(`line_${i}_description`)} /></label>
      </div>)}
    </fieldset>

    <fieldset className={s.fieldset}>
      <legend>{t(lang, "3 · Condiciones", "3 · Terms")}</legend>
      <div className={s.row}>
        <label className={s.field}>{t(lang, "Fecha de venta", "Sale date")}<input name="sold_on" type="date" defaultValue={v("sold_on", initialDate)} /></label>
        <label className={s.field}>{t(lang, "Moneda", "Currency")}<input name="currency" maxLength={3} pattern="[A-Za-z]{3}" defaultValue={v("currency", "USD")} /></label>
        <label className={s.field}>{t(lang, "Facturación", "Billing")}<select name="billing_mode" defaultValue={v("billing_mode", "mixed")}>{["mixed", "one_time", "installments", "monthly"].map(b => <option key={b} value={b}>{label(lang, b)}</option>)}</select></label>
        <label className={s.field}>{t(lang, "Responsable comercial", "Sales owner")}<select name="seller_id" defaultValue={v("seller_id", me)}>{ownerOptions}</select></label>
      </div>
      <div className={s.row}>
        <label className={s.field}>{t(lang, "Descuento general", "Overall discount")}<input name="discount" inputMode="decimal" pattern="\d{1,13}(\.\d{1,2})?" placeholder="0.00" defaultValue={v("discount")} /></label>
        <label className={s.field}>{t(lang, "Impuesto %", "Tax %")}<input name="tax_rate" inputMode="decimal" pattern="\d{1,3}(\.\d{1,2})?" placeholder="0" defaultValue={v("tax_rate")} /></label>
        <label className={s.field}>{t(lang, "Pago inicial acordado", "Agreed upfront payment")}<input name="upfront_amount" inputMode="decimal" pattern="\d{1,13}(\.\d{1,2})?" placeholder="0.00" defaultValue={v("upfront_amount")} /></label>
        <label className={s.field}>{t(lang, "Contrato", "Contract")}<select name="contract_status" defaultValue={v("contract_status", "pending_signature")}><option value="pending_signature">{label(lang, "pending_signature")}</option><option value="signed">{label(lang, "signed")}</option></select></label>
      </div>
      <label className={s.field}>{t(lang, "Notas internas", "Internal notes")}<textarea name="notes" maxLength={4000} rows={2} defaultValue={v("notes")} /></label>
      <p className={s.muted}>{t(lang, "El pago inicial es lo acordado, no lo cobrado. Los cobros reales se registran después en la ficha de la venta.", "The upfront payment is what was agreed, not collected. Actual payments are recorded later on the sale.")}</p>
    </fieldset>

    <div className={s.summary} aria-live="polite" role="region" aria-label={t(lang, "Resumen de la venta", "Sale summary")}>
      <dl>
        <div><dt>Subtotal</dt><dd>{fmt(totals.subtotal)}</dd></div>
        <div><dt>{t(lang, "Impuesto", "Tax")}</dt><dd>{fmt(totals.tax)}</dd></div>
        <div><dt>{t(lang, "Total contratado", "Contracted total")}</dt><dd><strong>{fmt(totals.total)}</strong></dd></div>
        <div><dt>{t(lang, "Recurrente / mes", "Recurring / mo")}</dt><dd>{fmt(totals.recurring)}</dd></div>
      </dl>
      <Submit lang={lang} />
    </div>
    <p className={s.muted}>{t(lang, "Vista previa. La base de datos recalcula y valida los importes. Confirmar dos veces no duplica la venta.", "Preview. The database recalculates and validates amounts. Confirming twice does not duplicate the sale.")}</p>
  </form>;
}
