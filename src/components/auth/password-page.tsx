import { createClient } from "@/lib/supabase/server";
import { validPasswordFlow } from "@/lib/auth/email-flow";
import { PasswordPanel } from "./password-panel";
import { getLang } from "@/lib/i18n-server";
export async function PasswordPage({ mode, searchParams }: { mode: "invite" | "recovery" | "request"; searchParams: Promise<{ error?: string; sent?: string }> }) {
  const params = await searchParams;
  let valid = false;
  if (mode !== "request") {
    try {
      const client = await createClient();
      const { data: { user } } = await client.auth.getUser();
      valid = !!user && await validPasswordFlow(user.id, mode);
    } catch { /* Show link-required state. */ }
  }
  return <PasswordPanel initialLanguage={await getLang()} mode={mode} valid={valid} error={params.error} sent={params.sent === "1"} />;
}
