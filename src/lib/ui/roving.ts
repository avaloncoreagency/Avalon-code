import type { KeyboardEvent } from "react";

/**
 * Keyboard behaviour for ARIA tablists and custom radiogroups (WAI-ARIA APG, "roving tabindex"):
 * only the selected item is in the Tab order; ArrowLeft/ArrowUp and ArrowRight/ArrowDown move to the previous/next
 * item (wrapping), Home/End to the first/last, and the item is activated (automatic activation), like native radios.
 * Attach to the group container's onKeyDown. Items are its descendants with the given role that are not disabled.
 */
export function rovingKeyDown(event: KeyboardEvent<HTMLElement>, role: "tab" | "radio") {
  const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
  if (!keys.includes(event.key)) return;
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>(`[role="${role}"]:not([disabled]):not([aria-disabled="true"])`)];
  const index = items.indexOf(document.activeElement as HTMLElement);
  if (index < 0 || !items.length) return;
  event.preventDefault();
  const last = items.length - 1;
  const next = event.key === "Home" ? 0 : event.key === "End" ? last
    : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (index === 0 ? last : index - 1)
    : (index === last ? 0 : index + 1);
  items[next].focus();
  items[next].click();
}

/** tabIndex for a roving item: the selected one, or the first when nothing is selected yet. */
export const rovingTabIndex = (selected: boolean, isFirst: boolean, anySelected: boolean) => (selected || (!anySelected && isFirst) ? 0 : -1);
