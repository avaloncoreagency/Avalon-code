/** Proposal-only fallback when the active CRM catalog has no chatbot SKU.
 * Never invents a catalog code, rate, or claims that a bot is live.
 */
export type ChatbotCatalogEntry = { code: string; name: string };
export function hasChatbotCatalogEntry(catalog: readonly ChatbotCatalogEntry[]): boolean {
  return catalog.some(item => /(^|[-_])chatbots?($|[-_])/i.test(item.code) || /\bchatbots?\b/i.test(item.name));
}
export function proposedChatbotLine(lang: "es" | "en") {
  return {
    code: null,
    name: lang === "es" ? "Chatbot con IA" : "AI chatbot",
    description: lang === "es"
      ? "Propuesta sujeta a evaluación técnica, alcance y precio aprobados. El chatbot no está activado ni entregado."
      : "Proposal subject to technical evaluation and approved scope and pricing. The chatbot is not active or delivered.",
    kind: "one_time" as const,
    qty: 1,
    unitPrice: "",
  };
}
