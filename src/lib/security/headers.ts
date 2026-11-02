// HTTP security headers for every response (applied in next.config.ts).
//
// Rollout plan (docs/security/AUDITORIA.md, R-01):
// 1. ENFORCED now: directives that cannot break Next.js, Supabase Auth or Vercel
//    (anti-framing, no plugins, fixed <base>), plus nosniff, Permissions-Policy,
//    COOP and HSTS without preload.
// 2. REPORT-ONLY: the full policy below. After it has been observed without
//    violations in Preview and production, move it to Content-Security-Policy.
//    Next.js inline bootstrap scripts currently require 'unsafe-inline'; a
//    nonce-based policy is the follow-up.

export const SUPABASE_ORIGIN = "https://*.supabase.co";

export const ENFORCED_CSP = ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'"].join("; ");

export const REPORT_ONLY_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  // Server actions post to self; OAuth (currently hidden) redirects via Supabase to Google.
  `form-action 'self' ${SUPABASE_ORIGIN} https://accounts.google.com`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "upgrade-insecure-requests",
].join("; ");

export const PERMISSIONS_POLICY = [
  "camera=()", "microphone=()", "geolocation=()", "payment=()", "usb=()", "serial=()",
  "bluetooth=()", "magnetometer=()", "gyroscope=()", "accelerometer=()", "browsing-topics=()",
].join(", ");

export const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "Content-Security-Policy", value: ENFORCED_CSP },
  { key: "Content-Security-Policy-Report-Only", value: REPORT_ONLY_CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // Two years, apex only. includeSubDomains/preload only after every subdomain is HTTPS-verified.
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

/** Names of headers the Security Command Center verifies on the live site. */
export const EXPECTED_HEADERS = ["content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy", "strict-transport-security"] as const;
