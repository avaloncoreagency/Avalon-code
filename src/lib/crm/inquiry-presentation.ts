/** Presentation only: preserve the stored original while showing the customer's need first.
 * The public intake RPC stores additional service selections as a message prefix
 * until the reviewed database allowlist can be changed separately.
 */
const LABELS: Record<string, readonly [string, string]> = {
  website: ["Desarrollo web", "Web development"],
  ecommerce: ["Tienda online", "Online store"],
  crm: ["CRM", "CRM"],
  receptionist: ["Recepcionista IA", "AI receptionist"],
  chatbots: ["Chatbot con IA", "AI chatbot"],
  funnels: ["Embudo de ventas", "Sales funnel"],
  marketing: ["Marketing", "Marketing"],
  automation: ["Automatización", "Automation"],
};
const ALIASES: Record<string, string> = {
  "chatbots ia": "chatbots",
  "ai chatbots": "chatbots",
  "embudo de ventas": "funnels",
  "sales funnels": "funnels",
};
function serviceKey(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  return ALIASES[normalized] ?? normalized;
}

/** The original message is never changed; output is solely a compact human-readable view. */
export function presentInquiry(message: string | null, requested: readonly string[], lang: "es" | "en") {
  const raw = message ?? "";
  const match = /^(?:Interés adicional|Additional interest):[ \t]*([^\r\n]+)(?:\r?\n|$)/i.exec(raw);
  const extra = match ? match[1].split(",").map(s => s.trim()).filter(Boolean) : [];
  const body = (match ? raw.slice(match[0].length) : raw).trim();
  const distinct = new Set<string>();
  const services: string[] = [];
  for (const original of [...requested, ...extra]) {
    const key = serviceKey(original);
    if (!key || distinct.has(key)) continue;
    distinct.add(key);
    services.push(LABELS[key]?.[lang === "es" ? 0 : 1] ?? original.trim());
  }
  return { text: body, services };
}
