import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAppOrigin } from "@/lib/auth/policy";
import { clearPasswordFlow, grantPasswordFlow } from "@/lib/auth/email-flow";

// Email link types this route accepts, and the password flow each one unlocks.
// Anything else is rejected before contacting Supabase. Supabase verifies that
// token_hash was issued for exactly this type; the query value alone grants nothing.
const PURPOSE = { invite: "invite", magiclink: "invite", recovery: "recovery" } as const;
type LinkType = keyof typeof PURPOSE;
const parseLinkType = (value: string | null): LinkType | null =>
  value === "invite" || value === "magiclink" || value === "recovery" ? value : null;

const NO_STORE = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

// Supabase Auth IDs are UUIDs. Reject malformed provider results before
// signing a password-flow grant, including truthy non-string values.
const isVerifiedAuthUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// URL-decoded control characters/whitespace cannot appear in a real token
// hash. Avoid spending provider requests on malformed or smuggled input.
const isSafeTokenHash = (value: string | null): value is string =>
  !!value && value.length <= 512 && !/[\x00-\x20\x7f]/.test(value);

export async function GET(request: NextRequest) {
  // Resolve the origin first: a misconfigured APP_ORIGIN must fail closed with a
  // controlled 503, never an unhandled 500 after the email token was consumed.
  let origin: string;
  try { origin = getAppOrigin(); } catch {
    return NextResponse.json({ error: "Authentication is not configured." }, { status: 503, headers: NO_STORE });
  }
  const done = (path: string) => NextResponse.redirect(new URL(path, origin), { headers: NO_STORE });
  const linkType = parseLinkType(request.nextUrl.searchParams.get("type"));
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  if (!linkType || !isSafeTokenHash(tokenHash)) return done("/admin/login?error=callback");
  let verifiedUserId: string | null = null;
  let authClient: Awaited<ReturnType<typeof createClient>> | null = null;
  try {
    authClient = await createClient();
    const { data, error } = await authClient.auth.verifyOtp({ token_hash: tokenHash, type: linkType });
    const userId = !error ? data?.user?.id : null;
    verifiedUserId = isVerifiedAuthUuid(userId) ? userId : null;
  } catch { /* Fail closed without exposing tokens. */ }
  // Only a Supabase-verified identity reaches this point. It unlocks password
  // setup for that same account; dashboard access still requires membership.
  if (!verifiedUserId) return done("/admin/login?error=callback");
  const purpose = PURPOSE[linkType];
  try {
    await grantPasswordFlow(verifiedUserId, purpose);
  } catch {
    // verifyOtp may have started an authenticated Supabase session before
    // cookie signing failed. Revoke this request\'s local session and remove any
    // partial password-flow proof. Do not leak cleanup errors or token details.
    try { await clearPasswordFlow(); } catch { /* best-effort cleanup */ }
    try { await authClient?.auth.signOut({ scope: "local" }); } catch { /* best-effort cleanup */ }
    return done("/admin/login?error=callback");
  }
  return done(purpose === "invite" ? "/admin/signup" : "/admin/reset-password");
}
