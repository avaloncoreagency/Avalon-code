import { PasswordPage } from "@/components/auth/password-page";
import { InviteComplete } from "./invite-complete";
export const dynamic = "force-dynamic";
export default function Page({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
 return <><InviteComplete /><PasswordPage mode="invite" searchParams={searchParams} /></>;
}
