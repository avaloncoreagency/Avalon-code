"use client";
import { useFormStatus } from "react-dom";

/** One invitation per click: the button is disabled while the request is in flight, so a double click cannot send a second
 * request (which Supabase would answer with "already registered" right after the first invitation succeeded). */
export function InviteSubmit({ className }: { className?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} type="submit" disabled={pending} aria-busy={pending} data-invite-submit>
    {pending ? "Enviando invitación…" : "Enviar invitación segura"}
  </button>;
}
