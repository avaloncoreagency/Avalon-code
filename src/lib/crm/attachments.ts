// Attachment rules shared by the upload/download routes (and unit-tested).
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, { mime: string; magic?: number[] }> = {
  pdf: { mime: "application/pdf", magic: [0x25, 0x50, 0x44, 0x46] },
  png: { mime: "image/png", magic: [0x89, 0x50, 0x4e, 0x47] },
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
  if (!t || bytes.length < 1) return null;
  if (t.magic) return t.magic.every((b, i) => bytes[i] === b) ? t.mime : null;
  if (bytes.includes(0)) return null;
  try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); return t.mime; } catch { return null; }
}
/** PostgREST returns bytea as "\x<hex>"; accept that or a raw byte array. */
export function decodeBytea(value: unknown): Buffer {
  if (typeof value === "string") return Buffer.from(value.startsWith("\\x") ? value.slice(2) : value, "hex");
  if (value && typeof value === "object") return Buffer.from(Object.values(value as Record<string, number>));
  return Buffer.alloc(0);
}
