import "server-only";

/**
 * Server-only gate for the two public intake RPCs (P0.2, docs/sql/public-intake-role-review.sql).
 *
 * When AVALON_INTAKE_TOKEN is configured (>= 32 chars, server env only), submissions go through the token-gated
 * wrappers crm_public_intake / crm_public_funnel_intake. The database stores only the token's SHA-256 and, once the
 * review SQL is applied, anon can no longer call crm_public_inquiry / crm_growth_funnel_submit directly — so the REST
 * API cannot be used to skip Turnstile and the per-IP limit. No JWT signing and no privileged key are involved; the
 * token never reaches the browser. Without the token the current direct RPCs are used (documented rollout state).
 */
export type IntakeMode = "gated" | "direct";

export function intakeToken(env = process.env): string | null {
  const token = env.AVALON_INTAKE_TOKEN?.trim() ?? "";
  return token.length >= 32 && token.length <= 256 ? token : null;
}
export function intakeMode(env = process.env): IntakeMode {
  return intakeToken(env) ? "gated" : "direct";
}

/** RPC name + arguments for a public submission. The token is added only server-side. */
export function intakeCall(kind: "inquiry" | "funnel", request: Record<string, unknown>, env = process.env):
  { fn: string; args: Record<string, unknown> } {
  const token = intakeToken(env);
  if (!token) return { fn: kind === "inquiry" ? "crm_public_inquiry" : "crm_growth_funnel_submit", args: { request } };
  return { fn: kind === "inquiry" ? "crm_public_intake" : "crm_public_funnel_intake", args: { request, p_token: token } };
}
