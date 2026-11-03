"use strict";
/**
 * Staging-only bounded poller for GitHub Actions (Node 22).
 * A cron run processes all five managers without paid AI/API calls.
 * The isolated Vercel endpoint validates the token and staging DB independently.
 */
const CODES = Object.freeze(["ren", "shin", "haru", "sora", "kenji"]);

function previewEndpoint(base) {
  if (typeof base !== "string") throw new Error("preview_url_missing");
  let url;
  try { url = new URL(base); } catch { throw new Error("preview_url_invalid"); }
  if (url.protocol !== "https:" || !url.hostname.endsWith(".vercel.app") ||
      url.hostname === "vercel.app" || url.username || url.password || url.port ||
      !["", "/"].includes(url.pathname) || url.search || url.hash)
    throw new Error("preview_url_must_be_vercel_preview");
  return new URL("/api/internal/office-manager-runner", url).toString();
}

function chooseManagers(value) {
  if (!value || value === "all") return [...CODES];
  if (!CODES.includes(value)) throw new Error("invalid_manager");
  return [value];
}

async function runStagingManagers({ baseUrl, token, bypassSecret = "", manager = "all", fetcher = fetch }) {
  const endpoint = previewEndpoint(baseUrl);
  if (typeof token !== "string" || token.length < 32) throw new Error("worker_token_missing");
  const results = [];
  for (const key of chooseManagers(manager)) {
    try {
      const headers = { "content-type": "application/json", authorization: `Bearer ${token}` };
      if (bypassSecret) headers["x-vercel-protection-bypass"] = bypassSecret;
      const res = await fetcher(endpoint, {
        method: "POST", redirect: "error", headers,
        body: JSON.stringify({ manager: key }), signal: AbortSignal.timeout(45000),
      });
      const result = await res.json().catch(() => null);
      const ok = res.ok && result?.manager === key &&
        ["completed", "duplicate"].includes(result?.scheduled) &&
        (result?.failures ?? 0) === 0;
      results.push({ manager: key, ok, status: res.status,
        scheduled: ok ? result.scheduled : "unavailable", processed: ok ? result.processed : 0 });
    } catch {
      results.push({ manager: key, ok: false, status: 0, scheduled: "unavailable", processed: 0 });
    }
  }
  return results;
}

if (require.main === module) {
  runStagingManagers({
    baseUrl: process.env.AVALON_MANAGER_PREVIEW_URL,
    token: process.env.AVALON_MANAGER_WORKER_TOKEN,
    bypassSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
    manager: process.env.MANAGER_CHOICE || "all",
  }).then(results => {
    for (const r of results) console.log(JSON.stringify(r));
    if (results.some(r => !r.ok)) process.exitCode = 1;
  }).catch(err => {
    // Never log tokens, URLs, request bodies or provider responses.
    console.error("Staging manager poller unavailable:", err instanceof Error ? err.message : "unknown");
    process.exitCode = 1;
  });
}
module.exports = { CODES, previewEndpoint, chooseManagers, runStagingManagers };
