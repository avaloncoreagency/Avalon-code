import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const MAX_DELIVERY_BYTES = 8192;
export const MAX_CLOCK_SKEW_SECONDS = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REF = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/;
const KEY_ID = /^[a-z][a-z0-9_-]{1,39}$/;
export type CreativeModule = "website" | "ecommerce" | "crm_creator";
export type CreativeAgent = "codex" | "claude";
export type CreativeDelivery = {
  schema_version: 1;
  provider: "higgsfield";
  module: CreativeModule;
  source_ref: string;
  company_name: string;
  existing_lead_id: string | null;
  product_name: string;
  description: string;
  project_url: string;
  repository_url: string;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
  return value as Record<string, unknown>;
}
function string(value: unknown, max: number, required = false): string {
  if (typeof value !== "string" || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new Error("invalid");
  const trimmed = value.trim();
  if (trimmed.length > max || (required && !trimmed)) throw new Error("invalid");
  return trimmed;
}
function stableUrl(value: unknown): string {
  if (value == null || value === "") return "";
  const raw = string(value, 500, true);
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("invalid"); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      host.endsWith(".internal") || host.includes(":") || /^\d+(\.\d+){3}$/.test(host)) throw new Error("invalid");
  return url.toString();
}

export function parseCreativeDelivery(value: unknown): CreativeDelivery {
  const item = record(value);
  const fields = ["schema_version", "provider", "module", "source_ref", "company_name",
    "existing_lead_id", "product_name", "description", "project_url", "repository_url"];
  if (Object.keys(item).some(k => !fields.includes(k))) throw new Error("invalid");
  if (item.schema_version !== 1 || item.provider !== "higgsfield" ||
      !["website", "ecommerce", "crm_creator"].includes(String(item.module))) throw new Error("invalid");
  const source_ref = string(item.source_ref, 120, true);
  if (!REF.test(source_ref)) throw new Error("invalid");
  const rawCompany = string(item.company_name, 200, true);
  if (/[\u0000-\u001f\u007f]/.test(rawCompany)) throw new Error("invalid");
  const company_name = rawCompany.replace(/\s+/g, " ");
  if (company_name.includes("@")) throw new Error("invalid"); // No contact addresses in company metadata.
  const existing_lead_id = item.existing_lead_id == null || item.existing_lead_id === ""
    ? null : string(item.existing_lead_id, 36, true);
  if (existing_lead_id && !UUID.test(existing_lead_id)) throw new Error("invalid");
  const project_url = stableUrl(item.project_url);
  const repository_url = stableUrl(item.repository_url);
  if (!project_url && !repository_url) throw new Error("invalid");
  return {
    schema_version: 1, provider: "higgsfield", module: item.module as CreativeModule,
    source_ref, company_name, existing_lead_id, product_name: string(item.product_name, 120, true),
    description: string(item.description ?? "", 2000), project_url, repository_url,
  };
}

export function signingMessage(body: Uint8Array, timestamp: string, keyId: string): string {
  const digest = createHash("sha256").update(body).digest("hex");
  return `v1\n${timestamp}\n${keyId}\n${digest}`;
}

export function signature(body: Uint8Array, timestamp: string, keyId: string, key: Uint8Array): string {
  return "v1=" + createHmac("sha256", key).update(signingMessage(body, timestamp, keyId)).digest("hex");
}

type BridgeKey = { agent: CreativeAgent; secret_b64: string };
export function authenticateCreativeDelivery(
  body: Uint8Array, headers: { get(name: string): string | null },
  keysJson: string | undefined, nowMillis: number,
): { agent: CreativeAgent; keyId: string } | null {
  const keyId = headers.get("x-avalon-key-id") ?? "";
  const timestamp = headers.get("x-avalon-timestamp") ?? "";
  const signed = headers.get("x-avalon-signature") ?? "";
  if (!KEY_ID.test(keyId) || !/^\d{10}$/.test(timestamp) || !/^v1=[0-9a-f]{64}$/.test(signed) ||
      body.byteLength > MAX_DELIVERY_BYTES ||
      Math.abs(nowMillis / 1000 - Number(timestamp)) > MAX_CLOCK_SKEW_SECONDS || !keysJson) return null;
  try {
    const keys = record(JSON.parse(keysJson));
    const credential = record(keys[keyId]) as BridgeKey;
    if (!["codex", "claude"].includes(credential.agent) || typeof credential.secret_b64 !== "string") return null;
    const key = Buffer.from(credential.secret_b64, "base64");
    if (key.length < 32 || key.toString("base64") !== credential.secret_b64) return null;
    const expected = Buffer.from(signature(body, timestamp, keyId, key).slice(3), "hex");
    const received = Buffer.from(signed.slice(3), "hex");
    return timingSafeEqual(expected, received) ? { agent: credential.agent, keyId } : null;
  } catch { return null; }
}
