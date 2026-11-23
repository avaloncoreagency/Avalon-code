"use client";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { completeStaffInvitation } from "./actions";

/** Supabase Admin Auth invite links can return an implicit session in URL
 * fragment. A server route can never see this fragment, so only the browser
 * exchanges it into secure SSR session cookies. Do not log or persist tokens. */
export function InviteComplete() {
  const [state,setState] = useState<"idle"|"verifying"|"failed">("idle");
  useEffect(()=>{
    const hash = window.location.hash;
    if (!hash || hash.length > 8192) return;
    const params = new URLSearchParams(hash.slice(1));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    const type = params.get("type");
    if (!access_token || !refresh_token || (type && type !== "invite")) return;
    // Clear tokens immediately from visible browser URL, history and referrers.
    window.history.replaceState(null,"",window.location.pathname);
    setState("verifying");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) { setState("failed"); return; }
    const client = createBrowserClient(url,key);
    void (async()=>{
      try {
        const { error } = await client.auth.setSession({ access_token, refresh_token });
        if (error) { setState("failed"); return; }
      } catch {
        setState("failed");
        return;
      }
      // Do not catch a Next.js Server Action redirect: it is control flow.
      await completeStaffInvitation();
    })();
  },[]);
  if (state === "verifying") return <p role="status">Verificando tu invitación segura…</p>;
  if (state === "failed") return <p role="alert">No pudimos completar la invitación. Solicita otra invitación a un administrador.</p>;
  return null;
}
