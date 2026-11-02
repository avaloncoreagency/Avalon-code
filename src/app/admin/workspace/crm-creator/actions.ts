"use server";
import { revalidatePath } from "next/cache";
import { back, field, ownerForAction, uuidField } from "@/lib/os/actions";
import { mapDbError } from "@/lib/os/data";
import {
  BLUEPRINT_TEMPLATES, FIELD_TYPES, LIMITS, PERMISSION_LEVELS, cleanText, oneOf, readBlueprint, toKey, validateBlueprint, type Blueprint,
} from "@/lib/os/domain";

const BASE = "/admin/workspace/crm-creator";
type Op = (bp: Blueprint, form: FormData) => Blueprint | string;

const keyFrom = (form: FormData, labelValue: string) => (field(form, "key").trim() || toKey(labelValue)).toLowerCase();
const label = (form: FormData) => {
  const r = cleanText(field(form, "label"), { min: 1, max: 80 });
  return r.ok ? r.value : null;
};

const OPS: Record<string, Op> = {
  add_entity(bp, form) {
    const l = label(form); if (!l) return "bp_label";
    if (bp.entities.length >= LIMITS.entities) return "bp_limit";
    return { ...bp, entities: [...bp.entities, { key: keyFrom(form, l), label: l, fields: [] }] };
  },
  remove_entity(bp, form) {
    const key = field(form, "entity");
    return { ...bp, entities: bp.entities.filter(e => e.key !== key), pipelines: bp.pipelines.filter(p => p.entity !== key) };
  },
  add_field(bp, form) {
    const l = label(form); if (!l) return "bp_label";
    const type = oneOf(field(form, "type"), FIELD_TYPES); if (!type.ok) return "bp_type";
    const entity = field(form, "entity");
    if (!bp.entities.some(e => e.key === entity)) return "bp_reference";
    const options = field(form, "options").split(",").map(o => o.trim()).filter(Boolean);
    return { ...bp, entities: bp.entities.map(e => e.key !== entity ? e : { ...e, fields: [...e.fields, { key: keyFrom(form, l), label: l, type: type.value, required: field(form, "required") === "on", options }] }) };
  },
  remove_field(bp, form) {
    const entity = field(form, "entity"), key = field(form, "field");
    return { ...bp, entities: bp.entities.map(e => e.key !== entity ? e : { ...e, fields: e.fields.filter(f => f.key !== key) }) };
  },
  add_pipeline(bp, form) {
    const l = label(form); if (!l) return "bp_label";
    return { ...bp, pipelines: [...bp.pipelines, { key: keyFrom(form, l), label: l, entity: field(form, "entity"), stages: [] }] };
  },
  remove_pipeline(bp, form) {
    const key = field(form, "pipeline");
    return { ...bp, pipelines: bp.pipelines.filter(p => p.key !== key) };
  },
  add_stage(bp, form) {
    const l = label(form); if (!l) return "bp_label";
    const kind = oneOf(field(form, "kind"), ["open", "won", "lost"] as const); if (!kind.ok) return "bp_type";
    const pipeline = field(form, "pipeline");
    if (!bp.pipelines.some(p => p.key === pipeline)) return "bp_reference";
    return { ...bp, pipelines: bp.pipelines.map(p => p.key !== pipeline ? p : { ...p, stages: [...p.stages, { key: keyFrom(form, l), label: l, kind: kind.value }] }) };
  },
  remove_stage(bp, form) {
    const pipeline = field(form, "pipeline"), key = field(form, "stage");
    return { ...bp, pipelines: bp.pipelines.map(p => p.key !== pipeline ? p : { ...p, stages: p.stages.filter(s => s.key !== key) }) };
  },
  add_role(bp, form) {
    const l = label(form); if (!l) return "bp_label";
    return { ...bp, roles: [...bp.roles, { key: keyFrom(form, l), label: l, permissions: {} }] };
  },
  remove_role(bp, form) {
    const key = field(form, "role");
    return { ...bp, roles: bp.roles.filter(r => r.key !== key) };
  },
  set_permissions(bp, form) {
    const key = field(form, "role");
    if (!bp.roles.some(r => r.key === key)) return "bp_reference";
    const permissions: Record<string, string> = {};
    for (const e of bp.entities) {
      const level = oneOf(field(form, `perm_${e.key}`), PERMISSION_LEVELS);
      if (!level.ok) return "bp_type";
      permissions[e.key] = level.value;
    }
    return { ...bp, roles: bp.roles.map(r => r.key !== key ? r : { ...r, permissions: permissions as Blueprint["roles"][number]["permissions"] }) };
  },
  replace_json(_bp, form) {
    const text = field(form, "json");
    if (text.length > 200_000) return "too_long";
    try {
      const parsed = JSON.parse(text) as unknown;
      const result = validateBlueprint(parsed);
      return result.ok ? result.value : result.error;
    } catch {
      return "bp_json";
    }
  },
  apply_template(_bp, form) {
    if (field(form, "confirm") !== "yes") return "required";
    const template = BLUEPRINT_TEMPLATES[field(form, "template")];
    return template ? structuredClone(template.blueprint) : "invalid";
  },
};

export async function mutateBlueprint(form: FormData) {
  const projectId = uuidField(form, "projectId");
  if (!projectId) back(BASE, { error: "not_found" });
  const path = `${BASE}/${projectId}`;
  const op = OPS[field(form, "op")];
  if (!Object.hasOwn(OPS, field(form, "op")) || !op) back(path, { error: "invalid" });
  const version = Number(field(form, "version"));
  const { supabase } = await ownerForAction();
  const { data, error, status } = await supabase.from("os_projects").select("settings,version").eq("id", projectId).eq("module", "crm_creator").maybeSingle();
  if (error) back(path, { error: mapDbError(error, status) });
  if (!data) back(BASE, { error: "not_found" });
  if (data.version !== version) back(path, { error: "conflict" });
  const next = op(readBlueprint(data.settings), form);
  if (typeof next === "string") back(path, { error: next });
  const valid = validateBlueprint(next);
  if (!valid.ok) back(path, { error: valid.error });
  const settings = { ...(data.settings as Record<string, unknown>), blueprint: valid.value };
  const update = await supabase.from("os_projects").update({ settings }).eq("id", projectId).eq("module", "crm_creator").eq("version", version).select("id");
  if (update.error) back(path, { error: mapDbError(update.error, update.status) });
  if (!update.data?.length) back(path, { error: "conflict" });
  revalidatePath(path);
  back(path, { ok: field(form, "op") === "apply_template" ? "template" : "saved" });
}
