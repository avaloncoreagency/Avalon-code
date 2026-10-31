import { redirect } from "next/navigation";
import { getAuthorizedMember } from "@/lib/auth/access";
import { signIn } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const member = await getAuthorizedMember();
  if (member) redirect("/dashboard");
  return (
    <main className="shell">
      <section className="panel">
        <h1>Avalon OS — Acceso privado</h1>
        <p>Solo miembros invitados y autorizados.</p>
        {params.error === "invalid" && <p role="alert">No se pudo iniciar sesión. Comprueba tus credenciales.</p>}
        <form action={signIn}>
          <label htmlFor="email">Correo electrónico</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
          <label htmlFor="password">Contraseña</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
          <button type="submit">Entrar</button>
        </form>
      </section>
    </main>
  );
}
