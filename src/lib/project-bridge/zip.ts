/**
 * Avalon Project Bridge — defensive ZIP reader (server only).
 *
 * Why a small reader instead of a generic unzip: we must refuse an archive BEFORE inflating it when the central
 * directory already proves it is dangerous, and we must never let a lying header allocate unbounded memory.
 *  - Only the central directory is trusted for names, sizes, flags and attributes; local headers must agree.
 *  - Rejected: ZIP64, multi-disk, encryption, unknown compression, symlinks/devices (Unix mode), traversal/absolute
 *    paths, duplicate names (case-insensitive, to stop overwrite tricks on case-insensitive filesystems), too many
 *    entries, too large totals, extreme compression ratios.
 *  - Inflate is bounded by `maxOutputLength = declared size`; the output must match the declared size AND CRC32.
 * Nothing extracted here is ever executed.
 */
import { inflateRawSync, crc32 as nodeCrc32 } from "node:zlib";
import { BRIDGE_LIMITS, safePath } from "./policy";

export type ZipEntry = { path: string; bytes: Uint8Array };
export type ZipResult = { ok: true; entries: ZipEntry[]; directories: number } | { ok: false; reason: string; detail?: string };
export type ZipLimits = { [K in keyof typeof BRIDGE_LIMITS]: number };

const EOCD = 0x06054b50, CEN = 0x02014b50, LOC = 0x04034b50, EOCD64_LOCATOR = 0x07064b50;

let crcTable: Uint32Array | null = null;
function crc32(data: Uint8Array): number {
  if (typeof nodeCrc32 === "function") return nodeCrc32(data) >>> 0;
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function readZip(input: Uint8Array, limits: ZipLimits = BRIDGE_LIMITS): ZipResult {
  const fail = (reason: string, detail?: string): ZipResult => ({ ok: false, reason, ...(detail ? { detail } : {}) });
  if (!(input instanceof Uint8Array)) return fail("not_bytes");
  if (input.length > limits.archiveBytes) return fail("archive_too_large");
  if (input.length < 22) return fail("not_a_zip");
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const u16 = (o: number) => view.getUint16(o, true);
  const u32 = (o: number) => view.getUint32(o, true);

  // End of central directory: last 22 bytes + up to 65535 bytes of comment.
  let eocd = -1;
  for (let i = input.length - 22; i >= Math.max(0, input.length - 22 - 0xffff); i--) {
    if (u32(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) return fail("not_a_zip");
  if (eocd >= 20 && u32(eocd - 20) === EOCD64_LOCATOR) return fail("zip64_not_supported");
  if (u16(eocd + 4) !== 0 || u16(eocd + 6) !== 0) return fail("multi_disk_zip");
  const count = u16(eocd + 10);
  const cdSize = u32(eocd + 12), cdOffset = u32(eocd + 16);
  if (count !== u16(eocd + 8)) return fail("multi_disk_zip");
  if (count === 0xffff || cdOffset === 0xffffffff) return fail("zip64_not_supported");
  if (count > limits.entries) return fail("too_many_entries", String(count));
  if (cdOffset + cdSize > eocd) return fail("corrupt_central_directory");

  type Meta = { path: string; method: number; csize: number; usize: number; crc: number; local: number; dir: boolean };
  const metas: Meta[] = [];
  const seen = new Set<string>();
  let total = 0, directories = 0, p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (p + 46 > eocd || u32(p) !== CEN) return fail("corrupt_central_directory");
    const madeBy = u16(p + 4) >> 8;
    const flags = u16(p + 8), method = u16(p + 10);
    const crc = u32(p + 16), csize = u32(p + 20), usize = u32(p + 24);
    const nameLen = u16(p + 28), extraLen = u16(p + 30), commentLen = u16(p + 32);
    const disk = u16(p + 34), extAttr = u32(p + 38), local = u32(p + 42);
    const nameBytes = input.subarray(p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (p > eocd) return fail("corrupt_central_directory");
    if (disk !== 0) return fail("multi_disk_zip");
    if (flags & 0x1 || flags & 0x40) return fail("encrypted_entry");
    if (csize === 0xffffffff || usize === 0xffffffff || local === 0xffffffff) return fail("zip64_not_supported");
    const raw = new TextDecoder("utf-8", { fatal: false }).decode(nameBytes);
    const isDir = raw.endsWith("/");
    // Unix mode lives in the high 16 bits when "made by" is Unix (3) or macOS (19).
    if (madeBy === 3 || madeBy === 19) {
      const type = (extAttr >>> 16) & 0o170000;
      if (type !== 0 && type !== 0o100000 && type !== 0o040000) return fail(type === 0o120000 ? "symlink_entry" : "special_file_entry", raw.slice(0, 120));
    }
    if (extAttr & 0x400) return fail("symlink_entry", raw.slice(0, 120)); // Windows reparse point
    const safe = safePath(raw);
    if (!safe.ok) return fail(safe.reason, raw.slice(0, 120));
    const key = safe.path.toLowerCase();
    if (seen.has(key)) return fail("duplicate_entry", safe.path);
    seen.add(key);
    if (isDir) { directories++; continue; }
    if (method !== 0 && method !== 8) return fail("unsupported_compression", String(method));
    if (usize > limits.fileBytes) return fail("file_too_large", safe.path);
    if (method === 0 && csize !== usize) return fail("corrupt_entry", safe.path);
    if (usize > 1024 * 1024 && csize > 0 && usize / csize > limits.ratio) return fail("compression_ratio_too_high", safe.path);
    if (usize > 0 && csize === 0) return fail("compression_ratio_too_high", safe.path);
    total += usize;
    if (total > limits.totalUncompressedBytes) return fail("archive_uncompressed_too_large");
    metas.push({ path: safe.path, method, csize, usize, crc, local, dir: false });
  }
  if (metas.length === 0) return fail("empty_archive");
  // A file and a directory with the same name (e.g. "a" and "a/b") would collide on extraction.
  const files = new Set(metas.map(m => m.path.toLowerCase()));
  for (const m of metas) {
    const parts = m.path.toLowerCase().split("/");
    for (let i = 1; i < parts.length; i++) if (files.has(parts.slice(0, i).join("/"))) return fail("file_directory_collision", m.path);
  }

  const entries: ZipEntry[] = [];
  for (const m of metas) {
    const l = m.local;
    if (l + 30 > cdOffset || u32(l) !== LOC) return fail("corrupt_local_header", m.path);
    if (u16(l + 6) & 0x1) return fail("encrypted_entry", m.path);
    if (u16(l + 8) !== m.method) return fail("local_header_mismatch", m.path);
    const start = l + 30 + u16(l + 26) + u16(l + 28);
    const end = start + m.csize;
    if (end > cdOffset) return fail("corrupt_entry", m.path);
    const data = input.subarray(start, end);
    let out: Uint8Array;
    if (m.method === 0) out = data;
    else {
      try { out = new Uint8Array(inflateRawSync(data, { maxOutputLength: Math.max(1, m.usize) })); }
      catch { return fail("corrupt_or_lying_entry", m.path); }
    }
    if (out.length !== m.usize) return fail("size_mismatch", m.path);
    if (crc32(out) !== m.crc) return fail("crc_mismatch", m.path);
    entries.push({ path: m.path, bytes: out });
  }
  return { ok: true, entries, directories };
}
