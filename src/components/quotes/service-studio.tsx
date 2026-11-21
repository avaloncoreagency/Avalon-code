"use client";

import { useMemo, useState } from "react";
import s from "@/components/sales/sales.module.css";
import w from "./quotes.module.css";
import { SERVICE_CONFIGURATORS, configureService, type Answers, type CatalogPrice, type Question } from "@/lib/quotes/service-configurators";
import {
  DEFAULT_SCENARIO_FACTORS, costText, estimateChatbot, estimateReceptionist, externalCostsSummary,
  type ChatbotInput, type ChatbotPlan, type Rate, type ReceptionistInput, type ReceptionistPlan, type ScenarioResult,
} from "@/lib/quotes/usage-estimators";
import type { QuoteLine } from "@/lib/quotes/model";

export type StudioResult = { line: QuoteLine; scope: string; exclusions: string; thirdParty: string };

const GROUPS = [["web", "Web y e-commerce", "Web & e-commerce"], ["crm", "CRM", "CRM"], ["google", "Google", "Google"], ["marketing", "Marketing", "Marketing"],
  ["ai", "IA", "AI"], ["automation", "Automatización", "Automation"], ["special", "Especiales", "Special"]] as const;

type RateDraft = Record<string, { amount: string; source: string; verifiedOn: string }>;
const RECEPTIONIST_RATES = [["platformPerMinute", "Plataforma por minuto", "Platform per minute"], ["telephonyInboundPerMinute", "Telefonía entrante / min", "Inbound telephony / min"],
  ["telephonyOutboundPerMinute", "Telefonía saliente / min", "Outbound telephony / min"], ["transferPerMinute", "Transferencia / min", "Transfer / min"],
  ["sttPerMinute", "STT / min", "STT / min"], ["ttsPerMinute", "TTS / min", "TTS / min"], ["llmPerMinute", "Modelo IA / min", "AI model / min"],
  ["numberMonthly", "Número / mes", "Number / month"], ["recordingStoragePerMinuteMonth", "Grabación / min·mes", "Recording / min·month"]] as const;
const CHATBOT_RATES = [["platformMonthly", "Plan mensual", "Monthly plan"], ["overagePerConversation", "Excedente / conversación", "Overage / conversation"],
  ["inputPerMillionTokens", "Entrada / 1M tokens", "Input / 1M tokens"], ["outputPerMillionTokens", "Salida / 1M tokens", "Output / 1M tokens"],
  ["embeddingPerMillionTokens", "Indexación / 1M tokens", "Indexing / 1M tokens"], ["retrievalPerThousandQueries", "Recuperación / 1k consultas", "Retrieval / 1k queries"],
  ["vectorStoragePerGbMonth", "Almacenamiento / GB·mes", "Storage / GB·month"], ["channelMonthly", "Canal / mes", "Channel / month"]] as const;

const num = (v: string) => (v.trim() === "" ? 0 : Number(v));
const pickRates = (draft: RateDraft): Record<string, Rate> => Object.fromEntries(Object.entries(draft).filter(([, r]) => r.amount.trim() !== "").map(([k, r]) => [k, r]));

/**
 * Service-specific configurator on top of the common quote engine. Adds a line (catalog price only when approved),
 * scope/exclusions text and — for AI Receptionists/Chatbots — provider cost scenarios to third-party costs.
 * Nothing is called or activated: estimates are arithmetic on rates the owner verified (source + date).
 */
export function ServiceStudio({ lang, catalog, onAdd }: { lang: "es" | "en"; catalog: readonly CatalogPrice[]; onAdd: (r: StudioResult) => void }) {
  const t = (es: string, en: string) => (lang === "es" ? es : en);
  const [id, setId] = useState("");
  const [answers, setAnswers] = useState<Answers>({});
  const [rates, setRates] = useState<RateDraft>({});
  const [usage, setUsage] = useState<Record<string, string>>({});
  const cfg = SERVICE_CONFIGURATORS.find(x => x.id === id) ?? null;
  const setRate = (k: string, patch: Partial<RateDraft[string]>) =>
    setRates(r => ({ ...r, [k]: { ...{ amount: "", source: "", verifiedOn: "" }, ...r[k], ...patch } }));
  const u = (k: string) => usage[k] ?? "";
  const estimate = useMemo((): { scenarios: ScenarioResult[]; oneTime: number | null; errors: string[]; warnings: string[] } | null => {
    if (!cfg?.estimator) return null;
    if (cfg.estimator === "receptionist") {
      const input: ReceptionistInput = { callsPerMonth: num(u("calls")), avgDurationSec: num(u("avgSec")), transferPct: num(u("transferPct")), transferAvgSec: num(u("transferSec")),
        outboundPerMonth: num(u("outbound")), outboundAvgSec: num(u("outboundSec")), concurrency: num(u("concurrency")), phoneNumbers: num(u("numbers")),
        recordCalls: u("record") === "yes", recordingRetentionMonths: num(u("retention")), country: u("country"), language: u("language") };
      const plan: ReceptionistPlan = { provider: u("provider"), planName: u("plan"), billingIncrementSec: num(u("increment")) || 60, minimumBillableSec: num(u("minimum")),
        maxConcurrency: u("maxConcurrency") ? num(u("maxConcurrency")) : null, includedMinutes: 0,
        bundles: { telephony: u("bundleTelephony") === "yes", stt: u("bundleVoice") === "yes", tts: u("bundleVoice") === "yes", llm: u("bundleLlm") === "yes" }, rates: pickRates(rates) };
      const r = estimateReceptionist(input, plan, DEFAULT_SCENARIO_FACTORS);
      return { scenarios: r.scenarios, oneTime: null, errors: r.errors, warnings: r.warnings };
    }
    const input: ChatbotInput = { conversationsPerMonth: num(u("conversations")), messagesPerConversation: num(u("messages")), inputTokensPerMessage: num(u("inTokens")),
      outputTokensPerMessage: num(u("outTokens")), retrievalTokensPerMessage: num(u("ragTokens")), retrievalQueriesPerConversation: num(u("queries")),
      channels: num(u("channels")), knowledgeTokens: num(u("kbTokens")), knowledgeGb: num(u("kbGb")) };
    const plan: ChatbotPlan = { provider: u("provider"), model: u("model"), includedConversations: num(u("included")), bundlesModelTokens: u("bundleTokens") === "yes", rates: pickRates(rates) };
    const r = estimateChatbot(input, plan, DEFAULT_SCENARIO_FACTORS);
    return { scenarios: r.scenarios, oneTime: r.oneTimeTotal, errors: r.errors, warnings: [] };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- u reads `usage`, which is listed
  }, [cfg, usage, rates]);

  const field = (q: Question) => {
    const value = answers[q.key] ?? "";
    const set = (v: string) => setAnswers(a => ({ ...a, [q.key]: v }));
    const label = <>{t(...q.label)}{q.external && <small> · {t("costo de terceros", "third-party cost")}</small>}</>;
    if (q.type === "select" || q.type === "boolean")
      return <label key={q.key} className={s.field}>{label}<select value={value} onChange={e => set(e.target.value)}>
        <option value="">{t("Sin especificar", "Not specified")}</option>{q.options?.map(o => <option key={o.value} value={o.value}>{t(...o.label)}</option>)}</select></label>;
    return <label key={q.key} className={s.field}>{label}<input value={value} inputMode={q.type === "number" ? "decimal" : undefined}
      type={q.type === "number" ? "number" : "text"} min={q.type === "number" ? 0 : undefined} max={q.max} maxLength={300} onChange={e => set(e.target.value)} /></label>;
  };
  const usageInput = (k: string, es: string, en: string, type: "number" | "text" = "number") =>
    <label key={k} className={s.field}>{t(es, en)}<input type={type} min={type === "number" ? 0 : undefined} value={u(k)} onChange={e => setUsage(x => ({ ...x, [k]: e.target.value }))} /></label>;
  const yes = (k: string, es: string, en: string) =>
    <label key={k} className={s.field}>{t(es, en)}<select value={u(k)} onChange={e => setUsage(x => ({ ...x, [k]: e.target.value }))}>
      <option value="">{t("No", "No")}</option><option value="yes">{t("Sí", "Yes")}</option></select></label>;
  const rateRows = (rows: readonly (readonly [string, string, string])[]) => <div className={w.rates} role="group" aria-label={t("Tarifas verificadas", "Verified rates")}>
    {rows.map(([k, es, en]) => <div key={k} className={s.row}>
      <label className={s.field}>{t(es, en)} (USD)<input inputMode="decimal" value={rates[k]?.amount ?? ""} placeholder="N/D" onChange={e => setRate(k, { amount: e.target.value })} /></label>
      <label className={s.field}>{t("Fuente (URL o contrato)", "Source (URL or contract)")}<input value={rates[k]?.source ?? ""} onChange={e => setRate(k, { source: e.target.value })} /></label>
      <label className={s.field}>{t("Verificada el", "Verified on")}<input type="date" value={rates[k]?.verifiedOn ?? ""} onChange={e => setRate(k, { verifiedOn: e.target.value })} /></label>
    </div>)}</div>;

  function add() {
    if (!cfg) return;
    const r = configureService(cfg, answers, lang, catalog);
    const provider = estimate?.scenarios.length && cfg.estimator ? externalCostsSummary(cfg.estimator, u("provider"), estimate.scenarios, lang, estimate.oneTime) : "";
    onAdd({ line: r.line, scope: r.scope, exclusions: r.exclusions, thirdParty: [r.thirdParty, provider].filter(Boolean).join("\n") });
    setAnswers({});
  }

  return <section className={w.studio} aria-label={t("Configurador por servicio", "Service configurator")}>
    <label className={s.field}>{t("Configurar un servicio", "Configure a service")}
      <select value={id} onChange={e => { setId(e.target.value); setAnswers({}); setRates({}); setUsage({}); }}>
        <option value="">{t("Elige un servicio…", "Choose a service…")}</option>
        {GROUPS.map(([g, es, en]) => <optgroup key={g} label={t(es, en)}>{SERVICE_CONFIGURATORS.filter(x => x.group === g).map(x => <option key={x.id} value={x.id}>{t(...x.label)}</option>)}</optgroup>)}
      </select></label>
    {cfg && <>
      <div className={s.row}>{cfg.questions.filter(q => !q.advanced).map(field)}</div>
      {cfg.questions.some(q => q.advanced) && <details><summary>{t("Opciones avanzadas", "Advanced options")}</summary><div className={s.row}>{cfg.questions.filter(q => q.advanced).map(field)}</div></details>}
      {cfg.estimator && <details open><summary>{cfg.estimator === "receptionist" ? t("Estimador de costos de voz (proveedor)", "Voice cost estimator (provider)") : t("Estimador de costos del chatbot (proveedor)", "Chatbot cost estimator (provider)")}</summary>
        <p className={w.hint}>{t("Sin llamadas a APIs ni activación. Solo se usan tarifas con fuente y fecha de verificación; las vacías se muestran como N/D. Escenarios: Bajo ×0,7 · Base ×1 · Alto ×1,3 del volumen.", "No API calls, nothing activated. Only rates with a source and verification date are used; empty ones show N/D. Scenarios: Low ×0.7 · Base ×1 · High ×1.3 of volume.")}</p>
        {cfg.estimator === "receptionist" ? <>
          <div className={s.row}>{usageInput("calls", "Llamadas por mes", "Calls per month")}{usageInput("avgSec", "Duración promedio (s)", "Average duration (s)")}{usageInput("transferPct", "% transferidas", "% transferred")}{usageInput("transferSec", "Duración transferencia (s)", "Transfer duration (s)")}</div>
          <div className={s.row}>{usageInput("outbound", "Salientes por mes", "Outbound per month")}{usageInput("outboundSec", "Duración saliente (s)", "Outbound duration (s)")}{usageInput("concurrency", "Concurrencia", "Concurrency")}{usageInput("numbers", "Números", "Numbers")}</div>
          <div className={s.row}>{usageInput("provider", "Proveedor", "Provider", "text")}{usageInput("plan", "Plan", "Plan", "text")}{usageInput("increment", "Incremento de facturación (s)", "Billing increment (s)")}{usageInput("minimum", "Mínimo por llamada (s)", "Minimum per call (s)")}{usageInput("maxConcurrency", "Concurrencia máx. del plan", "Plan max concurrency")}</div>
          <div className={s.row}>{usageInput("country", "País", "Country", "text")}{usageInput("language", "Idioma", "Language", "text")}{yes("record", "Grabaciones autorizadas", "Authorized recordings")}{usageInput("retention", "Retención (meses)", "Retention (months)")}</div>
          <div className={s.row}>{yes("bundleTelephony", "Plataforma incluye telefonía", "Platform includes telephony")}{yes("bundleVoice", "Incluye STT/TTS", "Includes STT/TTS")}{yes("bundleLlm", "Incluye modelo IA", "Includes AI model")}</div>
          {rateRows(RECEPTIONIST_RATES)}
        </> : <>
          <div className={s.row}>{usageInput("conversations", "Conversaciones por mes", "Conversations per month")}{usageInput("messages", "Mensajes por conversación", "Messages per conversation")}{usageInput("inTokens", "Tokens de entrada / mensaje", "Input tokens / message")}{usageInput("outTokens", "Tokens de salida / mensaje", "Output tokens / message")}</div>
          <div className={s.row}>{usageInput("ragTokens", "Contexto recuperado / mensaje", "Retrieved context / message")}{usageInput("queries", "Consultas de recuperación / conversación", "Retrieval queries / conversation")}{usageInput("channels", "Canales", "Channels")}{usageInput("included", "Conversaciones incluidas en el plan", "Conversations included in plan")}</div>
          <div className={s.row}>{usageInput("kbTokens", "Base de conocimiento (tokens a indexar)", "Knowledge base (tokens to index)")}{usageInput("kbGb", "Almacenamiento (GB)", "Storage (GB)")}{usageInput("provider", "Proveedor", "Provider", "text")}{usageInput("model", "Modelo", "Model", "text")}{yes("bundleTokens", "El plan incluye los tokens", "Plan includes tokens")}</div>
          {rateRows(CHATBOT_RATES)}
        </>}
        {estimate && (estimate.errors.length ? <p className={s.flash} data-tone="error" role="alert">{t("Revisa los datos de uso: ", "Check usage data: ")}{estimate.errors.join(", ")}</p> : <>
          {estimate.warnings.includes("concurrency_exceeds_plan") && <p className={s.flash} data-tone="warn">{t("La concurrencia supera el máximo del plan.", "Concurrency exceeds the plan maximum.")}</p>}
          <table className={w.estimate}><caption>{t("Costos mensuales estimados del proveedor (no son ingresos de Avalon)", "Estimated monthly provider costs (not Avalon revenue)")}</caption>
            <thead><tr><th scope="col">{t("Componente", "Component")}</th>{estimate.scenarios.map(x => <th scope="col" key={x.scenario}>{x.scenario === "low" ? t("Bajo", "Low") : x.scenario === "base" ? "Base" : t("Alto", "High")}</th>)}</tr></thead>
            <tbody>{estimate.scenarios[0]?.components.map((comp, i) => <tr key={comp.key}><th scope="row">{t(...comp.label)}</th>
              {estimate.scenarios.map(x => { const v = x.components[i]; return <td key={x.scenario}>{v.note === "included" ? t("Incluido", "Included") : costText(v.cost, lang)}<small> · {v.quantity.toLocaleString(lang)} {v.unit}</small></td>; })}</tr>)}
              <tr><th scope="row">{t("Total mensual", "Monthly total")}</th>{estimate.scenarios.map(x => <td key={x.scenario}><strong>{costText(x.total, lang)}</strong></td>)}</tr>
              {cfg.estimator === "chatbot" && <tr><th scope="row">{t("Indexación única", "One-time indexing")}</th><td colSpan={3}>{costText(estimate.oneTime, lang)}</td></tr>}
            </tbody></table>
        </>)}
      </details>}
      <button type="button" className={`${s.button} ${s.primary}`} onClick={add}>{t("Añadir a la cotización", "Add to quote")}</button>
    </>}
  </section>;
}
