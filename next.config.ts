import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./src/lib/security/headers";

if (process.env.VERCEL_ENV === 'preview' && process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('ltbwzcrxeuczdhhtbqgm')) {
  throw new Error('Preview must use an isolated Supabase database, never production.');
}

/** Exported for the security baseline test. */
export const securityHeaders = SECURITY_HEADERS;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
