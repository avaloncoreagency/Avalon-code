import "server-only";

/**
 * Turnstile gate for the owner's password login.
 * Both env vars absent => controlled legacy rollout (no widget, no gate).
 * Exactly one configured => block login (never treat partial setup as disabled).
 * In production the enabled gate also requires an explicit trusted hostname.
 */
export type TurnstileStatus = "disabled" | "enabled" | "misconfigured";
export function turnstileStatus(env = process.env): TurnstileStatus {
  const site = env.TURNSTILE_SITE_KEY?.trim();
  const secret = env.TURNSTILE_SECRET_KEY?.trim();
  if (!site && !secret) return "disabled";
  return site && secret ? "enabled" : "misconfigured";
}

export async function verifyLoginHuman(
  token: FormDataEntryValue | null,
  options: { env?: NodeJS.ProcessEnv; fetcher?: typeof fetch } = {},
): Promise<"ok" | "invalid" | "unavailable"> {
  const env = options.env ?? process.env;
  const status = turnstileStatus(env);
  if (status === "disabled") return "ok";
  if (status !== "enabled") return "unavailable";
  if (typeof token !== "string" || !token || token.length > 2048) return "invalid";

  // Exact hostname, never inferred from request headers supplied by a user.
  const expectedHostname = env.TURNSTILE_EXPECTED_HOSTNAME?.trim();
  if (!expectedHostname || !/^[a-z0-9.-]+$/i.test(expectedHostname)) return "unavailable";
  try {
    const response = await (options.fetcher ?? fetch)("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY!, response: token }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return "unavailable";
    const body: unknown = await response.json();
    if (!body || typeof body !== "object") return "unavailable";
    const result = body as { success?: unknown; action?: unknown; hostname?: unknown };
    if (result.success !== true || result.action !== "avalon_login" ||
        result.hostname !== expectedHostname) return "invalid";
    return "ok";
  } catch {
    return "unavailable";
  }
}
