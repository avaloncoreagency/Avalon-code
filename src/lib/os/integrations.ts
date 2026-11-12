// Integration adapters for future providers. Nothing here performs network calls,
// spends money or publishes externally. Connecting a provider requires explicit
// approval, a server-only secret in Vercel and a reviewed adapter implementation.

export type IntegrationCategory = "ai" | "voice" | "telephony" | "messaging" | "social" | "email" | "payments" | "analytics";
export type IntegrationStatus = "not_connected" | "connected";
export type Integration = {
  key: string;
  label: string;
  category: IntegrationCategory;
  modules: ("receptionist" | "chatbots" | "marketing" | "ecommerce" | "website" | "crm")[];
  status: IntegrationStatus;
  costModel: "usage" | "subscription" | "free_tier";
};

export const INTEGRATIONS: readonly Integration[] = [
  { key: "llm", label: "LLM provider (Anthropic / OpenAI)", category: "ai", modules: ["receptionist", "chatbots", "marketing", "crm"], status: "not_connected", costModel: "usage" },
  { key: "voice", label: "Voice / speech", category: "voice", modules: ["receptionist"], status: "not_connected", costModel: "usage" },
  { key: "telephony", label: "Telephony (SIP / Twilio)", category: "telephony", modules: ["receptionist"], status: "not_connected", costModel: "usage" },
  { key: "whatsapp", label: "WhatsApp Business", category: "messaging", modules: ["receptionist", "marketing"], status: "not_connected", costModel: "usage" },
  { key: "meta", label: "Meta (Instagram / Facebook)", category: "social", modules: ["marketing"], status: "not_connected", costModel: "free_tier" },
  { key: "linkedin", label: "LinkedIn", category: "social", modules: ["marketing"], status: "not_connected", costModel: "free_tier" },
  { key: "tiktok", label: "TikTok", category: "social", modules: ["marketing"], status: "not_connected", costModel: "free_tier" },
  { key: "email", label: "Email delivery (SMTP / ESP)", category: "email", modules: ["marketing", "crm"], status: "not_connected", costModel: "usage" },
  { key: "payments", label: "Payments (Stripe)", category: "payments", modules: ["ecommerce"], status: "not_connected", costModel: "usage" },
  { key: "analytics", label: "Web analytics", category: "analytics", modules: ["website", "marketing"], status: "not_connected", costModel: "free_tier" },
];

export const integrationsFor = (module: Integration["modules"][number]) => INTEGRATIONS.filter(i => i.modules.includes(module));

// ─── Adapter contracts (implementations intentionally absent) ───────────────
export type ChatMessage = { role: "user" | "assistant"; content: string };
export type Usage = { inputTokens: number; outputTokens: number };

export interface AiAdapter {
  readonly provider: string;
  respond(input: { system: string; messages: ChatMessage[]; maxOutputTokens: number }): Promise<{ text: string; usage: Usage }>;
}
export interface MessagingAdapter {
  readonly channel: string;
  send(input: { to: string; text: string }): Promise<{ id: string }>;
}
export interface SocialPublisher {
  readonly network: string;
  schedule(input: { text: string; mediaUrl?: string; publishAt: string }): Promise<{ id: string }>;
}

/** Returns null until an approved provider is configured. Callers must handle null. */
export function getAiAdapter(): AiAdapter | null {
  return null;
}
export function getMessagingAdapter(): MessagingAdapter | null {
  return null;
}
export function getSocialPublisher(): SocialPublisher | null {
  return null;
}
