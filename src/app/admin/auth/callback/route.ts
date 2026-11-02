import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnerState } from "@/lib/auth/access";
import { getAppOrigin } from "@/lib/auth/policy";

export async function GET(request: NextRequest) {
  let origin: string;
  try { origin = getAppOrigin(); } catch {
    return NextResponse.json({ error: "Authentication is not configured." }, {
      status: 503,
      headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
    });
  }
  const destination = (path: string) => {
    const response = NextResponse.redirect(new URL(path, origin));
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  const code = request.nextUrl.searchParams.get("code");
  if (request.nextUrl.searchParams.has("error") || !code) return destination("/admin/login?error=callback");
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return destination("/admin/login?error=callback");
    const owner = await getOwnerState(supabase);
    if (owner.state === "mfa") return destination("/admin/mfa");
    if (owner.state !== "ok") {
      await supabase.auth.signOut({ scope: "local" });
      return destination("/admin/login?error=unauthorized");
    }
  } catch {
    return destination("/admin/login?error=callback");
  }
  // Ignore next/returnTo and forwarded hosts: the only destination is the private HUD.
  return destination("/admin/dashboard");
}
