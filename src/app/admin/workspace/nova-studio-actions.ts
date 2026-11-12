"use server";
// Persistence for the Nova CRM Creator and AI Chatbots editors. Uses the owner's own Supabase session (RLS applies)
// and the project's row version for optimistic concurrency; the os_projects audit trigger records each change.
import { revalidatePath } from "next/cache";
import { ownerForAction } from "@/lib/os/actions";
import { mapDbError } from "@/lib/os/data";
import { isUuid } from "@/lib/os/domain";
import { NOVA_STUDIO_MODULE, mergeSettings, validateChatbot, validateCrm, type NovaStudioKind } from "@/lib/os/nova-settings";

export type NovaStudioSaveResult = { ok: true; version: number } | { ok: false; error: string };

const PATHS: Record<NovaStudioKind, string> = { crm: "/admin/workspace/crm-creator", chatbot: "/admin/workspace/ai-receptionist", chatbot_product: "/admin/workspace/ai-chatbots" };

export async function saveNovaStudio(kind: NovaStudioKind, projectId: string, version: number, content: unknown): Promise<NovaStudioSaveResult> {
  if (kind !== "crm" && kind !== "chatbot" && kind !== "chatbot_product") return { ok: false, error: "invalid" };
  if (!isUuid(projectId) || !Number.isSafeInteger(version) || version < 1) return { ok: false, error: "invalid" };
  const valid = kind === "crm" ? validateCrm(content) : validateChatbot(content);
  if (!valid.ok) return { ok: false, error: valid.error };
  const { supabase } = await ownerForAction();
  const moduleKey = NOVA_STUDIO_MODULE[kind];
  const current = await supabase.from("os_projects").select("settings,version").eq("id", projectId).eq("module", moduleKey).maybeSingle();
  if (current.error) return { ok: false, error: mapDbError(current.error, current.status) };
  if (!current.data) return { ok: false, error: "not_found" };
  if (current.data.version !== version) return { ok: false, error: "conflict" };
  const { data, error, status } = await supabase.from("os_projects").update({ settings: mergeSettings(kind, current.data.settings, valid.value) })
    .eq("id", projectId).eq("module", moduleKey).eq("version", version).select("version");
  if (error) return { ok: false, error: mapDbError(error, status) };
  if (!data?.length) return { ok: false, error: "conflict" };
  revalidatePath(`${PATHS[kind]}/${projectId}`);
  return { ok: true, version: data[0].version };
}
