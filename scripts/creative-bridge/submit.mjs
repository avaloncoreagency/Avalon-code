#!/usr/bin/env node
// One job -> one signed handoff. No owner cookies, no Supabase keys in agents.
// Usage: npm run creative:submit -- /private/path/to/handoff.json
import { createHmac, createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const MAX_BYTES = 8192;
const manifestPath = process.argv[2];
const endpointText = process.env.AVALON_CREATIVE_BRIDGE_ENDPOINT;
const keyId = process.env.AVALON_CREATIVE_BRIDGE_KEY_ID;
const secretText = process.env.AVALON_CREATIVE_BRIDGE_SECRET_B64;
if (!manifestPath || !endpointText || !keyId || !secretText) {
  console.error("Missing manifest path or bridge integration configuration (not an owner login).");
  process.exitCode = 2;
} else {
  try {
    const endpoint = new URL(endpointText);
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password ||
        endpoint.search || endpoint.hash ||
        endpoint.pathname !== "/api/creative-bridge/deliveries") throw Error("invalid_endpoint");
    if (!/^[a-z][a-z0-9_-]{1,39}$/.test(keyId)) throw Error("invalid_key_id");
    const key = Buffer.from(secretText, "base64");
    if (key.length < 32 || key.toString("base64") !== secretText) throw Error("invalid_integration_key");
    const fullPath = resolve(manifestPath);
    const info = await stat(fullPath);
    if (!info.isFile() || info.size > MAX_BYTES) throw Error("invalid_manifest_size");
    const original = await readFile(fullPath);
    // Canonical compact JSON is signed and transmitted byte-identically.
    const body = Buffer.from(JSON.stringify(JSON.parse(original.toString("utf8"))), "utf8");
    if (body.byteLength > MAX_BYTES) throw Error("invalid_manifest_size");
    const timestamp = String(Math.floor(Date.now() / 1000));
    const digest = createHash("sha256").update(body).digest("hex");
    const message = `v1\n${timestamp}\n${keyId}\n${digest}`;
    const sig = "v1=" + createHmac("sha256", key).update(message).digest("hex");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST", signal: controller.signal, redirect: "error",
        headers: {
          "content-type": "application/json", "x-avalon-key-id": keyId,
          "x-avalon-timestamp": timestamp, "x-avalon-signature": sig,
        },
        body,
      });
    } finally { clearTimeout(timeout); }
    // Only display a bounded status/receipt; never log customer manifest or key.
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Avalon registration rejected:", response.status, String(result.error || "unavailable").slice(0, 80));
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify({
        status: result.status, created: result.created, lead_created: result.lead_created,
        project_path: result.product_path, company_path: result.company_path,
      }));
    }
  } catch (err) {
    console.error("Avalon delivery not registered:", err?.name === "AbortError" ? "timeout" : String(err?.message || "error").slice(0, 100));
    process.exitCode = 1;
  }
}
