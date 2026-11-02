"use server";
import { revalidatePath } from "next/cache";
import { back, field, ownerForAction, uuidField } from "@/lib/os/actions";
import { mapDbError } from "@/lib/os/data";
import { DAYS, cleanText, intInRange, oneOf, validateReceptionist } from "@/lib/os/domain";

const BASE = "/admin/workspace/ai-receptionist";

async function assistant(form: FormData) {
  const projectId = uuidField(form, "projectId");
  if (!projectId) back(BASE, { error: "not_found" });
  const session = await ownerForAction();
  return { ...session, projectId, path: `${BASE}/${projectId}` };
}

export async function saveReceptionistConfig(form: FormData) {
  const ctx = await assistant(form);
  const version = Number(field(form, "version"));
  const hours = Object.fromEntries(DAYS.map(d => [d, { closed: form.get(`closed_${d}`) === "on", open: field(form, `open_${d}`), close: field(form, `close_${d}`) }]));
  const config = validateReceptionist({
    assistantName: field(form, "assistantName"), persona: field(form, "persona"), languages: form.getAll("languages"),
    greeting: field(form, "greeting"), instructions: field(form, "instructions"), timezone: field(form, "timezone"), hours,
    handoffEmail: field(form, "handoffEmail"), handoffPhone: field(form, "handoffPhone"), handoffRule: field(form, "handoffRule"),
  });
  if (!config.ok) back(ctx.path + "#config", { error: config.error });
  const { data: current, error: readError, status: readStatus } = await ctx.supabase.from("os_projects").select("settings,version").eq("id", ctx.projectId).eq("module", "receptionist").maybeSingle();
  if (readError) back(ctx.path, { error: mapDbError(readError, readStatus) });
  if (!current) back(BASE, { error: "not_found" });
  if (current.version !== version) back(ctx.path, { error: "conflict" });
  const { data, error, status } = await ctx.supabase.from("os_projects")
    .update({ settings: { ...(current.settings as Record<string, unknown>), receptionist: config.value } })
    .eq("id", ctx.projectId).eq("module", "receptionist").eq("version", version).select("id");
  if (error) back(ctx.path, { error: mapDbError(error, status) });
  if (!data?.length) back(ctx.path, { error: "conflict" });
  revalidatePath(ctx.path);
  back(ctx.path + "#config", { ok: "saved" });
}

function entryInput(form: FormData) {
  const kind = oneOf(field(form, "kind"), ["faq", "knowledge"] as const);
  const question = cleanText(field(form, "question"), { min: 1, max: 300 });
  const answer = cleanText(field(form, "answer"), { min: 1, max: 8000 });
  const position = intInRange(field(form, "position") || "0", 0, 10000);
  if (!kind.ok || !position.ok) return { ok: false as const, error: "invalid" };
  if (!question.ok) return { ok: false as const, error: question.error };
  if (!answer.ok) return { ok: false as const, error: answer.error };
  return { ok: true as const, value: { kind: kind.value, question: question.value, answer: answer.value, position: position.value } };
}

export async function addReceptionistEntry(form: FormData) {
  const ctx = await assistant(form);
  const input = entryInput(form);
  if (!input.ok) back(ctx.path + "#knowledge", { error: input.error });
  const { error, status } = await ctx.supabase.from("os_receptionist_entries").insert({ ...input.value, project_id: ctx.projectId, created_by: ctx.userId });
  if (error) back(ctx.path + "#knowledge", { error: mapDbError(error, status) });
  revalidatePath(ctx.path);
  back(ctx.path + "#knowledge", { ok: "created" });
}

export async function updateReceptionistEntry(form: FormData) {
  const ctx = await assistant(form);
  const entryId = uuidField(form, "entryId");
  const version = Number(field(form, "version"));
  const input = entryInput(form);
  if (!entryId || !Number.isSafeInteger(version)) back(ctx.path, { error: "invalid" });
  if (!input.ok) back(ctx.path + "#knowledge", { error: input.error });
  const { data, error, status } = await ctx.supabase.from("os_receptionist_entries").update(input.value)
    .eq("id", entryId).eq("project_id", ctx.projectId).eq("version", version).select("id");
  if (error) back(ctx.path + "#knowledge", { error: mapDbError(error, status) });
  if (!data?.length) back(ctx.path + "#knowledge", { error: "conflict" });
  revalidatePath(ctx.path);
  back(ctx.path + "#knowledge", { ok: "saved" });
}

export async function deleteReceptionistEntry(form: FormData) {
  const ctx = await assistant(form);
  const entryId = uuidField(form, "entryId");
  if (!entryId) back(ctx.path, { error: "invalid" });
  const { error, status } = await ctx.supabase.from("os_receptionist_entries").delete().eq("id", entryId).eq("project_id", ctx.projectId);
  if (error) back(ctx.path + "#knowledge", { error: mapDbError(error, status) });
  revalidatePath(ctx.path);
  back(ctx.path + "#knowledge", { ok: "deleted" });
}
