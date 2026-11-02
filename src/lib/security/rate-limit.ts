// Sliding-window rate limiter (pure logic + in-memory store).
//
// Scope and limits (documented in docs/security/AUDITORIA.md, R-03):
// - Memory is per server instance, so this is a best-effort brake that blocks
//   naive brute force and credential stuffing from a single source. Supabase
//   Auth applies its own server-side limits on top.
// - A distributed limiter needs a shared store (database or KV); that requires
//   owner approval because it changes production infrastructure.
// - Keys are SHA-256 hashes: raw IPs and emails are never kept in memory.

import { createHash } from "node:crypto";

export type Rule = { limit: number; windowMs: number };
export type Decision = { allowed: boolean; remaining: number; retryAfterMs: number };

export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();
  constructor(private readonly maxKeys = 10_000, private readonly now: () => number = Date.now) {}

  /** Records an attempt for `key` and decides whether it is allowed. */
  hit(key: string, rule: Rule): Decision {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter(ts => t - ts < rule.windowMs);
    if (recent.length >= rule.limit) {
      this.hits.set(key, recent);
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, rule.windowMs - (t - recent[0])) };
    }
    recent.push(t);
    this.hits.delete(key); // re-insert to keep Map order ≈ LRU
    this.hits.set(key, recent);
    this.evict();
    return { allowed: true, remaining: rule.limit - recent.length, retryAfterMs: 0 };
  }

  /** Clears a key (e.g. after a successful sign-in for the email bucket). */
  reset(key: string) { this.hits.delete(key); }

  size() { return this.hits.size; }

  private evict() {
    while (this.hits.size > this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }
  }
}

export const hashKey = (scope: string, value: string) =>
  `${scope}:${createHash("sha256").update(`${scope}\u0000${value.trim().toLowerCase()}`).digest("hex")}`;

/** Client IP as set by Vercel's edge (not client-controlled on Vercel). */
export function clientIp(headers: { get(name: string): string | null }) {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || "unknown").slice(0, 64);
}

export const AUTH_RULES = {
  loginPerIp: { limit: 20, windowMs: 15 * 60_000 },
  loginPerAccount: { limit: 8, windowMs: 15 * 60_000 },
  recoveryPerIp: { limit: 5, windowMs: 60 * 60_000 },
  recoveryPerAccount: { limit: 3, windowMs: 60 * 60_000 },
  passwordSetPerIp: { limit: 10, windowMs: 15 * 60_000 },
  mfaVerifyPerUser: { limit: 5, windowMs: 15 * 60_000 },
  mfaEnrollPerUser: { limit: 10, windowMs: 60 * 60_000 },
} as const satisfies Record<string, Rule>;

// One limiter per server instance.
const globalStore = globalThis as unknown as { __avalonAuthLimiter?: SlidingWindowLimiter };
export const authLimiter = (globalStore.__avalonAuthLimiter ??= new SlidingWindowLimiter());
