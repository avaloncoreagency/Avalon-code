/**
 * Provider usage cost estimators for AI Receptionists (voice) and AI Chatbots. Pure functions, no network, no API calls:
 * estimating never activates a receptionist or chatbot and never calls a provider.
 *
 * Honesty rules:
 *  - A rate is used only if it is VERIFIED: amount + unit + source + verification date. Otherwise the component is
 *    N/D (null) and so is the total. Nothing is filled with demo or remembered prices.
 *  - Units follow the provider: billing increments in seconds (1 s, 6 s, 60 s…), minimum billable seconds per call,
 *    tokens per million, monthly fees, included usage and overage.
 *  - No double counting: a component that the platform plan already bundles is reported as "included", cost 0.
 *  - Results are provider costs paid by the client (or passed through). They are never Avalon revenue.
 */

export type Rate = {
  /** Decimal string in USD (e.g. "0.0085"). */
  amount: string;
  /** Where the price was read (URL or contract reference) and when. Both required. */
  source: string;
  verifiedOn: string;
};
export type VerifiedRate = Rate | null | undefined;

const DEC = /^\d{1,9}(\.\d{1,8})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** A rate counts only with a valid amount, a source and an ISO verification date. */
export function rateValue(rate: VerifiedRate): number | null {
  if (!rate || !DEC.test(rate.amount) || rate.source.trim().length < 3 || !DATE.test(rate.verifiedOn)) return null;
  return Number(rate.amount);
}

/** Billable seconds for one call: minimum first, then rounded UP to the provider's increment. */
export function billableSeconds(durationSec: number, incrementSec: number, minimumSec = 0): number {
  if (!(durationSec > 0)) return 0;
  const inc = incrementSec > 0 ? incrementSec : 1;
  return Math.ceil(Math.max(durationSec, minimumSec) / inc) * inc;
}

export type Scenario = "low" | "base" | "high";
export const SCENARIOS: readonly Scenario[] = ["low", "base", "high"];
/** Volume multipliers shown to the owner as assumptions (editable in the UI). */
export const DEFAULT_SCENARIO_FACTORS: Record<Scenario, number> = { low: 0.7, base: 1, high: 1.3 };

export type Component = { key: string; label: readonly [string, string]; quantity: number; unit: string; cost: number | null; note?: "included" | "missing_rate" };
export type ScenarioResult = { scenario: Scenario; factor: number; components: Component[]; total: number | null; missing: string[] };

const round2 = (n: number) => Math.round(n * 100) / 100;
function component(key: string, label: readonly [string, string], quantity: number, unit: string, rate: VerifiedRate, bundled = false): Component {
  if (bundled) return { key, label, quantity, unit, cost: 0, note: "included" };
  if (quantity === 0) return { key, label, quantity, unit, cost: 0 };
  const v = rateValue(rate);
  return v === null ? { key, label, quantity, unit, cost: null, note: "missing_rate" } : { key, label, quantity, unit, cost: round2(quantity * v) };
}
function finish(scenario: Scenario, factor: number, components: Component[]): ScenarioResult {
  const missing = components.filter(c => c.cost === null).map(c => c.key);
  const total = missing.length ? null : round2(components.reduce((sum, c) => sum + (c.cost ?? 0), 0));
  return { scenario, factor, components, total, missing };
}

// ───────────────────────────── AI Receptionist (voice) ─────────────────────────────

export type CallMix = { sharePct: number; durationSec: number };
export type ReceptionistInput = {
  callsPerMonth: number;
  /** Either an average duration or a short/medium/long mix whose shares add up to 100. */
  avgDurationSec: number;
  mix?: CallMix[];
  transferPct: number;
  transferAvgSec: number;
  outboundPerMonth: number;
  outboundAvgSec: number;
  concurrency: number;
  phoneNumbers: number;
  recordCalls: boolean;
  recordingRetentionMonths: number;
  country: string;
  language: string;
};
export type ReceptionistPlan = {
  provider: string;
  planName: string;
  billingIncrementSec: number;
  minimumBillableSec: number;
  maxConcurrency: number | null;
  includedMinutes: number;
  /** What the platform per-minute price already includes (avoids double counting). */
  bundles: { telephony: boolean; stt: boolean; tts: boolean; llm: boolean };
  rates: {
    platformMonthly?: VerifiedRate;
    platformPerMinute?: VerifiedRate;
    overagePerMinute?: VerifiedRate;
    telephonyInboundPerMinute?: VerifiedRate;
    telephonyOutboundPerMinute?: VerifiedRate;
    transferPerMinute?: VerifiedRate;
    sttPerMinute?: VerifiedRate;
    ttsPerMinute?: VerifiedRate;
    llmPerMinute?: VerifiedRate;
    numberMonthly?: VerifiedRate;
    recordingStoragePerMinuteMonth?: VerifiedRate;
  };
};

export function validateReceptionist(i: ReceptionistInput): string[] {
  const e: string[] = [];
  const nonNeg = (k: keyof ReceptionistInput) => { const v = i[k]; if (typeof v !== "number" || !Number.isFinite(v) || v < 0) e.push(String(k)); };
  (["callsPerMonth", "avgDurationSec", "transferPct", "transferAvgSec", "outboundPerMonth", "outboundAvgSec", "concurrency", "phoneNumbers", "recordingRetentionMonths"] as const).forEach(nonNeg);
  if (i.transferPct > 100) e.push("transferPct");
  if (i.mix?.length) {
    const share = i.mix.reduce((s, m) => s + m.sharePct, 0);
    if (Math.abs(share - 100) > 0.01 || i.mix.some(m => !(m.durationSec > 0) || m.sharePct < 0)) e.push("mix");
  } else if (i.callsPerMonth > 0 && !(i.avgDurationSec > 0)) e.push("avgDurationSec");
  return e;
}

export function estimateReceptionist(input: ReceptionistInput, plan: ReceptionistPlan, factors = DEFAULT_SCENARIO_FACTORS): { errors: string[]; warnings: string[]; scenarios: ScenarioResult[] } {
  const errors = validateReceptionist(input);
  const warnings: string[] = [];
  if (plan.maxConcurrency !== null && input.concurrency > plan.maxConcurrency) warnings.push("concurrency_exceeds_plan");
  if (errors.length) return { errors, warnings, scenarios: [] };
  const inc = plan.billingIncrementSec, min = plan.minimumBillableSec;
  const mix = input.mix?.length ? input.mix : [{ sharePct: 100, durationSec: input.avgDurationSec }];
  const scenarios = SCENARIOS.map(scenario => {
    const f = factors[scenario];
    const calls = Math.round(input.callsPerMonth * f), outbound = Math.round(input.outboundPerMonth * f);
    // Billable inbound minutes: every call rounded individually (that is how providers bill), weighted by the mix.
    const inboundSec = mix.reduce((s, m) => s + calls * (m.sharePct / 100) * billableSeconds(m.durationSec, inc, min), 0);
    const outboundSec = outbound * billableSeconds(input.outboundAvgSec, inc, min);
    const transfers = Math.round(calls * input.transferPct / 100);
    const transferSec = transfers * billableSeconds(input.transferAvgSec, inc, min);
    const aiMinutes = (inboundSec + outboundSec) / 60;
    const billedMinutes = Math.round(aiMinutes * 100) / 100;
    const overMinutes = Math.max(0, Math.round((aiMinutes - plan.includedMinutes) * 100) / 100);
    const r = plan.rates, b = plan.bundles;
    const components: Component[] = [];
    if (r.platformMonthly !== undefined) components.push(component("platformMonthly", ["Plan de plataforma (mensual)", "Platform plan (monthly)"], 1, "month", r.platformMonthly));
    if (plan.includedMinutes > 0) components.push(component("overage", ["Excedente sobre minutos incluidos", "Overage over included minutes"], overMinutes, "min", r.overagePerMinute));
    else components.push(component("platform", ["Plataforma de voz IA", "AI voice platform"], billedMinutes, "min", r.platformPerMinute));
    components.push(component("telephonyIn", ["Telefonía entrante", "Inbound telephony"], Math.round(inboundSec / 60 * 100) / 100, "min", r.telephonyInboundPerMinute, b.telephony));
    components.push(component("telephonyOut", ["Telefonía saliente", "Outbound telephony"], Math.round(outboundSec / 60 * 100) / 100, "min", r.telephonyOutboundPerMinute, b.telephony));
    components.push(component("transfer", ["Transferencias a humano", "Transfers to a person"], Math.round(transferSec / 60 * 100) / 100, "min", r.transferPerMinute));
    components.push(component("stt", ["Transcripción (STT)", "Speech-to-text (STT)"], billedMinutes, "min", r.sttPerMinute, b.stt));
    components.push(component("tts", ["Voz sintética (TTS)", "Text-to-speech (TTS)"], billedMinutes, "min", r.ttsPerMinute, b.tts));
    components.push(component("llm", ["Modelo de IA", "AI model"], billedMinutes, "min", r.llmPerMinute, b.llm));
    components.push(component("numbers", ["Números telefónicos", "Phone numbers"], input.phoneNumbers, "number·month", r.numberMonthly));
    if (input.recordCalls) components.push(component("recordings", ["Grabaciones autorizadas (almacenamiento)", "Authorized recordings (storage)"], Math.round(billedMinutes * input.recordingRetentionMonths * 100) / 100, "min·month", r.recordingStoragePerMinuteMonth));
    return finish(scenario, f, components);
  });
  return { errors, warnings, scenarios };
}

// ───────────────────────────── AI Chatbot ─────────────────────────────

export type ChatbotInput = {
  conversationsPerMonth: number;
  messagesPerConversation: number;
  inputTokensPerMessage: number;
  outputTokensPerMessage: number;
  /** Retrieved context added to each answered message (RAG). 0 when there is no knowledge base. */
  retrievalTokensPerMessage: number;
  retrievalQueriesPerConversation: number;
  channels: number;
  /** Knowledge base size to index once (tokens) and to store (GB). */
  knowledgeTokens: number;
  knowledgeGb: number;
};
export type ChatbotPlan = {
  provider: string;
  model: string;
  includedConversations: number;
  /** The platform plan already pays model tokens (avoid adding token costs twice). */
  bundlesModelTokens: boolean;
  rates: {
    platformMonthly?: VerifiedRate;
    overagePerConversation?: VerifiedRate;
    inputPerMillionTokens?: VerifiedRate;
    outputPerMillionTokens?: VerifiedRate;
    embeddingPerMillionTokens?: VerifiedRate;
    retrievalPerThousandQueries?: VerifiedRate;
    vectorStoragePerGbMonth?: VerifiedRate;
    channelMonthly?: VerifiedRate;
  };
};

export function validateChatbot(i: ChatbotInput): string[] {
  return (Object.keys(i) as (keyof ChatbotInput)[]).filter(k => typeof i[k] !== "number" || !Number.isFinite(i[k]) || i[k] < 0).map(String);
}

export function estimateChatbot(input: ChatbotInput, plan: ChatbotPlan, factors = DEFAULT_SCENARIO_FACTORS): { errors: string[]; oneTime: Component[]; oneTimeTotal: number | null; scenarios: ScenarioResult[] } {
  const errors = validateChatbot(input);
  if (errors.length) return { errors, oneTime: [], oneTimeTotal: null, scenarios: [] };
  const r = plan.rates;
  // One-time indexing of the knowledge base: not a monthly cost, never mixed into the monthly scenarios.
  const oneTime = [component("indexing", ["Indexación de la base de conocimiento (única vez)", "Knowledge base indexing (one-time)"], input.knowledgeTokens / 1e6, "M tokens", r.embeddingPerMillionTokens)];
  const oneTimeMissing = oneTime.some(c => c.cost === null);
  const scenarios = SCENARIOS.map(scenario => {
    const f = factors[scenario];
    const conversations = Math.round(input.conversationsPerMonth * f);
    const messages = conversations * input.messagesPerConversation;
    const inTokens = messages * (input.inputTokensPerMessage + input.retrievalTokensPerMessage);
    const outTokens = messages * input.outputTokensPerMessage;
    const components: Component[] = [];
    if (r.platformMonthly !== undefined) components.push(component("platformMonthly", ["Plan de plataforma (mensual)", "Platform plan (monthly)"], 1, "month", r.platformMonthly));
    if (plan.includedConversations > 0 || r.overagePerConversation !== undefined)
      components.push(component("overage", ["Conversaciones sobre lo incluido", "Conversations over the included amount"], Math.max(0, conversations - plan.includedConversations), "conversation", r.overagePerConversation));
    components.push(component("inputTokens", ["Tokens de entrada (incluye contexto recuperado)", "Input tokens (incl. retrieved context)"], inTokens / 1e6, "M tokens", r.inputPerMillionTokens, plan.bundlesModelTokens));
    components.push(component("outputTokens", ["Tokens de salida", "Output tokens"], outTokens / 1e6, "M tokens", r.outputPerMillionTokens, plan.bundlesModelTokens));
    components.push(component("retrieval", ["Consultas de recuperación", "Retrieval queries"], conversations * input.retrievalQueriesPerConversation / 1000, "k queries", r.retrievalPerThousandQueries));
    components.push(component("storage", ["Almacenamiento vectorial", "Vector storage"], input.knowledgeGb, "GB·month", r.vectorStoragePerGbMonth));
    components.push(component("channels", ["Canales (web, WhatsApp, etc.)", "Channels (web, WhatsApp, etc.)"], input.channels, "channel·month", r.channelMonthly));
    return finish(scenario, f, components);
  });
  return { errors, oneTime, oneTimeTotal: oneTimeMissing ? null : round2(oneTime.reduce((s, c) => s + (c.cost ?? 0), 0)), scenarios };
}

/** "N/D" for unknown values; never a guessed number. */
export function costText(value: number | null, lang: "es" | "en"): string {
  if (value === null) return "N/D";
  return new Intl.NumberFormat(lang === "es" ? "es-US" : "en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

/** Plain-text summary for the quote's third-party costs (provider costs paid by the client, not Avalon revenue). */
export function externalCostsSummary(kind: "receptionist" | "chatbot", provider: string, scenarios: ScenarioResult[], lang: "es" | "en", oneTime: number | null = null): string {
  const t = (es: string, en: string) => (lang === "es" ? es : en);
  const by = Object.fromEntries(scenarios.map(s => [s.scenario, s.total])) as Record<Scenario, number | null>;
  const name = kind === "receptionist" ? t("Recepcionista IA", "AI Receptionist") : t("Chatbot IA", "AI Chatbot");
  const lines = [
    `${name} · ${t("costos estimados del proveedor", "estimated provider costs")} (${provider || "N/D"}), ${t("mensuales", "monthly")}:`,
    `  ${t("Bajo", "Low")} ${costText(by.low, lang)} · Base ${costText(by.base, lang)} · ${t("Alto", "High")} ${costText(by.high, lang)}`,
  ];
  if (kind === "chatbot") lines.push(`  ${t("Indexación única", "One-time indexing")}: ${costText(oneTime, lang)}`);
  lines.push(`  ${t("Estimación según tarifas verificadas; no es una factura del proveedor ni un ingreso de Avalon. N/D = sin tarifa verificable.", "Estimate from verified rates; not a provider invoice nor Avalon revenue. N/D = no verifiable rate.")}`);
  return lines.join("\n");
}
