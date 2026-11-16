#!/usr/bin/env node
// Avalon Project Bridge: upload for owner review, never automatic publication.
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';

const USAGE = 'Usage: AVALON_BRIDGE_TOKEN=avb_... node scripts/project-bridge/send-project.mjs <file.zip> --url https://avaloncoreagency.com [--category website|ecommerce|crm_creator|apps] [--name NAME] [--tool claude_code|codex|higgsfield|manual|api] [--key IDEMPOTENCY_KEY]';
const args = process.argv.slice(2);
const values = new Map();
let file = null;
for (let i = 0; i < args.length; i++) {
  const value = args[i];
  if (value.startsWith('--')) {
    const key = value.slice(2);
    if (!['url', 'category', 'name', 'tool', 'key'].includes(key) || values.has(key) || !args[i + 1] || args[i + 1].startsWith('--')) {
      console.error(USAGE);
      process.exit(2);
    }
    values.set(key, args[++i]);
  } else if (file === null) {
    file = value;
  } else {
    console.error(USAGE);
    process.exit(2);
  }
}
const rawBase = values.get('url') ?? process.env.AVALON_URL ?? '';
const token = process.env.AVALON_BRIDGE_TOKEN ?? '';
function originOf(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/+$/, '') !== '') return null;
    return url.origin;
  } catch { return null; }
}
const base = originOf(rawBase);
const key = values.get('key') ?? randomUUID();
if (!file || !file.toLowerCase().endsWith('.zip') || !base || !/^avb_[A-Za-z0-9_-]{20,80}$/.test(token) || key.length < 8 || key.length > 100) {
  console.error(USAGE);
  process.exit(2);
}
const auth = { authorization: 'Bearer ' + token, 'content-type': 'application/json' };
async function request(url, init, timeoutMs = 20_000) {
  return fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
}
async function responseJson(response) {
  try { return await response.json(); } catch { throw Error('invalid_provider_json'); }
}
function statusError(step, response, body) {
  const code = typeof body?.error === 'string' ? body.error.slice(0, 80) : 'unknown';
  throw Error(step + '_http_' + response.status + ':' + code);
}
async function main() {
  const bytes = await readFile(file);
  if (!bytes.length || bytes.length > 25 * 1024 * 1024) throw Error('zip_size_invalid');
  const opened = await request(base + '/api/project-bridge/v1/imports', {
    method: 'POST', headers: auth,
    body: JSON.stringify({
      fileName: basename(file), category: values.get('category') ?? 'website',
      projectName: values.get('name') ?? '', sourceTool: values.get('tool') ?? 'api',
      idempotencyKey: key,
    }),
  });
  const body = await responseJson(opened);
  if (!opened.ok) statusError('open', opened, body);
  if (typeof body.importId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.importId)) throw Error('invalid_import_id');
  const importId = body.importId;
  console.log('import', importId, body.status, body.replayed ? '(replayed)' : '');
  if (body.status !== 'awaiting_upload') {
    if (['received', 'processing', 'registered', 'duplicate'].includes(body.status)) {
      console.log('Already submitted; check the owner-only Avalon Library for the verified result.');
      return;
    }
    throw Error('unexpected_import_state');
  }
  const upload = body.upload;
  // Never forward upload headers to an unverified storage destination.
  if (!upload || upload.method !== 'POST' || typeof upload.url !== 'string') throw Error('invalid_upload_ticket');
  const storageUrl = new URL(upload.url);
  const configuredStorageUrl = process.env.AVALON_BRIDGE_STORAGE_ORIGIN;
  if (storageUrl.protocol !== 'https:' || storageUrl.username || storageUrl.password || storageUrl.hash ||
      storageUrl.pathname !== '/storage/v1/object/avalon-projects/inbox/' + importId + '.zip' ||
      storageUrl.search || !configuredStorageUrl || originOf(configuredStorageUrl) !== storageUrl.origin) {
    throw Error('untrusted_upload_destination: set AVALON_BRIDGE_STORAGE_ORIGIN to the expected Supabase HTTPS origin');
  }
  if (!upload.headers || typeof upload.headers !== 'object' || Array.isArray(upload.headers)) throw Error('invalid_upload_headers');
  const permitted = ['apikey', 'authorization', 'content-type', 'x-upsert'];
  if (Object.keys(upload.headers).some(h => !permitted.includes(h.toLowerCase()))) throw Error('unexpected_upload_header');
  const uploaded = await request(storageUrl.href, { method: 'POST', headers: upload.headers, body: bytes }, 90_000);
  if (!uploaded.ok) throw Error('upload_http_' + uploaded.status);
  const confirmed = await request(base + '/api/project-bridge/v1/imports/' + importId, {
    method: 'POST', headers: auth, body: JSON.stringify({ uploaded: true }),
  });
  const result = await responseJson(confirmed);
  if (!confirmed.ok) statusError('confirm', confirmed, result);
  console.log('status:', result.status, '- an owner reviews the archive in Avalon OS > Library');
}
main().catch(error => {
  // Never log response bodies or token-bearing URLs.
  console.error('Project Bridge:', error?.name === 'TimeoutError' ? 'timeout' : String(error?.message ?? 'unknown_failure'));
  process.exitCode = 1;
});
