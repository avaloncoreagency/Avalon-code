import { Suite, ModuleCards } from '@/components/suite/suite';
import s from '@/components/suite/suite.module.css';
export const dynamic = 'force-dynamic';
export default function DashboardPage() {
 return <Suite><section className={s.hero}><small>AVALON WORKSPACE</small><h1>Tu centro de operaciones.</h1><p>Un espacio compartido para gestionar el trabajo de la agencia. Accede a los módulos para conocer su alcance y estado de desarrollo.</p></section><ModuleCards /></Suite>;
}
