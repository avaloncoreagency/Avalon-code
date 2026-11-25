import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaffState } from "@/lib/auth/staff";
import { MfaEnroll } from "@/components/os/mfa-settings";
import { getLang } from "@/lib/i18n-server";
import { enrollStaffTotp, verifyStaffMfa } from "./actions";

export const dynamic = "force-dynamic";
export default async function StaffMfa({ searchParams }: {
  searchParams: Promise<{ error?: string }>;
}) {
  const staff = await getStaffState();
  if (staff.state === "ok") {
    const lang = await getLang();
    const es = lang === "es";
    const enrolled = staff.user.factors?.some(factor => factor.factor_type === "totp" && factor.status === "verified");
    return <main style={{maxWidth:520,margin:"8vh auto",padding:24}}>
      <h1>{es ? "Verificación en dos pasos" : "Two-step verification"}</h1>
      {enrolled
        ? <p>{es ? "Ya tienes un autenticador verificado." : "Your authenticator is verified."}</p>
        : <MfaEnroll lang={lang} enrollAction={enrollStaffTotp} staff />}
      <p><Link href="/staff">{es ? "Volver al portal" : "Back to the portal"}</Link></p>
    </main>;
  }
  if (staff.state !== "mfa") redirect("/admin/login");
  const { error } = await searchParams;
  return <main style={{maxWidth:430,margin:"8vh auto",padding:24}}>
    <h1>Verificación de empleado</h1>
    <p>Ingresa el código de seis dígitos de tu autenticador para acceder al espacio de empleados.</p>
    {error && <p role="alert">Código inválido o demasiados intentos. Intenta nuevamente.</p>}
    <form action={verifyStaffMfa}>
      <label>Código TOTP <input name="code" inputMode="numeric" autoComplete="one-time-code"
        minLength={6} maxLength={8} required /></label>
      <button type="submit">Verificar y entrar</button>
    </form>
    <p><Link href="/admin/login">Volver al acceso</Link></p>
  </main>;
}
