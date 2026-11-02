// Final cookie attributes for Supabase session cookies, applied in our own
// setAll() so they do not depend on library defaults.
//
// - HttpOnly: the app never reads the session from browser JavaScript (there is
//   no browser Supabase client), so an XSS cannot exfiltrate tokens.
// - Secure in production, SameSite=Lax (OAuth/email links are top-level GETs).
// - Sliding lifetime: cookies are rewritten whenever the access token is
//   refreshed (about hourly while active), so an idle session ends after
//   SESSION_IDLE_SECONDS. Deletions (maxAge 0) are preserved.

export const SESSION_IDLE_SECONDS = 12 * 60 * 60;

export type CookieAttributes = {
  path?: string; domain?: string; maxAge?: number; expires?: Date; httpOnly?: boolean;
  secure?: boolean; sameSite?: "lax" | "strict" | "none" | boolean; priority?: "low" | "medium" | "high"; partitioned?: boolean;
};

export function hardenSessionCookie(options: CookieAttributes | undefined, production = process.env.NODE_ENV === "production"): CookieAttributes {
  const removing = options?.maxAge === 0 || (options?.expires instanceof Date && options.expires.getTime() <= Date.now());
  const hardened: CookieAttributes = { ...options, path: "/", httpOnly: true, secure: production, sameSite: "lax" };
  delete hardened.domain; // host-only cookie
  if (removing) return { ...hardened, maxAge: 0 };
  delete hardened.expires;
  return { ...hardened, maxAge: SESSION_IDLE_SECONDS };
}
