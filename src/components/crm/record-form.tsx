"use client";
import { personDisplayName, type DisplayIdentity } from "@/lib/identity/owners";
import { useEffect, useRef, useState } from "react";
import { pick, type Lang } from "@/lib/i18n";
import type { Entity, Row, Stage } from "@/lib/crm/domain";
import s from "./crm.module.css";
type Field = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: string[][];
};
const contact: Field[] = [
  { name: "company", label: "Empresa", required: true },
  { name: "contact", label: "Contacto" },
  { name: "email", label: "Correo", type: "email" },
  { name: "phone", label: "Teléfono" },
  { name: "source", label: "Origen / fuente", required: true },
  {
    name: "owner_id",
    label: "Responsable",
    required: true,
  },
];
export const fields: Record<Entity, Field[]> = {
  leads: [
    ...contact,
    { name: "stage_id", label: "Etapa", required: true },
    { name: "value", label: "Valor estimado (USD)", type: "number" },
    { name: "probability", label: "Probabilidad (%)", type: "number" },
    {
      name: "priority",
      label: "Prioridad",
      options: [
        ["low", "Baja"],
        ["normal", "Normal"],
        ["high", "Alta"],
      ],
    },
    {
      name: "follow_up_at",
      label: "Próximo seguimiento",
      type: "datetime-local",
    },
    { name: "loss_reason", label: "Motivo de pérdida", type: "textarea" },
  ],
  prospects: [
    ...contact,
    { name: "industry", label: "Industria" },
    { name: "location", label: "Ubicación" },
    {
      name: "opportunity",
      label: "Oportunidad documentada",
      type: "textarea",
      required: true,
    },
    {
      name: "acquired_at",
      label: "Fecha de obtención",
      type: "datetime-local",
      required: true,
    },
    {
      name: "status",
      label: "Revisión",
      options: [
        ["pending", "Pendiente"],
        ["approved", "Aprobado"],
        ["rejected", "Rechazado"],
      ],
    },
  ],
  events: [
    { name: "title", label: "Título", required: true },
    { name: "owner_id", label: "Responsable", required: true },
    { name: "lead_id", label: "Lead relacionado (UUID)" },
    {
      name: "participants",
      label: "Participantes internos (nombres separados por comas)",
    },
    {
      name: "starts_at",
      label: "Inicio",
      type: "datetime-local",
      required: true,
    },
    { name: "ends_at", label: "Final", type: "datetime-local", required: true },
    {
      name: "kind",
      label: "Tipo",
      options: [
        ["meeting", "Reunión"],
        ["call", "Llamada"],
        ["follow-up", "Seguimiento"],
        ["task", "Tarea"],
      ],
    },
    {
      name: "status",
      label: "Estado",
      options: [
        ["scheduled", "Programado"],
        ["completed", "Completado"],
        ["cancelled", "Cancelado"],
      ],
    },
  ],
  activities: [
    { name: "lead_id", label: "Lead (UUID)", required: true },
    {
      name: "body",
      label: "Nota / actividad",
      type: "textarea",
      required: true,
    },
    {
      name: "status",
      label: "Estado",
      options: [
        ["completed", "Completada"],
        ["pending", "Pendiente"],
      ],
    },
    { name: "due_at", label: "Vencimiento", type: "datetime-local" },
  ],
  usage: [
    {
      name: "provider",
      label: "Proveedor",
      options: [
        ["Codex", "Codex"],
        ["Claude", "Claude"],
        ["Higgsfield", "Higgsfield"],
      ],
    },
    {
      name: "amount",
      label: "Consumo acumulado del periodo",
      type: "number",
      required: true,
    },
    { name: "unit", label: "Unidad (tokens, créditos, USD…)", required: true },
    {
      name: "period_start",
      label: "Inicio del periodo",
      type: "datetime-local",
      required: true,
    },
    {
      name: "period_end",
      label: "Fin del periodo",
      type: "datetime-local",
      required: true,
    },
    { name: "limit_value", label: "Límite (opcional)", type: "number" },
    { name: "threshold", label: "Umbral de alerta (%)", type: "number" },
    { name: "source", label: "Fuente del registro manual", required: true },
  ],
};
const englishLabels: Record<string, string> = {
  "Empresa": "Company",
  "Contacto": "Contact",
  "Correo": "Email",
  "Teléfono": "Phone",
  "Origen / fuente": "Source",
  "Responsable": "Owner",
  "Etapa": "Stage",
  "Valor estimado (USD)": "Estimated value (USD)",
  "Probabilidad (%)": "Probability (%)",
  "Prioridad": "Priority",
  "Próximo seguimiento": "Next follow-up",
  "Motivo de pérdida": "Loss reason",
  "Industria": "Industry",
  "Ubicación": "Location",
  "Oportunidad documentada": "Documented opportunity",
  "Fecha de obtención": "Acquisition date",
  "Revisión": "Review",
  "Título": "Title",
  "Lead relacionado (UUID)": "Related lead (UUID)",
  "Participantes internos (nombres separados por comas)": "Internal participants (comma-separated names)",
  "Inicio": "Start",
  "Final": "End",
  "Tipo": "Type",
  "Estado": "Status",
  "Lead (UUID)": "Lead (UUID)",
  "Nota / actividad": "Note / activity",
  "Vencimiento": "Due date",
  "Proveedor": "Provider",
  "Consumo acumulado del periodo": "Cumulative usage for period",
  "Unidad (tokens, créditos, USD…)": "Unit (tokens, credits, USD…)",
  "Inicio del periodo": "Period start",
  "Fin del periodo": "Period end",
  "Límite (opcional)": "Limit (optional)",
  "Umbral de alerta (%)": "Alert threshold (%)",
  "Fuente del registro manual": "Manual record source",
  "Baja": "Low",
  "Alta": "High",
  "Normal": "Normal",
  "Pendiente": "Pending",
  "Aprobado": "Approved",
  "Rechazado": "Rejected",
  "Reunión": "Meeting",
  "Llamada": "Call",
  "Seguimiento": "Follow-up",
  "Tarea": "Task",
  "Programado": "Scheduled",
  "Completado": "Completed",
  "Cancelado": "Cancelled",
  "Completada": "Completed"
};
function localDate(value: unknown) {
  if (!value) return "";
  const d = new Date(String(value));
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function RecordForm({
  entity,
  row,
  stages,
  userId,
  owners = [],
  onSave,
  onClose,
  busy,
  lang = "es",
}: {
  lang?: Lang;
  entity: Entity;
  row: Row | null;
  stages: Stage[];
  userId: string;
  owners?: DisplayIdentity[];
  onSave: (values: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
  busy: boolean;
}) {
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const submitting = useRef(false);
  const t = (es: string, en: string) => pick(lang, es, en);
  const labelText = (label: string) => lang === "en" ? (englishLabels[label] ?? label) : label;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const defaults: Record<string, unknown> = {
    owner_id: userId,
    stage_id: stages[0]?.id,
    value: 0,
    probability: 0,
    priority: "normal",
    acquired_at: new Date().toISOString(),
    threshold: 80,
    ...row,
  };
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <section className={s.panel} aria-label={t("Editor de registro", "Record editor")}>
      <h2>{row?.id ? t("Editar registro", "Edit record") : t("Crear registro", "Create record")}</h2>
      <p className={s.muted}>
        {t("Fechas en tu zona:", "Dates in your timezone:")} {zone}. {t("El responsable debe tener una membresía existente.", "The owner must have an existing membership.")}
      </p>
      <form
        className={s.form}
        aria-busy={busy}
        onChange={() => setDirty(true)}
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || submitting.current) return;
          submitting.current = true;
          setError("");
          const data = Object.fromEntries(new FormData(e.currentTarget));
          const values: Record<string, unknown> = {
            ...row,
            ...data,
            timezone: zone,
          };
          try {
            for (const field of fields[entity])
              if (field.type === "datetime-local")
                values[field.name] = data[field.name]
                  ? new Date(String(data[field.name])).toISOString()
                  : null;
            await onSave(values);
            setDirty(false);
          } catch (err) {
            setError(err instanceof Error ? err.message : t("No se pudo guardar. Conservamos tu borrador.", "Could not save. Your draft is preserved."));
          } finally {
            submitting.current = false;
          }
        }}
      >
        <fieldset disabled={busy} className={s.fieldset}>
          <div className={s.formGrid}>
            {fields[entity].map((field) => {
              const options =
                field.name === "owner_id"
                  ? owners.map(o => [String(o.user_id ?? o.id), personDisplayName(o)])
                  : field.name === "stage_id"
                  ? stages.map((x) => [x.id, x.label])
                  : field.options;
              const val = defaults[field.name];
              // A missing directory must not clear an existing assignment or the signed-in user's default.
              // Keep its immutable ID as the form value; the server still validates membership on save.
              if (field.name === "owner_id" && val && !options?.some(([id]) => id === String(val))) {
                options?.push([String(val), t("Responsable actual — nombre no disponible", "Current owner — name unavailable")]);
              }
              return (
                <label key={field.name} className={s.field}>
                  <span>
                    {labelText(field.label)}
                    {field.required ? " *" : ""}
                  </span>
                  {options ? (
                    <select
                      name={field.name}
                      required={field.required}
                      defaultValue={String(val ?? options[0]?.[0] ?? "")}
                    >
                      {options.map(([value, label]) => (
                        <option key={value} value={value}>
                          {field.name === "stage_id" ? label : labelText(label)}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "textarea" ? (
                    <textarea
                      name={field.name}
                      required={field.required}
                      maxLength={entity === "activities" ? 4000 : 1000}
                      defaultValue={String(val ?? "")}
                    />
                  ) : (
                    <input
                      name={field.name}
                      type={field.type ?? "text"}
                      required={field.required}
                      min={field.type === "number" ? 0 : undefined}
                      max={
                        ["probability", "threshold"].includes(field.name)
                          ? 100
                          : undefined
                      }
                      step={field.type === "number" ? "0.01" : undefined}
                      maxLength={field.type ? undefined : 300}
                      defaultValue={
                        field.type === "datetime-local"
                          ? localDate(val)
                          : String(val ?? "")
                      }
                    />
                  )}
                </label>
              );
            })}
          </div>
          {dirty && <p role="status">{t("Cambios sin guardar", "Unsaved changes")}</p>}
          {error && <p role="alert">{error}</p>}
          <div className={s.actions}>
            <button type="submit">{busy ? t("Guardando…", "Saving…") : t("Guardar", "Save")}</button>
            <button type="button" onClick={() => { if (!dirty || window.confirm(t("¿Descartar los cambios sin guardar?", "Discard unsaved changes?"))) onClose(); }}>
              {t("Cerrar editor", "Close editor")}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
