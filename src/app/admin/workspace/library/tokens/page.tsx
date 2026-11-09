import { cookies } from "next/headers";
import { Suite } from "@/components/suite/suite";
import { PageHeader, Flash, param, type SearchParams } from "@/components/os/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { createApiToken, revokeApiToken } from "../actions";
import s from "@/components/library/library.module.css";

export const dynamic = "force-dynamic";

export default async function BridgeTokens({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const fresh = (await cookies()).get("avalon_bridge_new_token")?.value ?? null;
  const tokens = await supabase.from("os_project_api_tokens").select("id,name,prefix,scopes,created_at,expires_at,revoked_at,last_used_at").order("created_at", { ascending: false }).limit(50);
  return (
    <Suite active="library">
      <PageHeader eyebrow="Avalon Project Bridge" title={pick(lang, "API para herramientas", "Tool API")} crumbs={[{ href: "/admin/workspace/library", label: pick(lang, "Biblioteca", "Library") }]}
        description={pick(lang, "Tokens revocables para que Claude Code, Codex, ChatGPT o un script envíen un ZIP a la bandeja privada. Un token no puede leer proyectos, crear versiones ni publicar: un owner revisa cada envío.", "Revocable tokens so tools can send a ZIP to the private inbox. A token cannot read projects, create versions or publish: an owner reviews every submission.")} />
      <Flash lang={lang} ok={param(sp, "ok")} error={param(sp, "error")} />
      <div className={s.wrap}>
        {fresh && /^avb_[A-Za-z0-9_-]+$/.test(fresh) && <section className={s.panel}><h2>{pick(lang, "Copia este token ahora: no se volverá a mostrar", "Copy this token now: it will not be shown again")}</h2><p className={`${s.secret} ${s.mono}`}>{fresh}</p></section>}
        <section className={s.panel}><h2>{pick(lang, "Nuevo token", "New token")}</h2>
          <form action={createApiToken} className={s.form}>
            <label className={s.muted}>{pick(lang, "Nombre (herramienta o persona)", "Name (tool or person)")}<input name="name" maxLength={80} required /></label>
            <div className={s.row}>
              <label className={s.muted}>{pick(lang, "Caduca en (días, máx. 90)", "Expires in (days, max 90)")}<input name="days" type="number" min={1} max={90} defaultValue={30} /></label>
              <label className={s.muted}>{pick(lang, "Permiso", "Scope")}<select name="scope" defaultValue="create"><option value="create">{pick(lang, "Enviar importaciones", "Send imports")}</option><option value="read">{pick(lang, "Solo consultar estado", "Read status only")}</option>
                <option value="code_agent">{pick(lang, "Código · agente (entregar + descargar la versión verificada)", "Code · agent (deliver + pull verified mainline)")}</option>
                <option value="code_integrator">{pick(lang, "Código · integrador (revisar, integrar, publicar)", "Code · integrator (review, integrate, publish)")}</option>
                <option value="code_pull">{pick(lang, "Código · solo descargar la versión verificada", "Code · pull verified mainline only")}</option></select></label>
            </div>
            <button className={s.primary}>{pick(lang, "Crear token", "Create token")}</button>
          </form>
        </section>
        <section className={s.panel}><h2>{pick(lang, "Tokens", "Tokens")}</h2>
          <div className={s.scroll}><table className={s.table}><thead><tr><th>{pick(lang, "Nombre", "Name")}</th><th>{pick(lang, "Prefijo", "Prefix")}</th><th>{pick(lang, "Permisos", "Scopes")}</th><th>{pick(lang, "Caduca", "Expires")}</th><th>{pick(lang, "Último uso", "Last used")}</th><th></th></tr></thead>
            <tbody>{(tokens.data ?? []).map(t => <tr key={t.id}><td>{t.name}</td><td className={s.mono}>{t.prefix}…</td><td>{(t.scopes as string[]).join(", ")}</td><td>{new Date(t.expires_at).toLocaleDateString()}</td><td>{t.last_used_at ? new Date(t.last_used_at).toLocaleString() : "—"}</td>
              <td>{t.revoked_at ? <span className={s.badge} data-state="blocked">{pick(lang, "Revocado", "Revoked")}</span> : <form action={revokeApiToken}><input type="hidden" name="token_id" value={t.id} /><button className={s.danger}>{pick(lang, "Revocar", "Revoke")}</button></form>}</td></tr>)}</tbody></table></div>
          <p className={s.muted}>{pick(lang, "Uso: scripts/project-bridge/send-project.mjs y docs/project-bridge/PROJECT_BRIDGE.md.", "Usage: scripts/project-bridge/send-project.mjs and docs/project-bridge/PROJECT_BRIDGE.md.")}</p>
        </section>
      </div>
    </Suite>
  );
}
