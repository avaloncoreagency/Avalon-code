/** A reported URL is a navigation hint, not proof of a verified deployment. */
export function safeCreativeExternalEvidenceLink(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 512 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return null;
    const host = url.hostname.toLowerCase();
    const labels = host.split('.');
    // Reject bare names, IP literals, reserved internal/test domains and malformed DNS labels.
    if (labels.length < 2 || labels.every(label => /^\d+$/.test(label)) ||
        labels.some(label => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) ||
        ['localhost', 'local', 'internal', 'test', 'invalid', 'example', 'onion'].includes(labels.at(-1) ?? '')) return null;
    return url.href;
  } catch {
    return null;
  }
}
