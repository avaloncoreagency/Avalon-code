import { INDUSTRY_ORDER, type IndustryKey } from "./industries";
import type { Lang } from "../landing/copy";
export const DEMO_IDS = ["chat", "calendar", "crm", "local", "shop", "ads"] as const;
export type DemoId = (typeof DEMO_IDS)[number];
/** Only public catalog identifiers enter URLs; no showroom records or input values. */
export function readDemoLink(search: string): { industry: IndustryKey; demo: DemoId } {
  const params = new URLSearchParams(search);
  const industry = INDUSTRY_ORDER.find(k => k === params.get("industry")) ?? "barber";
  const demo = DEMO_IDS.find(k => k === params.get("demo")) ?? "chat";
  return { industry, demo };
}
export function demoLink(lang: Lang, industry: IndustryKey, demo: DemoId): string {
  const safe = readDemoLink(new URLSearchParams({ industry, demo }).toString());
  return "/?" + new URLSearchParams({ lang: lang === "en" ? "en" : "es", industry: safe.industry, demo: safe.demo }) + "#demos";
}
