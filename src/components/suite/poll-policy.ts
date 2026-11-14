/** Shared, deterministic polling policy. No network, auth or cross-user cache. */
export const SUITE_POLL_INTERVAL_MS = 60_000;
export const SUITE_FOCUS_DEBOUNCE_MS = 15_000;

/** Normal navigation fetches immediately; only repeated focus/interval events are throttled. */
export function shouldRefreshNow(lastAttemptAt: number, now: number, visible: boolean) {
  if (!visible || !Number.isFinite(now)) return false;
  if (!Number.isFinite(lastAttemptAt) || lastAttemptAt <= 0 || now < lastAttemptAt) return true;
  return now - lastAttemptAt >= SUITE_FOCUS_DEBOUNCE_MS;
}
