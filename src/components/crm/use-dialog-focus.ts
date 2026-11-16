"use client";

import { useEffect, useRef } from "react";

/** Trap keyboard focus while a modal is open, then return it to its opener. */
export function useDialogFocus(open: boolean) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const candidates = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
    )).filter(element => element.getClientRects().length > 0);
    (dialog.querySelector<HTMLElement>("[data-initial-focus]") ?? candidates()[0] ?? dialog).focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const list = candidates();
      const first = list[0], last = list[list.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (!dialog.contains(document.activeElement) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault(); first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      }
    };
    document.addEventListener("keydown", keydown, true);
    return () => { document.removeEventListener("keydown", keydown, true); if (opener?.isConnected) opener.focus(); };
  }, [open]);
  return ref;
}
