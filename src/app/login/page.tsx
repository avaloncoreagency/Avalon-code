import { redirect } from "next/navigation";
import { getAuthorizedMember } from "@/lib/auth/access";
import { getStaffState } from "@/lib/auth/staff";
import { LoginPanel } from "@/components/auth/login-panel";
import { getLang } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; updated?: string }> }) {
  const params = await searchParams;
  const member = await getAuthorizedMember();
  if (member) redirect("/admin/dashboard");
  const staff = await getStaffState();
  if (staff.state === "ok") redirect("/staff");
  if (staff.state === "mfa") redirect("/staff/mfa");
  return <LoginPanel initialLanguage={await getLang()} updated={params.updated === "1"} error={params.error} turnstileSiteKey={process.env.TURNSTILE_SITE_KEY?.trim()} />;
}
