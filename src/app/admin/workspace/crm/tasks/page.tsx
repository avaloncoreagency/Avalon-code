import Link from "next/link";
import { CrmNavigation } from "@/components/crm/navigation";
import { Suite } from "@/components/suite/suite";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedMember } from "@/lib/auth/access";
export const dynamic = "force-dynamic";
export default async function TasksPage() {
  const client = await createClient();
  const member = await getAuthorizedMember(client);
  if (!member) return <Suite active="crm"><p role="alert">Acceso no autorizado.</p></Suite>;
  return <Suite active="crm"><main style={{padding:24}}><h1>Tareas internas</h1><CrmNavigation active="tasks" /><p>Espacio de trabajo para asignar tareas a Miguel, Samuel o a uno mismo.</p><Link href="/admin/workspace/crm">Volver al CRM</Link><section style={{marginTop:24,padding:20,border:"1px solid #777",borderRadius:12}}><h2>Preparando asignaciones</h2><p>La gestión persistente de tareas todavía no está conectada a la base de datos. No se muestran tareas inventadas ni se permite guardar asignaciones que se perderían.</p><p>Campos previstos: título, descripción, responsable, prioridad, vencimiento, estado y comentarios internos.</p></section></main></Suite>;
}
