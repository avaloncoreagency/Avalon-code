/** OWNER-IDENTITY-001: presentation only. Never use this registry for authorization. */
export const OWNER_NAMES = Object.freeze({ miguel: "Miguel Hobaica", samuel: "Samuel Muñoz" });
export type OwnerKey = keyof typeof OWNER_NAMES;
const ALIASES: Readonly<Record<string, OwnerKey>> = Object.freeze({
  miguel: "miguel", "miguel hobaica": "miguel", avalonagencymh: "miguel", "avalonagencymh@gmail.com": "miguel",
  samuel: "samuel", "samuel muñoz": "samuel", "samuel munoz": "samuel", avaloncoreagencysm: "samuel", "avaloncoreagencysm@gmail.com": "samuel",
});
const value = (x: unknown) => typeof x === "string" ? x.normalize("NFC").trim() : "";
export function officialOwnerName(reference: unknown): string | null {
  const key = ALIASES[value(reference).toLocaleLowerCase("en-US")];
  return key && Object.hasOwn(OWNER_NAMES, key) ? OWNER_NAMES[key] : null;
}
export type DisplayIdentity = { id?: string; user_id?: string; email?: string | null; display_name?: string | null; full_name?: string | null; name?: string | null };
/** An identified owner always wins over a mutable profile nickname. Unknown technical IDs never become names. */
export function personDisplayName(person: DisplayIdentity | null | undefined, fallback = "—"): string {
  if (!person) return fallback;
  const legacyHandle = [person.display_name, person.full_name, person.name].map(value).find(x => /^(avalonagencymh|avaloncoreagencysm)$/i.test(x));
  const official = officialOwnerName(person.email) ?? officialOwnerName(legacyHandle);
  if (official) return official;
  const candidate = [person.display_name, person.full_name, person.name].map(value).find(x => x && !x.includes("@") && !/^[a-f0-9-]{32,36}$/i.test(x));
  return candidate?.slice(0, 160) || fallback;
}
/** Resolve an existing UUID against the current directory without modifying any stored record. */
export function directoryDisplayName(directory: readonly DisplayIdentity[], id: unknown, fallback = "—"): string {
  const person = directory.find(p => (p.user_id ?? p.id) === id);
  return person ? personDisplayName(person, fallback) : officialOwnerName(id) ?? fallback;
}
/** Historical explicit author/seller labels, not arbitrary legal text or client names. */
export function authorDisplayName(label: unknown, fallback = "—"): string {
  return officialOwnerName(label) ?? (value(label) || fallback);
}
