#!/usr/bin/env node
// Avalon Direct Bridge — receive a package exactly as another tool produced it (e.g. Codex's downloadable ZIP) and
// verify it, so the owner never has to run Git, compute hashes or write manifests.
//
//   node scripts/project-bridge/receive-package.mjs <package.zip|dir> --id <id> --module <module> [--author codex] [--expect-commit <sha>]
//
// 1. A ZIP is extracted with the bridge's defensive reader (traversal, symlinks, bombs, ZIP64… refused) into a
//    quarantine folder; nothing inside is executed.
// 2. It finds a Git bundle (preferred) or patch, any checksum files (sha256sum format, SHA256SUMS, *.sha256) and
//    verifies every hash they declare.
// 3. If the package has no DELIVERY.json (Avalon contract), one is synthesized from Git facts only: bundle heads and
//    prerequisites, commit counts, changed files. Claims the package makes (tests passed…) are copied as DECLARED.
// 4. It runs verify-delivery.mjs (quarantine ref, base check, secrets, dry merge) and writes a report.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const repo = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const load = require(path.join(repo, "scripts/creative-bridge/continuity-loader.cjs"));
const { readZip } = load(path.join(repo, "src/lib/project-bridge/zip.ts"));
const { BRIDGE_LIMITS } = load(path.join(repo, "src/lib/project-bridge/policy.ts"));

const args = process.argv.slice(2);
const input = args.find(a => !a.startsWith("--") && !["--id", "--module", "--author", "--expect-commit", "--out"].includes(args[args.indexOf(a) - 1]));
const opt = (k, d) => (args.includes("--" + k) ? args[args.indexOf("--" + k) + 1] : d);
const id = opt("id"), moduleName = opt("module"), author = opt("author", "codex"), expect = opt("expect-commit");
if (!input || !id || !moduleName) { console.error("usage: receive-package.mjs <package.zip|dir> --id <id> --module <module> [--author codex] [--expect-commit <sha>]"); process.exit(2); }
const out = path.resolve(opt("out", path.join(repo, ".avalon-deliveries", id)));
const sha = b => createHash("sha256").update(b).digest("hex");
const log = (...m) => console.log(...m);

// 1. Quarantine extraction (ZIP) or copy (directory)
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const files = new Map();
if (fs.statSync(input).isDirectory()) {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isSymbolicLink() ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(input)) files.set(path.relative(input, f).split(path.sep).join("/"), fs.readFileSync(f));
} else {
  // Code packages are larger than site archives: same defenses, wider size limits.
  const limits = { ...BRIDGE_LIMITS, archiveBytes: 300 * 1024 * 1024, totalUncompressedBytes: 600 * 1024 * 1024, fileBytes: 250 * 1024 * 1024, entries: 20000 };
  const z = readZip(new Uint8Array(fs.readFileSync(input)), limits);
  if (!z.ok) { console.error("REJECTED package:", z.reason, z.detail ?? ""); process.exit(1); }
  for (const e of z.entries) files.set(e.path, Buffer.from(e.bytes));
}
for (const [p, b] of files) { const dst = path.join(out, "pkg", p); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, b); }
log(`extracted ${files.size} files into quarantine ${path.relative(repo, out)}/pkg`);

// 2. Artifacts and checksums
const names = [...files.keys()];
const bundles = names.filter(n => /\.bundle$/i.test(n));
const patches = names.filter(n => /\.(patch|diff)$/i.test(n));
const sumFiles = names.filter(n => /(^|\/)(SHA256SUMS|checksums?(\.txt)?|.*\.sha256)$/i.test(n));
let declared = 0, mismatched = [];
for (const sf of sumFiles) {
  for (const line of files.get(sf).toString("utf8").split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line.trim()) ?? /^SHA256 \((.+)\) = ([0-9a-fA-F]{64})$/.exec(line.trim())?.slice(0).reverse();
    if (!m) continue;
    const [hash, name] = /^[0-9a-fA-F]{64}$/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
    const base = path.posix.join(path.posix.dirname(sf), name.replace(/^\.\//, ""));
    const target = files.has(base) ? base : names.find(n => n.endsWith("/" + name) || n === name);
    declared++;
    if (!target || sha(files.get(target)) !== hash.toLowerCase()) mismatched.push(name);
  }
}
log(`artifacts: ${bundles.length} bundle(s), ${patches.length} patch(es); checksums declared ${declared}, mismatched ${mismatched.length}`);
if (mismatched.length) { console.error("REJECTED: checksum mismatch for", mismatched.join(", ")); process.exit(1); }
if (!bundles.length && !patches.length) { console.error("REJECTED: the package contains no Git bundle or patch"); process.exit(1); }

// 3. Delivery manifest (use the package's own DELIVERY.json when it follows the contract; otherwise synthesize)
const deliveryDir = path.join(out, "delivery");
fs.mkdirSync(deliveryDir, { recursive: true });
const artifactName = bundles[0] ?? patches[0];
const artifactFile = id + (artifactName.endsWith(".bundle") ? ".bundle" : ".patch");
fs.writeFileSync(path.join(deliveryDir, artifactFile), files.get(artifactName));
const own = names.find(n => /(^|\/)DELIVERY\.json$/.test(n));
let manifest;
if (own) {
  manifest = JSON.parse(files.get(own).toString("utf8"));
  manifest.artifact = { file: artifactFile, sha256: sha(files.get(artifactName)) };
  // The receiver names the quarantine: two senders may reuse the same id. The sender's id is kept for traceability.
  if (manifest.id !== id) { manifest.original_id = manifest.id; manifest.id = id; }
  log("using the package's own DELIVERY.json");
} else {
  let base = null, tip = null, changes = [];
  if (artifactFile.endsWith(".bundle")) {
    const abs = path.join(deliveryDir, artifactFile);
    const heads = execFileSync("git", ["bundle", "list-heads", abs], { cwd: repo, encoding: "utf8" }).trim().split("\n").filter(Boolean).map(l => l.split(" "));
    tip = (expect ? heads.find(([s]) => s.startsWith(expect)) : heads.find(([, r]) => r !== "HEAD"))?.[0] ?? heads[0]?.[0];
    const v = spawnSync("git", ["bundle", "verify", abs], { cwd: repo, encoding: "utf8" });
    const prereq = /requires (?:these \d+ refs|this ref):?\n([0-9a-f]{40})/.exec(v.stdout + v.stderr) ?? /([0-9a-f]{40})\s*$/m.exec((v.stdout + v.stderr).split("requires")[1] ?? "");
    base = prereq?.[1] ?? null;
    if (v.status !== 0) {
      const missing = [...(v.stderr || "").matchAll(/([0-9a-f]{40})/g)].map(m => m[1]);
      console.error("BLOCKED: the bundle needs commits that are not in this repository:", missing.slice(0, 5).join(", "));
      console.error("Ask the author for a FULL bundle (git bundle create x.bundle --all) or one based on a commit we have.");
      fs.writeFileSync(path.join(out, "RECEIVE_REPORT.json"), JSON.stringify({ id, verdict: "BLOCKED_MISSING_BASE", missing }, null, 2));
      process.exit(1);
    }
    // Objects are needed locally to list the changed files (and, for a full bundle, to find the base). Importing them
    // into a probe ref executes nothing; the probe ref is deleted below and verify-delivery re-imports into quarantine.
    execFileSync("git", ["fetch", "-q", "--no-tags", abs, `+${heads.find(([s]) => s === tip)[1]}:refs/quarantine/${id}-probe`], { cwd: repo });
    if (!base) base = execFileSync("git", ["merge-base", "HEAD", tip], { cwd: repo, encoding: "utf8" }).trim(); // full bundle
  }
  const declaredTests = names.map(n => /test|report|result/i.test(n) && /\.(json|txt|md|log)$/i.test(n) ? files.get(n).toString("utf8") : "").join("\n");
  const passed = Number(/(\d+)\s*(?:tests?\s*)?(?:passed|pass|aprobad)/i.exec(declaredTests)?.[1] ?? 0);
  const failed = Number(/(\d+)\s*(?:tests?\s*)?(?:failed|fail|fallid)/i.exec(declaredTests)?.[1] ?? 0);
  manifest = {
    id, author, module: moduleName, version: "0.0.0-received", base_commit: base, delivery_commit: tip,
    artifact: { file: artifactFile, sha256: sha(files.get(artifactName)) },
    changes: tip && base ? execFileSync("git", ["diff", "--name-only", `${base}..${tip}`], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split("\n").filter(Boolean) : changes,
    dependencies: [], tests: { command: "declared by author", passed, failed }, review_status: "needs_review",
    evidence: names.filter(n => /\.(png|jpe?g|webp|log|md|txt|json)$/i.test(n)).slice(0, 50),
    integration_instructions: "Synthesized by receive-package.mjs from Git facts; review before integrating.",
    synthesized: true,
  };
  spawnSync("git", ["update-ref", "-d", `refs/quarantine/${id}-probe`], { cwd: repo });
  log("synthesized DELIVERY.json from Git facts");
}
fs.writeFileSync(path.join(deliveryDir, "DELIVERY.json"), JSON.stringify(manifest, null, 2));
fs.writeFileSync(path.join(deliveryDir, "SHA256SUMS"), `${manifest.artifact.sha256}  ${artifactFile}\n`);
if (expect && manifest.delivery_commit && !manifest.delivery_commit.startsWith(expect)) {
  console.error(`REJECTED: package tip ${manifest.delivery_commit} is not the expected commit ${expect}`); process.exit(1);
}

// 4. Full verification (quarantine ref, base, secrets, dry merge)
const r = spawnSync("node", [path.join(repo, "scripts/project-bridge/verify-delivery.mjs"), deliveryDir, "--report", path.join(out, "VERIFY_REPORT.json")], { cwd: repo, encoding: "utf8" });
process.stdout.write(r.stdout); process.stderr.write(r.stderr);
process.exit(r.status ?? 1);
