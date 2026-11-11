-- Avalon v1: Code Exchange (gitless code hand-off with Codex) is DISABLED by default.
-- Reason: it existed to exchange code with Codex while GitHub was suspended. Codex is no longer used and GitHub is
-- restored, so its nine token-gated SECURITY DEFINER functions would only add an anonymous attack surface
-- (flagged "high" by crm_agent_security_posture()). Nothing is dropped: tables, functions and history stay intact.
-- Re-enable (owner decision, reversible): give the anon role EXECUTE again on the nine functions below.
revoke execute on function public.os_code_put_chunk(text, bigint, integer, text, text) from anon;
revoke execute on function public.os_code_get_chunk(text, integer, text) from anon;
revoke execute on function public.os_code_submit(jsonb, text, text) from anon;
revoke execute on function public.os_code_my_deliveries(text) from anon;
revoke execute on function public.os_code_inbox(text, text) from anon;
revoke execute on function public.os_code_set_status(uuid, text, jsonb, text) from anon;
revoke execute on function public.os_code_publish(text, text, text, text, jsonb, uuid[], text) from anon;
revoke execute on function public.os_code_set_preview(bigint, text, text) from anon;
revoke execute on function public.os_code_head(text) from anon;
