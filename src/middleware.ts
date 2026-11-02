import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  runtime: "nodejs",
  // Every API is private in Sprint 01. Public storefront APIs need an explicit policy later.
  matcher: ["/admin/:path*", "/api/:path*", "/dashboard/:path*", "/login"],
};
