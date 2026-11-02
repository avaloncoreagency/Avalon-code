import type { NextConfig } from "next";

/**
 * Baseline security headers for every response (public and private routes).
 * Deliberately conservative: no script-src CSP yet, because a nonce-based CSP
 * needs testing against Next.js hydration before it can be enforced.
 * - HSTS without `preload` (preload is hard to undo; decide separately).
 * - frame-ancestors/X-Frame-Options block clickjacking of the admin HUD.
 * - form-action 'self' stops injected forms from posting credentials elsewhere.
 * The middleware still overrides Referrer-Policy to no-referrer on private routes.
 */
export const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
