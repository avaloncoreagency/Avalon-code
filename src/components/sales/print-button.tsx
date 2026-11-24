"use client";
import { useEffect } from "react";
/** Opens the browser print dialog (iPhone, Android, tablet, desktop). Printing never changes any record.
 * Arriving with #print (the "Imprimir" action of a list) opens the dialog once. */
export function PrintButton({ label, className }: { label: string; className?: string }) {
  useEffect(() => { if (window.location.hash === "#print") { history.replaceState(null, "", window.location.pathname); window.print(); } }, []);
  return <button type="button" className={className} onClick={() => window.print()} data-print-invoice>{label}</button>;
}
