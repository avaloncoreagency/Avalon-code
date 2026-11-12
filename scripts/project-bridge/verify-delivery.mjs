#!/usr/bin/env node
// Avalon Direct Bridge — verify a code delivery from another agent (Codex, Claude, managers) WITHOUT GitHub.
//
//   node scripts/project-bridge/verify-delivery.mjs <delivery-dir> [--report out.json] [--run-tests]
//
// <delivery-dir> must contain DELIVERY.json (docs/dev-bridge/DELIVERY_CONTRACT.md), SHA256SUMS and a Git bundle
// (preferred) or a patch. The verifier NEVER merges and NEVER runs received code unless --run-tests is given (and even
// then only inside a separate throw-away worktree with `npm ci --ignore-scripts`). Steps:
//   1 manifest schema · 2 checksums · 3 base commit known locally · 4 bundle fetched into refs/quarantine/<id>
//   (git fetch executes nothing) and its head = delivery_commit, descending from base_commit · 5 changed files,
//   sensitive paths, secrets in added lines · 6 overlap with local work + dry merge in a separate worktree → conflicts.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const repo = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const load = require(path.join(repo, "scripts/creative-bridge/continuity-loader.cjs"));
const { secretFindings } = load(path.join(repo, "src/lib/project-bridge/policy.ts"));

const args = process.argv.slice(2);
const dir = args.find(a => !a.startsWith("--"));
const reportPath = args.includes("--report") ? args[args.indexOf("--report") + 1] : null;
const runTests = args.includes("--run-tests");
if (!dir) { console.error("usage: verify-delivery.mjs <delivery-dir> [--report out.json] [--run-tests]"); process.exit(2); }

const git = (a, opts = {}) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
const tryGit = a => { try { return git(a); } catch { return null; } };
const sha = f => createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const report = { delivery_dir: path.resolve(dir), checked_at: new Date().toISOString(), checks: [], warnings: [], verdict: "REJECTED" };
const check = (name, ok, detail) => { report.checks.push({ name, ok, ...(detail ? { detail } : {}) }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + (typeof detail === "string" ? detail : JSON.stringify(detail)) : ""}`); return ok; };
const finish = () => {
  report.verdict = report.checks.every(c => c.ok) ? "READY_FOR_HUMAN_REVIEW" : "REJECTED";
  if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log("VERDICT", report.verdict);
  process.exit(report.verdict === "REJECTED" ? 1 : 0);
};

// 1. Manifest
const AUTHORS = ["codex", "claude_code", "higgsfield", "ren", "shin", "haru", "sora", "kenji", "miguel", "samuel"];
const REVIEW = ["submitted", "self_tested", "needs_review"];
let m;
try { m = JSON.parse(fs.readFileSync(path.join(dir, "DELIVERY.json"), "utf8")); } catch (e) { check("DELIVERY.json readable", false, e.message); finish(); }
const hex = (v, n) => typeof v === "string" && new RegExp(`^[0-9a-f]{${n}}$`).test(v);
const problems = [];
if (!/^[a-z0-9][a-z0-9-]{5,80}$/.test(m.id ?? "")) problems.push("id");
if (!AUTHORS.includes(m.author)) problems.push("author");
if (!/^[a-z0-9-]{2,40}$/.test(m.module ?? "")) problems.push("module");
if (!hex(m.base_commit, 40)) problems.push("base_commit (full 40-char sha)");
if (!hex(m.delivery_commit, 40)) problems.push("delivery_commit (full 40-char sha)");
if (!/^\d+\.\d+\.\d+([-.+][0-9A-Za-z.-]+)?$/.test(m.version ?? "")) problems.push("version (semver)");
if (!m.artifact || !/^[\w.-]+\.(bundle|patch)$/.test(m.artifact.file ?? "") || !hex(m.artifact.sha256, 64)) problems.push("artifact {file, sha256}");
if (!Array.isArray(m.changes) || m.changes.length === 0) problems.push("changes[]");
if (!Array.isArray(m.dependencies)) problems.push("dependencies[]");
if (!m.tests || !Number.isInteger(m.tests.passed) || !Number.isInteger(m.tests.failed) || typeof m.tests.command !== "string") problems.push("tests {command, passed, failed}");
if (!REVIEW.includes(m.review_status)) problems.push("review_status");
if (!Array.isArray(m.evidence)) problems.push("evidence[]");
if (typeof m.integration_instructions !== "string" || m.integration_instructions.length < 10) problems.push("integration_instructions");
if (!check("1 manifest follows the delivery contract", problems.length === 0, problems.length ? { missing_or_invalid: problems } : undefined)) finish();
if (m.tests.failed > 0) report.warnings.push(`author reports ${m.tests.failed} failing test(s)`);
report.delivery = { id: m.id, author: m.author, module: m.module, version: m.version, base: m.base_commit, commit: m.delivery_commit };

// 2. Checksums (every listed file, and the artifact hash declared in the manifest)
const sums = fs.existsSync(path.join(dir, "SHA256SUMS")) ? fs.readFileSync(path.join(dir, "SHA256SUMS"), "utf8").trim().split("\n").map(l => l.trim().split(/\s+\*?/)) : [];
const sumBad = sums.filter(([h, f]) => !f || f.includes("/") || f.includes("..") || !fs.existsSync(path.join(dir, f)) || sha(path.join(dir, f)) !== h).map(([, f]) => f);
const artifactPath = path.join(dir, m.artifact.file);
const artifactOk = fs.existsSync(artifactPath) && sha(artifactPath) === m.artifact.sha256 && sums.some(([h, f]) => f === m.artifact.file && h === m.artifact.sha256);
if (!check("2 SHA256SUMS and artifact hash match", sums.length > 0 && sumBad.length === 0 && artifactOk, sumBad.length || !artifactOk ? { mismatched: sumBad, artifact_ok: artifactOk } : { files: sums.length })) finish();

// 3. Base commit
if (!check("3 base commit exists in the local repository", !!tryGit(["cat-file", "-e", `${m.base_commit}^{commit}`]) || tryGit(["cat-file", "-t", m.base_commit]) === "commit", m.base_commit.slice(0, 12))) finish();

// 4. Import into a quarantine ref (no code runs; nothing touches the working branch)
const qref = `refs/quarantine/${m.id}`;
if (m.artifact.file.endsWith(".bundle")) {
  const v = spawnSync("git", ["bundle", "verify", artifactPath], { cwd: repo, encoding: "utf8" });
  if (!check("4a git bundle verify (prerequisites present locally)", v.status === 0, v.status ? v.stderr.trim().split("\n").slice(-2).join(" ") : undefined)) finish();
  const heads = git(["bundle", "list-heads", artifactPath]).split("\n").filter(Boolean).map(l => l.split(" "));
  const head = heads.find(([s]) => s === m.delivery_commit);
  if (!check("4b bundle contains delivery_commit as a head", !!head, heads.map(([s, r]) => `${s.slice(0, 12)} ${r}`))) finish();
  git(["fetch", "-q", "--no-tags", artifactPath, `+${head[1]}:${qref}`]);
} else {
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), "avalon-delivery-patch-"));
  git(["worktree", "add", "-q", "--detach", wt, m.base_commit]);
  const am = spawnSync("git", ["-c", "user.name=avalon-bridge", "-c", "user.email=bridge@avalon.invalid", "am", "-q", "--keep-cr", artifactPath], { cwd: wt, encoding: "utf8" });
  const got = am.status === 0 ? execFileSync("git", ["rev-parse", "HEAD"], { cwd: wt, encoding: "utf8" }).trim() : null;
  if (got) git(["update-ref", qref, got]);
  git(["worktree", "remove", "--force", wt]);
  if (!check("4 patch applies cleanly on base_commit", am.status === 0, am.status ? am.stderr.slice(0, 200) : undefined)) finish();
  report.warnings.push("patch deliveries get new commit ids; delivery_commit cannot be byte-verified, only content (prefer a bundle)");
}
const tip = git(["rev-parse", qref]);
check("4c delivered tip descends from base_commit", !!tryGit(["merge-base", "--is-ancestor", m.base_commit, tip]) || spawnSync("git", ["merge-base", "--is-ancestor", m.base_commit, tip], { cwd: repo }).status === 0);
if (m.artifact.file.endsWith(".bundle")) check("4d quarantined tip == delivery_commit", tip === m.delivery_commit);

// 5. Changes, sensitive paths, secrets
const changed = git(["diff", "--name-status", `${m.base_commit}..${tip}`]).split("\n").filter(Boolean).map(l => l.split("\t"));
report.changed_files = changed.map(([s, f, g]) => ({ status: s, path: g ?? f }));
const SENSITIVE = [/^supabase\/migrations\//, /^src\/lib\/(auth|security|supabase)\//, /^src\/middleware\.ts$/, /^next\.config\./, /^\.github\/workflows\//, /^package(-lock)?\.json$/, /^scripts\//, /\.env/];
report.sensitive_paths = report.changed_files.filter(f => SENSITIVE.some(r => r.test(f.path))).map(f => f.path);
if (report.sensitive_paths.length) report.warnings.push("touches sensitive paths (needs explicit owner/security review): " + report.sensitive_paths.join(", "));
const added = git(["diff", "-U0", `${m.base_commit}..${tip}`]).split("\n").filter(l => l.startsWith("+") && !l.startsWith("+++")).join("\n");
const secrets = secretFindings(added);
check("5 no secrets in added lines", secrets.length === 0, secrets.length ? { kinds: secrets } : { added_lines: added.split("\n").length });
const declared = new Set((m.changes ?? []).map(c => (typeof c === "string" ? c : c.path)));
const undeclared = report.changed_files.map(f => f.path).filter(p => !declared.has(p));
if (undeclared.length) report.warnings.push(`files changed but not listed in changes[]: ${undeclared.slice(0, 20).join(", ")}`);

// 6. Overlap with local work and a dry merge in a SEPARATE worktree (the working branch is never touched)
const local = git(["rev-parse", "HEAD"]);
const mb = tryGit(["merge-base", local, tip]);
const ours = mb ? git(["diff", "--name-only", `${mb}..${local}`]).split("\n").filter(Boolean) : [];
report.shared_files = report.changed_files.map(f => f.path).filter(p => ours.includes(p));
const wt = fs.mkdtempSync(path.join(os.tmpdir(), "avalon-delivery-merge-"));
git(["worktree", "add", "-q", "--detach", wt, local]);
const merge = spawnSync("git", ["-c", "user.name=avalon-bridge", "-c", "user.email=bridge@avalon.invalid", "merge", "--no-commit", "--no-ff", tip], { cwd: wt, encoding: "utf8" });
report.conflicts = merge.status === 0 ? [] : execFileSync("git", ["diff", "--name-only", "--diff-filter=U"], { cwd: wt, encoding: "utf8" }).trim().split("\n").filter(Boolean);
check("6 dry merge onto the current branch (separate worktree)", merge.status === 0, merge.status === 0 ? { shared_files: report.shared_files } : { conflicts: report.conflicts });

if (runTests && merge.status === 0) {
  // Opt-in only. Received code runs here, in the throw-away worktree, without install scripts.
  const ci = spawnSync("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: wt, encoding: "utf8" });
  const t = ci.status === 0 ? spawnSync("npm", ["test"], { cwd: wt, encoding: "utf8", timeout: 15 * 60e3 }) : ci;
  const summary = (t.stdout ?? "").match(/^# (pass|fail) \d+/gm) ?? [];
  check("7 tests in the isolated worktree (opt-in)", t.status === 0, { summary });
} else report.warnings.push("tests not executed by the verifier (run with --run-tests in a sandbox to execute them)");
execFileSync("git", ["worktree", "remove", "--force", wt], { cwd: repo });
report.next_step = "Human review of the quarantine ref, then integrate with: git merge --no-ff " + qref;
finish();
