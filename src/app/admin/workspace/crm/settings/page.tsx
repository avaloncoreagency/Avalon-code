import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, OkFlash, ErrorFlash, Tag, Unavailable, q, type Query } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { run } from "@/lib/os/data";
import { label } from "@/lib/sales/domain";
import { saveService, toggleRule } from "./actions";
import s from "@/components/sales/sales.module.css";
export const dynamic = "force-dynamic";

type Service = { id: string; code: string; name: string; billing_type: string; suggested_price: string | null; default_assignee_id: string | null; active: boolean; version: number; task_template: { title: string }[]; crm_departments: { label: string } | null };
type Rule = { id: string; key: string; label: string; label_en: string; description: string; enabled: boolean; updated_at: string };
type Stage = { id: string; label: string; kind: string; position: number };

export default async function CrmSettings({ searchParams }: { searchParams: Promise<Query> }) {
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const p = await searchParams;
  const [services, rules, owners, stages] = await Promise.all([
    run<Service[]>(supabase.from("crm_service_catalog").select("id,code,name,billing_type,suggested_price,default_assignee_id,active,version,task_template,crm_departments(label)").order("department_id").order("name")),
    run<Rule[]>(supabase.from("crm_automation_rules").select("id,key,label,label_en,description,enabled,updated_at").order("key")),
    run<{ user_id: string; email: string }[]>(supabase.rpc("crm_owner_directory")),
    run<Stage[]>(supabase.from("crm_stages").select("id,label,kind,position").order("position")),
  ]);
  return <Suite active="crm"><div className={s.hud}>
    <OpsHeader lang={lang} active="settings" eyebrow="CRM / Configuración" title={pick(lang, "Configuración del CRM", "CRM settings")}
      lead={pick(lang, "Catálogo de servicios (precio sugerido, responsable por defecto, plantilla de tareas) y automatizaciones. Cada cambio queda auditado.", "Service catalog (suggested price, default assignee, task template) and automations. Every change is audited.")} />
    <OkFlash lang={lang} code={q(p, "ok")} /><ErrorFlash lang={lang} code={q(p, "error")} />
    <section className={s.panel} aria-labelledby="catalog"><header><h2 id="catalog">{pick(lang, "Catálogo de servicios y enrutamiento", "Service catalog and routing")}</h2></header>
      {services.error ? <Unavailable lang={lang} code={services.error} /> : <ul className={s.list}>{services.data.map(x => <li key={x.id}>
        <form action={saveService} className={s.form}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="version" value={x.version} />
          <div className={s.actions} style={{ justifyContent: "space-between" }}><strong>{x.crm_departments?.label} · <code>{x.code}</code></strong><span className={s.inline}><Tag lang={lang} value={x.billing_type} />{!x.active && <Tag lang={lang} value="inactive" />}</span></div>
          <div className={s.row}>
            <label className={s.field}>{pick(lang, "Nombre", "Name")}<input name="name" required maxLength={120} defaultValue={x.name} /></label>
            <label className={s.field}>{pick(lang, "Precio sugerido (opcional)", "Suggested price (optional)")}<input name="suggested_price" inputMode="decimal" pattern="\d{1,13}(\.\d{1,2})?" placeholder="—" defaultValue={x.suggested_price ?? ""} /></label>
            <label className={s.field}>{pick(lang, "Responsable por defecto", "Default assignee")}<select name="default_assignee_id" defaultValue={x.default_assignee_id ?? ""}><option value="">{pick(lang, "El vendedor", "The seller")}</option>{(owners.data ?? []).map(o => <option key={o.user_id} value={o.user_id}>{o.email}</option>)}</select></label>
          </div>
          <div className={s.actions} style={{ justifyContent: "space-between" }}>
            <label className={s.inline}><input type="checkbox" name="active" defaultChecked={x.active} />{pick(lang, "Activo en el formulario de venta", "Active in the sale form")}</label>
            <button className={s.button}>{pick(lang, "Guardar servicio", "Save service")}</button>
          </div>
          <details><summary className={s.muted}>{pick(lang, `Plantilla: ${x.task_template.length} tarea(s) iniciales`, `Template: ${x.task_template.length} starter task(s)`)}</summary><ol className={s.muted}>{x.task_template.map((t, i) => <li key={i}>{t.title}</li>)}</ol></details>
        </form></li>)}</ul>}
    </section>
    <div className={s.columns}>
      <section className={s.panel} aria-labelledby="rules"><header><h2 id="rules">{pick(lang, "Automatizaciones", "Automations")}</h2><Link href="/admin/workspace/crm/activity?module=automation">{pick(lang, "Historial", "History")}</Link></header>
        {rules.error ? <Unavailable lang={lang} code={rules.error} /> : <ul className={s.list}>{rules.data.map(r => <li key={r.id}>
          <div className={s.actions} style={{ justifyContent: "space-between" }}><strong>{pick(lang, r.label, r.label_en)}</strong><span className={s.tag} data-tone={r.enabled ? "ok" : "neutral"}>{r.enabled ? pick(lang, "Activa", "On") : pick(lang, "Desactivada", "Off")}</span></div>
          <span className={s.muted}>{r.description}</span>
          <form action={toggleRule}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="enabled" value={String(!r.enabled)} /><button className={`${s.button} ${s.ghost}`}>{r.enabled ? pick(lang, "Desactivar", "Turn off") : pick(lang, "Activar", "Turn on")}</button></form>
        </li>)}</ul>}
      </section>
      <section className={s.panel} aria-labelledby="stages"><header><h2 id="stages">{pick(lang, "Etapas del pipeline", "Pipeline stages")}</h2><Link href="/admin/workspace/crm/leads">{pick(lang, "Abrir pipeline", "Open pipeline")}</Link></header>
        {stages.error ? <Unavailable lang={lang} code={stages.error} /> : <ol className={s.muted}>{stages.data.map(st => <li key={st.id}>{st.label} <span className={s.tag} data-tone={st.kind === "won" ? "ok" : st.kind === "lost" ? "neutral" : "info"}>{st.kind}</span></li>)}</ol>}
        <p className={s.muted}>{pick(lang, `${label(lang, "active")}: ${stages.data?.length ?? "—"} etapas. Con la migración 20261102180000 son 13 configurables.`, `${stages.data?.length ?? "—"} stages. With migration 20261102180000 there are 13 configurable stages.`)}</p>
      </section>
    </div>
  </div></Suite>;
}
