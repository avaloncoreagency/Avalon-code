import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAppOrigin } from "@/lib/auth/policy";
import { grantPasswordFlow } from "@/lib/auth/email-flow";

// Email link types this route accepts, and the password flow each one unlocks.
// Anything else is rejected before contacting Supabase. Supabase verifies that
// token_hash was issued for exactly this type; the query value alone grants nothing.
const PURPOSE = { invite: "invite", magiclink: "invite", recovery: "recovery" } as const;
type LinkType = keyof typeof PURPOSE;
const parseLinkType = (value: string | null): LinkType | null =>
  value === "invite" || value === "magiclink" || value === "recovery" ? value : null;

const NO_STORE = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

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
  if (!linkType || !tokenHash || tokenHash.length > 512) return done("/admin/login?error=callback");
  let verifiedUserId: string | null = null;
  try {
    const client = await createClient();
    const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: linkType });
    verifiedUserId = !error && data.user ? data.user.id : null;
  } catch { /* Fail closed without exposing tokens. */ }
  // Only a Supabase-verified identity reaches this point. It unlocks password
  // setup for that same account; dashboard access still requires membership.
  if (!verifiedUserId) return done("/admin/login?error=callback");
  const purpose = PURPOSE[linkType];
  await grantPasswordFlow(verifiedUserId, purpose);
  return done(purpose === "invite" ? "/admin/signup" : "/admin/reset-password");
}
