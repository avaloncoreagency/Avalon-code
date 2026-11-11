// Server-side validation for the Nova CRM Creator and AI Chatbots editors (Codex UI). Both persist inside the
// project's existing `os_projects.settings` JSON (no new table, no migration): CRM → settings.blueprint (the same key
// the classic CRM Creator uses) + settings.nova; chatbot → settings.chatbot on an AI Receptionist project.
import { cleanText, readBlueprint, validateBlueprint, type Blueprint, type ModuleKey } from "./domain";

export type NovaStudioKind = "crm" | "chatbot";
export const NOVA_STUDIO_MODULE: Record<NovaStudioKind, ModuleKey> = { crm: "crm_creator", chatbot: "receptionist" };

export type ChatbotSettings = {
  description: string; instructions: string; personality: string; greeting: string; color: string;
  knowledge: { id: string; title: string; body: string }[];
};
export type CrmSettings = { kind: "crm"; blueprint: Blueprint; color: string; modules: string[] };

const HEX = /^#[0-9a-f]{6}$/i;
const ITEM_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MODULE = /^[a-z][a-z0-9_]{0,39}$/;
type R<T> = { ok: true; value: T } | { ok: false; error: string };

export function validateChatbot(input: unknown): R<ChatbotSettings> {
  if (!input || typeof input !== "object") return { ok: false, error: "invalid" };
  const raw = input as Record<string, unknown>;
  const out: Partial<ChatbotSettings> = {};
  for (const [key, max] of [["description", 2000], ["instructions", 12000], ["personality", 500], ["greeting", 1000]] as const) {
    const v = cleanText(raw[key] ?? "", { max });
    if (!v.ok) return { ok: false, error: key };
    out[key] = v.value;
  }
  if (typeof raw.color !== "string" || !HEX.test(raw.color)) return { ok: false, error: "color" };
  if (!Array.isArray(raw.knowledge) || raw.knowledge.length > 100) return { ok: false, error: "knowledge" };
  const seen = new Set<string>();
  const knowledge: ChatbotSettings["knowledge"] = [];
  for (const k of raw.knowledge as Record<string, unknown>[]) {
    if (!k || typeof k !== "object" || typeof k.id !== "string" || !ITEM_ID.test(k.id) || seen.has(k.id)) return { ok: false, error: "knowledge" };
    seen.add(k.id);
    const title = cleanText(k.title, { min: 1, max: 120 }), body = cleanText(k.body, { min: 1, max: 10000 });
    if (!title.ok || !body.ok) return { ok: false, error: "knowledge" };
    knowledge.push({ id: k.id, title: title.value, body: body.value });
  }
  return { ok: true, value: { ...(out as Omit<ChatbotSettings, "color" | "knowledge">), color: raw.color, knowledge } };
}

export function validateCrm(input: unknown): R<CrmSettings> {
  if (!input || typeof input !== "object") return { ok: false, error: "invalid" };
  const raw = input as Record<string, unknown>;
  const bp = validateBlueprint(raw.blueprint);
  if (!bp.ok) return { ok: false, error: bp.error };
  if (typeof raw.color !== "string" || !HEX.test(raw.color)) return { ok: false, error: "color" };
  if (!Array.isArray(raw.modules) || raw.modules.length > 20 || !raw.modules.every(m => typeof m === "string" && MODULE.test(m))) return { ok: false, error: "modules" };
  return { ok: true, value: { kind: "crm", blueprint: bp.value, color: raw.color, modules: [...new Set(raw.modules as string[])] } };
}

/** Rehydrate editor content from stored settings; invalid or missing data falls back to safe defaults. */
export function readChatbot(settings: unknown): ChatbotSettings {
  const stored = settings && typeof settings === "object" ? (settings as Record<string, unknown>).chatbot : undefined;
  const v = validateChatbot(stored);
  return v.ok ? v.value : { description: "", instructions: "", personality: "", greeting: "", color: "#8edbff", knowledge: [] };
}
export function readCrm(settings: unknown): CrmSettings {
  const s = settings && typeof settings === "object" ? (settings as Record<string, unknown>) : {};
  const nova = s.nova && typeof s.nova === "object" ? (s.nova as Record<string, unknown>) : {};
  const v = validateCrm({ blueprint: readBlueprint(s), color: nova.color ?? "#8edbff", modules: nova.modules ?? ["contacts"] });
  return v.ok ? v.value : { kind: "crm", blueprint: readBlueprint(s), color: "#8edbff", modules: ["contacts"] };
}

/** Merge validated content into the existing settings without dropping other keys. */
export function mergeSettings(kind: NovaStudioKind, current: unknown, value: ChatbotSettings | CrmSettings): Record<string, unknown> {
  const base = current && typeof current === "object" ? { ...(current as Record<string, unknown>) } : {};
  if (kind === "chatbot") return { ...base, chatbot: value };
  const crm = value as CrmSettings;
  return { ...base, blueprint: crm.blueprint, nova: { color: crm.color, modules: crm.modules } };
}
