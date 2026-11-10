// Minimal ZIP writer (STORE method, no compression) for archives Avalon itself generates — e.g. a Website Designer
// snapshot — so they enter the library through the SAME validated import pipeline as any uploaded ZIP.
// Pure function, no I/O. Paths must already be safe (the reader re-validates everything on import).
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function writeZip(entries: { path: string; bytes: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [], centrals: Uint8Array[] = [];
  let offset = 0;
  // Fixed DOS timestamp (1980-01-01) keeps the archive — and therefore its SHA-256 — deterministic for equal content.
  for (const e of entries) {
    if (!/^[A-Za-z0-9._/-]{1,255}$/.test(e.path) || e.path.startsWith("/") || e.path.split("/").includes("..")) throw new Error("unsafe_zip_path");
    const name = enc.encode(e.path), crc = crc32(e.bytes), size = e.bytes.length;
    const local = new Uint8Array(30 + name.length); const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true); lv.setUint16(12, 0x21, true); lv.setUint32(14, crc, true); lv.setUint32(18, size, true); lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true); local.set(name, 30);
    const central = new Uint8Array(46 + name.length); const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true); cv.setUint32(16, crc, true); cv.setUint32(20, size, true); cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); central.set(name, 46);
    locals.push(local, e.bytes); centrals.push(central);
    offset += local.length + size;
  }
  const cdSize = centrals.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22); const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, end];
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
