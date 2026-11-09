#!/usr/bin/env node
// acx — Avalon Code Exchange client. Develop Avalon OS indefinitely WITHOUT GitHub.
//
//   Agents (Codex, Claude, managers; token scopes code:deliver + code:pull):
//     acx sync [--dir <path>]            start from (or update to) the latest VERIFIED mainline
//     acx deliver --id <id> --module <m> --author <codex|claude_code|…> [--branch HEAD] [--notes "…"] [--offline <dir>]
//     acx my                             state and verification report of my deliveries
//   Integrator (Claude; scopes code:integrate + code:pull):
//     acx cycle [--auto-approve-safe] [--preview] [--backup-dir <dir>]
//         = review (verify, quarantine, dry merge) → integrate approved (merge + gates, one by one) → publish mainline
//           (bundle + green tests) → local backup → restore check from the exchange → optional Vercel Preview
//     acx review | integrate | publish [--full] | verify-restore | preview | inbox
//   Anyone with a code token:  acx status
//
// Configuration: <repo>/.avalon/exchange.json {url, publishableKey, preview?} or AVALON_EXCHANGE_URL / AVALON_EXCHANGE_KEY.
// Token: AVALON_BRIDGE_TOKEN (hashed locally; only the hash is sent) — or nothing, when a network proxy injects the
// X-Avalon-Bridge-Token header so the token never exists inside the sandbox. Never writes the token anywhere.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Node's fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1: re-exec once so sandboxes behind a proxy just work.
if (process.env.HTTPS_PROXY && process.env.NODE_USE_ENV_PROXY !== "1") {
  const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1", NODE_NO_WARNINGS: "1" } });
  process.exit(r.status ?? 1);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const PRODUCTION_REF = "ltbwzcrxeuczdhhtbqgm";
const CHUNK = 1048576;
const SENSITIVE_HINT = "migrations, auth/security, middleware, next.config, workflows, package manifests, scripts";

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = k => argv.includes("--" + k);
const opt = (k, d) => { const i = argv.indexOf("--" + k); return i > 0 && i + 1 < argv.length ? argv[i + 1] : d; };
const sha256 = b => createHash("sha256").update(b).digest("hex");
const log = (...m) => console.log(...m);
const die = (msg, code = 1) => { console.error("acx: " + msg); process.exit(code); };

const git = (args, o = {}) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 << 20, stdio: ["ignore", "pipe", o.quiet ? "ignore" : "pipe"], ...o }).trim();
const gitOk = (args, o = {}) => spawnSync("git", args, { encoding: "utf8", ...o }).status === 0;
const topLevel = (cwd = process.cwd()) => { try { return git(["rev-parse", "--show-toplevel"], { cwd, quiet: true }); } catch { return null; } };

function config(repo) {
  const file = repo && path.join(repo, ".avalon", "exchange.json");
  const fromFile = file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  const c = { ...fromFile, url: process.env.AVALON_EXCHANGE_URL || opt("url") || fromFile.url, publishableKey: process.env.AVALON_EXCHANGE_KEY || opt("key") || fromFile.publishableKey };
  if (!c.url || !c.publishableKey) die("exchange not configured: .avalon/exchange.json or AVALON_EXCHANGE_URL + AVALON_EXCHANGE_KEY");
  if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(c.url)) die("exchange url must be https://<ref>.supabase.co");
  if (c.url.includes(PRODUCTION_REF) && process.env.AVALON_EXCHANGE_PRODUCTION !== "approved-by-owner")
    die("refusing the PRODUCTION Supabase project without explicit owner approval (AVALON_EXCHANGE_PRODUCTION=approved-by-owner)");
  if (/service_role|sb_secret_/i.test(c.publishableKey)) die("only a publishable key may be used here");
  return c;
}

function client(c) {
  const tokenHash = process.env.AVALON_BRIDGE_TOKEN ? sha256(process.env.AVALON_BRIDGE_TOKEN) : null;
  async function rpc(fn, args = {}, tries = 4) {
    const body = { ...args, ...(tokenHash ? { p_token_sha256: tokenHash } : {}) };
    for (let i = 1; ; i++) {
      let res;
      try {
        res = await fetch(`${c.url}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: c.publishableKey, "content-type": "application/json" }, body: JSON.stringify(body) });
      } catch (e) { if (i < tries) { await new Promise(r => setTimeout(r, 500 * 2 ** i)); continue; } throw new Error(`${fn}: network error ${e.cause?.code ?? e.message}`); }
      const text = await res.text();
      if (res.ok) return text ? JSON.parse(text) : null;
      let err; try { err = JSON.parse(text); } catch { err = { message: text.slice(0, 200) }; }
      if (res.status >= 500 && i < tries) { await new Promise(r => setTimeout(r, 500 * 2 ** i)); continue; }
      const e = new Error(`${fn}: ${err.message ?? res.status}${err.code ? ` (${err.code})` : ""}`); e.code = err.code; e.status = res.status; throw e;
    }
  }
  async function upload(bytes) {
    const s = sha256(bytes); let r;
    for (let i = 0; i * CHUNK < bytes.length; i++) {
      r = await rpc("os_code_put_chunk", { p_sha256: s, p_size: bytes.length, p_index: i, p_data: bytes.subarray(i * CHUNK, (i + 1) * CHUNK).toString("base64") });
      if (r.deduplicated) break;
      if (r.error) throw new Error("upload rejected: " + r.error);
    }
    if (!r?.complete) throw new Error("upload incomplete");
    return s;
  }
  async function download(s) {
    const first = await rpc("os_code_get_chunk", { p_sha256: s, p_index: 0 });
    const parts = [Buffer.from(first.data, "base64")];
    for (let i = 1; i < first.chunks; i++) parts.push(Buffer.from((await rpc("os_code_get_chunk", { p_sha256: s, p_index: i })).data, "base64"));
    const bytes = Buffer.concat(parts);
    if (bytes.length !== first.size || sha256(bytes) !== s) throw new Error(`downloaded blob ${s.slice(0, 12)} failed its SHA-256 check`);
    return bytes;
  }
  return { rpc, upload, download };
}

const tmp = prefix => fs.mkdtempSync(path.join(os.tmpdir(), "acx-" + prefix + "-"));
const stateFile = repo => path.join(git(["rev-parse", "--git-dir"], { cwd: repo }).replace(/^(?!\/)/, repo + "/"), "acx-state.json");
const readState = repo => { try { return JSON.parse(fs.readFileSync(stateFile(repo), "utf8")); } catch { return {}; } };
const writeState = (repo, patch) => fs.writeFileSync(stateFile(repo), JSON.stringify({ ...readState(repo), ...patch }, null, 2));
const hasCommit = (repo, c) => gitOk(["cat-file", "-e", c + "^{commit}"], { cwd: repo });

// ── sync: build or update the local repository from the exchange only ──────────────────────────────────────────
async function sync(c, repo) {
  const ex = client(c);
  const head = await ex.rpc("os_code_head");
  if (!head.chain.length) die("the exchange has no mainline yet (an integrator must publish the first full snapshot)");
  if (!fs.existsSync(path.join(repo, ".git"))) { fs.mkdirSync(repo, { recursive: true }); git(["init", "-q", "-b", "main"], { cwd: repo }); }
  let fetched = 0;
  for (const e of head.chain) {
    if (hasCommit(repo, e.commit)) continue;
    const blob = e.parent && hasCommit(repo, e.parent) ? e.bundle_sha256 : (e.full_sha256 ?? e.bundle_sha256);
    const file = path.join(tmp("sync"), "m.bundle");
    fs.writeFileSync(file, await ex.download(blob));
    if (!gitOk(["bundle", "verify", file], { cwd: repo })) die(`bundle for mainline #${e.seq} cannot be applied (missing prerequisites)`);
    git(["fetch", "-q", "--no-tags", file, "+refs/acx/head:refs/acx/fetched"], { cwd: repo });
    if (git(["rev-parse", "refs/acx/fetched"], { cwd: repo }) !== e.commit) die(`mainline #${e.seq}: bundle tip is not ${e.commit}`);
    fetched++;
  }
  const tip = head.chain.at(-1);
  git(["update-ref", "refs/acx/mainline", tip.commit], { cwd: repo });
  gitOk(["update-ref", "-d", "refs/acx/fetched"], { cwd: repo });
  const fresh = !gitOk(["rev-parse", "--verify", "-q", "HEAD"], { cwd: repo });
  if (fresh) git(["reset", "-q", "--hard", tip.commit], { cwd: repo });
  else if (flag("checkout")) {
    if (!gitOk(["merge", "--ff-only", "-q", "refs/acx/mainline"], { cwd: repo })) die("local branch has diverged from mainline: rebase your work onto refs/acx/mainline");
  }
  writeState(repo, { mainline: { seq: tip.seq, commit: tip.commit, synced_at: new Date().toISOString() } });
  log(`OK mainline #${tip.seq} ${tip.commit.slice(0, 12)} (${fetched} bundle(s) fetched, each SHA-256 verified)${fresh ? " — working tree created" : " — available as refs/acx/mainline"}`);
  if (tip.preview_url) log(`   last Preview: ${tip.preview_url}`);
  return tip;
}

// ── tests: run the gate commands and parse node:test counts ────────────────────────────────────────────────────
function runGates(repo, gates) {
  const results = [];
  for (const g of gates) {
    const r = spawnSync(g[0], g.slice(1), { cwd: repo, encoding: "utf8", maxBuffer: 256 << 20, env: { ...process.env, CI: "1" } });
    const out = (r.stdout ?? "") + (r.stderr ?? "");
    const pass = [...out.matchAll(/^# pass (\d+)/gm)].reduce((a, m) => a + Number(m[1]), 0);
    const fail = [...out.matchAll(/^# fail (\d+)/gm)].reduce((a, m) => a + Number(m[1]), 0);
    results.push({ command: g.join(" "), exit: r.status, passed: pass, failed: fail, tail: r.status ? out.split("\n").slice(-25).join("\n") : undefined });
    if (r.status !== 0) break;
  }
  const ok = results.every(r => r.exit === 0 && r.failed === 0);
  return { ok, results, passed: results.reduce((a, r) => a + r.passed, 0), failed: results.reduce((a, r) => a + r.failed + (r.exit ? 1 : 0), 0) };
}
const gatesOf = c => c.gates ?? [["npx", "tsc", "--noEmit"], ["npx", "eslint", "."], ["npm", "test"]];

// ── deliver ─────────────────────────────────────────────────────────────────────────────────────────────────────
async function deliver(c, repo) {
  const id = opt("id"), moduleName = opt("module"), author = opt("author"), branch = opt("branch", "HEAD");
  if (!/^[a-z0-9][a-z0-9-]{5,62}$/.test(id ?? "")) die("--id: 6-63 chars, lowercase letters, digits and hyphens");
  if (!/^[a-z0-9-]{2,40}$/.test(moduleName ?? "")) die("--module: lowercase letters, digits and hyphens");
  if (gitOk(["status", "--porcelain", "--untracked-files=no"], { cwd: repo }) && git(["status", "--porcelain", "--untracked-files=no"], { cwd: repo })) die("commit your changes first (working tree has modifications)");
  const base = opt("base") ?? (gitOk(["rev-parse", "-q", "--verify", "refs/acx/mainline"], { cwd: repo }) ? "refs/acx/mainline" : die("no refs/acx/mainline: run acx sync first (or pass --base)"));
  const baseSha = git(["rev-parse", base + "^{commit}"], { cwd: repo }), tip = git(["rev-parse", branch + "^{commit}"], { cwd: repo });
  if (!gitOk(["merge-base", "--is-ancestor", baseSha, tip], { cwd: repo })) die(`${branch} does not descend from ${base}: run acx sync and rebase`);
  if (baseSha === tip) die("nothing to deliver: no commits after the mainline");
  let tests = { command: "not run (--skip-tests)", passed: 0, failed: 0 };
  if (!flag("skip-tests")) {
    log("running gates:", gatesOf(c).map(g => g.join(" ")).join(" · "));
    const g = runGates(repo, gatesOf(c));
    tests = { command: gatesOf(c).map(x => x.join(" ")).join(" && "), passed: g.passed, failed: g.failed };
    if (!g.ok && !flag("allow-failing")) die("gates failed — fix them or pass --allow-failing (the integrator will see it):\n" + (g.results.find(r => r.exit)?.tail ?? ""));
  }
  const out = tmp("deliver");
  // make-delivery bundles base..<ref>; a named ref keeps the bundle head readable for the receiver.
  git(["update-ref", "refs/acx/deliver", tip], { cwd: repo });
  const r = spawnSync("bash", [path.join(repo, "scripts/project-bridge/make-delivery.sh"), out, id, author ?? "", moduleName, opt("version", "1.0.0"), baseSha, "refs/acx/deliver",
    tests.command, String(tests.passed), String(tests.failed), opt("notes", "Delivered with acx; see commits for details.")], { cwd: repo, encoding: "utf8" });
  if (r.status !== 0) die("make-delivery failed: " + (r.stderr || r.stdout));
  const { buildZip } = require(path.join(repo, "tests/support/zip-builder.cjs"));
  const files = fs.readdirSync(path.join(out, id));
  const zip = buildZip(files.map(f => ({ name: `${id}/${f}`, data: fs.readFileSync(path.join(out, id, f)) })));
  const manifest = JSON.parse(fs.readFileSync(path.join(out, id, "DELIVERY.json"), "utf8"));
  if (opt("offline")) {
    const dst = path.join(path.resolve(opt("offline")), id + ".zip");
    fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, zip);
    log(`OK offline package ${dst}\n   sha256 ${sha256(zip)} — hand it to the integrator (acx ingest) or upload it in Avalon`);
    return;
  }
  const ex = client(c);
  const pkg = await ex.upload(zip);
  const s = await ex.rpc("os_code_submit", { p_manifest: manifest, p_package_sha256: pkg });
  log(`OK delivery ${id} submitted (${s.replayed ? "already submitted" : s.status}) — ${git(["rev-list", "--count", `${baseSha}..${tip}`], { cwd: repo })} commit(s), package ${pkg.slice(0, 12)}, tests ${tests.passed}/${tests.failed}`);
  log("   follow it with: acx my");
}

// ── integrator: review ─────────────────────────────────────────────────────────────────────────────────────────
const qid = d => `acx-${d.key.replace(/[^a-z0-9-]/g, "-")}-${d.id.slice(0, 8)}`.slice(0, 80);
async function review(c, repo, ex) {
  const queue = [...await ex.rpc("os_code_inbox", { p_status: "submitted" }), ...await ex.rpc("os_code_inbox", { p_status: "failed" })];
  const done = [];
  for (const d of queue) {
    await ex.rpc("os_code_set_status", { p_delivery: d.id, p_status: "verifying", p_report: { verifier: "acx review", started_at: new Date().toISOString() } });
    const dir = path.join(repo, ".avalon-deliveries", "acx", qid(d));
    fs.mkdirSync(dir, { recursive: true });
    const zip = path.join(dir, "package.zip");
    fs.writeFileSync(zip, await ex.download(d.package_sha256));
    const r = spawnSync(process.execPath, [path.join(repo, "scripts/project-bridge/receive-package.mjs"), zip, "--id", qid(d), "--module", d.module, "--author", d.author,
      "--expect-commit", d.delivery_commit, "--out", path.join(dir, "received")], { cwd: repo, encoding: "utf8" });
    let rep = {}; try { rep = JSON.parse(fs.readFileSync(path.join(dir, "received", "VERIFY_REPORT.json"), "utf8")); } catch { /* receive failed before verify */ }
    const ok = r.status === 0 && rep.verdict === "READY_FOR_HUMAN_REVIEW";
    const report = { verdict: ok ? rep.verdict : "REJECTED", quarantine: `refs/quarantine/${qid(d)}`, sensitive_paths: rep.sensitive_paths ?? [],
      conflicts: rep.conflicts ?? [], shared_files: rep.shared_files ?? [], warnings: (rep.warnings ?? []).slice(0, 20),
      failed_checks: (rep.checks ?? []).filter(x => !x.ok).map(x => x.name), changed_files: (rep.changed_files ?? []).length,
      receive_error: ok ? undefined : (r.stderr || r.stdout).split("\n").filter(Boolean).slice(-5).join(" | ").slice(0, 800) };
    if (!ok) { await ex.rpc("os_code_set_status", { p_delivery: d.id, p_status: "rejected", p_report: report }); log(`REJECTED ${d.key}: ${report.failed_checks.join(", ") || report.receive_error}`); done.push({ ...d, status: "rejected" }); continue; }
    await ex.rpc("os_code_set_status", { p_delivery: d.id, p_status: "ready_for_review", p_report: report });
    let status = "ready_for_review";
    if (flag("auto-approve-safe") && report.sensitive_paths.length === 0) {
      await ex.rpc("os_code_set_status", { p_delivery: d.id, p_status: "approved", p_report: { approved_rule: "no sensitive paths, verified, no conflicts" } });
      status = "approved";
    }
    log(`${status === "approved" ? "APPROVED" : "READY   "} ${d.key} (${d.author}) ${report.changed_files} file(s)${report.sensitive_paths.length ? ` — owner approval required: ${report.sensitive_paths.join(", ")}` : ""}`);
    done.push({ ...d, status });
  }
  if (!queue.length) log("no new deliveries");
  return done;
}

// ── integrator: integrate approved deliveries one by one, keeping only those that pass the gates ───────────────
async function integrate(c, repo, ex) {
  if (git(["status", "--porcelain", "--untracked-files=no"], { cwd: repo })) die("integration checkout must be clean");
  const head = await ex.rpc("os_code_head");
  const mainline = head.chain.at(-1)?.commit;
  if (mainline && !gitOk(["merge-base", "--is-ancestor", mainline, "HEAD"], { cwd: repo })) die("HEAD does not contain the published mainline: run acx sync --checkout");
  const approved = await ex.rpc("os_code_inbox", { p_status: "approved" });
  const merged = readState(repo).pending ?? [];
  for (const d of approved) {
    if (merged.includes(d.id)) continue;
    const ref = `refs/quarantine/${qid(d)}`;
    if (!gitOk(["rev-parse", "-q", "--verify", ref], { cwd: repo }) || git(["rev-parse", ref], { cwd: repo }) !== d.delivery_commit) {
      log(`SKIP ${d.key}: quarantine ref missing on this machine (run acx review first)`); continue;
    }
    const before = git(["rev-parse", "HEAD"], { cwd: repo });
    const m = spawnSync("git", ["merge", "--no-ff", "--no-edit", "-m", `merge(acx): ${d.key} by ${d.author} (${d.delivery_commit.slice(0, 7)}, approved ${d.approved_by})`, ref], { cwd: repo, encoding: "utf8" });
    if (m.status !== 0) {
      const conflicts = git(["diff", "--name-only", "--diff-filter=U"], { cwd: repo }).split("\n").filter(Boolean);
      git(["merge", "--abort"], { cwd: repo });
      await ex.rpc("os_code_set_status", { p_delivery: d.id, p_status: "failed", p_report: { integration: "merge_conflict", conflicts } });
      log(`FAILED ${d.key}: conflicts in ${conflicts.join(", ")}`); continue;
    }
    log(`merged ${d.key}; running gates…`);
    const g = runGates(repo, gatesOf(c));
    if (!g.ok) {
      git(["reset", "-q", "--hard", before], { cwd: repo });
      await ex.rpc("os_code_set_status", { p_delivery: d.id, p_status: "failed", p_report: { integration: "gates_failed", gates: g.results.map(({ tail, ...r }) => ({ ...r, tail: tail?.slice(-1500) })) } });
      log(`FAILED ${d.key}: gates (${g.results.find(r => r.exit)?.command}) — reverted`); continue;
    }
    merged.push(d.id);
    writeState(repo, { pending: merged, gates: { commit: git(["rev-parse", "HEAD"], { cwd: repo }), passed: g.passed, failed: 0, commands: g.results.map(r => r.command) } });
    log(`INTEGRATED ${d.key}: ${g.passed} tests passed`);
  }
  return merged;
}

// ── integrator: publish the verified HEAD as the next mainline entry, back it up and prove it can be restored ─────
async function publish(c, repo, ex) {
  const head = await ex.rpc("os_code_head");
  const parent = head.chain.at(-1)?.commit ?? null;
  const tip = git(["rev-parse", "HEAD"], { cwd: repo });
  if (parent === tip) { log("mainline already at HEAD; nothing to publish"); return null; }
  if (parent && !gitOk(["merge-base", "--is-ancestor", parent, tip], { cwd: repo })) die("HEAD does not descend from the mainline head");
  if (git(["status", "--porcelain", "--untracked-files=no"], { cwd: repo })) die("publish only committed work (working tree is dirty)");
  const st = readState(repo);
  let gates = st.gates?.commit === tip ? st.gates : null;
  if (!gates) { log("running gates on HEAD…"); const g = runGates(repo, gatesOf(c)); if (!g.ok) die("gates failed; mainline NOT published:\n" + (g.results.find(r => r.exit)?.tail ?? "")); gates = { commit: tip, passed: g.passed, failed: 0, commands: g.results.map(r => r.command) }; }
  const work = tmp("publish");
  git(["update-ref", "refs/acx/head", tip], { cwd: repo });
  const full = flag("full") || !parent || (head.chain.length >= 20);
  const inc = path.join(work, "incremental.bundle"), fullFile = path.join(work, "full.bundle");
  if (parent) git(["bundle", "create", "-q", inc, "refs/acx/head", "^" + parent], { cwd: repo });
  if (full) git(["bundle", "create", "-q", fullFile, "refs/acx/head"], { cwd: repo });
  const bundleBytes = fs.readFileSync(parent ? inc : fullFile);
  const bundleSha = await ex.upload(bundleBytes);
  const fullSha = full ? (parent ? await ex.upload(fs.readFileSync(fullFile)) : bundleSha) : null;
  const tests = { command: gates.commands.join(" && "), passed: gates.passed, failed: 0, commit: tip, at: new Date().toISOString() };
  const deliveries = (st.pending ?? []);
  const r = await ex.rpc("os_code_publish", { p_commit: tip, p_parent: parent, p_bundle_sha256: bundleSha, p_full_sha256: fullSha, p_tests: tests, p_deliveries: deliveries });
  writeState(repo, { pending: [], mainline: { seq: r.seq, commit: tip } });
  git(["update-ref", "refs/acx/mainline", tip], { cwd: repo });
  // Local backup next to the exchange copy: bundle + sha256 + manifest (restorable with git alone).
  const backupDir = path.resolve(opt("backup-dir", path.join(repo, ".avalon-backups")));
  fs.mkdirSync(backupDir, { recursive: true });
  const name = `avalon-mainline-${String(r.seq).padStart(5, "0")}-${tip.slice(0, 12)}`;
  const copies = [[parent ? inc : fullFile, `${name}${parent ? "" : "-full"}.bundle`], ...(full && parent ? [[fullFile, `${name}-full.bundle`]] : [])];
  for (const [src, dst] of copies) {
    fs.copyFileSync(src, path.join(backupDir, dst));
    fs.writeFileSync(path.join(backupDir, dst + ".sha256"), `${sha256(fs.readFileSync(src))}  ${dst}\n`);
  }
  fs.writeFileSync(path.join(backupDir, name + ".json"), JSON.stringify({ seq: r.seq, commit: tip, parent, bundle_sha256: bundleSha, full_sha256: fullSha, tests, deliveries,
    restore: parent ? `git fetch <full>.bundle +refs/acx/head:refs/acx/mainline, then each incremental in order` : `git clone ${name}-full.bundle avalon && git -C avalon checkout -b main FETCH_HEAD` }, null, 2));
  log(`PUBLISHED mainline #${r.seq} ${tip.slice(0, 12)} (${parent ? "incremental" : "full"}${full && parent ? " + full snapshot" : ""}, ${deliveries.length} delivery(ies), ${gates.passed} tests green)`);
  log(`   backup: ${backupDir}/${name}*`);
  return { ...r, commit: tip };
}

// Restore check: rebuild the mainline in an empty directory from the EXCHANGE ONLY and compare the tree.
async function verifyRestore(c, repo) {
  const dir = tmp("restore");
  const tip = await sync(c, path.join(dir, "r"));
  const ok = git(["rev-parse", "HEAD^{tree}"], { cwd: path.join(dir, "r") }) === git(["rev-parse", tip.commit + "^{tree}"], { cwd: repo });
  fs.rmSync(dir, { recursive: true, force: true });
  if (!ok) die("restore check FAILED: rebuilt tree differs");
  log(`RESTORE OK: an empty machine rebuilds mainline #${tip.seq} byte-identical from the exchange`);
  return tip;
}

// ── integrator: Vercel Preview of the mainline (never production) ───────────────────────────────────────────────
async function preview(c, repo, ex) {
  const p = c.preview;
  if (!p?.vercelOrg || !p?.vercelProject || !p?.supabaseUrl || !p?.publishableKey) die("preview not configured in .avalon/exchange.json");
  if (p.supabaseUrl.includes(PRODUCTION_REF)) die("refusing: Preview must use the isolated Supabase project");
  const head = await ex.rpc("os_code_head"); const tip = head.chain.at(-1);
  const src = tmp("preview");
  execFileSync("bash", ["-c", `git -C "${repo}" archive ${tip.commit} | tar -x -C "${src}"`]);
  const env = ["NEXT_PUBLIC_SUPABASE_URL=" + p.supabaseUrl, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=" + p.publishableKey];
  const args = ["-y", "vercel@65.11.0", "deploy", "--token", process.env.VERCEL_TOKEN ? process.env.VERCEL_TOKEN : "proxyinjected", "--yes", "--target", "preview",
    ...env.flatMap(e => ["--build-env", e, "--env", e]), "--meta", "avalonMainline=" + tip.seq];
  if (args.includes("--prod")) die("never --prod");
  log(`deploying mainline #${tip.seq} as a Vercel Preview (no Git metadata, isolated database)…`);
  const r = spawnSync("npx", args, { cwd: src, encoding: "utf8", env: { ...process.env, VERCEL_ORG_ID: p.vercelOrg, VERCEL_PROJECT_ID: p.vercelProject, VERCEL_TELEMETRY_DISABLED: "1" }, timeout: 1500000, maxBuffer: 64 << 20 });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  const url = /"url":\s*"(https:\/\/[a-z0-9-]+\.vercel\.app)"/.exec(out)?.[1] ?? /Preview\s+(https:\/\/[a-z0-9-]+\.vercel\.app)/.exec(out)?.[1];
  if (!url || !/"readyState":\s*"READY"/.test(out)) die("preview deploy did not reach READY:\n" + out.split("\n").slice(-15).join("\n"));
  if (/"target":\s*"production"/.test(out)) die("deployment reports a production target — investigate immediately");
  await ex.rpc("os_code_set_preview", { p_seq: tip.seq, p_url: url });
  log(`PREVIEW ${url} (mainline #${tip.seq}, READY, target preview)`);
  return url;
}

// ── main ────────────────────────────────────────────────────────────────────────────────────────────────────────
(async () => {
  if (!cmd || cmd === "help" || flag("help")) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 18).map(l => l.replace(/^\/\/ ?/, "")).join("\n")); return; }
  if (cmd === "sync") { const dir = path.resolve(opt("dir", topLevel() ?? ".")); await sync(config(topLevel(dir) ?? topLevel()), dir); return; }
  const repo = topLevel() ?? die("run inside a git checkout (or use acx sync --dir <path> first)");
  const c = config(repo); const ex = client(c);
  switch (cmd) {
    case "status": { const h = await ex.rpc("os_code_head"); const t = h.chain.at(-1); log(JSON.stringify({ token: h.token, mainline: t ? { seq: t.seq, commit: t.commit, tests: t.tests, preview: t.preview_url } : null, local: readState(repo) }, null, 2)); break; }
    case "deliver": await deliver(c, repo); break;
    case "my": for (const d of await ex.rpc("os_code_my_deliveries")) log(`${d.status.padEnd(16)} ${d.key}${d.integrated_commit ? " → " + d.integrated_commit.slice(0, 12) : ""}${d.review_note ? " — " + d.review_note : ""}${d.report?.conflicts?.length ? " conflicts: " + d.report.conflicts.join(", ") : ""}`); break;
    case "inbox": for (const d of await ex.rpc("os_code_inbox", { p_status: opt("status", null) })) log(`${d.status.padEnd(16)} ${d.key} ${d.author} ${d.module} ${d.delivery_commit.slice(0, 12)} ${d.report?.sensitive_paths?.length ? "SENSITIVE" : ""}`); break;
    case "review": await review(c, repo, ex); break;
    case "integrate": await integrate(c, repo, ex); break;
    case "publish": await publish(c, repo, ex); break;
    case "verify-restore": await verifyRestore(c, repo); break;
    case "preview": await preview(c, repo, ex); break;
    case "ingest": { // manual fallback: a package handed over by the owner becomes a normal delivery (needs code:deliver)
      const zip = argv[1]; const bytes = fs.readFileSync(zip); const load = require(path.join(HERE, "../creative-bridge/continuity-loader.cjs"));
      const { readZip } = load(path.join(repo, "src/lib/project-bridge/zip.ts")); const { BRIDGE_LIMITS } = load(path.join(repo, "src/lib/project-bridge/policy.ts"));
      const z = readZip(new Uint8Array(bytes), { ...BRIDGE_LIMITS, archiveBytes: 64 << 20, totalUncompressedBytes: 256 << 20, fileBytes: 64 << 20 });
      const m = z.ok && z.entries.find(e => /(^|\/)DELIVERY\.json$/.test(e.path));
      if (!m) die("package has no DELIVERY.json: use receive-package.mjs for foreign formats, then make-delivery");
      const manifest = JSON.parse(Buffer.from(m.bytes).toString("utf8"));
      const s = await ex.rpc("os_code_submit", { p_manifest: manifest, p_package_sha256: await ex.upload(bytes) });
      log(`OK ingested ${manifest.id} as a delivery (${s.status})`); break;
    }
    case "cycle": {
      const summary = { started_at: new Date().toISOString() };
      summary.reviewed = (await review(c, repo, ex)).map(d => ({ key: d.key, status: d.status }));
      summary.integrated = await integrate(c, repo, ex);
      const pending = await ex.rpc("os_code_inbox", { p_status: "ready_for_review" });
      summary.awaiting_owner = pending.map(d => ({ key: d.key, sensitive: d.report?.sensitive_paths }));
      const pub = await publish(c, repo, ex);
      summary.published = pub;
      if (pub) summary.restore = await verifyRestore(c, repo);
      if (pub && flag("preview")) summary.preview = await preview(c, repo, ex);
      summary.finished_at = new Date().toISOString();
      const out = path.join(repo, ".avalon-deliveries", "acx", `cycle-${summary.started_at.replace(/\D/g, "").slice(0, 14)}.json`);
      fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(summary, null, 2));
      log(`CYCLE done: ${summary.reviewed.length} reviewed, ${summary.integrated.length} integrated, ${summary.awaiting_owner.length} awaiting owner approval${pub ? `, mainline #${pub.seq}` : ""} → ${path.relative(repo, out)}`);
      if (summary.awaiting_owner.length) log(`   owner: approve in Avalon → Biblioteca → Código (${SENSITIVE_HINT})`);
      break;
    }
    default: die("unknown command " + cmd + " (acx help)");
  }
})().catch(e => die(e.message));
