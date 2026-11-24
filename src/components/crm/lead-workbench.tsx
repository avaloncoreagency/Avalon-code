import { loadOwnerDirectory } from "@/lib/identity/directory";
import Link from "next/link";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { run } from "@/lib/os/data";
import { crmBusinessDayBounds } from "@/lib/crm/business-day";
import { QuickAdd } from "@/components/crm/intel/quick-add";
import s from "@/components/sales/sales.module.css";
import { CommandSummary, loadCommandSummary } from "./command-summary";

type Filter = "today" | "overdue" | "new" | "diagnosis" | "proposal" | "contract";
const cards: { key: Filter; es: string; en: string }[] = [
  { key: "today", es: "Contactos de hoy", en: "Today's follow-ups" },
  { key: "overdue", es: "Seguimientos vencidos", en: "Overdue follow-ups" },
  { key: "new", es: "Leads nuevos (7 días)", en: "New leads (7 days)" },
  { key: "diagnosis", es: "Diagnósticos pendientes", en: "Pending diagnoses" },
  { key: "proposal", es: "Propuestas abiertas", en: "Open proposals" },
  { key: "contract", es: "Contratos pendientes", en: "Pending contracts" },
];

/** Server-owned Pipeline workspace: the former desk's valuable actions, no extra main tab. */
export async function LeadWorkbench() {
  const { supabase, userId } = await requireOwner();
  const lang = await getLang();
  const now = new Date();
  const { start, end } = crmBusinessDayBounds(now);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const base = () => supabase.from("crm_leads").select("id", { count: "exact" })
    .eq("archived", false).eq("audience", "agency_b2b").not("stage_id", "in", "(won,lost)");
  const counts = [
    base().gte("follow_up_at", start).lt("follow_up_at", end).limit(1),
    base().lt("follow_up_at", now.toISOString()).limit(1),
    base().eq("stage_id", "new").gte("created_at", weekAgo).limit(1),
    base().neq("diagnosis_status", "complete").limit(1),
    base().in("stage_id", ["proposal", "negotiation"]).limit(1),
    base().in("contract_status", ["draft", "internal_review", "sent_for_signature", "signed_pending_verification"]).limit(1),
  ];
  const [[owners, ...results], commandData] = await Promise.all([Promise.all([
    run<{ user_id: string; email: string }[]>(loadOwnerDirectory(supabase)),
    ...counts.map(query => run<unknown[]>(query)),
  ]), loadCommandSummary(supabase)]);
  return (
    <section className={s.hud} aria-label={pick(lang, "Mi jornada comercial", "My sales workday")}>
      <header className={s.header}>
        <div>
          <p className={s.eyebrow}>Avalon OS / CRM</p>
          <h2>{pick(lang, "Tu jornada comercial", "Your sales workday")}</h2>
          <p className={s.lead}>{pick(lang,
            "Registra leads, revisa tus pendientes y continúa el proceso de ventas desde un solo lugar.",
            "Register leads, review follow-ups and run your sales process from one place.")}</p>
        </div>
        <div className={s.actions}>
          <Link className={s.button} href="/admin/workspace/crm/calendar">{pick(lang, "Calendario", "Calendar")}</Link>
          <Link className={s.button} href="/admin/workspace/crm/tasks">{pick(lang, "Tareas", "Tasks")}</Link>
        </div>
      </header>
      <CommandSummary supabase={supabase} lang={lang} data={commandData} />
      <div className={s.stats}>
        {cards.map((card, i) => (
          <Link key={card.key} className={s.stat} href={`/admin/workspace/crm/desk?f=${card.key}`}>
            <span>{pick(lang, card.es, card.en)}</span>
            <strong>{results[i].error ? "—" : results[i].count ?? 0}</strong>
          </Link>
        ))}
      </div>
      <details className={s.panel}>
        <summary style={{ cursor: "pointer", fontWeight: 700, minHeight: 44 }}>
          {pick(lang, "+ Registrar nuevo lead", "+ Register new lead")}
        </summary>
        <div style={{ marginTop: 16 }}>
          <QuickAdd lang={lang} owners={owners.data ?? []} me={userId} />
        </div>
      </details>
      <p className={s.muted}>
        {pick(lang, "Los conteos son reales; un guion indica que la consulta no está disponible. Cada tarjeta abre la lista filtrada.",
          "Counts come from stored records; a dash indicates unavailable data. Each card opens a filtered list.")}
      </p>
    </section>
  );
}
