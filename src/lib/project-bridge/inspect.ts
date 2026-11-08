/**
 * Avalon Project Bridge — inspection: turns extracted files into a validated, content-addressed manifest.
 * Server only (node:crypto). Never executes, installs or builds anything; package.json scripts are only READ.
 */
import { createHash } from "node:crypto";
import { BRIDGE_LIMITS, filePolicy, isText, magicMismatch, mimeOf, secretFindings, type Category } from "./policy";
import { readZip, type ZipEntry, type ZipLimits } from "./zip";

export type ManifestFile = { path: string; size: number; sha256: string; mime: string };
export type Framework = "static" | "nextjs" | "react" | "vite" | "vue" | "svelte" | "astro" | "node" | "unknown";
export type Inspection = {
  files: ManifestFile[];
  totalBytes: number;
  framework: Framework;
  entry: string | null;
  /** sha256 over the sorted "path\0sha256" lines: identical content ⇒ identical digest, whatever the ZIP metadata. */
  contentDigest: string;
  suggestedCategory: Category;
  deployable: "static" | "needs_build" | "no";
  warnings: string[];
  skipped: string[];
  packageInfo: { name: string | null; dependencies: string[]; scripts: string[]; installScripts: string[] } | null;
};
export type InspectResult =
  | { ok: true; inspection: Inspection; blobs: Map<string, Uint8Array> }
  | { ok: false; reason: string; problems: { path: string; reason: string }[] };

/** OS clutter that ZIP tools add (Finder, Windows): skipped and reported, never an error. */
const JUNK = /(^|\/)(__MACOSX\/.*|\.DS_Store|Thumbs\.db|desktop\.ini|\._[^/]*)$/i;
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

function stripCommonRoot(entries: ZipEntry[]): ZipEntry[] {
  const roots = new Set(entries.map(e => (e.path.includes("/") ? e.path.split("/")[0] : "")));
  if (roots.size !== 1 || roots.has("")) return entries;
  const root = [...roots][0] + "/";
  return entries.map(e => ({ path: e.path.slice(root.length), bytes: e.bytes }));
}

export function inspectFiles(input: ZipEntry[]): InspectResult {
  const skipped: string[] = [];
  const kept = input.filter(e => { if (JUNK.test(e.path)) { skipped.push(e.path); return false; } return true; });
  const entries = stripCommonRoot(kept);
  const problems: { path: string; reason: string }[] = [];
  if (entries.length === 0) return { ok: false, reason: "empty_archive", problems };
  const blobs = new Map<string, Uint8Array>();
  const files: ManifestFile[] = [];
  let total = 0;
  const decoder = new TextDecoder("utf-8", { fatal: false });
  for (const e of entries) {
    const pol = filePolicy(e.path);
    if (!pol.ok) { problems.push({ path: e.path, reason: pol.reason }); continue; }
    if (e.bytes.length > BRIDGE_LIMITS.fileBytes) { problems.push({ path: e.path, reason: "file_too_large" }); continue; }
    if (magicMismatch(e.path, e.bytes)) { problems.push({ path: e.path, reason: "content_does_not_match_type" }); continue; }
    if (isText(e.path)) {
      const found = secretFindings(decoder.decode(e.bytes));
      if (found.length) { problems.push({ path: e.path, reason: "secret_detected:" + found.join(",") }); continue; }
    }
    const digest = sha256(e.bytes);
    blobs.set(digest, e.bytes);
    files.push({ path: e.path, size: e.bytes.length, sha256: digest, mime: mimeOf(e.path) });
    total += e.bytes.length;
  }
  if (problems.length) return { ok: false, reason: "rejected_files", problems: problems.slice(0, 50) };
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const byPath = new Map(files.map(f => [f.path.toLowerCase(), f]));
  const warnings: string[] = [];

  let packageInfo: Inspection["packageInfo"] = null;
  let framework: Framework = "unknown";
  const pkgFile = byPath.get("package.json");
  if (pkgFile) {
    let pkg: Record<string, unknown> = {};
    try { pkg = JSON.parse(decoder.decode(blobs.get(pkgFile.sha256)!)); } catch { warnings.push("package_json_invalid"); }
    const deps = { ...(pkg.dependencies as object ?? {}), ...(pkg.devDependencies as object ?? {}) } as Record<string, string>;
    const scripts = (pkg.scripts && typeof pkg.scripts === "object" ? pkg.scripts : {}) as Record<string, string>;
    const installScripts = ["preinstall", "install", "postinstall", "prepare", "prepublish"].filter(k => k in scripts);
    if (installScripts.length) warnings.push("install_scripts_present:" + installScripts.join(","));
    packageInfo = { name: typeof pkg.name === "string" ? pkg.name.slice(0, 120) : null, dependencies: Object.keys(deps).slice(0, 200), scripts: Object.keys(scripts).slice(0, 50), installScripts };
    framework = "next" in deps ? "nextjs" : "astro" in deps ? "astro" : "svelte" in deps || "@sveltejs/kit" in deps ? "svelte" : "vue" in deps ? "vue" : "vite" in deps ? "vite" : "react" in deps ? "react" : "node";
    if (!byPath.has("package-lock.json") && !byPath.has("pnpm-lock.yaml") && !byPath.has("yarn.lock")) warnings.push("no_lockfile");
  }
  const htmls = files.filter(f => /\.html?$/i.test(f.path)).sort((a, b) => a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path));
  const entry = byPath.get("index.html")?.path ?? htmls[0]?.path ?? null;
  if (!pkgFile && entry) framework = "static";
  if (!pkgFile && !entry) warnings.push("no_html_entry");
  if (entry && entry !== "index.html") warnings.push("entry_not_at_root:" + entry);

  const contentDigest = createHash("sha256").update(files.map(f => f.path + "\0" + f.sha256).join("\n")).digest("hex");
  const deployable: Inspection["deployable"] = framework === "static" && entry === "index.html" ? "static" : pkgFile ? "needs_build" : "no";
  const suggestedCategory: Category = pkgFile ? "apps" : "website";
  return { ok: true, blobs, inspection: { files, totalBytes: total, framework, entry, contentDigest, suggestedCategory, deployable, warnings, skipped: skipped.slice(0, 50), packageInfo } };
}

/** Archive (ZIP) or a single HTML file → validated inspection. */
export function inspectUpload(name: string, bytes: Uint8Array, limits?: ZipLimits): InspectResult {
  const lower = name.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) {
    if (bytes.length > BRIDGE_LIMITS.fileBytes) return { ok: false, reason: "file_too_large", problems: [] };
    return inspectFiles([{ path: "index.html", bytes }]);
  }
  const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05);
  if (!isZip) return { ok: false, reason: "unsupported_upload_type", problems: [] };
  const zip = readZip(bytes, limits);
  if (!zip.ok) return { ok: false, reason: zip.reason, problems: zip.detail ? [{ path: zip.detail, reason: zip.reason }] : [] };
  return inspectFiles(zip.entries);
}

export const archiveDigest = (bytes: Uint8Array) => sha256(bytes);
