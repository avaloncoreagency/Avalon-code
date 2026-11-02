import { redirect } from "next/navigation";
import { getOwnerState } from "@/lib/auth/access";
import { getLang } from "@/lib/i18n-server";
import { MfaPanel } from "@/components/auth/mfa-panel";

export const dynamic = "force-dynamic";

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const owner = await getOwnerState();
  if (owner.state === "ok") redirect("/admin/dashboard");
  if (owner.state !== "mfa") redirect("/admin/login");
  const { error } = await searchParams;
  return <MfaPanel initialLanguage={await getLang()} error={error} />;
}
