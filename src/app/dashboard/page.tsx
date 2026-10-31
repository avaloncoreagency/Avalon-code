import { redirect } from "next/navigation";
import { getAuthorizedMember } from "@/lib/auth/access";
import { signOut } from "./actions";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const member = await getAuthorizedMember();
  if (!member) redirect("/login");
  return (
    <main className="shell">
      <section className="panel">
        <h1>Avalon OS — Área privada</h1>
        <p>Acceso verificado. Panel en construcción; no hay datos de clientes.</p>
        <p>Rol: {member.role}</p>
        <form action={signOut}><button type="submit">Cerrar sesión</button></form>
      </section>
    </main>
  );
}
