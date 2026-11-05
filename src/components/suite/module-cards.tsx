import Link from "next/link";
import type { Lang } from "@/lib/i18n";
import { modules, type ModuleDef } from "./modules";
import { Icon } from "./icons";
import s from "./suite.module.css";

export type ModuleStat = { value: number | null; label: string; state: "ready" | "pending" };

export function ModuleCards({ lang = "es", stats = {} }: { lang?: Lang; stats?: Partial<Record<ModuleDef["key"], ModuleStat>> }) {
  const es = lang === "es";
  return (
    <div className={s.moduleGrid}>
      {modules.map(m => {
        const stat = stats[m.key];
        const badge = stat?.state !== "ready" ? (es ? "Pendiente de migración" : "Migration pending") : m.key === "chatbots" ? (es ? "Estructura lista" : "Structure ready") : (es ? "Operativo" : "Operational");
        return (
          <Link className={s.moduleCard} href={m.href} key={m.slug} data-accent={m.accent}>
            <span className={s.moduleIcon}><Icon name={m.icon} size={22} /></span>
            <span className={s.moduleBadge} data-state={stat?.state ?? "pending"}>{badge}</span>
            <h3>{m.name}</h3>
            <p>{m.description[lang]}</p>
            <span className={s.moduleFoot}>
              <span>{stat && stat.value !== null ? <><strong>{stat.value}</strong> {stat.label}</> : <span className={s.muted}>{es ? "Sin datos todavía" : "No data yet"}</span>}</span>
              <span className={s.open}>{es ? "Abrir" : "Open"} <Icon name="chevron" size={16} /></span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
