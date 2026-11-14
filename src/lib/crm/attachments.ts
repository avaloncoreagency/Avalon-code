// Attachment rules shared by the upload/download routes (and unit-tested).
import { readZip } from '../project-bridge/zip';
import { BRIDGE_LIMITS } from '../project-bridge/policy';
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, { mime: string; magic?: number[] }> = {
  pdf: { mime: "application/pdf", magic: [0x25, 0x50, 0x44, 0x46] },
  png: { mime: "image/png", magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  jpg: { mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  jpeg: { mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  webp: { mime: "image/webp", magic: [0x52, 0x49, 0x46, 0x46] },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", magic: [0x50, 0x4b, 0x03, 0x04] },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", magic: [0x50, 0x4b, 0x03, 0x04] },
  txt: { mime: "text/plain" },
  csv: { mime: "text/csv" },
};
/** MIME from the extension, accepted only if the content signature agrees (text: valid UTF-8, no NUL). */
export function attachmentMime(filename: string, bytes: Uint8Array): string | null {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const t = Object.hasOwn(TYPES, ext) ? TYPES[ext] : null;
  if (!t || bytes.length < 1 || bytes.length > ATTACHMENT_MAX_BYTES) return null;
  if (ext === 'docx' || ext === 'xlsx') {
    // Reuse the existing defensive reader: CRC, traversal, symlinks, encryption and inflation limits.
    // This is a format check, not an antivirus or permission to execute document content.
    const zip = readZip(bytes, {...BRIDGE_LIMITS,archiveBytes:ATTACHMENT_MAX_BYTES,totalUncompressedBytes:25*1024*1024,fileBytes:ATTACHMENT_MAX_BYTES,entries:500});
    if (!zip.ok) return null;
    if (zip.entries.some(e => /(?:vbaProject|activeX|embeddings)\b|\.(?:bin|exe|dll|js|vbs|ps1|com)$/i.test(e.path))) return null;
    const main = ext === 'docx' ? 'word/document.xml' : 'xl/workbook.xml';
    const part = ext === 'docx' ? 'wordprocessingml.document' : 'spreadsheetml.sheet';
    const types = zip.entries.find(e=>e.path==='[Content_Types].xml');
    if (!types || !zip.entries.some(e=>e.path===main) || !zip.entries.some(e=>e.path==='_rels/.rels')) return null;
    let xml: string;
    try {xml = new TextDecoder('utf-8',{fatal:true}).decode(types.bytes);} catch {return null;}
    if (/<!DOCTYPE|<!ENTITY|macroEnabled/i.test(xml)) return null;
    const expected = `application/vnd.openxmlformats-officedocument.${part}.main+xml`;
    const validPart = (xml.match(/<Override\b[^>]*>/g) ?? []).some(tag =>
      new RegExp(`PartName\\s*=\\s*["']/${main.replaceAll('.', '\\.')}["']`).test(tag) &&
      new RegExp(`ContentType\\s*=\\s*["']${expected.replaceAll('.', '\\.').replaceAll('+', '\\+')}["']`).test(tag));
    return validPart ? t.mime : null;
  }
  if (ext === 'webp' && (bytes.length < 12 || new TextDecoder().decode(bytes.subarray(8,12)) !== 'WEBP')) return null;
  if (t.magic) return t.magic.every((b, i) => bytes[i] === b) ? t.mime : null;
  if (bytes.includes(0)) return null;
  try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); return t.mime; } catch { return null; }
}
/** PostgREST returns bytea as "\x<hex>"; accept that or a raw byte array. */
export function decodeBytea(value: unknown): Buffer {
  if (typeof value === "string") {
    const hex=value.startsWith('\\x')?value.slice(2):value;
    return /^(?:[0-9a-f]{2})*$/i.test(hex)&&hex.length<=ATTACHMENT_MAX_BYTES*2?Buffer.from(hex,'hex'):Buffer.alloc(0);
  }
  if (value && typeof value === "object") {
    const entries=Object.entries(value);
    if(entries.length>ATTACHMENT_MAX_BYTES||entries.some(([key,n],i)=>key!==String(i)||!Number.isInteger(n)||n<0||n>255))return Buffer.alloc(0);
    return Buffer.from(entries.map(([,n])=>n));
  }
  return Buffer.alloc(0);
}
