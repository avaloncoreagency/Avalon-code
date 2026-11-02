import { redirect } from "next/navigation";
import { getAuthorizedMember } from "@/lib/auth/access";
import { LoginPanel } from "@/components/auth/login-panel";
import { getLang } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; updated?: string }> }) {
  const params = await searchParams;
  const member = await getAuthorizedMember();
  if (member) redirect("/admin/dashboard");
  return <LoginPanel initialLanguage={await getLang()} updated={params.updated === "1"} error={params.error} passwordEnabled={process.env.AUTH_PASSWORD_LOGIN_ENABLED === "true"} />;
}
