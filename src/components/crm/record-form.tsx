"use client";
import { useState } from "react";
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
    label: "Responsable (UUID de membresía)",
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
    { name: "owner_id", label: "Responsable (UUID)", required: true },
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
  onSave,
  onClose,
  busy,
}: {
  entity: Entity;
  row: Row | null;
  stages: Stage[];
  userId: string;
  onSave: (values: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
  busy: boolean;
}) {
  const [error, setError] = useState("");
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
    <section className={s.panel} aria-label="Editor de registro">
      <h2>{row?.id ? "Editar registro" : "Crear registro"}</h2>
      <p className={s.muted}>
        Fechas en tu zona: {zone}. El responsable debe tener una membresía
        existente.
      </p>
      <form
        className={s.form}
        onSubmit={async (e) => {
          e.preventDefault();
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
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <fieldset disabled={busy} className={s.fieldset}>
          <div className={s.formGrid}>
            {fields[entity].map((field) => {
              const options =
                field.name === "stage_id"
                  ? stages.map((x) => [x.id, x.label])
                  : field.options;
              const val = defaults[field.name];
              return (
                <label key={field.name} className={s.field}>
                  <span>
                    {field.label}
                    {field.required ? " *" : ""}
                  </span>
                  {options ? (
                    <select
                      name={field.name}
                      defaultValue={String(val ?? options[0][0])}
                    >
                      {options.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
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
          {error && <p role="alert">{error}</p>}
          <div className={s.actions}>
            <button type="submit">{busy ? "Guardando…" : "Guardar"}</button>
            <button type="button" onClick={onClose}>
              Cerrar editor
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
