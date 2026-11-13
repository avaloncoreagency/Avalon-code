import Link from "next/link";
import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, ownerName, q, UUID_RE, type Query } from "@/components/sales/ui";
import { TzOffset } from "@/components/sales/tz-offset";
import { ContractUpload } from "@/components/crm/intel/contract-upload";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate, type Lang } from "@/lib/i18n";
import { run } from "@/lib/os/data";
import { industryLabel } from "@/lib/crm/intel/industries";
import { intelErrorText } from "@/lib/crm/intel/errors";
import { templateFor } from "@/lib/crm/intel/templates";
import { progress } from "@/lib/crm/intel/form";
import { recommend } from "@/lib/crm/intel/recommendations";
import { legalOf, extractFacts, type CategoryResult } from "@/lib/crm/intel/scoring";
import type { Answers } from "@/lib/crm/intel/types";
import { adjustScore, createContract, decideRecommendation, logInteraction, saveTerms, transitionContract, updateLeadMeta } from "../actions";
import s from "@/components/sales/sales.module.css";
import x from "@/components/crm/intel/intel.module.css";
export const dynamic = "force-dynamic";

type Lead = Record<string, unknown> & { id: string; company: string; owner_id: string; created_by: string; stage_id: string; version: number; priority: string;
  industry_key: string | null; diagnosis_status: string; lead_score: number | null; lead_grade: string | null; contract_status: string; follow_up_at: string | null;
  next_action: string; last_interaction_at: string | null; created_at: string; updated_at: string; contact: string; phone: string; email: string | null; website: string;
  city: string; zip: string; address: string; legal_name: string; contact_title: string; google_business_url: string; specialty: string; service_area: string; origin: string; source: string; loss_reason: string };
type Score = { id: string; score: number | null; grade: string; breakdown: CategoryResult[]; legal_status: string; legal_flags: string[]; manual_score: number | null; manual_reason: string; rules_version: string; created_by: string; created_at: string };
type Rec = { id: string; rule_id: string; service: string; problem: string; evidence: { label: string; value: string }[]; missing: string[]; next_action: string; status: string; note: string; decided_by: string | null; version: number };
type Terms = Record<string, unknown> & { id: string; kind: string; version: number; services: string[]; commission_pct: number | null; commission_approved_by: string | null };
type Contract = { id: string; title: string; status: string; version: number; terms_id: string | null; accepted_at: string | null; sent_at: string | null; signed_at: string | null; signer_name: string;
  attachment_id: string | null; external_reference: string; verification_method: string | null; verification_note: string; verified_by: string | null; verified_at: string | null; created_at: string };

const CONTRACT_LABEL: Record<string, [string, string]> = {
  not_started: ["Sin iniciar", "Not started"], draft: ["Borrador", "Draft"], internal_review: ["Revisión interna", "Internal review"],
  sent_for_signature: ["Enviado a firma", "Sent for signature"], signed_pending_verification: ["Firmado · pendiente de verificar", "Signed — pending verification"],
  verified_signed: ["Firmado y verificado", "Verified signed"], rejected: ["Rechazado", "Rejected"], expired: ["Vencido", "Expired"],
};
const NEXT: Record<string, string[]> = {
  draft: ["internal_review", "sent_for_signature", "rejected"], internal_review: ["draft", "sent_for_signature", "rejected"],
  sent_for_signature: ["signed_pending_verification", "rejected", "expired"], signed_pending_verification: ["verified_signed", "rejected", "sent_for_signature"],
  verified_signed: ["expired"], rejected: ["draft"], expired: ["draft"],
};
const SERVICES = ["Website Designer", "E-commerce Designer", "CRM Creator", "AI Receptionist", "AI Chatbot", "Marketing / Ads", "SEO / Google Business", "Automatizaciones"];
const TABS = ["summary", "recs", "terms", "contract", "history"] as const;

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Query> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { supabase, userId } = await requireOwner();
  const lang = await getLang();
  const p = await searchParams;
  const tab = (TABS as readonly string[]).includes(q(p, "tab") ?? "") ? q(p, "tab")! : "summary";
  const leadRes = await run<Lead | null>(supabase.from("crm_leads").select("*, crm_stages(label,kind)").eq("id", id).maybeSingle());
  if (leadRes.error === "schema_pending") return <Suite active="crm"><section className={s.hud}><p className={s.flash} data-tone="warn">{intelErrorText(lang, "schema_pending")}</p></section></Suite>;
  const lead = leadRes.data;
  if (!lead) notFound();
  const [owners, stages, scores, assessments, recs, terms, contracts, files, acts, audit, revs, cevents, stageHist] = await Promise.all([
    run<{ user_id: string; email: string }[]>(supabase.rpc("crm_owner_directory")),
    run<{ id: string; label: string; kind: string; active: boolean }[]>(supabase.from("crm_stages").select("id,label,kind,active").order("position")),
    run<Score[]>(supabase.from("crm_lead_scores").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(10)),
    run<{ industry_key: string; status: string; progress: number; answers: Answers; updated_at: string; updated_by: string | null }[]>(supabase.from("crm_lead_assessments").select("industry_key,status,progress,answers,updated_at,updated_by").eq("lead_id", id)),
    run<Rec[]>(supabase.from("crm_lead_recommendations").select("*").eq("lead_id", id).order("created_at")),
    run<Terms[]>(supabase.from("crm_commercial_terms").select("*").eq("lead_id", id)),
    run<Contract[]>(supabase.from("crm_contracts").select("*").eq("lead_id", id).order("created_at", { ascending: false })),
    run<{ id: string; filename: string; created_at: string }[]>(supabase.from("crm_attachments").select("id,filename,created_at").eq("lead_id", id).order("created_at", { ascending: false })),
    run<{ id: string; body: string; kind: string; status: string; due_at: string | null; created_by: string; created_at: string }[]>(supabase.from("crm_activities").select("id,body,kind,status,due_at,created_by,created_at").eq("lead_id", id).order("created_at", { ascending: false }).limit(40)),
    run<{ id: string; operation: string; actor_id: string; before_data: Record<string, unknown> | null; after_data: Record<string, unknown>; created_at: string }[]>(supabase.from("crm_audit").select("id,operation,actor_id,before_data,after_data,created_at").eq("record_id", id).order("created_at", { ascending: false }).limit(40)),
    run<{ id: string; changes: Record<string, unknown>; conflicts: string[]; changed_by: string; created_at: string }[]>(supabase.from("crm_lead_assessment_revisions").select("id,changes,conflicts,changed_by,created_at").eq("lead_id", id).order("created_at", { ascending: false }).limit(40)),
    run<{ id: string; from_status: string | null; to_status: string; actor_id: string; created_at: string }[]>(supabase.from("crm_contract_events").select("id,from_status,to_status,actor_id,created_at").eq("lead_id", id).order("created_at", { ascending: false })),
    run<{ id: number; from_stage: string | null; to_stage: string; actor_id: string; changed_at: string }[]>(supabase.from("crm_lead_stage_history").select("id,from_stage,to_stage,actor_id,changed_at").eq("lead_id", id).order("id", { ascending: false }).limit(30)),
  ]);
  const ownerList = owners.data ?? [];
  const who = (u: string | null | undefined) => ownerName(ownerList, u);
  const score = scores.data?.[0];
  const active = (assessments.data ?? []).find(a => a.industry_key === lead.industry_key) ?? null;
  const answers = active?.answers ?? {};
  const t = lead.industry_key ? templateFor(lead.industry_key) : null;
  const prog = t ? progress(t, answers) : null;
  const live = lead.industry_key ? recommend(lead.industry_key, answers) : [];
  const liveIds = new Set(live.map(r => r.ruleId));
  const legal = lead.industry_key ? legalOf(extractFacts(lead.industry_key, answers)) : { status: "clear", flags: [] };
  const verified = (contracts.data ?? []).some(c => c.status === "verified_signed");
  const termsBy = Object.fromEntries((terms.data ?? []).map(t => [t.kind, t])) as Record<string, Terms | undefined>;
  const ok = q(p, "ok"), err = q(p, "error");
  const base = `/admin/workspace/crm/lead/${id}`;
  const effective = score ? score.manual_score ?? score.score : null;

  return (
    <Suite active="crm">
      <section className={s.hud} aria-labelledby="lead-title">
        <OpsHeader lang={lang} active="" crm="desk" eyebrow={`${industryLabel(lead.industry_key, lang)} · ${(lead.crm_stages as { label: string } | null)?.label ?? lead.stage_id}`} title={lead.company}
          lead={pick(lang, `Responsable: ${who(lead.owner_id)} · Creado por ${who(lead.created_by)} el ${formatDate(lang, lead.created_at)} · Última actualización ${formatDate(lang, lead.updated_at, true)}`,
            `Owner: ${who(lead.owner_id)} · Created by ${who(lead.created_by)} on ${formatDate(lang, lead.created_at)} · Last update ${formatDate(lang, lead.updated_at, true)}`)}
          actions={<><Link className={`${s.button} ${s.primary}`} href={`${base}/discovery`}>{pick(lang, "Diagnóstico", "Discovery")}</Link><Link className={s.button} href="/admin/workspace/crm/desk">{pick(lang, "Mesa comercial", "Sales desk")}</Link></>} />
        {ok && <p className={s.flash} data-tone="ok" role="status">{ok === "created" ? pick(lang, "Lead creado. Completa el diagnóstico cuando tengas la información.", "Lead created. Complete the diagnosis when you have the information.") : pick(lang, "Cambios guardados en Avalon.", "Changes saved in Avalon.")}</p>}
        {err && <p className={s.flash} data-tone="error" role="alert">{intelErrorText(lang, err)}</p>}
        <nav className={x.tabs} aria-label={pick(lang, "Secciones del lead", "Lead sections")}>
          {([["summary", "Resumen (Deal Review)", "Summary (Deal Review)"], ["recs", "Recomendaciones", "Recommendations"], ["terms", "Condiciones comerciales", "Commercial terms"], ["contract", "Contrato", "Contract"], ["history", "Historial", "History"]] as const)
            .map(([k, es, en]) => <Link key={k} href={`${base}?tab=${k}`} aria-current={tab === k ? "page" : undefined}>{pick(lang, es, en)}{k === "contract" ? <small>{pick(lang, ...CONTRACT_LABEL[lead.contract_status] ?? ["", ""])}</small> : null}</Link>)}
        </nav>

        {tab === "summary" && <>
          <div className={x.split}>
            <section className={s.panel} aria-labelledby="score-title">
              <h2 id="score-title">Lead Score</h2>
              <div className={x.scoreBox}>
                <div className={x.grade} data-grade={lead.lead_grade ?? "insufficient"}>
                  {lead.lead_grade && lead.lead_grade !== "insufficient" ? <span>{lead.lead_grade}<small>{effective}/100</small></span> : <span>{pick(lang, "Datos insuficientes", "Insufficient data")}</span>}
                </div>
                <div className={s.muted}>
                  {score ? <>{pick(lang, "Evaluado", "Evaluated")} {formatDate(lang, score.created_at, true)} · {pick(lang, "reglas", "rules")} {score.rules_version}
                    {score.manual_score !== null && <><br />{pick(lang, "Ajuste manual", "Manual adjustment")}: {score.score ?? "—"} → {score.manual_score} · «{score.manual_reason}» ({who(score.created_by)})</>}</>
                    : pick(lang, "Aún sin evaluación. Se calcula al guardar el diagnóstico.", "Not evaluated yet. It is computed when the diagnosis is saved.")}
                  {prog && <><br />{pick(lang, "Diagnóstico", "Discovery")}: {prog.pct}% ({prog.done}/{prog.total}) · {lead.diagnosis_status === "complete" ? pick(lang, "completo", "complete") : pick(lang, "en progreso", "in progress")}</>}
                </div>
              </div>
              {legal.flags.length > 0 && <div className={x.legal} data-status={legal.status} style={{ marginTop: 12 }} role="note">
                <strong>{legal.status === "restricted" ? pick(lang, "Restricción legal / de plataformas (independiente de la puntuación)", "Legal / platform restriction (independent of the score)") : pick(lang, "Requiere revisión legal", "Needs legal review")}</strong>
                <ul>{legal.flags.map(f => <li key={f.code}>{f.label[lang]}</li>)}</ul>
                <small>{pick(lang, "No es asesoría legal. Verificar con las fuentes oficiales vigentes.", "Not legal advice. Verify with current official sources.")}</small>
              </div>}
              {lead.industry_key && !["hvac", "barber", "smoke_shop"].includes(lead.industry_key) && <div className={s.flash} data-tone="warn" role="note">
                {pick(lang,
                  "Verificación sectorial pendiente: el diagnóstico recopila información, pero la calificación y las reglas legales automáticas todavía son generales para esta industria. Comprueba licencias, permisos y restricciones antes de ofrecer publicidad o contratar.",
                  "Industry compliance review pending: discovery captures information, but automated scoring and legal rules are still general for this sector. Verify licensing, permits and advertising restrictions before selling or activating ads.")}
              </div>}
              {score?.breakdown?.length ? <div style={{ marginTop: 12 }}>
                {score.breakdown.map(c => <div key={c.category} className={x.cat}>
                  <header><span>{c.label[lang]}</span><strong>{c.earned === null ? pick(lang, "sin datos", "no data") : `${c.earned} / ${c.max}`}</strong></header>
                  <div className={x.bar} aria-hidden><span style={{ width: `${c.earned === null ? 0 : (c.earned / c.max) * 100}%` }} /></div>
                  {c.factors.length > 0 && <ul>{c.factors.map((f, i) => <li key={i}>{f.label[lang]}: {f.points}/{f.max}{f.evidence ? ` · ${f.evidence}` : ""}</li>)}</ul>}
                </div>)}
              </div> : null}
              {score && <details style={{ marginTop: 10 }}><summary className={x.meta} style={{ cursor: "pointer" }}>{pick(lang, "Ajuste manual justificado", "Justified manual adjustment")}</summary>
                <form action={adjustScore} className={s.form} style={{ marginTop: 8 }}>
                  <input type="hidden" name="lead" value={id} />
                  <div className={s.row}><label className={s.field}><span>{pick(lang, "Puntuación manual (0–100)", "Manual score (0–100)")}</span><input name="manual_score" inputMode="numeric" defaultValue={score.manual_score ?? ""} /></label></div>
                  <label className={s.field}><span>{pick(lang, "Justificación (queda auditada)", "Justification (audited)")}</span><textarea name="reason" minLength={15} maxLength={1000} rows={2} /></label>
                  <div className={s.actions}><button className={s.button}>{pick(lang, "Guardar ajuste", "Save adjustment")}</button>
                    {score.manual_score !== null && <button className={s.button} name="clear" value="1">{pick(lang, "Quitar ajuste", "Remove adjustment")}</button>}</div>
                </form></details>}
            </section>

            <section className={s.panel} aria-labelledby="deal-title">
              <h2 id="deal-title">Deal Review</h2>
              <dl className={s.detail}>
                <dt>{pick(lang, "Empresa", "Company")}</dt><dd>{lead.company}{lead.legal_name ? ` (${lead.legal_name})` : ""}</dd>
                <dt>{pick(lang, "Industria", "Industry")}</dt><dd>{industryLabel(lead.industry_key, lang)}</dd>
                <dt>{pick(lang, "Responsable", "Owner")}</dt><dd>{who(lead.owner_id)}</dd>
                <dt>{pick(lang, "Problemas principales", "Main problems")}</dt><dd>{(answers.g_main_problem?.v as string) ?? pick(lang, "sin dato", "no data")}</dd>
                <dt>{pick(lang, "Capacidad", "Capacity")}</dt><dd>{factText(score, "capacity", lang)}</dd>
                <dt>{pick(lang, "Rentabilidad conocida", "Known profitability")}</dt><dd>{factText(score, "profitability", lang)}</dd>
                <dt>{pick(lang, "Presupuesto", "Budget")}</dt><dd>{factText(score, "budget", lang)}</dd>
                <dt>{pick(lang, "Servicios recomendados", "Recommended services")}</dt><dd>{live.filter(r => r.kind === "service").map(r => r.service).join(" · ") || "—"}</dd>
                <dt>{pick(lang, "Acuerdo propuesto", "Proposed deal")}</dt><dd>{termsBy.proposed ? termsSummary(termsBy.proposed, lang) : pick(lang, "sin propuesta", "no proposal")}</dd>
                <dt>{pick(lang, "Próximo paso", "Next step")}</dt><dd>{lead.next_action || "—"}{lead.follow_up_at ? ` · ${formatDate(lang, lead.follow_up_at, true)}` : ""}</dd>
                <dt>{pick(lang, "Contrato", "Contract")}</dt><dd>{pick(lang, ...CONTRACT_LABEL[lead.contract_status] ?? ["—", "—"])}</dd>
                <dt>{pick(lang, "Última interacción", "Last interaction")}</dt><dd>{formatDate(lang, lead.last_interaction_at, true)}</dd>
                <dt>{pick(lang, "Contacto", "Contact")}</dt><dd>{[lead.contact, lead.contact_title, lead.phone, lead.email].filter(Boolean).join(" · ") || "—"}</dd>
                <dt>{pick(lang, "Origen", "Source")}</dt><dd>{lead.source}</dd>
              </dl>
            </section>
          </div>

          <div className={x.split}>
            <section className={s.panel} aria-labelledby="log-title">
              <h2 id="log-title">{pick(lang, "Después de la llamada", "After the call")}</h2>
              <form action={logInteraction} className={s.form}>
                <input type="hidden" name="lead" value={id} /><input type="hidden" name="version" value={lead.version} /><TzOffset />
                <div className={s.row}>
                  <label className={s.field}><span>{pick(lang, "Tipo", "Type")}</span><select name="kind" defaultValue="call">
                    {[["call", "Llamada", "Call"], ["meeting", "Reunión", "Meeting"], ["whatsapp", "WhatsApp", "WhatsApp"], ["email", "Correo", "Email"], ["note", "Nota interna", "Internal note"]].map(([v, es, en]) => <option key={v} value={v}>{pick(lang, es, en)}</option>)}</select></label>
                  <label className={s.field}><span>{pick(lang, "Próximo contacto", "Next contact")}</span><input type="datetime-local" name="next_at" /></label>
                  <label className={s.field}><span>{pick(lang, "Próxima acción", "Next action")}</span><input name="next_action" maxLength={300} defaultValue={lead.next_action} /></label>
                </div>
                <label className={s.field}><span>{pick(lang, "Resultado / notas", "Result / notes")}</span><textarea name="body" rows={3} maxLength={4000} /></label>
                <div className={s.actions}><button className={`${s.button} ${s.primary}`}>{pick(lang, "Registrar", "Log it")}</button></div>
              </form>
            </section>

            <section className={s.panel} aria-labelledby="assign-title">
              <h2 id="assign-title">{pick(lang, "Asignación y pipeline", "Assignment and pipeline")}</h2>
              <form action={updateLeadMeta} className={s.form}>
                <input type="hidden" name="lead" value={id} /><input type="hidden" name="version" value={lead.version} />
                <div className={s.row}>
                  <label className={s.field}><span>{pick(lang, "Responsable", "Owner")}</span><select name="owner_id" defaultValue={lead.owner_id}>{ownerList.map(o => <option key={o.user_id} value={o.user_id}>{o.email.split("@")[0]}{o.user_id === userId ? pick(lang, " (yo)", " (me)") : ""}</option>)}</select></label>
                  <label className={s.field}><span>{pick(lang, "Prioridad", "Priority")}</span><select name="priority" defaultValue={lead.priority}><option value="low">{pick(lang, "Baja", "Low")}</option><option value="normal">Normal</option><option value="high">{pick(lang, "Alta", "High")}</option></select></label>
                  <label className={s.field}><span>{pick(lang, "Etapa (13 etapas existentes)", "Stage (existing 13 stages)")}</span><select name="stage_id" defaultValue={lead.stage_id}>
                    {(stages.data ?? []).filter(st => st.active || st.id === lead.stage_id).map(st => <option key={st.id} value={st.id} disabled={st.kind === "won" && !verified && lead.stage_id !== st.id}>
                      {st.label}{st.kind === "won" && !verified ? pick(lang, " — requiere contrato verificado", " — needs verified contract") : ""}</option>)}</select></label>
                </div>
                <label className={s.field}><span>{pick(lang, "Motivo de pérdida (solo si pasa a Perdido)", "Loss reason (only when moving to Lost)")}</span><input name="loss_reason" maxLength={1000} defaultValue={lead.loss_reason} /></label>
                <details><summary className={x.meta} style={{ cursor: "pointer" }}>{pick(lang, "Datos de identificación", "Identification details")}</summary>
                  <div className={s.row} style={{ marginTop: 8 }}>
                    {([["legal_name", "Nombre legal", "Legal name"], ["contact", "Contacto", "Contact"], ["contact_title", "Cargo", "Title"], ["phone", "Teléfono", "Phone"], ["website", "Website", "Website"],
                      ["google_business_url", "Google Business Profile (URL)", "Google Business Profile (URL)"], ["address", "Dirección", "Address"], ["city", "Ciudad", "City"], ["specialty", "Especialidad", "Specialty"], ["service_area", "Zona de servicio", "Service area"]] as const)
                      .map(([k, es, en]) => <label key={k} className={s.field}><span>{pick(lang, es, en)}</span><input name={k} defaultValue={String(lead[k] ?? "")} /></label>)}
                  </div></details>
                <div className={s.actions}><button className={s.button}>{pick(lang, "Guardar", "Save")}</button>
                  <span className={x.meta}>{pick(lang, `Versión ${lead.version}. Si otro propietario guardó antes, verás un aviso de conflicto y nada se sobrescribe.`, `Version ${lead.version}. If the other owner saved first, you'll get a conflict notice and nothing is overwritten.`)}</span></div>
              </form>
            </section>
          </div>
        </>}

        {tab === "recs" && <section className={s.panel} aria-labelledby="recs-title">
          <h2 id="recs-title">{pick(lang, "Recomendaciones (reglas, con evidencia)", "Recommendations (rules, with evidence)")}</h2>
          {!lead.industry_key && <p className={s.empty}>{pick(lang, "Elige la industria en el diagnóstico para obtener recomendaciones.", "Choose the industry in Discovery to get recommendations.")}</p>}
          <ul className={s.list}>
            {(recs.data ?? []).filter(r => liveIds.has(r.rule_id) || r.status !== "suggested").map(r => {
              const cur = live.find(l => l.ruleId === r.rule_id);
              return <li key={r.id}>
                <div className={x.leadRow}><strong>{r.service}</strong><span className={s.tag} data-tone={r.status === "accepted" ? "ok" : r.status === "dismissed" ? "neutral" : "info"}>{pick(lang, ...({ suggested: ["Sugerida", "Suggested"], accepted: ["Aceptada", "Accepted"], dismissed: ["Descartada", "Dismissed"], edited: ["Editada", "Edited"] } as Record<string, [string, string]>)[r.status])}</span></div>
                <span>{cur ? cur.problem[lang] : r.problem}</span>
                <span className={s.muted}>{pick(lang, "Evidencia", "Evidence")}: {r.evidence.map(e => `${e.label}: ${e.value}`).join(" · ") || "—"}</span>
                {cur && <span className={s.muted}>{pick(lang, "Beneficio esperado", "Expected benefit")}: {cur.benefit[lang]}</span>}
                {r.missing.length > 0 && <span className={s.muted}>{pick(lang, "Datos faltantes", "Missing data")}: {r.missing.join(", ")}</span>}
                <span className={s.muted}>{pick(lang, "Próxima acción", "Next action")}: {r.status === "edited" ? r.next_action : cur ? cur.nextAction[lang] : r.next_action}</span>
                {!liveIds.has(r.rule_id) && <span className={x.meta}>{pick(lang, "Ya no aplica según el diagnóstico actual.", "No longer applies to the current diagnosis.")}</span>}
                {r.note && <span className={s.muted}>{pick(lang, "Nota", "Note")}: {r.note} ({who(r.decided_by)})</span>}
                <form action={decideRecommendation} className={s.inline}>
                  <input type="hidden" name="lead" value={id} /><input type="hidden" name="id" value={r.id} /><input type="hidden" name="version" value={r.version} />
                  <input name="note" placeholder={pick(lang, "Nota (opcional)", "Note (optional)")} maxLength={1000} style={{ minWidth: 160 }} />
                  <input name="next_action" placeholder={pick(lang, "Editar próxima acción", "Edit next action")} maxLength={300} style={{ minWidth: 160 }} />
                  <button className={s.button} name="status" value="accepted">{pick(lang, "Aceptar", "Accept")}</button>
                  <button className={s.button} name="status" value="edited">{pick(lang, "Guardar edición", "Save edit")}</button>
                  <button className={s.button} name="status" value="dismissed">{pick(lang, "Descartar", "Dismiss")}</button>
                </form>
              </li>;
            })}
          </ul>
          <p className={x.meta}>{pick(lang, "Las recomendaciones nunca incluyen retorno de inversión, conversiones ni ingresos estimados.", "Recommendations never include estimated ROI, conversions or revenue.")}</p>
        </section>}

        {tab === "terms" && <div className={x.split}>
          {(["proposed", "agreed"] as const).map(kind => <TermsForm key={kind} lang={lang} lead={id} kind={kind} terms={termsBy[kind]} approver={who(termsBy[kind]?.commission_approved_by as string | null)} />)}
        </div>}

        {tab === "contract" && <section className={s.panel} aria-labelledby="ct-title">
          <h2 id="ct-title">{pick(lang, "Contrato", "Contract")}</h2>
          <p className={s.muted}>{pick(lang, "Avalon no genera contratos legales ni firma electrónica en esta fase. Aquí se registra el acuerdo existente, su evidencia y su verificación manual. Sin «Firmado y verificado», el lead no puede pasar a Ganado ni convertirse en cliente.",
            "Avalon does not generate legal contracts or e-signatures in this phase. Record the existing agreement, its evidence and its manual verification here. Without “Verified signed”, the lead cannot become Won or a client.")}</p>
          {(contracts.data ?? []).length === 0 && <form action={createContract} className={s.form}>
            <input type="hidden" name="lead" value={id} />
            <div className={s.row}>
              <label className={s.field}><span>{pick(lang, "Título", "Title")}</span><input name="title" maxLength={200} defaultValue={pick(lang, "Acuerdo comercial Avalon", "Avalon commercial agreement")} /></label>
              {termsBy.agreed && <input type="hidden" name="terms_id" value={termsBy.agreed.id} />}
            </div>
            <label className={s.inline}><input type="checkbox" name="accepted" value="1" /> {pick(lang, "El cliente aceptó comercialmente la propuesta (esto NO es una firma)", "The client commercially accepted the proposal (this is NOT a signature)")}</label>
            <div className={s.actions}><button className={`${s.button} ${s.primary}`}>{pick(lang, "Iniciar contrato", "Start contract")}</button></div>
          </form>}
          {(contracts.data ?? []).map(c => <article key={c.id} className={s.panel} style={{ marginTop: 12 }}>
            <header><h2>{c.title}</h2><span className={s.tag} data-tone={c.status === "verified_signed" ? "ok" : c.status === "rejected" || c.status === "expired" ? "danger" : "warn"}>{pick(lang, ...CONTRACT_LABEL[c.status])}</span></header>
            <dl className={s.detail}>
              <dt>{pick(lang, "Aceptación comercial", "Commercial acceptance")}</dt><dd>{formatDate(lang, c.accepted_at, true)}</dd>
              <dt>{pick(lang, "Enviado a firma", "Sent for signature")}</dt><dd>{formatDate(lang, c.sent_at, true)}</dd>
              <dt>{pick(lang, "Firmado", "Signed")}</dt><dd>{c.signed_at ? `${formatDate(lang, c.signed_at)} · ${c.signer_name}` : "—"}</dd>
              <dt>{pick(lang, "Evidencia", "Evidence")}</dt><dd>{c.attachment_id ? <a href={`/admin/workspace/crm/pipeline/files/${c.attachment_id}`}>{(files.data ?? []).find(f => f.id === c.attachment_id)?.filename ?? pick(lang, "documento", "document")}</a> : c.external_reference || "—"}</dd>
              <dt>{pick(lang, "Verificación", "Verification")}</dt><dd>{c.verified_at ? `${formatDate(lang, c.verified_at, true)} · ${who(c.verified_by)} · ${c.verification_method} · «${c.verification_note}»` : "—"}</dd>
            </dl>
            {!c.accepted_at && <form action={transitionContract}><input type="hidden" name="lead" value={id} /><input type="hidden" name="id" value={c.id} /><input type="hidden" name="version" value={c.version} />
              <button className={s.button} name="accept" value="1">{pick(lang, "Registrar aceptación comercial", "Record commercial acceptance")}</button></form>}
            {(NEXT[c.status] ?? []).map(to => <form key={to} action={transitionContract} className={s.form} style={{ marginTop: 10, borderTop: "1px solid #1b2a46", paddingTop: 10 }}>
              <input type="hidden" name="lead" value={id} /><input type="hidden" name="id" value={c.id} /><input type="hidden" name="version" value={c.version} /><input type="hidden" name="to" value={to} />
              {to === "signed_pending_verification" && <>
                <ContractUpload lang={lang} lead={id} />
                <div className={s.row}>
                  <label className={s.field}><span>{pick(lang, "Fecha de firma", "Signing date")}</span><input type="date" name="signed_at" required /></label>
                  <label className={s.field}><span>{pick(lang, "Firmado por", "Signed by")}</span><input name="signer_name" required maxLength={160} defaultValue={String(termsBy.agreed?.signer_name ?? "")} /></label>
                  <label className={s.field}><span>{pick(lang, "Documento firmado", "Signed document")}</span><select name="attachment_id" defaultValue=""><option value="">{pick(lang, "— ninguno —", "— none —")}</option>{(files.data ?? []).map(f => <option key={f.id} value={f.id}>{f.filename}</option>)}</select></label>
                  <label className={s.field}><span>{pick(lang, "o referencia externa (sobre de firma)", "or external reference (signature envelope)")}</span><input name="external_reference" maxLength={300} /></label>
                </div></>}
              {to === "verified_signed" && <div className={s.row}>
                <label className={s.field}><span>{pick(lang, "Método de verificación", "Verification method")}</span><select name="verification_method" required defaultValue="">
                  <option value="" disabled>—</option><option value="document_review">{pick(lang, "Revisión del documento firmado", "Signed document review")}</option><option value="esign_certificate">{pick(lang, "Certificado de firma electrónica", "E-signature certificate")}</option><option value="in_person">{pick(lang, "Firma en persona", "In-person signature")}</option></select></label>
                <label className={s.field}><span>{pick(lang, "Qué se revisó (mín. 15 caracteres)", "What was reviewed (15+ characters)")}</span><textarea name="verification_note" minLength={15} maxLength={1000} required rows={2} /></label>
              </div>}
              <div className={s.actions}><button className={to === "verified_signed" ? `${s.button} ${s.primary}` : s.button}>{pick(lang, "Pasar a", "Move to")}: {pick(lang, ...CONTRACT_LABEL[to])}</button></div>
            </form>)}
          </article>)}
        </section>}

        {tab === "history" && <section className={s.panel} aria-labelledby="hist-title">
          <h2 id="hist-title">{pick(lang, "Historial", "History")}</h2>
          <ol className={s.timeline}>
            {[
              ...(acts.data ?? []).map(a => ({ at: a.created_at, who: a.created_by, text: `${a.kind === "task" ? pick(lang, "Tarea", "Task") : a.kind}: ${a.body}${a.due_at ? ` (${formatDate(lang, a.due_at, true)})` : ""}` })),
              ...(revs.data ?? []).map(r => ({ at: r.created_at, who: r.changed_by, text: `${pick(lang, "Diagnóstico", "Discovery")}: ${Object.keys(r.changes).length} ${pick(lang, "respuesta(s)", "answer(s)")}${r.conflicts.length ? ` · ${pick(lang, "conflictos", "conflicts")}: ${r.conflicts.join(", ")}` : ""}` })),
              ...(cevents.data ?? []).map(e => ({ at: e.created_at, who: e.actor_id, text: `${pick(lang, "Contrato", "Contract")}: ${e.from_status ? pick(lang, ...CONTRACT_LABEL[e.from_status]) + " → " : ""}${pick(lang, ...CONTRACT_LABEL[e.to_status])}` })),
              ...(stageHist.data ?? []).map(h => ({ at: h.changed_at, who: h.actor_id, text: `${pick(lang, "Etapa", "Stage")}: ${h.from_stage ?? "—"} → ${h.to_stage}` })),
              ...(scores.data ?? []).map(sc => ({ at: sc.created_at, who: sc.created_by, text: `Lead Score: ${sc.manual_score ?? sc.score ?? pick(lang, "datos insuficientes", "insufficient data")} (${sc.rules_version})` })),
              ...(audit.data ?? []).filter(a => a.operation === "UPDATE" && a.before_data).map(a => ({ at: a.created_at, who: a.actor_id, text: auditText(a.before_data!, a.after_data, lang, who) })).filter(a => a.text),
            ].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 80).map((e, i) => <li key={i}><strong>{who(e.who)}</strong> · <span className={s.muted}>{formatDate(lang, e.at, true)}</span><br />{e.text}</li>)}
          </ol>
        </section>}
      </section>
    </Suite>
  );
}

function factText(score: Score | undefined, cat: string, lang: Lang) {
  const c = score?.breakdown?.find(b => b.category === cat);
  if (!c || c.earned === null) return pick(lang, "sin datos", "no data");
  return c.factors.map(f => `${f.label[lang]}: ${f.evidence ?? f.points}`).join(" · ");
}
function termsSummary(t: Terms, lang: Lang) {
  const $ = (v: unknown) => (v === null || v === undefined ? "—" : "$" + Number(v).toLocaleString("en-US"));
  return `${pick(lang, "Configuración", "Setup")} ${$(t.setup_price)} · ${pick(lang, "Mensual", "Monthly")} ${$(t.monthly_fee)}${t.commission_pct !== null ? ` · ${pick(lang, "Comisión", "Commission")} ${t.commission_pct}%` : ""}`;
}
const AUDITED = ["owner_id", "priority", "stage_id", "next_action", "follow_up_at", "industry_key", "company", "phone", "email", "contact"];
function auditText(before: Record<string, unknown>, after: Record<string, unknown>, lang: Lang, who: (u: string | null) => string) {
  const changed = AUDITED.filter(k => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null));
  if (!changed.length) return "";
  return changed.map(k => k === "owner_id" ? `${pick(lang, "Responsable", "Owner")}: ${who(before[k] as string)} → ${who(after[k] as string)}` : `${k}: ${String(before[k] ?? "—")} → ${String(after[k] ?? "—")}`).join(" · ");
}

function TermsForm({ lang, lead, kind, terms, approver }: { lang: Lang; lead: string; kind: "proposed" | "agreed"; terms?: Terms; approver: string }) {
  const v = (k: string) => (terms?.[k] === null || terms?.[k] === undefined ? "" : String(terms[k]));
  return <section className={s.panel} aria-labelledby={`t-${kind}`}>
    <h2 id={`t-${kind}`}>{kind === "proposed" ? pick(lang, "Condiciones propuestas", "Proposed terms") : pick(lang, "Condiciones acordadas", "Agreed terms")}</h2>
    <form action={saveTerms} className={s.form}>
      <input type="hidden" name="lead" value={lead} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="version" value={terms?.version ?? 0} />
      <fieldset className={s.fieldset}><legend>{pick(lang, "Servicios", "Services")}</legend>
        <div className={x.opts}>{SERVICES.map(sv => <label key={sv}><input type="checkbox" name="services" value={sv} defaultChecked={terms?.services?.includes(sv)} />{sv}</label>)}</div></fieldset>
      <div className={s.row}>
        <label className={s.field}><span>{pick(lang, "Precio de configuración (USD)", "Setup price (USD)")}</span><input name="setup_price" inputMode="decimal" defaultValue={v("setup_price")} /></label>
        <label className={s.field}><span>{pick(lang, "Mensualidad de Avalon (USD)", "Avalon monthly fee (USD)")}</span><input name="monthly_fee" inputMode="decimal" defaultValue={v("monthly_fee")} /></label>
        <label className={s.field}><span>{pick(lang, "Presupuesto de anuncios del cliente (gasto del cliente, no ingreso de Avalon)", "Client ad budget (client spend, not Avalon revenue)")}</span><input name="client_ad_budget" inputMode="decimal" defaultValue={v("client_ad_budget")} /></label>
        <label className={s.field}><span>{pick(lang, "Modelo de facturación", "Billing model")}</span><select name="billing_model" defaultValue={v("billing_model")}><option value="">—</option><option value="monthly">{pick(lang, "Mensual", "Monthly")}</option><option value="commission">{pick(lang, "Comisión", "Commission")}</option><option value="hybrid">{pick(lang, "Híbrido", "Hybrid")}</option></select></label>
        <label className={s.field}><span>{kind === "proposed" ? pick(lang, "Comisión propuesta (%)", "Proposed commission (%)") : pick(lang, "Comisión acordada (%)", "Agreed commission (%)")}</span><input name="commission_pct" inputMode="decimal" defaultValue={v("commission_pct")} /></label>
        <label className={s.field}><span>{pick(lang, "Base de la comisión", "Commission base")}</span><select name="commission_base" defaultValue={v("commission_base")}><option value="">—</option><option value="gross_revenue">{pick(lang, "Ingreso bruto", "Gross revenue")}</option><option value="gross_profit">{pick(lang, "Beneficio bruto", "Gross profit")}</option><option value="other">{pick(lang, "Otra", "Other")}</option></select></label>
        <label className={s.field}><span>{pick(lang, "Fecha de inicio", "Start date")}</span><input type="date" name="start_date" defaultValue={v("start_date")} /></label>
        <label className={s.field}><span>{pick(lang, "Duración (meses)", "Duration (months)")}</span><input name="duration_months" inputMode="numeric" defaultValue={v("duration_months")} /></label>
        <label className={s.field}><span>{pick(lang, "Conciliación", "Reconciliation")}</span><select name="reconciliation" defaultValue={v("reconciliation")}><option value="">—</option><option value="weekly">{pick(lang, "Semanal", "Weekly")}</option><option value="biweekly">{pick(lang, "Quincenal", "Biweekly")}</option><option value="monthly">{pick(lang, "Mensual", "Monthly")}</option><option value="quarterly">{pick(lang, "Trimestral", "Quarterly")}</option></select></label>
        <label className={s.field}><span>{pick(lang, "Persona autorizada para firmar", "Authorized signer")}</span><input name="signer_name" maxLength={160} defaultValue={v("signer_name")} /></label>
        <label className={s.field}><span>{pick(lang, "Cargo del firmante", "Signer title")}</span><input name="signer_title" maxLength={120} defaultValue={v("signer_title")} /></label>
      </div>
      <label className={s.field}><span>{pick(lang, "Reglas de atribución", "Attribution rules")}</span><textarea name="attribution_rules" rows={2} maxLength={2000} defaultValue={v("attribution_rules")} /></label>
      <label className={s.field}><span>{pick(lang, "Cancelaciones y reembolsos", "Cancellations and refunds")}</span><textarea name="cancellation_terms" rows={2} maxLength={2000} defaultValue={v("cancellation_terms")} /></label>
      <label className={s.field}><span>{pick(lang, "Condiciones especiales", "Special conditions")}</span><textarea name="special_conditions" rows={2} maxLength={2000} defaultValue={v("special_conditions")} /></label>
      {kind === "agreed" && <label className={s.inline}><input type="checkbox" name="approve_commission" value="1" defaultChecked={!!terms?.commission_approved_by} />
        {pick(lang, "Apruebo personalmente la comisión indicada (queda registrado)", "I personally approve the stated commission (recorded)")}{terms?.commission_approved_by ? ` · ${pick(lang, "aprobada por", "approved by")} ${approver}` : ""}</label>}
      <p className={x.meta}>{pick(lang, "Las comisiones o referencias pueden tener restricciones legales según industria y jurisdicción: revisión jurídica pendiente antes de firmar.", "Commissions or referral fees may be legally restricted by industry and jurisdiction: legal review pending before signing.")}</p>
      <div className={s.actions}><button className={`${s.button} ${s.primary}`}>{pick(lang, "Guardar", "Save")}</button>{terms && <span className={x.meta}>v{terms.version}</span>}</div>
    </form>
  </section>;
}

