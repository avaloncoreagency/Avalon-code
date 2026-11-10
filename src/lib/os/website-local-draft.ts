/**
 * Website Designer local rescue copy.
 *
 * The authoritative document remains public.os_website_pages under owner RLS.
 * These helpers never contact an API; the UI stores only unsaved text fields in
 * sessionStorage (same tab, owner+project+page+form scoped). No customer contacts,
 * cookies, access tokens or privileged database operations are stored here.
 */
export const WEBSITE_DRAFT_TTL_MS = 72 * 60 * 60 * 1000;
export const WEBSITE_DRAFT_MAX_BYTES = 24_000;
export const WEBSITE_DRAFT_FIELDS = [
  "heading", "subheading", "body", "items", "buttonLabel", "buttonHref",
  "title", "slug", "seo_description",
] as const;

export type WebsiteDraftField = typeof WEBSITE_DRAFT_FIELDS[number];
export type DraftFields = Partial<Record<WebsiteDraftField, string>>;
export type WebsiteDraft = {
  schema: 1;
  version: number;
  savedAt: number;
  baseline: DraftFields;
  values: DraftFields;
};

const supported = new Set<string>(WEBSITE_DRAFT_FIELDS);
const validId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const validScope = (scope: string) => scope === "meta" || /^block-[0-5]?[0-9]$/.test(scope);

export function websiteDraftKey(ownerId: string, projectId: string, pageId: string, scope: string): string {
  if (![ownerId, projectId, pageId].every(validId) || !validScope(scope))
    throw new Error("invalid_draft_scope");
  return `avalon:website:v1:${ownerId}:${projectId}:${pageId}:${scope}`;
}

const fieldsValid = (fields: unknown): fields is DraftFields => {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return false;
  const entries = Object.entries(fields);
  return entries.length > 0 && entries.length <= WEBSITE_DRAFT_FIELDS.length &&
    entries.every(([name, value]) =>
      supported.has(name) && typeof value === "string" && value.length <= 11_000);
};

export function parseWebsiteDraft(raw: string | null, now: number): WebsiteDraft | null {
  if (!raw || raw.length > WEBSITE_DRAFT_MAX_BYTES || !Number.isFinite(now)) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const d = parsed as Partial<WebsiteDraft>;
    if (d.schema !== 1 || !Number.isSafeInteger(d.version) || (d.version ?? 0) < 1 ||
        !Number.isFinite(d.savedAt) || (d.savedAt ?? 0) > now + 120_000 ||
        (d.savedAt ?? 0) < now - WEBSITE_DRAFT_TTL_MS ||
        !fieldsValid(d.baseline) || !fieldsValid(d.values)) return null;
    const a = Object.keys(d.baseline).sort();
    const b = Object.keys(d.values).sort();
    if (a.join("|") !== b.join("|")) return null;
    return d as WebsiteDraft;
  } catch {
    return null;
  }
}

function normal(name: WebsiteDraftField, value: string): string {
  const text = value.replace(/\r\n/g, "\n").trim();
  return name === "items"
    ? text.split("\n").map(s => s.trim()).filter(Boolean).join("\n")
    : text;
}

export function equalDraftFields(a: DraftFields, b: DraftFields, names: readonly WebsiteDraftField[]): boolean {
  return names.every(name => normal(name, a[name] ?? "") === normal(name, b[name] ?? ""));
}

export function makeWebsiteDraft(version: number, baseline: DraftFields, values: DraftFields, now: number): WebsiteDraft | null {
  if (!Number.isSafeInteger(version) || version < 1 || !Number.isFinite(now) ||
      !fieldsValid(baseline) || !fieldsValid(values)) return null;
  const snapshot = { schema: 1 as const, version, savedAt: now, baseline, values };
  return JSON.stringify(snapshot).length <= WEBSITE_DRAFT_MAX_BYTES ? snapshot : null;
}

/** Never apply a local draft silently when server version or baseline changed. */
export function reconcileWebsiteDraft(
  draft: WebsiteDraft | null,
  serverVersion: number,
  serverFields: DraftFields,
  names: readonly WebsiteDraftField[],
): "none" | "confirmed" | "restore" | "conflict" {
  if (!draft) return "none";
  // Successful server save is the sole confirmation needed to remove the rescue
  // copy: the persisted content now matches what was being edited locally.
  if (equalDraftFields(draft.values, serverFields, names)) return "confirmed";
  if (draft.version !== serverVersion ||
      !equalDraftFields(draft.baseline, serverFields, names)) return "conflict";
  return "restore";
}
