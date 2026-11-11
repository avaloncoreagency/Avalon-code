#!/usr/bin/env node
// Avalon Project Bridge — send an exported project (ZIP) to the private library inbox, without GitHub.
//
//   AVALON_BRIDGE_TOKEN=avb_… node scripts/project-bridge/send-project.mjs ./mi-sitio.zip \
//     --url https://avaloncoreagency.com --category website --name "Landing Barbería" --tool claude_code
//
// The token is read ONLY from the environment (never from argv, so it does not land in shell history or `ps`).
// An owner then reviews and imports the project in Avalon OS → Biblioteca → "Recibidos por API".
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { randomUUID } from "node:crypto";

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith("--"));
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const base = (opt("url", process.env.AVALON_URL ?? "")).replace(/\/+$/, "");
const token = process.env.AVALON_BRIDGE_TOKEN ?? "";
if (!file || !file.toLowerCase().endsWith(".zip") || !base.startsWith("https://") || !/^avb_/.test(token)) {
  console.error("Usage: AVALON_BRIDGE_TOKEN=avb_… node send-project.mjs <file.zip> --url https://<avalon> [--category website|ecommerce|crm_creator|apps] [--name …] [--tool chatgpt|claude_code|codex|…]");
  process.exit(2);
}
const bytes = await readFile(file);
if (bytes.length > 25 * 1024 * 1024) { console.error("File exceeds 25 MB"); process.exit(2); }
const key = opt("key", randomUUID());
const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" };
const open = await fetch(`${base}/api/project-bridge/v1/imports`, { method: "POST", headers: auth,
  body: JSON.stringify({ fileName: basename(file), category: opt("category", "website"), projectName: opt("name", ""), sourceTool: opt("tool", "api"), idempotencyKey: key }) });
const o = await open.json();
if (!open.ok) { console.error("open failed:", open.status, o.error); process.exit(1); }
console.log("import", o.importId, o.status, o.replayed ? "(replayed)" : "");
if (o.status === "awaiting_upload") {
  const up = await fetch(o.upload.url, { method: o.upload.method, headers: o.upload.headers, body: bytes });
  if (!up.ok) { console.error("upload failed:", up.status, (await up.text()).slice(0, 200)); process.exit(1); }
  const done = await fetch(`${base}/api/project-bridge/v1/imports/${o.importId}`, { method: "POST", headers: auth, body: JSON.stringify({ uploaded: true }) });
  const d = await done.json();
  if (!done.ok) { console.error("confirm failed:", done.status, d.error); process.exit(1); }
  console.log("status:", d.status, "— an owner will review it in Avalon OS → Biblioteca");
}
