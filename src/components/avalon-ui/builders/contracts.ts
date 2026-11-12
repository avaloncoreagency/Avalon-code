import type { Block, Blueprint } from '../../../lib/os/domain';
export type BuilderKind = 'website' | 'chatbot' | 'crm';
export type BuilderStatus = 'draft' | 'local-saved';
export type ProjectAsset = { id:string; name:string; authorizedUrl?:string; approval:'pending'|'approved' };
export type WebsitePage = { id:string; title:string; blocks:Block[] };
export type ChatbotConfig = { description:string; instructions:string; personality:string; greeting:string; color:string; knowledge:{id:string;title:string;body:string}[] };
export type BuilderContent = { kind:'website'; pages:WebsitePage[] } | { kind:'chatbot'; config:ChatbotConfig } | { kind:'crm'; blueprint:Blueprint; color:string; modules:string[] };
export type BuilderDraft = { id:string; name:string; content:BuilderContent; status:BuilderStatus; demo:boolean; assets:ProjectAsset[] };
export type ProjectVersion = { id:string; savedAt:string; draft:BuilderDraft };
export type Project = { draft:BuilderDraft; versions:ProjectVersion[] };
export type BuilderTemplate = { id:string; name:string; content:BuilderContent };
export type ValidationResult = { ok:true } | { ok:false; errors:string[] };
/** Optional handoff notification only. No persistence or endpoint is implied. */
export type BuilderHandoff = (draft:BuilderDraft)=>void;
