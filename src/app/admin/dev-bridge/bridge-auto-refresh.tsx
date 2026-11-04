'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Read-only refresh. Suspends while the tab is hidden; never publishes or merges. */
export function BridgeAutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, 300_000);
    return () => window.clearInterval(interval);
  }, [router]);
  return null;
}
