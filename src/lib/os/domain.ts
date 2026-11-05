// Pure validation and domain logic for Avalon OS modules.
// No framework or network imports: unit-tested directly in tests/os.test.cjs.

export type ModuleKey = "website" | "ecommerce" | "crm_creator" | "receptionist" | "marketing" | "chatbots";
export const MODULE_KEYS: readonly ModuleKey[] = ["website", "ecommerce", "crm_creator", "receptionist", "marketing", "chatbots"];
export const PROJECT_STATUSES = ["draft", "active", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T = never>(error: string): Result<T> => ({ ok: false, error });

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

/** Trimmed text within bounds. Rejects control characters except newlines/tabs. */
export function cleanText(value: unknown, { min = 0, max }: { min?: number; max: number }): Result<string> {
  if (value === null || value === undefined) value = "";
  if (typeof value !== "string") return fail("invalid");
  const text = value.replace(/\r\n/g, "\n").trim();
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return fail("invalid");
  if (text.length < min) return fail("required");
  if (text.length > max) return fail("too_long");
  return ok(text);
}

export function oneOf<T extends string>(value: unknown, options: readonly T[]): Result<T> {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? ok(value as T) : fail("invalid");
}

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}
export const isSlug = (value: string) => value.length > 0 && value.length <= 80 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);

/** https URL only (or empty). Blocks javascript:, data:, http: and markup characters. */
export function httpsUrl(value: unknown, { allowEmpty = true } = {}): Result<string> {
  const text = cleanText(value, { max: 1000 });
  if (!text.ok) return text;
  if (!text.value) return allowEmpty ? ok("") : fail("required");
  try {
    const url = new URL(text.value);
    if (url.protocol !== "https:" || url.username || url.password || /[\s<>"]/.test(text.value)) return fail("url");
    return ok(url.toString());
  } catch {
    return fail("url");
  }
}

/** Link targets for page buttons: https URLs, site-relative paths, anchors or mailto/tel. */
export function safeHref(value: unknown): Result<string> {
  const text = cleanText(value, { max: 500 });
  if (!text.ok) return text;
  const href = text.value;
  if (!href) return ok("");
  if (/^\/(?!\/)[A-Za-z0-9\-._~/?#=&%]*$/.test(href) || /^#[A-Za-z0-9\-_]+$/.test(href)) return ok(href);
  if (/^mailto:[^\s<>"]+@[^\s<>"]+$/.test(href) || /^tel:\+?[0-9 ()-]{3,30}$/.test(href)) return ok(href);
  return httpsUrl(href, { allowEmpty: false });
}

export function isoDate(value: unknown, { allowEmpty = true } = {}): Result<string | null> {
  if (value === "" || value === null || value === undefined) return allowEmpty ? ok(null) : fail("required");
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail("date");
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return fail("date");
  return ok(value);
}

export function intInRange(value: unknown, min: number, max: number): Result<number> {
  const text = typeof value === "string" ? value.trim() : value;
  const number = typeof text === "number" ? text : typeof text === "string" && /^-?\d+$/.test(text) ? Number(text) : NaN;
  if (!Number.isSafeInteger(number) || number < min || number > max) return fail("number");
  return ok(number);
}

// ─── Money (integer minor units, never floats in storage) ───────────────────
export const CURRENCIES = ["USD", "EUR", "MXN", "COP", "ARS", "CLP", "PEN", "GBP"] as const;
export type Currency = (typeof CURRENCIES)[number];
const ZERO_DECIMAL: readonly string[] = ["CLP"];

export function parsePrice(value: unknown, currency: Currency = "USD"): Result<number> {
  if (typeof value !== "string") return fail("price");
  const text = value.trim().replace(/\s/g, "");
  const decimals = ZERO_DECIMAL.includes(currency) ? 0 : 2;
  const pattern = decimals === 0 ? /^\d{1,12}$/ : /^\d{1,10}([.,]\d{1,2})?$/;
  if (!pattern.test(text)) return fail("price");
  const [whole, fraction = ""] = text.split(/[.,]/);
  const cents = Number(whole) * 10 ** decimals + Number((fraction + "00").slice(0, decimals) || "0");
  return Number.isSafeInteger(cents) && cents <= 100_000_000_000 ? ok(cents) : fail("price");
}

export function formatMoney(cents: number, currency: string, lang: "es" | "en") {
  const decimals = ZERO_DECIMAL.includes(currency) ? 0 : 2;
  try {
    return new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-US", { style: "currency", currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(cents / 10 ** decimals);
  } catch {
    return `${(cents / 10 ** decimals).toFixed(decimals)} ${currency}`;
  }
}
export function centsToInput(cents: number, currency: string) {
  const decimals = ZERO_DECIMAL.includes(currency) ? 0 : 2;
  return (cents / 10 ** decimals).toFixed(decimals);
}

// ─── Website Designer blocks ────────────────────────────────────────────────
export const BLOCK_TYPES = ["hero", "text", "features", "cta"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];
export type Block =
  | { type: "hero"; heading: string; subheading: string; buttonLabel: string; buttonHref: string }
  | { type: "text"; heading: string; body: string }
  | { type: "features"; heading: string; items: string[] }
  | { type: "cta"; heading: string; body: string; buttonLabel: string; buttonHref: string };
export const MAX_BLOCKS = 60;

export function emptyBlock(type: BlockType): Block {
  switch (type) {
    case "hero": return { type, heading: "", subheading: "", buttonLabel: "", buttonHref: "" };
    case "text": return { type, heading: "", body: "" };
    case "features": return { type, heading: "", items: [] };
    case "cta": return { type, heading: "", body: "", buttonLabel: "", buttonHref: "" };
  }
}

/** Validate one block from untrusted input (form or stored JSON). */
export function validateBlock(input: unknown): Result<Block> {
  if (!input || typeof input !== "object") return fail("block");
  const raw = input as Record<string, unknown>;
  const type = oneOf(raw.type, BLOCK_TYPES);
  if (!type.ok) return fail("block");
  const heading = cleanText(raw.heading, { max: 200 });
  if (!heading.ok) return fail("block_" + heading.error);
  if (type.value === "text") {
    const body = cleanText(raw.body, { max: 10000 });
    return body.ok ? ok({ type: "text", heading: heading.value, body: body.value }) : fail("block_" + body.error);
  }
  if (type.value === "features") {
    const list = Array.isArray(raw.items) ? raw.items : typeof raw.items === "string" ? raw.items.split("\n") : [];
    const items: string[] = [];
    for (const item of list) {
      const text = cleanText(item, { max: 200 });
      if (!text.ok) return fail("block_" + text.error);
      if (text.value) items.push(text.value);
    }
    if (items.length > 24) return fail("block_too_long");
    return ok({ type: "features", heading: heading.value, items });
  }
  const label = cleanText(raw.buttonLabel, { max: 60 });
  const href = safeHref(raw.buttonHref);
  if (!label.ok) return fail("block_" + label.error);
  if (!href.ok) return fail("block_url");
  if (Boolean(label.value) !== Boolean(href.value)) return fail("block_button");
  if (type.value === "hero") {
    const sub = cleanText(raw.subheading, { max: 500 });
    return sub.ok ? ok({ type: "hero", heading: heading.value, subheading: sub.value, buttonLabel: label.value, buttonHref: href.value }) : fail("block_" + sub.error);
  }
  const body = cleanText(raw.body, { max: 2000 });
  return body.ok ? ok({ type: "cta", heading: heading.value, body: body.value, buttonLabel: label.value, buttonHref: href.value }) : fail("block_" + body.error);
}

export function validateBlocks(input: unknown): Result<Block[]> {
  if (!Array.isArray(input) || input.length > MAX_BLOCKS) return fail("block");
  const blocks: Block[] = [];
  for (const item of input) {
    const block = validateBlock(item);
    if (!block.ok) return block;
    blocks.push(block.value);
  }
  return ok(blocks);
}

/** Stored JSON may predate a schema change: keep only valid blocks for rendering. */
export function readBlocks(input: unknown): Block[] {
  if (!Array.isArray(input)) return [];
  return input.map(validateBlock).filter((b): b is { ok: true; value: Block } => b.ok).map(b => b.value).slice(0, MAX_BLOCKS);
}

export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;
  const copy = items.slice();
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

// ─── CRM Creator blueprints ─────────────────────────────────────────────────
export const FIELD_TYPES = ["text", "long_text", "email", "phone", "number", "currency", "date", "boolean", "select", "url"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export const PERMISSION_LEVELS = ["none", "view", "edit", "manage"] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];
export type BlueprintField = { key: string; label: string; type: FieldType; required: boolean; options: string[] };
export type BlueprintEntity = { key: string; label: string; fields: BlueprintField[] };
export type BlueprintStage = { key: string; label: string; kind: "open" | "won" | "lost" };
export type BlueprintPipeline = { key: string; label: string; entity: string; stages: BlueprintStage[] };
export type BlueprintRole = { key: string; label: string; permissions: Record<string, PermissionLevel> };
export type Blueprint = { schemaVersion: 1; entities: BlueprintEntity[]; pipelines: BlueprintPipeline[]; roles: BlueprintRole[] };

export const KEY = /^[a-z][a-z0-9_]{0,39}$/;
const RESERVED = new Set(["id", "created_at", "updated_at", "created_by", "version", "select", "from", "where", "table", "user", "order", "group"]);
export const LIMITS = { entities: 30, fields: 60, pipelines: 10, stages: 20, roles: 10, options: 50 } as const;
export const emptyBlueprint = (): Blueprint => ({ schemaVersion: 1, entities: [], pipelines: [], roles: [] });

export function toKey(label: string) {
  const key = slugify(label).replace(/-/g, "_").replace(/^[^a-z]+/, "").slice(0, 40);
  return key || "item";
}

function validKey(value: unknown, seen: Set<string>): Result<string> {
  if (typeof value !== "string" || !KEY.test(value) || RESERVED.has(value)) return fail("bp_key");
  if (seen.has(value)) return fail("bp_duplicate");
  seen.add(value);
  return ok(value);
}

export function validateBlueprint(input: unknown): Result<Blueprint> {
  if (!input || typeof input !== "object") return fail("bp_shape");
  const raw = input as Record<string, unknown>;
  const entitiesIn = raw.entities ?? [], pipelinesIn = raw.pipelines ?? [], rolesIn = raw.roles ?? [];
  if (!Array.isArray(entitiesIn) || !Array.isArray(pipelinesIn) || !Array.isArray(rolesIn)) return fail("bp_shape");
  if (entitiesIn.length > LIMITS.entities || pipelinesIn.length > LIMITS.pipelines || rolesIn.length > LIMITS.roles) return fail("bp_limit");
  const entityKeys = new Set<string>();
  const entities: BlueprintEntity[] = [];
  for (const e of entitiesIn) {
    if (!e || typeof e !== "object") return fail("bp_shape");
    const er = e as Record<string, unknown>;
    const key = validKey(er.key, entityKeys);
    const label = cleanText(er.label, { min: 1, max: 80 });
    if (!key.ok) return key;
    if (!label.ok) return fail("bp_label");
    const fieldsIn = er.fields ?? [];
    if (!Array.isArray(fieldsIn) || fieldsIn.length > LIMITS.fields) return fail("bp_limit");
    const fieldKeys = new Set<string>();
    const fields: BlueprintField[] = [];
    for (const f of fieldsIn) {
      if (!f || typeof f !== "object") return fail("bp_shape");
      const fr = f as Record<string, unknown>;
      const fkey = validKey(fr.key, fieldKeys);
      const flabel = cleanText(fr.label, { min: 1, max: 80 });
      const type = oneOf(fr.type, FIELD_TYPES);
      if (!fkey.ok) return fkey;
      if (!flabel.ok) return fail("bp_label");
      if (!type.ok) return fail("bp_type");
      const optionsIn = Array.isArray(fr.options) ? fr.options : [];
      if (optionsIn.length > LIMITS.options) return fail("bp_limit");
      const options: string[] = [];
      for (const o of optionsIn) {
        const opt = cleanText(o, { min: 1, max: 80 });
        if (!opt.ok) return fail("bp_label");
        if (!options.includes(opt.value)) options.push(opt.value);
      }
      if (type.value === "select" && options.length === 0) return fail("bp_options");
      fields.push({ key: fkey.value, label: flabel.value, type: type.value, required: fr.required === true, options: type.value === "select" ? options : [] });
    }
    entities.push({ key: key.value, label: label.value, fields });
  }
  const pipelineKeys = new Set<string>();
  const pipelines: BlueprintPipeline[] = [];
  for (const p of pipelinesIn) {
    if (!p || typeof p !== "object") return fail("bp_shape");
    const pr = p as Record<string, unknown>;
    const key = validKey(pr.key, pipelineKeys);
    const label = cleanText(pr.label, { min: 1, max: 80 });
    if (!key.ok) return key;
    if (!label.ok) return fail("bp_label");
    if (typeof pr.entity !== "string" || !entityKeys.has(pr.entity)) return fail("bp_reference");
    const stagesIn = pr.stages ?? [];
    if (!Array.isArray(stagesIn) || stagesIn.length > LIMITS.stages) return fail("bp_limit");
    const stageKeys = new Set<string>();
    const stages: BlueprintStage[] = [];
    for (const s of stagesIn) {
      if (!s || typeof s !== "object") return fail("bp_shape");
      const sr = s as Record<string, unknown>;
      const skey = validKey(sr.key, stageKeys);
      const slabel = cleanText(sr.label, { min: 1, max: 80 });
      const kind = oneOf(sr.kind, ["open", "won", "lost"] as const);
      if (!skey.ok) return skey;
      if (!slabel.ok) return fail("bp_label");
      if (!kind.ok) return fail("bp_type");
      stages.push({ key: skey.value, label: slabel.value, kind: kind.value });
    }
    pipelines.push({ key: key.value, label: label.value, entity: pr.entity, stages });
  }
  const roleKeys = new Set<string>();
  const roles: BlueprintRole[] = [];
  for (const r of rolesIn) {
    if (!r || typeof r !== "object") return fail("bp_shape");
    const rr = r as Record<string, unknown>;
    const key = validKey(rr.key, roleKeys);
    const label = cleanText(rr.label, { min: 1, max: 80 });
    if (!key.ok) return key;
    if (!label.ok) return fail("bp_label");
    const permsIn = rr.permissions && typeof rr.permissions === "object" ? rr.permissions as Record<string, unknown> : {};
    const permissions: Record<string, PermissionLevel> = {};
    for (const entity of entityKeys) {
      const level = oneOf(permsIn[entity] ?? "none", PERMISSION_LEVELS);
      if (!level.ok) return fail("bp_type");
      permissions[entity] = level.value;
    }
    roles.push({ key: key.value, label: label.value, permissions });
  }
  return ok({ schemaVersion: 1, entities, pipelines, roles });
}

/** Reads stored settings defensively; invalid JSON becomes an empty blueprint. */
export function readBlueprint(settings: unknown): Blueprint {
  const value = settings && typeof settings === "object" ? (settings as Record<string, unknown>).blueprint : undefined;
  const parsed = validateBlueprint(value ?? emptyBlueprint());
  return parsed.ok ? parsed.value : emptyBlueprint();
}

const f = (key: string, label: string, type: FieldType, required = false, options: string[] = []): BlueprintField => ({ key, label, type, required, options });
export const BLUEPRINT_TEMPLATES: Record<string, { es: string; en: string; blueprint: Blueprint }> = {
  agency_sales: {
    es: "Ventas B2B de agencia", en: "Agency B2B sales",
    blueprint: {
      schemaVersion: 1,
      entities: [
        { key: "companies", label: "Empresas", fields: [f("name", "Nombre", "text", true), f("website", "Sitio web", "url"), f("industry", "Industria", "text")] },
        { key: "contacts", label: "Contactos", fields: [f("full_name", "Nombre completo", "text", true), f("email", "Correo", "email"), f("phone", "Teléfono", "phone")] },
        { key: "deals", label: "Oportunidades", fields: [f("title", "Título", "text", true), f("amount", "Importe", "currency"), f("close_date", "Fecha de cierre", "date")] },
      ],
      pipelines: [{ key: "sales", label: "Ventas", entity: "deals", stages: [
        { key: "new", label: "Nuevo", kind: "open" }, { key: "qualified", label: "Calificado", kind: "open" },
        { key: "proposal", label: "Propuesta", kind: "open" }, { key: "won", label: "Ganado", kind: "won" }, { key: "lost", label: "Perdido", kind: "lost" },
      ] }],
      roles: [
        { key: "sales_rep", label: "Comercial", permissions: { companies: "edit", contacts: "edit", deals: "edit" } },
        { key: "viewer", label: "Solo lectura", permissions: { companies: "view", contacts: "view", deals: "view" } },
      ],
    },
  },
  real_estate: {
    es: "Inmobiliaria", en: "Real estate",
    blueprint: {
      schemaVersion: 1,
      entities: [
        { key: "properties", label: "Propiedades", fields: [f("address", "Dirección", "text", true), f("price", "Precio", "currency"), f("type", "Tipo", "select", true, ["Casa", "Departamento", "Local", "Terreno"])] },
        { key: "buyers", label: "Compradores", fields: [f("full_name", "Nombre", "text", true), f("email", "Correo", "email"), f("budget", "Presupuesto", "currency")] },
      ],
      pipelines: [{ key: "buyers_flow", label: "Compradores", entity: "buyers", stages: [
        { key: "inquiry", label: "Consulta", kind: "open" }, { key: "visit", label: "Visita", kind: "open" },
        { key: "offer", label: "Oferta", kind: "open" }, { key: "closed", label: "Cerrado", kind: "won" }, { key: "dropped", label: "Descartado", kind: "lost" },
      ] }],
      roles: [{ key: "agent", label: "Agente", permissions: { properties: "edit", buyers: "edit" } }],
    },
  },
  services_booking: {
    es: "Servicios con citas", en: "Service bookings",
    blueprint: {
      schemaVersion: 1,
      entities: [
        { key: "clients", label: "Clientes", fields: [f("full_name", "Nombre", "text", true), f("phone", "Teléfono", "phone", true), f("notes", "Notas", "long_text")] },
        { key: "appointments", label: "Citas", fields: [f("service", "Servicio", "text", true), f("date", "Fecha", "date", true), f("confirmed", "Confirmada", "boolean")] },
      ],
      pipelines: [{ key: "bookings", label: "Reservas", entity: "appointments", stages: [
        { key: "requested", label: "Solicitada", kind: "open" }, { key: "confirmed", label: "Confirmada", kind: "open" },
        { key: "done", label: "Atendida", kind: "won" }, { key: "no_show", label: "No asistió", kind: "lost" },
      ] }],
      roles: [{ key: "front_desk", label: "Recepción", permissions: { clients: "edit", appointments: "manage" } }],
    },
  },
};

const SQL_TYPES: Record<FieldType, string> = {
  text: "text", long_text: "text", email: "text", phone: "text", number: "numeric", currency: "numeric(15,2)",
  date: "date", boolean: "boolean", select: "text", url: "text",
};
const sqlLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`;

/**
 * Generates a reviewable PostgreSQL DDL preview. It is NEVER executed by the
 * application; installation requires a separate reviewed migration.
 * Keys are validated identifiers, so they are safe to embed.
 */
export function blueprintToSql(blueprint: Blueprint, prefix: string) {
  const safePrefix = KEY.test(prefix) ? prefix.slice(0, 20) : "client";
  const lines = [
    "-- PREVIEW ONLY. Generated by Avalon OS CRM Creator. Review before any use.",
    "-- Not executed by Avalon OS. Add RLS policies for the target project's auth model.",
    "begin;",
  ];
  for (const entity of blueprint.entities) {
    const table = `${safePrefix}_${entity.key}`;
    lines.push("", `create table public.${table} (`, "  id uuid primary key default gen_random_uuid(),");
    for (const field of entity.fields) {
      let column = `  ${field.key} ${SQL_TYPES[field.type]}${field.required ? " not null" : ""}`;
      if (field.type === "select") column += ` check (${field.key} in (${field.options.map(sqlLiteral).join(", ")}))`;
      if (field.type === "email") column += ` check (${field.key} ~ '^[^@\\s]+@[^@\\s]+$')`;
      lines.push(column + ",");
    }
    const pipeline = blueprint.pipelines.find(p => p.entity === entity.key);
    if (pipeline && pipeline.stages.length) {
      lines.push(`  stage text not null default ${sqlLiteral(pipeline.stages[0].key)} check (stage in (${pipeline.stages.map(s => sqlLiteral(s.key)).join(", ")})),`);
    }
    lines.push("  created_at timestamptz not null default now(),", "  updated_at timestamptz not null default now()", ");", `alter table public.${table} enable row level security;`);
  }
  lines.push("", "commit;");
  return lines.join("\n");
}

// ─── AI Receptionist ────────────────────────────────────────────────────────
export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];
export const PERSONAS = ["professional", "friendly", "formal"] as const;
export type ReceptionistSettings = {
  assistantName: string;
  persona: (typeof PERSONAS)[number];
  languages: ("es" | "en")[];
  greeting: string;
  instructions: string;
  timezone: string;
  hours: Record<Day, { closed: boolean; open: string; close: string }>;
  handoffEmail: string;
  handoffPhone: string;
  handoffRule: string;
};
export const defaultReceptionist = (): ReceptionistSettings => ({
  assistantName: "", persona: "professional", languages: ["es"], greeting: "", instructions: "", timezone: "America/New_York",
  hours: Object.fromEntries(DAYS.map(d => [d, { closed: d === "sat" || d === "sun", open: "09:00", close: "18:00" }])) as ReceptionistSettings["hours"],
  handoffEmail: "", handoffPhone: "", handoffRule: "",
});
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export function validateReceptionist(input: Record<string, unknown>): Result<ReceptionistSettings> {
  const name = cleanText(input.assistantName, { min: 1, max: 60 });
  const persona = oneOf(input.persona, PERSONAS);
  const greeting = cleanText(input.greeting, { max: 500 });
  const instructions = cleanText(input.instructions, { max: 6000 });
  const timezone = cleanText(input.timezone, { min: 1, max: 64 });
  const handoffEmail = cleanText(input.handoffEmail, { max: 254 });
  const handoffPhone = cleanText(input.handoffPhone, { max: 30 });
  const handoffRule = cleanText(input.handoffRule, { max: 1000 });
  if (!name.ok) return fail("rc_name");
  if (!persona.ok || !greeting.ok || !instructions.ok || !handoffRule.ok) return fail("invalid");
  if (!timezone.ok || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(timezone.value)) return fail("rc_timezone");
  if (!handoffEmail.ok || (handoffEmail.value && !EMAIL.test(handoffEmail.value))) return fail("rc_email");
  if (!handoffPhone.ok || (handoffPhone.value && !/^\+?[0-9 ()-]{6,30}$/.test(handoffPhone.value))) return fail("rc_phone");
  const languages = (Array.isArray(input.languages) ? input.languages : [input.languages]).filter((l): l is "es" | "en" => l === "es" || l === "en");
  if (!languages.length) return fail("rc_language");
  const hoursIn = (input.hours && typeof input.hours === "object" ? input.hours : {}) as Record<string, Record<string, unknown>>;
  const hours = {} as ReceptionistSettings["hours"];
  for (const day of DAYS) {
    const h = hoursIn[day] ?? {};
    const closed = h.closed === true || h.closed === "on";
    const open = typeof h.open === "string" ? h.open : "09:00";
    const close = typeof h.close === "string" ? h.close : "18:00";
    if (!TIME.test(open) || !TIME.test(close) || (!closed && open >= close)) return fail("rc_hours");
    hours[day] = { closed, open, close };
  }
  return ok({ assistantName: name.value, persona: persona.value, languages: Array.from(new Set(languages)), greeting: greeting.value, instructions: instructions.value, timezone: timezone.value, hours, handoffEmail: handoffEmail.value, handoffPhone: handoffPhone.value, handoffRule: handoffRule.value });
}

export function readReceptionist(settings: unknown): ReceptionistSettings | null {
  const value = settings && typeof settings === "object" ? (settings as Record<string, unknown>).receptionist : undefined;
  if (!value || typeof value !== "object") return null;
  const parsed = validateReceptionist(value as Record<string, unknown>);
  return parsed.ok ? parsed.value : null;
}

/** The exact system prompt a future AI adapter would receive. Deterministic and testable. */
export function buildReceptionistPrompt(settings: ReceptionistSettings, entries: { kind: string; question: string; answer: string }[]) {
  const dayNames: Record<Day, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
  const hours = DAYS.map(d => `- ${dayNames[d]}: ${settings.hours[d].closed ? "closed" : `${settings.hours[d].open}-${settings.hours[d].close}`}`).join("\n");
  const faqs = entries.filter(e => e.kind === "faq").map(e => `Q: ${e.question}\nA: ${e.answer}`).join("\n\n");
  const knowledge = entries.filter(e => e.kind === "knowledge").map(e => `## ${e.question}\n${e.answer}`).join("\n\n");
  return [
    `You are ${settings.assistantName}, a ${settings.persona} AI receptionist. Reply in: ${settings.languages.join(", ")}.`,
    "Never invent prices, availability or commitments. If unsure, offer a human handoff.",
    settings.greeting && `Greeting: ${settings.greeting}`,
    settings.instructions && `Instructions:\n${settings.instructions}`,
    `Business hours (${settings.timezone}):\n${hours}`,
    (settings.handoffEmail || settings.handoffPhone || settings.handoffRule) && `Human handoff: ${[settings.handoffRule, settings.handoffEmail, settings.handoffPhone].filter(Boolean).join(" · ")}`,
    faqs && `FAQ:\n${faqs}`,
    knowledge && `Knowledge base:\n${knowledge}`,
  ].filter(Boolean).join("\n\n");
}

/** Rough token estimate (~4 characters per token). Labelled as an estimate in the UI. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

// ─── Marketing Hub ──────────────────────────────────────────────────────────
export const CHANNELS = ["instagram", "facebook", "tiktok", "linkedin", "x", "youtube", "email", "blog", "ads", "other"] as const;
export const CONTENT_STATUSES = ["idea", "draft", "review", "approved", "planned", "published", "cancelled"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];
export const OPEN_CONTENT = (status: string) => status !== "published" && status !== "cancelled";

/** Calendar grid for a month: weeks starting Monday, ISO date strings or null padding. */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function parseMonth(value: unknown, today = new Date()): { year: number; month: number } {
  if (typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    const [year, month] = value.split("-").map(Number);
    if (year >= 2000 && year <= 2100) return { year, month };
  }
  return { year: today.getUTCFullYear(), month: today.getUTCMonth() + 1 };
}
export function shiftMonth({ year, month }: { year: number; month: number }, delta: number) {
  const index = year * 12 + (month - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

// ─── Search ─────────────────────────────────────────────────────────────────
/**
 * Normalize a user search term for PostgREST ilike/or filters. Characters that
 * carry meaning in filter syntax or LIKE patterns are replaced by spaces, so a
 * term can never add conditions or wildcards. Returns "" when too short.
 */
export function searchTerm(value: unknown, max = 80): string {
  if (typeof value !== "string") return "";
  const term = value.replace(/[\u0000-\u001f\u007f%_,().*\\"':]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return term.length >= 2 ? term : "";
}
