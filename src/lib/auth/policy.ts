// Only trusted server-verified identities and database memberships reach this check.
export function isOwner(role: unknown): role is "owner" {
  return role === "owner";
}

export function getAppOrigin() {
  const value = process.env.APP_ORIGIN;
  if (!value) throw new Error("APP_ORIGIN must be configured for authentication");
  const url = new URL(value);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
    throw new Error("APP_ORIGIN must be an HTTPS origin (HTTP allowed on localhost)");
  }
  return url.origin;
}

export function hasAllowedProvider(provider: unknown) {
  // Preserve existing verified owner identities; an account's original provider
  // is not the method used for this login. All login initiation is email/password.
  return provider === "email" || provider === "google";
}
