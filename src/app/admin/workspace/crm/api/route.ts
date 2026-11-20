import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/session";
import { duplicateConflict, linkProspectToExistingLead } from "@/lib/crm/prospect-link";
import {
  tables,
  validate,
  parseCsv,
  metrics,
  uuid,
  type Entity,
  type Row,
  type Stage,
} from "@/lib/crm/domain";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function failure(error: unknown) {
  const code = (error as { code?: string })?.code;
  const message = String((error as { message?: string })?.message ?? "");
  // Business-rule refusals get a stable code so the pipeline can explain them and revert the card precisely.
  if (message.includes("won_requires_verified_contract"))
    return json({ code: "won_requires_contract", error: "Para marcar como Ganado se necesita un contrato firmado y verificado. Regístralo (o registra la venta) desde la ficha." }, 409);
  if (message.includes("Motivo de pérdida requerido"))
    return json({ code: "loss_reason_required", error: "Indica el motivo de pérdida para mover la oportunidad a Perdido." }, 400);
  if (["23505", "23P01"].includes(code ?? ""))
    return json(
      {
        error:
          code === "23505"
            ? "Duplicado: revisa correo, empresa/contacto o periodo de consumo."
            : "Conflicto de horario del responsable o de participantes.",
      },
      409,
    );
  if (["23514", "23503", "22P02"].includes(code ?? ""))
    return json(
      {
        error:
          "Datos inválidos: revisa campos, referencias y motivo de pérdida.",
      },
      400,
    );
  if (code === "42501")
    return json({ error: "Sin permiso para esta operación." }, 403);
  return json(
    {
      error:
        "CRM no disponible. Comprueba la conexión y que la migración haya sido aprobada y aplicada.",
    },
    503,
  );
}
// Same verified identity + owner membership (+ MFA level) check as every private page.
async function context() {
  const session = await getOwnerSession();
  if (!session) return { client: await createClient(), member: null };
  return { client: session.supabase, member: { userId: session.userId, role: "owner" as const } };
}
export async function GET(request: NextRequest) {
  try {
    const { client, member } = await context();
    if (!member) return json({ error: "No autorizado" }, 403);
    const p = request.nextUrl.searchParams,
      entity = p.get("entity") ?? "leads";
    const { data: stages, error: stageError } = await client
      .from("crm_stages")
      .select("*")
      .order("position");
    if (stageError) return failure(stageError);
    if (entity === "audit") {
      const lead = p.get("lead");
      if (!lead || !uuid.test(lead))
        return json({ error: "Lead inválido" }, 400);
      const { data, error } = await client
        .from("crm_audit")
        .select("id,operation,actor_id,created_at,before_data,after_data")
        .eq("record_id", lead)
        .order("created_at", { ascending: false })
        .limit(100);
      return error
        ? failure(error)
        : json({ rows: data, stages, userId: member.userId });
    }
    if (entity === "stage_history") {
      // Read-only stage trail of one lead (newest first): lets the board restore a lost lead to its last working stage.
      const lead = p.get("lead");
      if (!lead || !uuid.test(lead)) return json({ error: "Lead inválido" }, 400);
      const { data, error } = await client
        .from("crm_lead_stage_history")
        .select("from_stage,to_stage,changed_at")
        .eq("lead_id", lead)
        .order("changed_at", { ascending: false })
        .limit(50);
      return error ? failure(error) : json({ rows: data, stages, userId: member.userId });
    }
    if (entity !== "kpis" && !Object.hasOwn(tables, entity))
      return json({ error: "Sección inválida" }, 400);
    const owner = p.get("owner"),
      source = p.get("source"),
      from = p.get("from"),
      to = p.get("to");
    if (owner && !uuid.test(owner))
      return json({ error: "Responsable inválido" }, 400);
    if (
      [from, to].some(
        (d) =>
          d &&
          (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d))),
      )
    )
      return json({ error: "Fecha inválida" }, 400);
    if (entity === "kpis") {
      // Never silently aggregate a truncated PostgREST response. Batch reads, fail closed at the explicit ceiling.
      const all = async (table: string) => {
        const rows: Row[] = [];
        for (let offset = 0; offset <= 50000; offset += 500) {
          let query = client
            .from(table)
            .select("*")
            .order("id")
            .range(offset, offset + 499);
          if (table === "crm_leads") {
            query = query.eq("archived", false);
            if (owner) query = query.eq("owner_id", owner);
            if (source) query = query.eq("source", source);
            if (from) query = query.gte("created_at", `${from}T00:00:00Z`);
            if (to)
              query = query.lt(
                "created_at",
                new Date(Date.parse(to) + 86400000).toISOString(),
              );
          }
          const { data, error } = await query;
          if (error) throw error;
          rows.push(...data);
          if (rows.length > 50000) throw new Error("Metric capacity exceeded");
          if (data.length < 500) return rows;
        }
        throw new Error("Metric capacity exceeded");
      };
      const [leads, activities] = await Promise.all([
        all("crm_leads"),
        all("crm_activities"),
      ]);
      const group = (key: string) =>
        [...new Set(leads.map((l) => String(l[key])))].map((label) => ({
          label,
          ...metrics(
            leads.filter((l) => String(l[key]) === label),
            activities,
            stages as Stage[],
            Date.now(),
          ),
        }));
      return json({
        metrics: metrics(leads, activities, stages as Stage[], Date.now()),
        byOwner: group("owner_id"),
        bySource: group("source"),
        byStage: stages.map((s) => ({
          label: s.label,
          count: leads.filter((l) => l.stage_id === s.id).length,
        })),
        stages,
        userId: member.userId,
      });
    }
    const page = Math.max(0, Math.min(10000, Number(p.get("page")) || 0));
    const inbound = entity === "prospects" && p.get("inbound") === "true";
    // Receipt membership, not discovery source: a website inquiry may reuse an existing Radar prospect.
    let query = client
      .from(tables[entity as Entity])
      .select(inbound ? "*,crm_public_inquiries!inner(id,created_at,services,language)" : "*", { count: "exact" });
    if (p.get("id")) {
      if (!uuid.test(p.get("id")!)) return json({ error: "ID inválido" }, 400);
      query = query.eq("id", p.get("id"));
    }
    if (entity === "leads") {
      query = query.eq("archived", p.get("archived") === "true");
      if (p.get("stage")) query = query.eq("stage_id", p.get("stage"));
    }
    if (entity === "leads" || entity === "prospects") {
      if (owner) query = query.eq("owner_id", owner);
      if (source) query = query.eq("source", source);
      const q = (p.get("q") ?? "")
        .slice(0, 100)
        .replace(/[^\p{L}\p{N}\s@.-]/gu, "");
      if (q)
        query = query.or(
          `company.ilike.%${q}%,contact.ilike.%${q}%,email.ilike.%${q}%`,
        );
    }
    if (entity === "prospects") {
      const kind = p.get("source_kind"), status = p.get("status");
      if (kind && !["manual", "osm", "overture", "licensed", "web_form"].includes(kind))
        return json({ error: "Origen inválido" }, 400);
      if (status && !["pending", "approved", "rejected", "converted"].includes(status))
        return json({ error: "Estado inválido" }, 400);
      if (kind) query = query.eq("source_kind", kind);
      if (status) query = query.eq("status", status);
    }
    if (entity === "prospects")
      for (const key of ["industry", "location", "opportunity"])
        if (p.get(key))
          query = query.ilike(key, `%${p.get(key)!.slice(0, 100)}%`);
    if (entity === "activities") {
      const lead = p.get("lead");
      if (!lead || !uuid.test(lead))
        return json({ error: "Lead requerido" }, 400);
      query = query.eq("lead_id", lead);
    }
    const dateColumn = entity === "events" ? "starts_at" : "created_at";
    if (from)
      query = query.gte(
        entity === "events" ? "ends_at" : dateColumn,
        `${from}T00:00:00Z`,
      );
    if (to)
      query = query.lt(
        dateColumn,
        new Date(Date.parse(to) + 86400000).toISOString(),
      );
    const sort = ["company", "value", "created_at", "starts_at"].includes(
      p.get("sort") ?? "",
    )
      ? p.get("sort")!
      : "created_at";
    if ((sort === "company" || sort === "value") && entity !== "leads")
      return json({ error: "Orden inválido" }, 400);
    if (sort === "starts_at" && entity !== "events")
      return json({ error: "Orden inválido" }, 400);
    const { data, error, count } = await query
      .order(sort, { ascending: p.get("asc") === "true" })
      .order("id")
      .range(page * 50, page * 50 + 49);
    if (error) return failure(error);
    if (inbound) {
      // Every stored message of the listed prospects (P0.1). A database without migration 20261120160000 reports the
      // history as pending instead of pretending each prospect has only its first message.
      const ids = ((data ?? []) as unknown as { id: string }[]).map(r => r.id);
      const history = ids.length
        ? await client.from("crm_public_inquiries")
            .select("id,prospect_id,created_at,services,language,message,review_status,review_note,version,reviewed_at")
            .in("prospect_id", ids).order("created_at", { ascending: false }).limit(500)
        : { data: [], error: null };
      const pending = history.error && ["42703", "PGRST204", "42P01", "PGRST205"].includes(String(history.error.code));
      if (history.error && !pending) return failure(history.error);
      return json({ rows: data, count, page, stages, userId: member.userId,
        messages: pending ? null : history.data, messageHistory: pending ? "pending_migration" : "available" });
    }
    return json({ rows: data, count, page, stages, userId: member.userId });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    const origin = process.env.APP_ORIGIN;
    if (!origin || request.headers.get("origin") !== new URL(origin).origin)
      return json({ error: "Origen no autorizado" }, 403);
    const { client, member } = await context();
    if (!member) return json({ error: "No autorizado" }, 403);
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return json({ error: "JSON requerido" }, 415);
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Cuerpo requerido" }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 600000) {
        await reader.cancel();
        return json({ error: "Solicitud demasiado grande" }, 413);
      }
      chunks.push(value);
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return json({ error: "JSON inválido" }, 400);
    }
    if (!body || typeof body !== "object")
      return json({ error: "Datos inválidos" }, 400);
    if (body.action === "inquiry_review") {
      // Owner review of ONE website message: reversible, versioned, never creates a lead, client or sale.
      const statuses = ["pending", "legitimate", "possible_spam", "duplicate", "discarded"];
      if (typeof body.id !== "string" || !uuid.test(body.id) || !Number.isSafeInteger(body.version) || (body.version as number) < 1
          || typeof body.status !== "string" || !statuses.includes(body.status))
        return json({ error: "Revisión inválida" }, 400);
      const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
      const { data, error } = await client.from("crm_public_inquiries")
        .update({ review_status: body.status, review_note: note })
        .eq("id", body.id).eq("version", body.version).select("id,version,review_status").maybeSingle();
      if (error) return failure(error);
      if (!data) return json({ error: "La solicitud cambió. Actualiza antes de reintentar.", code: "stale" }, 409);
      return json(data);
    }
    if (body.action === "convert") {
      if (typeof body.id !== "string" || !uuid.test(body.id))
        return json({ error: "Prospecto inválido" }, 400);
      const { data, error } = await client.rpc("crm_convert_prospect", {
        prospect_id: body.id,
      });
      if (error?.code === "23505") {
        const dup = await duplicateConflict(client, body.id);
        if (dup) return json(dup.body, dup.status);
      }
      return error ? failure(error) : json({ id: data });
    }
    if (body.action === "link_existing") {
      if (typeof body.id !== "string" || !uuid.test(body.id))
        return json({ error: "Prospecto inválido" }, 400);
      const out = await linkProspectToExistingLead(client, body.id);
      return out.ok ? json({ id: out.leadId }) : json({ error: out.error }, out.status);
    }
    if (body.action === "import") {
      let rows: Row[];
      try {
        rows = parseCsv(String(body.csv ?? "")).map((row) =>
          validate("prospects", {
            ...row,
            owner_id: member.userId,
            acquired_at: new Date().toISOString(),
            status: "pending",
          }),
        );
      } catch (error) {
        return json({ error: (error as Error).message }, 400);
      }
      // One insert statement: the entire CSV rolls back on a duplicate or invalid row.
      const { error } = await client.from("crm_prospects").insert(rows);
      return error ? failure(error) : json({ imported: rows.length }, 201);
    }
    const entity = body.entity as Entity;
    if (!Object.hasOwn(tables, entity))
      return json({ error: "Entidad inválida" }, 400);
    let values: Row;
    try {
      if (
        !body.values ||
        typeof body.values !== "object" ||
        Array.isArray(body.values)
      )
        throw new Error("Campos requeridos");
      values = validate(entity, body.values as Record<string, unknown>);
    } catch (error) {
      return json({ error: (error as Error).message }, 400);
    }
    if (body.id) {
      if (
        typeof body.id !== "string" ||
        !uuid.test(body.id) ||
        !Number.isInteger(body.version) ||
        Number(body.version) < 1
      )
        return json({ error: "Versión o identificador inválido" }, 400);
      const { data, error } = await client
        .from(tables[entity])
        .update(values)
        .eq("id", body.id)
        .eq("version", body.version)
        .select("id,version")
        .maybeSingle();
      if (error) return failure(error);
      if (!data)
        return json(
          {
            code: "stale",
            error:
              "El registro cambió o ya no está disponible. Recarga antes de editar.",
          },
          409,
        );
      return json(data);
    }
    const { data, error } = await client
      .from(tables[entity])
      .insert(values)
      .select("id,version")
      .single();
    return error ? failure(error) : json(data, 201);
  } catch (error) {
    return failure(error);
  }
}
