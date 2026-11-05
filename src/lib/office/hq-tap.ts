/** Guard raycast station selection on a touch-friendly 3D scene. Orbit drags and pinches are not taps. */
export type HqPointerStart = { pointerId: number; x: number; y: number; timeMs: number };

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
