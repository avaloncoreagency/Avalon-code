import { Suite } from "@/components/suite/suite";
import { PageHeader, Panel, Badge } from "@/components/os/ui";
import { LanguageSwitch } from "@/components/suite/language-switch";
import s from "@/components/os/os.module.css";
import shell from "@/components/suite/suite.module.css";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { countRows } from "@/lib/os/data";
import { INTEGRATIONS } from "@/lib/os/integrations";

export const dynamic = "force-dynamic";
const MIGRATION = "20261102120000_avalon_os_modules.sql";

export default async function SettingsPage() {
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const [modulesDb, crmDb] = await Promise.all([countRows(supabase, "os_projects"), countRows(supabase, "crm_leads")]);
  const flags = [
    { label: pick(lang, "Acceso con contraseña", "Password sign-in"), on: process.env.AUTH_PASSWORD_LOGIN_ENABLED === "true" },
    { label: "Google OAuth (APP_ORIGIN)", on: Boolean(process.env.APP_ORIGIN) },
    { label: pick(lang, "Firma de enlaces de invitación/recuperación", "Invitation/recovery link signing"), on: (process.env.AUTH_FLOW_SECRET ?? "").length >= 32 },
  ];
  const tone = (state: string | null) => (state === null ? "ok" : state === "schema_pending" ? "warn" : "danger");
  return (
    <Suite active="settings">
      <PageHeader eyebrow={pick(lang, "Cuenta", "Account")} title={pick(lang, "Configuración", "Settings")} description={pick(lang, "Estado del sistema, preferencias e integraciones. Los cambios de infraestructura requieren aprobación de los propietarios.", "System status, preferences and integrations. Infrastructure changes require owner approval.")} />
      <div className={s.split}>
        <div>
          <Panel title={pick(lang, "Estado del sistema", "System status")} id="status">
            <div className={s.tableWrap}>
              <table className={s.table}>
                <tbody>
                  <tr><td>{pick(lang, "Base de datos de módulos", "Module database")}</td><td><Badge tone={tone(modulesDb.error)}>{modulesDb.error === null ? pick(lang, "Activa", "Active") : modulesDb.error === "schema_pending" ? pick(lang, "Migración pendiente", "Migration pending") : modulesDb.error}</Badge></td><td className={s.meta}>{MIGRATION}</td></tr>
                  <tr><td>CRM (Samuel)</td><td><Badge tone={crmDb.error === null ? "ok" : "warn"}>{crmDb.error === null ? pick(lang, "Activo", "Active") : pick(lang, "En desarrollo", "In development")}</Badge></td><td className={s.meta}>PR #6 · 20261102040501_crm_core.sql</td></tr>
                  {flags.map(f => <tr key={f.label}><td>{f.label}</td><td><Badge tone={f.on ? "ok" : "neutral"}>{f.on ? pick(lang, "Activo", "On") : pick(lang, "Inactivo", "Off")}</Badge></td><td className={s.meta}>Vercel env</td></tr>)}
                </tbody>
              </table>
            </div>
            {modulesDb.error === "schema_pending" && (
              <p className={s.meta}>{pick(lang,
                `Para activar los módulos, un propietario debe aprobar y aplicar ${MIGRATION}, primero en una base de datos de pruebas aislada. La aplicación nunca ejecuta migraciones desde el navegador.`,
                `To activate the modules, an owner must approve and apply ${MIGRATION}, first on an isolated test database. The app never runs migrations from the browser.`)}</p>
            )}
          </Panel>
          <Panel title={pick(lang, "Seguridad", "Security")} id="security">
            <ul className={s.stack} style={{ margin: 0, paddingLeft: 18 }}>
              <li>{pick(lang, "Acceso solo para propietarios verificados por Supabase Auth y membresía en base de datos.", "Access only for owners verified by Supabase Auth and a database membership.")}</li>
              <li>{pick(lang, "Row Level Security en todas las tablas; sin claves administrativas en el navegador.", "Row Level Security on every table; no admin keys in the browser.")}</li>
              <li>{pick(lang, "Registro de auditoría de solo inserción para cambios de módulos.", "Insert-only audit trail for module changes.")}</li>
              <li>{pick(lang, "Sin registro público: las cuentas nuevas solo por invitación.", "No public sign-up: new accounts by invitation only.")}</li>
            </ul>
          </Panel>
        </div>
        <div>
          <Panel title={pick(lang, "Preferencias", "Preferences")} id="prefs">
            <p className={s.label}>{pick(lang, "Idioma de la interfaz", "Interface language")}</p>
            <LanguageSwitch lang={lang} className={shell.lang} />
          </Panel>
          <Panel title={pick(lang, "Integraciones", "Integrations")} id="integrations">
            <ul className={s.stack} style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {INTEGRATIONS.map(i => <li key={i.key} className={s.actions} style={{ justifyContent: "space-between" }}><span>{i.label}</span><Badge>{pick(lang, "No conectado", "Not connected")}</Badge></li>)}
            </ul>
            <p className={s.meta}>{pick(lang, "Ninguna integración de pago o coste variable se activa sin aprobación explícita.", "No paid or variable-cost integration is activated without explicit approval.")}</p>
          </Panel>
        </div>
      </div>
    </Suite>
  );
}
