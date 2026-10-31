import { notFound } from 'next/navigation';
import { Suite } from '@/components/suite/suite';
import { modules } from '@/components/suite/modules';
import s from '@/components/suite/suite.module.css';
export const dynamic = 'force-dynamic';
export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
 const { module } = await params;
 const item = modules.find(m => m.slug === module);
 if (!item) notFound();
 return <Suite active={item.slug}><section className={s.hero}><small>WORKSPACE / {item.icon}</small><h1>{item.name}</h1><p>{item.description}</p></section><section className={s.empty}><h2>Espacio preparado</h2><p>Este módulo está en fase inicial. Todavía no permite crear, consultar ni modificar información de negocio.{item.slug === 'crm' ? ' CRM será el primer módulo de negocio en desarrollarse.' : ''}</p><a href="/admin/dashboard">← Volver al dashboard</a></section></Suite>;
}
