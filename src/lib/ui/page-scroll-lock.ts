"use client";
import { useSyncExternalStore } from "react";

/**
 * Locks the document scroll behind a modal panel and gives back a release function.
 *
 * - The page position is remembered and restored exactly on release (no jump to the top).
 * - The scrollbar gap is compensated with body padding so the layout does not shift.
 * - `overscroll-behavior: none` on the root stops wheel/touch chaining to the page at the panel's ends.
 * Nested locks are counted: only the last release unlocks the page.
 */
let depth = 0;
let saved: { x: number; y: number; overflow: string; overscroll: string; padding: string } | null = null;

export function lockPageScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  const root = document.documentElement, body = document.body;
  if (depth === 0) {
    const gap = window.innerWidth - root.clientWidth;
    saved = { x: window.scrollX, y: window.scrollY, overflow: root.style.overflow, overscroll: root.style.overscrollBehavior, padding: body.style.paddingRight };
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
  }
  depth++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    depth = Math.max(0, depth - 1);
    if (depth > 0 || !saved) return;
    const { x, y, overflow, overscroll, padding } = saved;
    saved = null;
    root.style.overflow = overflow;
    root.style.overscrollBehavior = overscroll;
    body.style.paddingRight = padding;
    if (window.scrollX !== x || window.scrollY !== y) window.scrollTo({ left: x, top: y, behavior: "instant" as ScrollBehavior });
  };
}

const subscribe = () => () => {};
/** True only in the browser, without a hydration mismatch (server snapshot is false). */
export function useIsClient(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
