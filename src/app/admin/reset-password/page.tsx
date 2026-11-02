import { PasswordPage } from "@/components/auth/password-page";
export const dynamic = "force-dynamic";
export default function Page({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
 return <PasswordPage mode="recovery" searchParams={searchParams} />;
}
