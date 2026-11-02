/** CRM domain: no credentials, network calls or authorization decisions here. */
export const sections = [
  { slug: "leads", label: "Leads & Pipeline" },
  { slug: "calendar", label: "Calendario Avalon" },
  { slug: "kpis", label: "KPI Tracker" },
  { slug: "hunter", label: "Lead Hunter" },
  { slug: "ai-usage", label: "Medidores de IA" },
] as const;
export type Section = (typeof sections)[number]["slug"];
export type Entity = "leads" | "events" | "prospects" | "usage" | "activities";
export type Row = Record<string, string | number | boolean | null>;
export type Stage = {
  id: string;
  label: string;
  kind: "open" | "won" | "lost";
  position: number;
};
export const tables: Record<Entity, string> = {
  leads: "crm_leads",
  events: "crm_events",
  prospects: "crm_prospects",
  usage: "crm_usage",
  activities: "crm_activities",
};
export const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function text(
  value: unknown,
  label: string,
  max = 200,
  required = false,
) {
  if (typeof value !== "string" && value != null)
    throw new Error(`${label}: texto inválido`);
  const result = String(value ?? "").trim();
  if (result.length > max || (required && !result))
    throw new Error(`${label}: requerido o demasiado largo`);
  return result;
}
function number(value: unknown, label: string, max: number, fallback = 0) {
  const n = value === "" || value == null ? fallback : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max)
    throw new Error(`${label}: fuera de rango`);
  return n;
}
function choice(value: unknown, options: string[], fallback: string) {
  const s = String(value ?? fallback);
  if (!options.includes(s)) throw new Error("Opción inválida");
  return s;
}
function id(value: unknown, required = true) {
  if (!value && !required) return null;
  if (typeof value !== "string" || !uuid.test(value))
    throw new Error("Identificador inválido");
  return value;
}
function instant(value: unknown, required = false) {
  if (!value && !required) return null;
  if (
    typeof value !== "string" ||
    !/(Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new Error("Fecha inválida: incluye zona horaria");
  return new Date(value).toISOString();
}
function contact(input: Record<string, unknown>) {
  const email = text(input.email, "Correo", 254).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Correo inválido");
  return {
    company: text(input.company, "Empresa", 200, true),
    contact: text(input.contact, "Contacto", 160),
    email: email || null,
    phone: text(input.phone, "Teléfono", 40),
    source: text(input.source, "Origen", 200, true),
    owner_id: id(input.owner_id),
  };
}
export function validate(entity: Entity, input: Record<string, unknown>): Row {
  if (entity === "leads")
    return {
      ...contact(input),
      stage_id: text(input.stage_id, "Etapa", 50, true),
      value: number(input.value, "Valor", 1e12),
      probability: number(input.probability, "Probabilidad", 100),
      priority: choice(input.priority, ["low", "normal", "high"], "normal"),
      follow_up_at: instant(input.follow_up_at),
      loss_reason: text(input.loss_reason, "Motivo de pérdida", 1000),
      archived: input.archived === true,
    };
  if (entity === "prospects")
    return {
      ...contact(input),
      industry: text(input.industry, "Industria", 120),
      location: text(input.location, "Ubicación", 200),
      opportunity: text(input.opportunity, "Oportunidad", 1000, true),
      acquired_at: instant(input.acquired_at, true),
      status: choice(
        input.status,
        ["pending", "approved", "rejected"],
        "pending",
      ),
    };
  if (entity === "events") {
    const starts_at = instant(input.starts_at, true)!,
      ends_at = instant(input.ends_at, true)!;
    if (starts_at >= ends_at)
      throw new Error("El final debe ser posterior al inicio");
    const timezone = text(input.timezone, "Zona horaria", 100, true);
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    } catch {
      throw new Error("Zona horaria IANA inválida");
    }
    return {
      title: text(input.title, "Título", 200, true),
      owner_id: id(input.owner_id),
      lead_id: id(input.lead_id, false),
      starts_at,
      ends_at,
      timezone,
      participants: text(
        input.participants,
        "Participantes (nombres internos)",
        1000,
      ),
      kind: choice(
        input.kind,
        ["meeting", "call", "follow-up", "task"],
        "meeting",
      ),
      status: choice(
        input.status,
        ["scheduled", "completed", "cancelled"],
        "scheduled",
      ),
    };
  }
  if (entity === "activities")
    return {
      lead_id: id(input.lead_id),
      body: text(input.body, "Nota / actividad", 4000, true),
      status: choice(input.status, ["pending", "completed"], "completed"),
      due_at: instant(input.due_at),
    };
  const period_start = instant(input.period_start, true)!,
    period_end = instant(input.period_end, true)!;
  if (period_start >= period_end) throw new Error("Periodo inválido");
  return {
    provider: choice(
      input.provider,
      ["Codex", "Claude", "Higgsfield"],
      "Codex",
    ),
    amount: number(input.amount, "Consumo", 1e15),
    unit: text(input.unit, "Unidad", 50, true),
    period_start,
    period_end,
    limit_value:
      input.limit_value === "" || input.limit_value == null
        ? null
        : number(input.limit_value, "Límite", 1e15),
    threshold: number(input.threshold, "Umbral", 100, 80),
    source: text(input.source, "Fuente manual", 300, true),
    mode: "manual",
  };
}
export function scoreProspect(p: Row) {
  const reasons = [
    [!!p.email, 25, "Correo registrado"],
    [!!p.phone, 15, "Teléfono registrado"],
    [!!p.industry, 15, "Industria registrada"],
    [!!p.location, 15, "Ubicación registrada"],
    [!!p.opportunity, 30, "Oportunidad documentada"],
  ] as const;
  return {
    score: reasons.reduce((sum, [ok, points]) => sum + (ok ? points : 0), 0),
    reasons: reasons
      .filter(([ok]) => ok)
      .map(([, points, label]) => `${label}: +${points}`),
  };
}
/** RFC 4180 subset: comma-separated, escaped quotes, CRLF, BOM, quoted newlines. */
export function parseCsv(csv: string): Record<string, string>[] {
  if (csv.length > 500_000) throw new Error("CSV máximo 500 KB");
  csv = csv.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (quoted) {
      if (c === '"') {
        if (csv[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
    } else if (c === '"') {
      if (cell || closed) throw new Error("Comillas CSV inválidas");
      quoted = true;
    } else if (c === "," || c === "\n" || c === "\r") {
      row.push(cell);
      cell = "";
      closed = false;
      if (c !== ",") {
        if (c === "\r" && csv[i + 1] === "\n") i++;
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else {
      if (closed) throw new Error("Texto después de comillas CSV");
      cell += c;
    }
  }
  if (quoted) throw new Error("Comillas CSV sin cerrar");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift()?.map((h) => h.trim());
  const allowed = [
    "company",
    "contact",
    "email",
    "phone",
    "source",
    "industry",
    "location",
    "opportunity",
  ];
  if (
    !headers ||
    !["company", "source", "opportunity"].every((h) => headers.includes(h)) ||
    new Set(headers).size !== headers.length ||
    headers.some((h) => !allowed.includes(h))
  )
    throw new Error("Cabeceras CSV inválidas");
  if (!rows.length || rows.length > 200)
    throw new Error("Importa entre 1 y 200 filas");
  return rows.map((r, i) => {
    if (r.length !== headers.length)
      throw new Error(`Fila ${i + 2}: número de columnas incorrecto`);
    return Object.fromEntries(headers.map((h, j) => [h, r[j]]));
  });
}
export function metrics(
  leads: Row[],
  activities: Row[],
  stages: Stage[],
  now: number,
) {
  const active = leads.filter((l) => !l.archived),
    kind = (l: Row) => stages.find((s) => s.id === l.stage_id)?.kind;
  const won = active.filter((l) => kind(l) === "won"),
    open = active.filter((l) => kind(l) === "open");
  const sum = (rows: Row[]) => rows.reduce((n, l) => n + Number(l.value), 0);
  const ids = new Set(active.map((l) => l.id)),
    relevant = activities.filter((a) => ids.has(a.lead_id));
  return {
    created: active.length,
    conversion: active.length ? (won.length / active.length) * 100 : 0,
    open: sum(open),
    won: sum(won),
    average: active.length ? sum(active) / active.length : 0,
    completed: relevant.filter((a) => a.status === "completed").length,
    pending: relevant.filter((a) => a.status === "pending").length,
    overdue: open.filter(
      (l) => l.follow_up_at && Date.parse(String(l.follow_up_at)) < now,
    ).length,
  };
}
