#!/usr/bin/env node
// Run one acx command with a SHORT-LIVED token minted by an owner's own Supabase session (RLS, never an admin key),
// then revoke it — so no long-lived integrator secret has to exist anywhere.
//   AVALON_OWNER_CREDS=<file.json {email,password} | {owner:{email,password}}> \
//   node scripts/gitless/owner-token-run.cjs --profile integrator|agent|pull [--hours 2] -- <command> [args…]
// The token travels to the child only through the AVALON_BRIDGE_TOKEN environment variable; it is never printed or
// written. The exchange URL/key come from .avalon/exchange.json (or AVALON_EXCHANGE_URL/KEY).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { createClient } = require('@supabase/supabase-js');

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
if (sep < 0) { console.error('usage: owner-token-run.cjs --profile integrator|agent|pull [--hours N] -- <command…>'); process.exit(2); }
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && i < sep ? argv[i + 1] : d; };
const PROFILES = { integrator: ['code:integrate', 'code:pull'], agent: ['code:deliver', 'code:pull'], pull: ['code:pull'] };
const scopes = PROFILES[opt('profile')];
if (!scopes) { console.error('--profile must be integrator, agent or pull'); process.exit(2); }
const hours = Math.min(24, Math.max(1, Number(opt('hours', 2))));
const repo = path.resolve(__dirname, '../..');
const cfg = JSON.parse(fs.readFileSync(path.join(repo, '.avalon/exchange.json'), 'utf8'));
const url = process.env.AVALON_EXCHANGE_URL || cfg.url, key = process.env.AVALON_EXCHANGE_KEY || cfg.publishableKey;
if (/ltbwzcrxeuczdhhtbqgm/.test(url) && process.env.AVALON_EXCHANGE_PRODUCTION !== 'approved-by-owner') { console.error('refusing production'); process.exit(3); }
const credFile = process.env.AVALON_OWNER_CREDS;
if (!credFile) { console.error('AVALON_OWNER_CREDS must point to a private (0600) file with the owner email/password'); process.exit(2); }
const raw = JSON.parse(fs.readFileSync(credFile, 'utf8'));
const who = raw.owner ?? raw;
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

(async () => {
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email: who.email, password: who.password });
  if (error) { console.error('owner sign-in failed:', error.message); process.exit(1); }
  const token = 'avb_' + crypto.randomBytes(24).toString('base64url');
  const name = `${opt('profile')} run ${new Date().toISOString().slice(0, 16)} (${crypto.randomBytes(2).toString('hex')})`;
  const ins = await sb.from('os_project_api_tokens').insert({ name, token_sha256: sha(token), prefix: token.slice(0, 8), scopes,
    expires_at: new Date(Date.now() + hours * 3600e3).toISOString(), created_by: data.user.id }).select('id').single();
  if (ins.error) { console.error('token creation refused (owner membership required):', ins.error.message); process.exit(1); }
  let status = 1;
  try {
    const r = spawnSync(argv[sep + 1], argv.slice(sep + 2), { stdio: 'inherit', env: { ...process.env, AVALON_BRIDGE_TOKEN: token, AVALON_EXCHANGE_URL: url, AVALON_EXCHANGE_KEY: key } });
    status = r.status ?? 1;
  } finally {
    const rv = await sb.from('os_project_api_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', ins.data.id).select('id');
    if (rv.error || rv.data?.length !== 1) { console.error(`WARNING: could not revoke token "${name}" — revoke it in Library → Tool API`); status = status || 1; }
    else console.error(`token "${name}" revoked`);
    await sb.auth.signOut();
  }
  process.exit(status);
})().catch(e => { console.error(e.message); process.exit(1); });
