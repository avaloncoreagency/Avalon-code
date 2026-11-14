/**
 * Avalon Project Bridge — import policy (Misión 0400). Pure data + pure helpers: no I/O.
 *
 * Every limit is enforced on the SERVER, never trusted from the browser. Limits are deliberately conservative for the
 * free/hobby tiers of Supabase Storage and Vercel; raising them is a configuration change, not a code change.
 */

export const BRIDGE_LIMITS = {
  /** Uploaded archive (ZIP) size. Supabase Free allows 50 MB per object; we stay below. */
  archiveBytes: 25 * 1024 * 1024,
  /** Sum of the declared uncompressed sizes of every entry. */
  totalUncompressedBytes: 100 * 1024 * 1024,
  /** One extracted file. */
  fileBytes: 15 * 1024 * 1024,
  /** Entries in one archive (directories included). */
  entries: 2000,
  /** Max compression ratio of a single entry (decompression-bomb guard). */
  ratio: 200,
  /** Path depth and length. */
  depth: 24,
  pathChars: 240,
  /** Imports per owner per hour and imports in progress at the same time (enforced again in SQL). */
  importsPerHour: 30,
  concurrentImports: 2,
} as const;

export const BRIDGE_BUCKET = "avalon-projects";
/** Extended categories require a separately reviewed, applied SQL migration. UI is not an authorization boundary. */
export const BRIDGE_LEGACY_CATEGORIES = ["website","ecommerce","crm_creator","apps"] as const;
export function bridgeCategoryEnabled(category: string, extended = false): boolean {
  return (BRIDGE_LEGACY_CATEGORIES as readonly string[]).includes(category) ||
    (extended && ["receptionist","chatbots","marketing"].includes(category));
}

export type Category = "website" | "ecommerce" | "crm_creator" | "receptionist" | "chatbots" | "marketing" | "apps";
export const CATEGORIES: readonly Category[] = ["website", "ecommerce", "crm_creator", "receptionist", "chatbots", "marketing", "apps"];
export const CATEGORY_LABEL: Record<Category, { es: string; en: string }> = {
  website: { es: "Website Designer", en: "Website Designer" },
  ecommerce: { es: "E-commerce Designer", en: "E-commerce Designer" },
  crm_creator: { es: "CRM Creator", en: "CRM Creator" },
  receptionist: { es: "AI Receptionist", en: "AI Receptionist" },
  chatbots: { es: "AI Chatbots", en: "AI Chatbots" },
  marketing: { es: "Marketing Hub", en: "Marketing Hub" },
  apps: { es: "Apps", en: "Apps" },
};
export const SOURCE_TOOLS = ["chatgpt", "claude_code", "codex", "higgsfield", "editor", "manual", "api", "other"] as const;
export type SourceTool = (typeof SOURCE_TOOLS)[number];

/** Extensions a static site or a source project may contain. Anything else is rejected with a clear reason. */
const ALLOWED = new Set([
  // web
  "html", "htm", "css", "js", "mjs", "cjs", "map", "json", "txt", "md", "xml", "webmanifest", "csv",
  // source
  "ts", "tsx", "jsx", "scss", "sass", "less", "vue", "svelte", "astro", "mdx", "yml", "yaml", "toml", "lock", "prisma", "graphql", "gql", "sql",
  // media
  "png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "ico", "bmp", "mp4", "webm", "mov", "mp3", "wav", "ogg", "m4a", "pdf", "glb", "gltf",
  // fonts
  "woff", "woff2", "ttf", "otf", "eot",
]);
/** Extension-less files commonly present in projects. */
const ALLOWED_NAMES = new Set(["license", "readme", "dockerignore", "gitignore", "npmrc-disabled", "nvmrc", "editorconfig", "prettierrc", "eslintrc", "browserslistrc"]);

/** Never accepted, whatever the extension policy says: executables, scripts for servers, secrets, VCS internals. */
const BLOCKED_EXT = new Set(["exe", "dll", "so", "dylib", "bat", "cmd", "com", "scr", "msi", "ps1", "psm1", "vbs", "vbe", "wsf", "sh", "bash", "zsh", "fish", "apk", "ipa", "jar", "war", "class", "php", "phtml", "cgi", "pl", "py", "pyc", "rb", "asp", "aspx", "jsp", "htaccess", "pem", "key", "p12", "pfx", "keystore", "jks", "kdbx", "zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "iso", "dmg", "img", "bin", "app", "deb", "rpm"]);
const BLOCKED_SEGMENTS = new Set([".git", ".svn", ".hg", "node_modules", "__macosx", ".ssh", ".aws", ".vercel", ".supabase", ".next", ".turbo", ".cache"]);
const BLOCKED_NAMES = /^(\.env(\..*)?|\.npmrc|\.netrc|\.pgpass|id_rsa.*|id_ed25519.*|id_ecdsa.*|credentials(\.json)?|service[-_]?account.*\.json|\.ds_store|thumbs\.db|desktop\.ini)$/i;

export type PathVerdict = { ok: true; path: string } | { ok: false; reason: string };

/**
 * Normalizes an archive entry name to a safe relative POSIX path, or explains why it is rejected.
 * Rejects: absolute paths, drive letters, backslash tricks, `..`, NUL/control chars, overlong or overly deep paths.
 */
export function safePath(raw: string): PathVerdict {
  if (typeof raw !== "string" || raw.length === 0) return { ok: false, reason: "empty_name" };
  if (/[\u0000-\u001f\u007f]/.test(raw)) return { ok: false, reason: "control_character_in_name" };
  if (raw.includes("\\")) return { ok: false, reason: "backslash_in_name" };
  if (raw.startsWith("/") || /^[a-zA-Z]:/.test(raw)) return { ok: false, reason: "absolute_path" };
  const parts = raw.split("/").filter((p, i, a) => !(p === "" && i === a.length - 1));
  if (parts.some(p => p === "" || p === "." || p === "..")) return { ok: false, reason: "path_traversal" };
  const path = parts.join("/");
  if (path.length > BRIDGE_LIMITS.pathChars) return { ok: false, reason: "path_too_long" };
  if (parts.length > BRIDGE_LIMITS.depth) return { ok: false, reason: "path_too_deep" };
  return { ok: true, path };
}

export function extensionOf(path: string): string {
  const name = path.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export type FileVerdict = { ok: true } | { ok: false; reason: string };
/** Policy for one regular file (path already normalized). */
export function filePolicy(path: string): FileVerdict {
  const segments = path.toLowerCase().split("/");
  const name = segments[segments.length - 1];
  if (segments.slice(0, -1).some(s => BLOCKED_SEGMENTS.has(s))) return { ok: false, reason: "blocked_directory" };
  if (BLOCKED_NAMES.test(name)) return { ok: false, reason: "secret_or_system_file" };
  const ext = extensionOf(path);
  if (BLOCKED_EXT.has(ext)) return { ok: false, reason: "blocked_file_type:" + ext };
  if (!ext) return ALLOWED_NAMES.has(name.replace(/^\./, "")) ? { ok: true } : { ok: false, reason: "file_without_extension" };
  return ALLOWED.has(ext) ? { ok: true } : { ok: false, reason: "file_type_not_allowed:" + ext };
}

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8", cjs: "text/javascript; charset=utf-8", json: "application/json", map: "application/json",
  webmanifest: "application/manifest+json", txt: "text/plain; charset=utf-8", md: "text/markdown; charset=utf-8", xml: "application/xml",
  csv: "text/csv; charset=utf-8", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", avif: "image/avif", ico: "image/x-icon", bmp: "image/bmp", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", pdf: "application/pdf", woff: "font/woff", woff2: "font/woff2",
  ttf: "font/ttf", otf: "font/otf", eot: "application/vnd.ms-fontobject", glb: "model/gltf-binary", gltf: "model/gltf+json",
};
export function mimeOf(path: string): string {
  return MIME[extensionOf(path)] ?? "text/plain; charset=utf-8";
}
export const isText = (path: string) => /^(text\/|application\/(json|xml|manifest\+json)|image\/svg\+xml)/.test(mimeOf(path)) || ["ts", "tsx", "jsx", "scss", "sass", "less", "vue", "svelte", "astro", "mdx", "yml", "yaml", "toml", "lock", "prisma", "graphql", "gql", "sql"].includes(extensionOf(path));

/** Content checks on text files: real magic bytes for binaries, and secrets that must never be stored or deployed. */
const SECRET_PATTERNS: [string, RegExp][] = [
  ["private_key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/],
  ["supabase_service_key", /\bservice[_]role\b[^\n]{0,40}eyJ[A-Za-z0-9_-]{10,}/],
  ["stripe_live_secret", /\bsk_live_[0-9a-zA-Z]{16,}/],
  ["aws_access_key", /\bAKIA[0-9A-Z]{16}\b/],
  ["github_token", /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ["openai_key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/],
  ["slack_token", /\bxox[abpr]-[A-Za-z0-9-]{10,}/],
  ["google_api_key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["vercel_token", /\bvercel_[A-Za-z0-9]{24,}/i],
];
export function secretFindings(text: string): string[] {
  return SECRET_PATTERNS.filter(([, re]) => re.test(text)).map(([k]) => k);
}

/** Magic numbers: a file must be what its extension says (prevents e.g. an executable renamed to .png). */
export function magicMismatch(path: string, bytes: Uint8Array): boolean {
  const ext = extensionOf(path);
  const starts = (...b: number[]) => b.every((v, i) => bytes[i] === v);
  if (bytes.length >= 2 && starts(0x4d, 0x5a)) return true; // MZ: Windows executable, never acceptable
  if (bytes.length >= 4 && starts(0x7f, 0x45, 0x4c, 0x46)) return true; // ELF
  if (bytes.length >= 4 && (starts(0xcf, 0xfa, 0xed, 0xfe) || starts(0xfe, 0xed, 0xfa, 0xcf) || starts(0xca, 0xfe, 0xba, 0xbe))) return true; // Mach-O / fat / Java class
  const check: Record<string, () => boolean> = {
    png: () => starts(0x89, 0x50, 0x4e, 0x47),
    jpg: () => starts(0xff, 0xd8, 0xff), jpeg: () => starts(0xff, 0xd8, 0xff),
    gif: () => starts(0x47, 0x49, 0x46, 0x38),
    webp: () => starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45,
    pdf: () => starts(0x25, 0x50, 0x44, 0x46),
    woff: () => starts(0x77, 0x4f, 0x46, 0x46), woff2: () => starts(0x77, 0x4f, 0x46, 0x32),
    glb: () => starts(0x67, 0x6c, 0x54, 0x46),
  };
  const fn = check[ext];
  return fn ? bytes.length < 4 || !fn() : false;
}
