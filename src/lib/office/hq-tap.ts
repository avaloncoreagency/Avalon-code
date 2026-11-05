/** Guard raycast station selection on a touch-friendly 3D scene. Orbit drags and pinches are not taps. */
export type HqPointerStart = { pointerId: number; x: number; y: number; timeMs: number };

/** Cancel a tap permanently after any move beyond tolerance, even if a drag returns to its start. */
export function trackHqPointerMove(
  start: HqPointerStart | null, pointerId: number, x: number, y: number,
): HqPointerStart | null {
  if (!start || start.pointerId !== pointerId) return start;
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x - start.x, y - start.y) > 12) return null;
  return start;
}

export function isHqTap(
  start: HqPointerStart | null, pointerId: number,
  x: number, y: number, nowMs: number, remainingPointers: number,
): boolean {
  if (!start || start.pointerId !== pointerId || remainingPointers !== 0) return false;
  const elapsedMs = nowMs - start.timeMs;
  return Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs <= 300 &&
    Number.isFinite(x) && Number.isFinite(y) &&
    Math.hypot(x - start.x, y - start.y) <= 12;
}
