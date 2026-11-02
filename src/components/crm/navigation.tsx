import Link from "next/link";
import { crmNavigation } from "@/lib/crm/domain";
import s from "./crm.module.css";

/** Shared navigation across all five CRM screens; legacy analytics remain secondary. */
export function CrmNavigation({ active }: { active?: string }) {
  return (
    <nav aria-label="Flujo principal del CRM" className={s.tabs}>
      {crmNavigation.map((tab) => (
        <Link
          key={tab.slug}
          href={tab.href}
          className={`${s.tab} ${active === tab.slug ? s.active : ""}`}
          aria-current={active === tab.slug ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
