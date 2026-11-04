import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getOwnerState, type OwnerState } from "@/lib/auth/access";
import { hardenSessionCookie } from "./cookies";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  const isApi = path === "/api" || path.startsWith("/api/");
  const isPublicAuth = path === "/admin/login" || path === "/admin/auth/callback" || path === "/login" || ["/admin/signup", "/admin/forgot-password", "/admin/reset-password", "/admin/auth/confirm"].includes(path);
  const finish = (result: NextResponse) => {
    response.cookies.getAll().forEach(cookie => result.cookies.set(cookie));
    result.headers.set("Cache-Control", "private, no-store");
    result.headers.set("Vary", "Cookie");
    result.headers.set("Referrer-Policy", "no-referrer");
    return result;
  };
  // GET aliases only; preserve Samuel's POST server action for logout.
  if ((request.method === "GET" || request.method === "HEAD") && (path === "/login" || path === "/dashboard")) {
    const target = request.nextUrl.clone();
    target.pathname = path === "/login" ? "/admin/login" : "/admin/dashboard";
    return finish(NextResponse.redirect(target));
  }
  // The callback exchanges its own PKCE code; do not refresh an old identity first.
  if (path === "/admin/auth/callback" || path === "/admin/auth/confirm") return finish(response);
  // Exactly one external machine endpoint. It enforces its own HMAC, clock, payload,
  // environment and database gates; no cookie-based owner session is accepted.
  if (path === "/api/creative-bridge/deliveries" && request.method === "POST") return finish(response);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let owner: OwnerState = { state: "none" };
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(values) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, hardenSessionCookie(options)));
        },
      },
    });
    try { owner = await getOwnerState(supabase); } catch { /* Fail closed. */ }
  }
  const go = (target: string) => finish(NextResponse.redirect(new URL(target, request.url)));
  if (isPublicAuth) {
    if (path === "/admin/login" || path === "/login") {
      if (owner.state === "ok") return go("/admin/dashboard");
      if (owner.state === "mfa") return go("/admin/mfa");
    }
    return finish(response);
  }
  // Second-factor step: only for a verified owner whose session is still AAL1.
  if (path === "/admin/mfa") {
    if (owner.state === "mfa") return finish(response);
    return go(owner.state === "ok" ? "/admin/dashboard" : "/admin/login");
  }
  if (owner.state === "mfa") {
    if (isApi) return finish(NextResponse.json({ error: "MFA required" }, { status: 401 }));
    return go("/admin/mfa");
  }
  if (owner.state !== "ok") {
    if (isApi) return finish(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    return finish(NextResponse.redirect(new URL("/admin/login", request.url)));
  }
  return finish(response);
}
