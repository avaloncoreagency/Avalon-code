// Synthetic ZIP builder for Project Bridge tests. Builds VALID and deliberately MALICIOUS archives byte by byte,
// so each defense is proven against the exact structure an attacker would send. No files touch the disk.
const zlib = require('node:zlib');

/**
 * entries: [{ name, data (string|Buffer), method?: 0|8, mode?: unix mode (e.g. 0o120777 symlink), flags?, declaredSize?, crc? }]
 * opts: { zip64Locator?: boolean }
 */
function buildZip(entries, opts = {}) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data ?? '', 'utf8');
    const method = e.method ?? (raw.length ? 8 : 0);
    const comp = method === 8 ? zlib.deflateRawSync(raw) : raw;
    const crc = e.crc ?? zlib.crc32(raw) >>> 0;
    const usize = e.declaredSize ?? raw.length;
    const flags = e.flags ?? 0x800; // UTF-8 names
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(flags, 6); lh.writeUInt16LE(e.localMethod ?? method, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(usize, 22); lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(e.mode !== undefined ? (3 << 8) | 20 : 20, 4); // made by: Unix when a mode is given
    ch.writeUInt16LE(20, 6); ch.writeUInt16LE(flags, 8); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(usize, 24); ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(e.mode !== undefined ? ((e.mode << 16) >>> 0) : 0, 38); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const parts = [...locals, cd];
  if (opts.zip64Locator) { const z = Buffer.alloc(20); z.writeUInt32LE(0x07064b50, 0); parts.push(z); }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  parts.push(end);
  return new Uint8Array(Buffer.concat(parts));
}

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4ce0000000049454e44ae426082', 'hex');

/** A small but complete static site: two pages, CSS, JS, an image, inside a single top-level folder (like Finder ZIPs). */
function staticSite(title = 'Sitio de prueba Avalon', root = 'mi-sitio/') {
  return buildZip([
    { name: root + 'index.html', data: `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><link rel="stylesheet" href="css/style.css"></head><body><h1>${title}</h1><img src="img/logo.png" alt="logo"><a href="contacto.html">Contacto</a><script src="js/app.js"></script></body></html>` },
    { name: root + 'contacto.html', data: '<!doctype html><html><body><h1>Contacto</h1></body></html>' },
    { name: root + 'css/style.css', data: 'body{font-family:system-ui;background:#0b0b1a;color:#fff}' },
    { name: root + 'js/app.js', data: 'document.body.dataset.ready="1";' },
    { name: root + 'img/logo.png', data: PNG, method: 0 },
    { name: '__MACOSX/' + root + '._index.html', data: 'junk' },
  ]);
}

module.exports = { buildZip, staticSite, PNG };
