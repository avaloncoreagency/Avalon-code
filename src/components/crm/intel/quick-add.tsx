"use client";
import Link from "next/link";
import { useActionState, useRef } from "react";
import { quickAddLead, type QuickAddState } from "@/app/admin/workspace/crm/lead/actions";
import { TzOffset } from "@/components/sales/tz-offset";
import { INDUSTRIES } from "@/lib/crm/intel/industries";
import { intelErrorText } from "@/lib/crm/intel/errors";
import type { Lang } from "@/lib/crm/intel/types";
import s from "@/components/sales/sales.module.css";
import x from "./intel.module.css";

const t = (lang: Lang, es: string, en: string) => (lang === "es" ? es : en);
const REASON: Record<string, [string, string]> = { phone: ["mismo teléfono", "same phone"], domain: ["mismo dominio", "same domain"], email: ["mismo correo", "same email"], name: ["mismo nombre", "same name"] };

/** Quick Add: only the business name is required. Data stays in the form on errors or duplicate warnings. */
export function QuickAdd({ lang, owners, me }: { lang: Lang; owners: { user_id: string; email: string }[]; me: string }) {
  const [state, action, pending] = useActionState<QuickAddState, FormData>(quickAddLead, null);
  const confirm = useRef<HTMLInputElement>(null);
  const v = (k: string, d = "") => state?.values?.[k] ?? d;
  return (
    <form key={JSON.stringify(state?.values ?? null) + (state?.error ?? "") + (state?.duplicates?.length ?? 0)} action={action} className={s.form} aria-busy={pending}>
      {state?.error && <p className={s.flash} data-tone="error" role="alert">{intelErrorText(lang, state.error)}</p>}
      {state?.duplicates && <div className={x.dup} role="alert">
        <strong>{t(lang, "Posibles duplicados. No se fusiona nada automáticamente:", "Possible duplicates. Nothing is merged automatically:")}</strong>
        <ul>{state.duplicates.map(d => <li key={d.id}><Link href={`/admin/workspace/crm/lead/${d.id}`}>{d.company}</Link> — {d.reasons.map(r => t(lang, ...(REASON[r] ?? [r, r]))).join(", ")}</li>)}</ul>
        <button type="submit" className={s.button} onClick={() => { if (confirm.current) confirm.current.value = "1"; }}>
          {t(lang, "Es otro negocio: crear de todos modos", "It's a different business: create anyway")}
        </button>
      </div>}
      <input ref={confirm} type="hidden" name="confirm_new" defaultValue="0" />
      <TzOffset />
      <div className={s.row}>
        <label className={s.field}><span>{t(lang, "Nombre comercial *", "Business name *")}</span><input name="company" defaultValue={v("company")} required maxLength={200} autoComplete="organization" /></label>
        <label className={s.field}><span>{t(lang, "Industria", "Industry")}</span>
          <select name="industry_key" defaultValue={v("industry_key")}><option value="">{t(lang, "Elegir después", "Choose later")}</option>
            {INDUSTRIES.map(i => <option key={i.key} value={i.key}>{i.label[lang]}</option>)}</select></label>
      </div>
      <div className={s.row}>
        <label className={s.field}><span>{t(lang, "Contacto", "Contact")}</span><input name="contact" defaultValue={v("contact")} maxLength={160} autoComplete="name" /></label>
        <label className={s.field}><span>{t(lang, "Teléfono", "Phone")}</span><input name="phone" defaultValue={v("phone")} type="tel" maxLength={40} autoComplete="tel" inputMode="tel" /></label>
        <label className={s.field}><span>{t(lang, "Correo", "Email")}</span><input name="email" defaultValue={v("email")} type="email" maxLength={254} autoComplete="email" /></label>
      </div>
      <details>
        <summary className={x.meta} style={{ cursor: "pointer", fontSize: 13 }}>{t(lang, "Más datos (opcional)", "More details (optional)")}</summary>
        <div className={s.row} style={{ marginTop: 10 }}>
          <label className={s.field}><span>Website</span><input name="website" defaultValue={v("website")} maxLength={300} inputMode="url" placeholder="ejemplo.com" /></label>
          <label className={s.field}><span>{t(lang, "Ciudad", "City")}</span><input name="city" defaultValue={v("city")} maxLength={120} /></label>
          <label className={s.field}><span>ZIP</span><input name="zip" defaultValue={v("zip")} maxLength={10} inputMode="numeric" /></label>
          <label className={s.field}><span>{t(lang, "Origen", "Source")}</span>
            <select name="origin" defaultValue={v("origin", "manual")}>
              {[["manual", "Entrada manual", "Manual entry"], ["radar", "Radar / Lead Hunter", "Radar / Lead Hunter"], ["referral", "Referido", "Referral"], ["website", "Website Avalon", "Avalon website"], ["campaign", "Campaña", "Campaign"], ["other", "Otro (verificable)", "Other (verifiable)"]]
                .map(([v, es, en]) => <option key={v} value={v}>{t(lang, es, en)}</option>)}
            </select></label>
          <label className={s.field}><span>{t(lang, "Responsable", "Owner")}</span>
            <select name="owner_id" defaultValue={v("owner_id", me)}>{owners.map(o => <option key={o.user_id} value={o.user_id}>{o.email.split("@")[0]}{o.user_id === me ? t(lang, " (yo)", " (me)") : ""}</option>)}</select></label>
          <label className={s.field}><span>{t(lang, "Prioridad", "Priority")}</span>
            <select name="priority" defaultValue={v("priority", "normal")}><option value="low">{t(lang, "Baja", "Low")}</option><option value="normal">Normal</option><option value="high">{t(lang, "Alta", "High")}</option></select></label>
          <label className={s.field}><span>{t(lang, "Próximo contacto", "Next contact")}</span><input name="follow_up_at" defaultValue={v("follow_up_at")} type="datetime-local" /></label>
          <label className={s.field}><span>{t(lang, "Próxima acción", "Next action")}</span><input name="next_action" defaultValue={v("next_action")} maxLength={300} /></label>
        </div>
        <label className={s.field} style={{ marginTop: 10 }}><span>{t(lang, "Nota interna", "Internal note")}</span><textarea name="note" defaultValue={v("note")} maxLength={4000} rows={2} /></label>
      </details>
      <div className={s.actions}>
        <button type="submit" className={`${s.button} ${s.primary}`} disabled={pending} onClick={() => { if (confirm.current) confirm.current.value = "0"; }}>
          {pending ? t(lang, "Guardando…", "Saving…") : t(lang, "Guardar lead", "Save lead")}
        </button>
        <span className={x.meta}>{t(lang, "Solo el nombre es obligatorio. El diagnóstico se completa después.", "Only the name is required. Complete the diagnosis later.")}</span>
      </div>
    </form>
  );
}
