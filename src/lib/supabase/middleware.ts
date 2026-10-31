import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizedMember } from "@/lib/auth/access";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  const isApi = path === "/api" || path.startsWith("/api/");
  const isPublicAuth = path === "/admin/login" || path === "/admin/auth/callback" || path === "/login";
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
  if (path === "/admin/auth/callback") return finish(response);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let member = null;
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(values) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    try { member = await getAuthorizedMember(supabase); } catch { /* Fail closed. */ }
  }
  if (isPublicAuth) {
    if (member) return finish(NextResponse.redirect(new URL("/admin/dashboard", request.url)));
    return finish(response);
  }
  if (!member) {
    if (isApi) return finish(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    return finish(NextResponse.redirect(new URL("/admin/login", request.url)));
  }
  return finish(response);
}
