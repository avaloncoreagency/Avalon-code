import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAppOrigin } from "@/lib/auth/policy";
import { grantPasswordFlow } from "@/lib/auth/email-flow";

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type");
  const token_hash = request.nextUrl.searchParams.get("token_hash");
  let path = "/admin/login?error=callback";
  if (token_hash && (type === "invite" || type === "recovery" || type === "magiclink")) {
    try {
      const client = await createClient();
      const { data, error } = await client.auth.verifyOtp({ token_hash, type });
      if (!error && data.user) {
        // Password setup proves identity only; access still requires owner membership.
        const purpose = type === "recovery" ? "recovery" : "invite";
        await grantPasswordFlow(data.user.id, purpose);
        path = purpose === "invite" ? "/admin/signup" : "/admin/reset-password";
      }
    } catch { /* Fail closed without exposing tokens. */ }
  }
  return NextResponse.redirect(new URL(path, getAppOrigin()), { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
