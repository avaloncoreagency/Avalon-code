import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { uuid } from "@/lib/crm/domain";
import { prepareOpportunityBrief, SERVICE_AREAS, type ServiceArea } from "@/lib/ai/opportunity-brief";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ lead?: string }> };
type Lead = { id: string; company: string; stage_id: string | null };
const NAMES: Record<ServiceArea, [string, string]> = {
  website: ["Sitio web", "Website"],
  ecommerce: ["Comercio electronico", "E-commerce"],
  crm: ["CRM", "CRM"],
  receptionist: ["Recepcion", "Reception"],
  marketing: ["Marketing", "Marketing"],
};
const clean = (value: unknown, limit: number) =>
  typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, " ").trim().slice(0, limit) : "";

/** Read-only page: owner session + Supabase RLS, no privileged client or AI provider. */
export default async function SalesCopilotPage({ searchParams }: Props) {
  const { supabase } = await requireOwner(); // Must happen before ANY CRM read.
  const lang = await getLang();
  const params = await searchParams;
  const rawId = params?.lead;
  const leadId = typeof rawId === "string" && rawId.length <= 64 && uuid.test(rawId) ? rawId : null;

  // Business name only. Never fetch contacts, emails, notes or private financials.
  const { data: recent, error: listError } = await supabase
    .from("crm_leads")
    .select("id,company,stage_id")
    .eq("archived", false)
    .order("created_at", { ascending: false })
    .limit(12);

  let missing = false;
  let unavailable = Boolean(listError);
  let selected: { company: string; stage: string } | null = null;
  if (leadId && !unavailable) {
    const { data: row, error } = await supabase
      .from("crm_leads")
      .select("id,company,stage_id")
      .eq("id", leadId)
      .maybeSingle();
    if (error) unavailable = true;
    else if (!row) missing = true; // Identical for an absent or RLS-hidden lead.
    else {
      let stage = pick(lang, "Etapa no verificada", "Unverified stage");
      if (row.stage_id) {
        const { data: stageRow, error: stageError } = await supabase
          .from("crm_stages")
          .select("label")
          .eq("id", row.stage_id)
          .maybeSingle();
        // RLS-hidden, deleted or malformed stages must not be presented as verified context.
        const verifiedStage = clean(stageRow?.label, 100);
        if (stageError || !verifiedStage) unavailable = true;
        else stage = verifiedStage;
      }
      const company = clean(row.company, 160);
      if (!company) unavailable = true;
      else selected = { company, stage };
    }
  }

  // Empty signals are intentional: the CRM lead alone proves no service gap.
  // Reuse #73's strict core instead of fabricating facts or calling an LLM.
  const brief = selected && !unavailable
    ? await prepareOpportunityBrief({ companyName: selected.company, stage: selected.stage, signals: [] }, { adapter: null })
    : null;

  return (
    <Suite active="crm">
      <main style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 16px" }}>
        <Link href="/admin/workspace/crm/leads">{pick(lang, "Volver a leads", "Back to leads")}</Link>
        <h1>{pick(lang, "Sales Copilot | Evidencia", "Sales Copilot | Evidence")}</h1>
        <p role="status"><strong>{pick(lang, "IA no conectada", "AI not connected")}</strong> - {pick(lang,
          "Vista local, privada y de solo lectura. No genera respuestas ni consume tokens.",
          "Local, private, read-only view. No generated answers or token usage.")}</p>
        <p>{pick(lang,
          "Los datos de un lead no prueban que le falte un servicio. Solo se mostraran hechos con evidencia verificada.",
          "Lead data alone is not proof of missing services. Only evidence-backed facts may be displayed.")}</p>
        <section aria-labelledby="copilot-leads">
          <h2 id="copilot-leads">{pick(lang, "Seleccionar negocio", "Select a business")}</h2>
          {listError ? <p role="alert">{pick(lang, "No se pudieron consultar los leads.", "Leads are unavailable.")}</p> :
            !recent?.length ? <p>{pick(lang, "No hay leads visibles.", "No visible leads.")}</p> :
            <ul>{(recent as Lead[]).map(row => <li key={row.id}>
              <Link href={"/admin/workspace/crm/copilot?lead=" + encodeURIComponent(row.id)}>
                {clean(row.company, 160) || pick(lang, "Negocio sin nombre", "Unnamed business")}
              </Link>
            </li>)}</ul>}
        </section>
        {rawId && !leadId && <p role="alert">{pick(lang, "Identificador invalido.", "Invalid lead identifier.")}</p>}
        {unavailable && !listError && <p role="alert">{pick(lang, "No se pudo verificar el registro.", "Unable to verify the record.")}</p>}
        {missing && <p role="status">{pick(lang, "Lead no disponible o sin permiso de lectura.", "Lead unavailable or not readable.")}</p>}
        {brief && <section aria-labelledby="copilot-result">
          <h2 id="copilot-result">{brief.snapshot.companyName}</h2>
          <p>{pick(lang, "Etapa", "Stage")}: {brief.snapshot.stage}</p>
          <h3>{pick(lang, "Hechos comprobados", "Verified facts")}</h3>
          {brief.snapshot.facts.length === 0 ?
            <p>{pick(lang, "Ninguno: no se han cargado evidencias verificadas.", "None: no verified evidence has been loaded.")}</p> :
            <ul>{brief.snapshot.facts.map(fact => <li key={fact.area}>
              {pick(lang, ...NAMES[fact.area])}: {fact.assessment} <a href={fact.sourceUrl} rel="noopener noreferrer">{pick(lang, "Fuente", "Source")}</a>
            </li>)}</ul>}
          <h3>{pick(lang, "Datos desconocidos", "Unknowns")}</h3>
          <ul>{brief.snapshot.unknowns.map(item => <li key={item.area}>
            {pick(lang, ...NAMES[item.area])}: {pick(lang, "Sin evaluar", "Not evaluated")}
          </li>)}</ul>
          <p>{pick(lang, "No existe borrador de IA. Toda accion comercial requiere revision humana.",
            "No AI draft exists. Any sales action requires human review.")}</p>
        </section>}
        <p><small>{pick(lang, "Categorias previstas: " + SERVICE_AREAS.length + ". Sin cambios al CRM.",
          "Tracked categories: " + SERVICE_AREAS.length + ". No CRM changes.")}</small></p>
      </main>
    </Suite>
  );
}
