"use client";

import { useEffect, useState } from "react";
import { saveTaskDetails } from "@/app/admin/workspace/crm/tasks/actions";
import { TASK_PRIORITIES, label } from "@/lib/sales/domain";
import { pick, type Lang } from "@/lib/i18n";
import s from "@/components/sales/sales.module.css";

type Owner = { user_id: string; email: string };
type Task = {
  id: string; title: string; description: string; priority: string;
  assignee_id: string; due_at: string | null; version: number;
};

function localDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) +
    "T" + pad(date.getHours()) + ":" + pad(date.getMinutes());
}

/** Browser-local editing; the posted UTC instant is still validated in the server action. */
export function TaskEditForm({ task, owners, view, page, client, workOrder, lang }: {
  task: Task; owners: Owner[]; view: string; page: number; client?: string; workOrder?: string; lang: Lang;
}) {
  const [ready, setReady] = useState(false);
  const [dueLocal, setDueLocal] = useState("");
  useEffect(() => {
    setDueLocal(localDateTime(task.due_at));
    setReady(true);
  }, [task.id, task.due_at]);
  const date = dueLocal ? new Date(dueLocal) : null;
  const dueIso = !date ? "" : Number.isFinite(date.getTime()) ? date.toISOString() : "invalid";

  return <form action={saveTaskDetails} className={s.form}>
    <input type="hidden" name="task_id" value={task.id} />
    <input type="hidden" name="version" value={task.version} />
    <input type="hidden" name="view" value={view} />
    <input type="hidden" name="page" value={page} />
    <input type="hidden" name="client" value={client ?? ""} />
    <input type="hidden" name="work_order" value={workOrder ?? ""} />
    <input type="hidden" name="due_at_iso" value={dueIso} />
    <label className={s.field}>{pick(lang, "Título", "Title")}
      <input name="title" defaultValue={task.title} required maxLength={200} />
    </label>
    <label className={s.field}>{pick(lang, "Descripción", "Description")}
      <textarea name="description" defaultValue={task.description} maxLength={4000} rows={4} />
    </label>
    <div className={s.row}>
      <label className={s.field}>{pick(lang, "Responsable", "Assignee")}
        <select name="assignee_id" defaultValue={task.assignee_id} required>
          {owners.map(o => <option key={o.user_id} value={o.user_id}>{o.email.split("@")[0]}</option>)}
        </select>
      </label>
      <label className={s.field}>{pick(lang, "Prioridad", "Priority")}
        <select name="priority" defaultValue={task.priority}>
          {TASK_PRIORITIES.map(p => <option key={p} value={p}>{label(lang, p)}</option>)}
        </select>
      </label>
    </div>
    <label className={s.field}>{pick(lang, "Vencimiento (hora de tu dispositivo)", "Due date (device time)")}
      <input type="datetime-local" value={dueLocal} onChange={e => setDueLocal(e.target.value)}
        disabled={!ready} />
    </label>
    <button className={s.button} type="submit" disabled={!ready}>
      {pick(lang, "Guardar edición", "Save changes")}
    </button>
  </form>;
}
