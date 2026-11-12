import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { PageHeader, Flash, Panel, Empty, Badge, DbNotice, param, type SearchParams } from "@/components/os/ui";
import { ProjectSettingsForm } from "@/components/os/projects";
import s from "@/components/os/os.module.css";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { getProject, run } from "@/lib/os/data";
import { DAYS, PERSONAS, buildReceptionistPrompt, defaultReceptionist, estimateTokens, isUuid, readReceptionist } from "@/lib/os/domain";
import { integrationsFor } from "@/lib/os/integrations";
import { addReceptionistEntry, deleteReceptionistEntry, saveReceptionistConfig, updateReceptionistEntry } from "../actions";

export const dynamic = "force-dynamic";
const BASE = "/admin/workspace/ai-receptionist";
const DAY_NAMES: Record<string, [string, string]> = { mon: ["Lunes", "Monday"], tue: ["Martes", "Tuesday"], wed: ["Miércoles", "Wednesday"], thu: ["Jueves", "Thursday"], fri: ["Viernes", "Friday"], sat: ["Sábado", "Saturday"], sun: ["Domingo", "Sunday"] };
const PERSONA_NAMES: Record<string, [string, string]> = { professional: ["Profesional", "Professional"], friendly: ["Cercana", "Friendly"], formal: ["Formal", "Formal"] };
type Entry = { id: string; kind: "faq" | "knowledge"; question: string; answer: string; position: number; version: number };

export default async function ReceptionistPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const query = await searchParams;
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const project = await getProject(supabase, "receptionist", id);
  if (!project.error && !project.data) notFound();
  const entries = project.data ? await run<Entry[]>(supabase.from("os_receptionist_entries").select("id,kind,question,answer,position,version").eq("project_id", id).order("kind").order("position").order("created_at").limit(300)) : null;
  const saved = readReceptionist(project.data?.settings);
  const config = saved ?? defaultReceptionist();
  const rows = entries?.data ?? [];
  const prompt = saved ? buildReceptionistPrompt(saved, rows) : "";
  const tokens = estimateTokens(prompt);
  const integrations = integrationsFor("receptionist");

  return (
    <Suite active="ai-receptionist">
      <PageHeader eyebrow="AI Receptionist" title={project.data?.name ?? "—"} description={project.data?.description || undefined} crumbs={[{ href: BASE, label: "AI Receptionist" }]}
        actions={project.data ? <a className={s.btnPrimary} href={`${BASE}/${id}/studio`} data-testid="open-studio">{pick(lang, "Abrir AI Chatbots Builder (Nova)", "Open AI Chatbots Builder (Nova)")}</a> : undefined} />
      <Flash lang={lang} ok={param(query, "ok")} error={param(query, "error")} />
      {project.error ? <DbNotice lang={lang} error={project.error} /> : project.data && (
        <>
          <div className={s.stats}>
            <div className={s.stat}><span>{pick(lang, "Configuración", "Configuration")}</span><strong>{saved ? pick(lang, "Lista", "Ready") : pick(lang, "Pendiente", "Pending")}</strong></div>
            <div className={s.stat}><span>FAQ</span><strong>{rows.filter(r => r.kind === "faq").length}</strong></div>
            <div className={s.stat}><span>{pick(lang, "Conocimiento", "Knowledge")}</span><strong>{rows.filter(r => r.kind === "knowledge").length}</strong></div>
            <div className={s.stat}><span>{pick(lang, "Conversaciones", "Conversations")}</span><strong>0</strong></div>
            <div className={s.stat}><span>{pick(lang, "Tokens de contexto (estim.)", "Context tokens (est.)")}</span><strong>{saved ? `~${tokens.toLocaleString(lang === "es" ? "es-ES" : "en-US")}` : "—"}</strong></div>
          </div>
          <div className={s.split}>
            <div>
              <Panel title={pick(lang, "Configuración del asistente", "Assistant configuration")} id="config">
                <form action={saveReceptionistConfig} className={s.form}>
                  <input type="hidden" name="projectId" value={id} /><input type="hidden" name="version" value={project.data.version} />
                  <div className={s.row}>
                    <label className={s.field}><span>{pick(lang, "Nombre del asistente", "Assistant name")} *</span><input className={s.input} name="assistantName" defaultValue={config.assistantName} required maxLength={60} /></label>
                    <label className={s.field}><span>{pick(lang, "Personalidad", "Personality")}</span>
                      <select className={s.select} name="persona" defaultValue={config.persona}>{PERSONAS.map(p => <option key={p} value={p}>{pick(lang, ...PERSONA_NAMES[p])}</option>)}</select>
                    </label>
                    <label className={s.field}><span>{pick(lang, "Zona horaria", "Time zone")} *</span><input className={s.input} name="timezone" defaultValue={config.timezone} required maxLength={64} /></label>
                  </div>
                  <fieldset className={s.actions} style={{ border: 0, padding: 0, margin: 0 }}>
                    <legend className={s.label}>{pick(lang, "Idiomas de respuesta", "Reply languages")}</legend>
                    <label className={s.check}><input type="checkbox" name="languages" value="es" defaultChecked={config.languages.includes("es")} />Español</label>
                    <label className={s.check}><input type="checkbox" name="languages" value="en" defaultChecked={config.languages.includes("en")} />English</label>
                  </fieldset>
                  <label className={s.field}><span>{pick(lang, "Saludo", "Greeting")}</span><input className={s.input} name="greeting" defaultValue={config.greeting} maxLength={500} /></label>
                  <label className={s.field}><span>{pick(lang, "Instrucciones", "Instructions")}</span><textarea className={s.textarea} name="instructions" defaultValue={config.instructions} maxLength={6000} rows={5} /></label>
                  <fieldset style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12, margin: 0 }}>
                    <legend className={s.label}>{pick(lang, "Horario de atención", "Business hours")}</legend>
                    <div className={s.stack}>
                      {DAYS.map(d => (
                        <div key={d} className={s.actions}>
                          <span style={{ minWidth: 92 }}>{pick(lang, ...DAY_NAMES[d])}</span>
                          <label className="sr-only" htmlFor={`open_${d}`}>{pick(lang, "Apertura", "Opens")}</label>
                          <input id={`open_${d}`} className={s.input} type="time" name={`open_${d}`} defaultValue={config.hours[d].open} style={{ width: 120 }} />
                          <label className="sr-only" htmlFor={`close_${d}`}>{pick(lang, "Cierre", "Closes")}</label>
                          <input id={`close_${d}`} className={s.input} type="time" name={`close_${d}`} defaultValue={config.hours[d].close} style={{ width: 120 }} />
                          <label className={s.check}><input type="checkbox" name={`closed_${d}`} defaultChecked={config.hours[d].closed} />{pick(lang, "Cerrado", "Closed")}</label>
                        </div>
                      ))}
                    </div>
                  </fieldset>
                  <div className={s.row}>
                    <label className={s.field}><span>{pick(lang, "Transferir a (correo)", "Handoff email")}</span><input className={s.input} type="email" name="handoffEmail" defaultValue={config.handoffEmail} maxLength={254} /></label>
                    <label className={s.field}><span>{pick(lang, "Transferir a (teléfono)", "Handoff phone")}</span><input className={s.input} type="tel" name="handoffPhone" defaultValue={config.handoffPhone} maxLength={30} /></label>
                  </div>
                  <label className={s.field}><span>{pick(lang, "Cuándo transferir a una persona", "When to hand off to a person")}</span><textarea className={s.textarea} name="handoffRule" defaultValue={config.handoffRule} maxLength={1000} rows={2} /></label>
                  <div className={s.actions}><button className={s.btnPrimary} type="submit">{pick(lang, "Guardar configuración", "Save configuration")}</button></div>
                </form>
              </Panel>

              <Panel title={pick(lang, "FAQ y base de conocimiento", "FAQ and knowledge base")} id="knowledge">
                {entries?.error ? <DbNotice lang={lang} error={entries.error} /> : rows.length === 0 ? (
                  <Empty title={pick(lang, "Sin entradas", "No entries")} body={pick(lang, "Añade preguntas frecuentes y conocimiento verificado de la empresa.", "Add FAQs and verified company knowledge.")} />
                ) : (
                  <div className={s.stack}>
                    {rows.map(r => (
                      <details key={r.id} className={`${s.block} ${s.details}`}>
                        <summary><Badge tone={r.kind === "faq" ? "info" : "neutral"}>{r.kind === "faq" ? "FAQ" : pick(lang, "Conocimiento", "Knowledge")}</Badge> {r.question}</summary>
                        <form action={updateReceptionistEntry} className={s.form}>
                          <input type="hidden" name="projectId" value={id} /><input type="hidden" name="entryId" value={r.id} /><input type="hidden" name="version" value={r.version} />
                          <div className={s.row}>
                            <label className={s.field}><span>{pick(lang, "Tipo", "Kind")}</span><select className={s.select} name="kind" defaultValue={r.kind}><option value="faq">FAQ</option><option value="knowledge">{pick(lang, "Conocimiento", "Knowledge")}</option></select></label>
                            <label className={s.field}><span>{pick(lang, "Orden", "Order")}</span><input className={s.input} type="number" name="position" min={0} max={10000} defaultValue={r.position} /></label>
                          </div>
                          <label className={s.field}><span>{pick(lang, "Pregunta / título", "Question / title")}</span><input className={s.input} name="question" defaultValue={r.question} required maxLength={300} /></label>
                          <label className={s.field}><span>{pick(lang, "Respuesta / contenido", "Answer / content")}</span><textarea className={s.textarea} name="answer" defaultValue={r.answer} required maxLength={8000} rows={4} /></label>
                          <div className={s.actions}><button className={`${s.btnPrimary} ${s.small}`} type="submit">{pick(lang, "Guardar", "Save")}</button></div>
                        </form>
                        <form action={deleteReceptionistEntry} className={s.inline}>
                          <input type="hidden" name="projectId" value={id} /><input type="hidden" name="entryId" value={r.id} />
                          <button className={`${s.btnDanger} ${s.small}`} type="submit" style={{ marginTop: 8 }}>{pick(lang, "Eliminar", "Delete")}</button>
                        </form>
                      </details>
                    ))}
                  </div>
                )}
                <form action={addReceptionistEntry} className={s.form} style={{ marginTop: 16 }}>
                  <input type="hidden" name="projectId" value={id} />
                  <div className={s.row}>
                    <label className={s.field}><span>{pick(lang, "Tipo", "Kind")}</span><select className={s.select} name="kind"><option value="faq">FAQ</option><option value="knowledge">{pick(lang, "Conocimiento", "Knowledge")}</option></select></label>
                    <label className={s.field}><span>{pick(lang, "Orden", "Order")}</span><input className={s.input} type="number" name="position" min={0} max={10000} defaultValue={rows.length} /></label>
                  </div>
                  <label className={s.field}><span>{pick(lang, "Pregunta / título", "Question / title")} *</span><input className={s.input} name="question" required maxLength={300} /></label>
                  <label className={s.field}><span>{pick(lang, "Respuesta / contenido", "Answer / content")} *</span><textarea className={s.textarea} name="answer" required maxLength={8000} rows={3} /></label>
                  <div className={s.actions}><button className={s.btn} type="submit">{pick(lang, "Añadir entrada", "Add entry")}</button></div>
                </form>
              </Panel>
            </div>

            <div>
              <Panel title={pick(lang, "Integraciones", "Integrations")} id="integrations">
                <ul className={s.stack} style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {integrations.map(i => <li key={i.key} className={s.actions} style={{ justifyContent: "space-between" }}><span>{i.label}</span><Badge>{pick(lang, "No conectado", "Not connected")}</Badge></li>)}
                </ul>
                <p className={s.meta}>{pick(lang, "Conectar un proveedor requiere aprobación de costes y una clave de servidor. Los adaptadores ya están definidos en el código.", "Connecting a provider requires cost approval and a server-side key. Adapter contracts are already defined in code.")}</p>
              </Panel>
              <Panel title={pick(lang, "Historial de conversaciones", "Conversation history")} id="history">
                <Empty title={pick(lang, "Sin conversaciones", "No conversations")} body={pick(lang, "Aparecerán aquí cuando un canal real (web, WhatsApp, teléfono) esté conectado. No se simulan conversaciones.", "They will appear here once a real channel (web, WhatsApp, phone) is connected. Conversations are never simulated.")} />
              </Panel>
              <Panel title={pick(lang, "Uso y costes", "Usage and cost")} id="usage">
                <p className={s.meta}>{pick(lang,
                  `Cada respuesta enviaría ~${tokens} tokens de contexto (estimación: 4 caracteres ≈ 1 token) más el mensaje del usuario. El coste real dependerá del proveedor y tarifa aprobados; no se muestran precios inventados.`,
                  `Each reply would send ~${tokens} context tokens (estimate: 4 characters ≈ 1 token) plus the user message. Actual cost depends on the approved provider and rate; no invented prices are shown.`)}</p>
              </Panel>
              <Panel title={pick(lang, "Instrucciones de sistema generadas", "Generated system prompt")} id="prompt">
                {prompt ? <pre className={s.pre}>{prompt}</pre> : <p className={s.meta}>{pick(lang, "Guarda la configuración para generar las instrucciones.", "Save the configuration to generate the prompt.")}</p>}
              </Panel>
              <Panel title={pick(lang, "Proyecto", "Project")} id="settings"><ProjectSettingsForm lang={lang} project={project.data} /></Panel>
            </div>
          </div>
        </>
      )}
    </Suite>
  );
}
