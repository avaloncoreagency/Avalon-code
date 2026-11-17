import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaffState } from "@/lib/auth/staff";
import { verifyStaffMfa } from "./actions";

export const dynamic = "force-dynamic";
export default async function StaffMfa({ searchParams }: {
  searchParams: Promise<{ error?: string }>;
}) {
  const staff = await getStaffState();
  if (staff.state === "ok") redirect("/staff");
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
