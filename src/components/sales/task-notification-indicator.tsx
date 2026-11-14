"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import s from "./sales.module.css";

/** Low-frequency in-app badge, never a browser push request or external message. */
export function TaskNotificationIndicator() {
  const [unread, setUnread] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const response = await fetch("/admin/workspace/crm/notifications/unread", { cache: "no-store" });
        if (!response.ok) return;
        const body: { unread?: unknown } = await response.json();
        if (active && typeof body.unread === "number" && Number.isSafeInteger(body.unread) && body.unread >= 0) {
          setUnread(body.unread);
        }
      } catch {
        // Keep the last known badge; never fabricate zero unread on a network error.
      }
    }
    void refresh();
    const refreshVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = window.setInterval(refreshVisible, 30_000);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, []);
  const quantity = unread === null ? "" : unread > 99 ? "99+" : String(unread);
  return <Link className={s.button} href="/admin/workspace/crm/notifications"
    aria-label={unread === null ? "Avisos de tareas" : String(unread) + " avisos de tareas sin leer"}
    title="Avisos privados: se actualizan al volver a esta pestaña y aproximadamente cada 30 segundos">
    <span aria-hidden="true">🔔</span> Avisos de tareas
    {unread !== null && unread > 0 && <span className={s.tag} data-tone="warn" aria-live="polite">{quantity}</span>}
  </Link>;
}
