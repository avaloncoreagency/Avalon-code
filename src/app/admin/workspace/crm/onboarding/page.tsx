import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, q, type Query } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { PRODUCT_LABEL, PRODUCT_TYPES, STAGES, STAGE_LABEL, isStage, progress, readChecklist, type ProductType } from "@/lib/onboarding/model";
import { startOnboarding } from "./actions";
import s from "@/components/sales/sales.module.css";
import w from "@/components/quotes/quotes.module.css";

export const dynamic = "force-dynamic";
type Row = { id: string; client_id: string; sale_id: string | null; title: string; product_type: ProductType; stage: string; checklist: unknown; next_step: string; next_step_on: string | null;
  next_step_confirmed: boolean; updated_at: string; crm_clients: { legal_name: string; trade_name: string } | null };

/** CRM → Onboarding y entregas. Owners only (requireOwner + RLS). Canonical clients; no second client base. */
export default async function OnboardingList({ searchParams }: { searchParams: Promise<Query> }) {
  const { supabase } = await requireOwner();
  const lang = await getLang(); const p = await searchParams;
  const t = (es: string, en: string) => pick(lang, es, en);
  const stage = q(p, "stage"); const stageFilter = isStage(stage) ? stage : null;
  let query = supabase.from("crm_client_onboardings").select("id,client_id,sale_id,title,product_type,stage,checklist,next_step,next_step_on,next_step_confirmed,updated_at,crm_clients(legal_name,trade_name)", { count: "exact" })
    .order("updated_at", { ascending: false }).limit(100);
  if (stageFilter) query = query.eq("stage", stageFilter);
  const [rows, eligible] = await Promise.all([
    query,
    // Confirmed sales without an onboarding yet (one per sale; the database enforces it).
    supabase.from("crm_sales").select("id,sale_number,client_id,sold_on,crm_clients(legal_name)").eq("status", "confirmed").order("sold_on", { ascending: false }).limit(30),
  ]);
  const ready = !rows.error;
  const list = (rows.data ?? []) as unknown as Row[];
  const started = new Set(list.map(r => r.sale_id).filter(Boolean));
  const candidates = ((eligible.data ?? []) as unknown as { id: string; sale_number: string; client_id: string; sold_on: string; crm_clients: { legal_name: string } | null }[]).filter(x => !started.has(x.id));
  return <Suite active="crm"><div className={s.hud}>
    <OpsHeader lang={lang} active="clients" eyebrow={t("CRM / Onboarding y entregas", "CRM / Onboarding & delivery")} title={t("Onboarding y entregas", "Onboarding & delivery")}
      lead={t("Venta → Cliente → Contrato → Onboarding → Producción → Entrega → Documentación → Factura → Soporte, sobre los registros canónicos.", "Sale → Client → Agreement → Onboarding → Build → Delivery → Documentation → Invoice → Support, on the canonical records.")}
      actions={<Link className={s.button} href="/admin/workspace/crm/clients">{t("Clientes 360°", "Clients 360°")}</Link>} />
    {!ready ? <p className={s.flash} data-tone="warn" role="status">{t("El onboarding requiere la migración 20261124140000 (pendiente de aplicar). Nada se ha inventado.", "Onboarding requires migration 20261124140000 (not applied yet). Nothing has been fabricated.")}</p> : <>
      <section className={s.panel} aria-labelledby="ob-list">
        <header><h2 id="ob-list">{t("Onboardings", "Onboardings")}</h2><small className={s.muted}>{rows.count ?? list.length}</small></header>
        <nav className={w.filters} aria-label={t("Filtrar por etapa", "Filter by stage")}>
          <Link href="/admin/workspace/crm/onboarding" aria-current={!stageFilter ? "page" : undefined}>{t("Todas", "All")}</Link>
          {STAGES.map(st => <Link key={st} href={`/admin/workspace/crm/onboarding?stage=${st}`} aria-current={stageFilter === st ? "page" : undefined}>{pick(lang, ...STAGE_LABEL[st])}</Link>)}
        </nav>
        {list.length === 0 ? <p className={s.empty}>{t("Aún no hay onboardings. Inícialos desde una venta confirmada o desde la ficha del cliente.", "No onboardings yet. Start one from a confirmed sale or from the client record.")}</p> :
        <div className={s.tableWrap}><table className={s.table} data-mobile-cards><thead><tr><th>{t("Onboarding", "Onboarding")}</th><th>{t("Cliente", "Client")}</th><th>{t("Producto", "Product")}</th><th>{t("Etapa", "Stage")}</th><th>{t("Checklist", "Checklist")}</th><th>{t("Próximo paso", "Next step")}</th></tr></thead>
          <tbody>{list.map(r => { const pr = progress(readChecklist(r.checklist)); return <tr key={r.id} data-onboarding={r.stage}>
            <td data-label={t("Onboarding", "Onboarding")}><Link href={`/admin/workspace/crm/onboarding/${r.id}`}><strong>{r.title}</strong></Link></td>
            <td data-label={t("Cliente", "Client")}><Link href={`/admin/workspace/crm/clients/${r.client_id}`}>{r.crm_clients?.trade_name || r.crm_clients?.legal_name}</Link></td>
            <td data-label={t("Producto", "Product")}>{pick(lang, ...PRODUCT_LABEL[r.product_type])}</td>
            <td data-label={t("Etapa", "Stage")}><span className={s.tag}>{isStage(r.stage) ? pick(lang, ...STAGE_LABEL[r.stage]) : r.stage}</span></td>
            <td data-label={t("Checklist", "Checklist")}>{pr.done}/{pr.total}</td>
            <td data-label={t("Próximo paso", "Next step")}>{r.next_step || "—"}{r.next_step_on ? ` · ${formatDate(lang, r.next_step_on)}${r.next_step_confirmed ? "" : ` (${t("estimada", "estimate")})`}` : ""}</td>
          </tr>; })}</tbody></table></div>}
      </section>
      {candidates.length > 0 && <section className={s.panel} aria-labelledby="ob-eligible">
        <h2 id="ob-eligible">{t("Ventas confirmadas sin onboarding", "Confirmed sales without onboarding")}</h2>
        <ul className={s.list}>{candidates.map(x => <li key={x.id} data-eligible-sale={x.sale_number}><span><strong>{x.sale_number}</strong> · {x.crm_clients?.legal_name} · {formatDate(lang, x.sold_on)}</span>
          <form action={startOnboarding} className={s.inline}><input type="hidden" name="client_id" value={x.client_id} /><input type="hidden" name="sale_id" value={x.id} />
            <select name="product_type" aria-label={t("Tipo de producto", "Product type")} defaultValue="website">{PRODUCT_TYPES.map(pt => <option key={pt} value={pt}>{pick(lang, ...PRODUCT_LABEL[pt])}</option>)}</select>
            <button className={`${s.button} ${s.primary}`} type="submit">{t("Iniciar onboarding", "Start onboarding")}</button></form></li>)}</ul>
      </section>}
    </>}
  </div></Suite>;
}
