/** Client-side expiry of verified manager work, even when the Office tab stays open. */
export type ManagerRunState = {
  display_status: string;
  started_at: string;
  finished_at: string | null;
};
export function managerStatusAt(run: ManagerRunState | undefined, nowMs: number): string {
  if (!run) return "not_run";
  if (run.display_status !== "completed") return run.display_status;
  const observedMs = Date.parse(run.finished_at ?? run.started_at);
  // Invalid/implausibly future timestamps never count as fresh verified work.
  if (!Number.isFinite(nowMs) || nowMs <= 0 || !Number.isFinite(observedMs) || observedMs > nowMs + 120_000)
    return "stale";
  return nowMs - observedMs > 90 * 60_000 ? "stale" : "completed";
}
