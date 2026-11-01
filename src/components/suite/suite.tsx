import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getAuthorizedMember } from '@/lib/auth/access';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '@/app/dashboard/actions';
import { modules } from './modules';
import s from './suite.module.css';
export async function Suite({ children, active = 'dashboard' }: { children: ReactNode; active?: string }) {
  const member = await getAuthorizedMember();
  if (!member) redirect('/admin/login');
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user || user.id !== member.userId) redirect('/admin/login');
  return <div className={s.shell}>
    <aside className={s.sidebar}><Link className={s.brand} href="/admin/dashboard">AVALON<span>CORE AGENCY / OS</span></Link>
      <nav aria-label="Navegación principal"><Link aria-current={active === 'dashboard' ? 'page' : undefined} href="/admin/dashboard">◈ Dashboard</Link>{modules.map(m => <Link key={m.slug} aria-current={active === m.slug ? 'page' : undefined} href={`/admin/workspace/${m.slug}`}><span>{m.icon}</span> {m.name}</Link>)}</nav>
      <div className={s.account}><span>SESIÓN ACTIVA · {member.role}</span><p><strong aria-hidden="true">{user.email?.slice(0, 1).toUpperCase()} · </strong>{user.email}</p><form action={signOut}><button>Cerrar sesión ↗</button></form></div>
    </aside>
    <main className={s.main}><header className={s.top}><span>ESPACIO PRIVADO</span><span>Avalon Core Agency</span></header>{children}<footer className={s.footer}>AVALON OS · AI. PEOPLE. SYSTEMS.</footer></main>
  </div>;
}
export function ModuleCards() {
  return <div className={s.grid}>{modules.map(m => <Link className={s.card} href={`/admin/workspace/${m.slug}`} key={m.slug}><span className={s.number}>{m.icon}</span><span className={s.badge}>{m.slug === 'crm' ? 'PRIMER MÓDULO' : 'VISTA INICIAL'}</span><h2>{m.name}</h2><p>{m.description}</p><span className={s.open}>Abrir espacio <span aria-hidden="true">↗</span></span></Link>)}</div>;
}
