import Link from "next/link";
import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, q, UUID_RE, type Query } from "@/components/sales/ui";
import { DiscoveryForm } from "@/components/crm/intel/discovery-form";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { run } from "@/lib/os/data";
import { INDUSTRIES, industryLabel, isIndustry } from "@/lib/crm/intel/industries";
import { templateFor } from "@/lib/crm/intel/templates";
import { progress, visibleQuestions } from "@/lib/crm/intel/form";
import { intelErrorText } from "@/lib/crm/intel/errors";
import type { Answers } from "@/lib/crm/intel/types";
import s from "@/components/sales/sales.module.css";
import x from "@/components/crm/intel/intel.module.css";
export const dynamic = "force-dynamic";

/** Discovery: the industry questionnaire, one short section at a time, saved progressively. */
export default async function DiscoveryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Query> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const p = await searchParams;
  const lead = await run<{ id: string; company: string; industry_key: string | null } | null>(supabase.from("crm_leads").select("id,company,industry_key").eq("id", id).maybeSingle());
  if (lead.error === "schema_pending") return <Suite active="crm"><section className={s.hud}><p className={s.flash} data-tone="warn">{intelErrorText(lang, "schema_pending")}</p></section></Suite>;
  if (!lead.data) notFound();
  const requested = q(p, "industry");
  const industry = isIndustry(requested) ? requested : lead.data.industry_key;
  const [assessments, owners] = await Promise.all([
    run<{ industry_key: string; answers: Answers; status: string; progress: number }[]>(supabase.from("crm_lead_assessments").select("industry_key,answers,status,progress").eq("lead_id", id)),
    run<{ user_id: string; email: string }[]>(supabase.rpc("crm_owner_directory")),
  ]);
  const ownerNames = Object.fromEntries((owners.data ?? []).map(o => [o.user_id, o.email.split("@")[0]]));
  const base = `/admin/workspace/crm/lead/${id}`;
  const otherWithAnswers = (assessments.data ?? []).filter(a => a.industry_key !== industry && Object.keys(a.answers).length > 0);

  return (
    <Suite active="crm">
      <section className={s.hud} aria-labelledby="disc-title">
        <OpsHeader lang={lang} active="" crm="desk" eyebrow={pick(lang, "Business Intelligence · Diagnóstico comercial", "Business Intelligence · Commercial diagnosis")}
          title={lead.data.company} actions={<Link className={s.button} href={base}>{pick(lang, "Volver al Deal Review", "Back to Deal Review")}</Link>} />
        <form method="get" className={s.toolbar} aria-label={pick(lang, "Industria", "Industry")}>
          <label><span>{pick(lang, "Industria del diagnóstico", "Diagnosis industry")}</span>
            <select name="industry" defaultValue={industry ?? ""} required>
              <option value="" disabled>{pick(lang, "Elegir…", "Choose…")}</option>
              {INDUSTRIES.map(i => <option key={i.key} value={i.key}>{i.label[lang]}{i.specialized ? "" : pick(lang, " (plantilla general)", " (general template)")}</option>)}
            </select></label>
          <button className={s.button}>{pick(lang, "Abrir", "Open")}</button>
        </form>
        {otherWithAnswers.length > 0 && <p className={s.muted}>{pick(lang, "Respuestas guardadas en otras industrias (se conservan, no se borran):", "Answers saved under other industries (kept, never deleted):")} {otherWithAnswers.map(a =>
          <Link key={a.industry_key} href={`?industry=${a.industry_key}`} style={{ marginRight: 8 }}>{industryLabel(a.industry_key, lang)}</Link>)}</p>}
        {!industry ? <p className={s.empty}>{pick(lang, "Elige la industria para ver sus preguntas. Puedes cambiarla después sin perder respuestas.", "Choose the industry to see its questions. You can change it later without losing answers.")}</p>
          : <Questionnaire lang={lang} lead={id} industry={industry} p={p} answers={(assessments.data ?? []).find(a => a.industry_key === industry)?.answers ?? {}} owners={ownerNames} />}
      </section>
    </Suite>
  );
}

function Questionnaire({ lang, lead, industry, p, answers, owners }: { lang: "es" | "en"; lead: string; industry: string; p: Query; answers: Answers; owners: Record<string, string> }) {
  const t = templateFor(industry);
  const sections = visibleQuestions(t, answers);
  const current = sections.find(sec => sec.id === q(p, "section")) ?? sections[0];
  const prog = progress(t, answers);
  const list = (k: string) => (q(p, k) ?? "").split(",").filter(Boolean);
  const missing = list("missing");
  return <>
    {!t.specialized && <p className={s.flash} data-tone="warn" role="note">{pick(lang, "Esta industria usa la plantilla general. Las preguntas específicas están pendientes de especialización.", "This industry uses the general template. Industry-specific questions are pending specialization.")}</p>}
    {q(p, "ok") && <p className={s.flash} data-tone="ok" role="status">{pick(lang, "Respuestas guardadas en Avalon. Puntuación y recomendaciones recalculadas.", "Answers saved in Avalon. Score and recommendations recalculated.")}</p>}
    {list("conflicts").length > 0 && <p className={s.flash} data-tone="error" role="alert">{intelErrorText(lang, "conflict")}</p>}
    {q(p, "error") && <p className={s.flash} data-tone="error" role="alert">{intelErrorText(lang, q(p, "error")!)}</p>}
    {missing.length > 0 && <p className={s.flash} data-tone="warn" role="alert">{pick(lang, `Guardado, pero aún no se puede marcar completo: faltan ${missing.length} pregunta(s) obligatoria(s) (las marcadas con *).`, `Saved, but it can't be marked complete yet: ${missing.length} required question(s) missing (marked *).`)}</p>}
    <div className={x.layout}>
      <nav className={x.sectionNav} aria-label={pick(lang, "Secciones", "Sections")}>
        <div className={x.bar} aria-label={`${prog.pct}%`}><span style={{ width: `${prog.pct}%` }} /></div>
        <span className={x.meta}>{prog.pct}% · {prog.done}/{prog.total} {pick(lang, "respondidas o marcadas", "answered or marked")}</span>
        {sections.map(sec => {
          const done = sec.questions.filter(qq => answers[qq.id]).length;
          return <Link key={sec.id} href={`?industry=${industry}&section=${sec.id}`} aria-current={sec.id === current.id ? "step" : undefined}>
            <span>{sec.title[lang]}</span><span className={x.meta}>{done}/{sec.questions.length}</span></Link>;
        })}
      </nav>
      <section className={s.panel} aria-labelledby="sec-title">
        <h2 id="sec-title">{current.title[lang]}</h2>
        <DiscoveryForm key={`${industry}:${current.id}:${current.questions.map(qq => answers[qq.id]?.at ?? "").join("|")}`} lang={lang} lead={lead} industry={industry}
          section={templateFor(industry).sections.find(sec => sec.id === current.id)!} saved={answers}
          conflicts={list("conflicts")} invalid={list("invalid")} justSaved={!!q(p, "ok")} owners={owners} />
      </section>
    </div>
  </>;
}
