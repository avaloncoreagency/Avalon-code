import "server-only";

/**
 * Higgsfield's official read:usage organization report; spend only, NOT remaining balance.
 * Requires a separately issued HIGGSFIELD_ORG_KEY in the server environment.
 * Never accepts client-supplied URLs, keys, or accounts and never fetches content permissions.
 */
const URL_BASE = "https://fnf-api-gw.higgsfield.ai/fnf/v1/organization/generation_usage_report";
export type HiggsfieldUsage =
  | { status: "disconnected"; reason: string }
  | { status: "unavailable"; reason: string }
  | { status: "incomplete"; reason: string }
  | { status: "connected"; start: string; end: string; updatedAt: string;
      spentCredits: number; generations: number;
      members: Array<{ display: string; spentCredits: number; generations: number }> };

type Report = {
  data?: Array<{
    id?: unknown; type?: unknown; credits?: unknown;
    actor?: { user_id?: unknown; name?: unknown } | null;
  }>;
  has_more?: unknown; next_page?: unknown; generated_at?: unknown;
};

const round = (n: number) => Math.round(n * 100) / 100;
const cleanLabel = (v: unknown) => typeof v === "string" && v.trim()
  ? v.trim().slice(0, 70) : "Usuario no identificado";

export async function readHiggsfieldOrganizationUsage(now = new Date()): Promise<HiggsfieldUsage> {
  const key = process.env.HIGGSFIELD_ORG_KEY;
  if (!key) return { status: "disconnected",
    reason: "Falta configurar HIGGSFIELD_ORG_KEY (permiso read:usage) en el servidor de Avalon." };
  const end = now.toISOString();
  const start = new Date(now.getTime() - 7 * 86400000).toISOString();
  let nextPage: string | null = null;
  let sum = 0, generations = 0;
  let updatedAt = end;
  const actors = new Map<string,{display:string;spentCredits:number;generations:number}>();
  const seen = new Set<string>();
  try {
    for (let pageCount = 0; pageCount < 10; pageCount++) {
      const url = new URL(URL_BASE);
      url.searchParams.set("starting_at",start);
      url.searchParams.set("ending_at",end);
      url.searchParams.set("limit","1000");
      if (nextPage) url.searchParams.set("page",nextPage);
      const response = await fetch(url.toString(), {
        headers: { "x-api-key": key, "User-Agent": "avalon-os-ai-usage/1.0" },
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) return { status: "unavailable",
        reason: response.status === 401 || response.status === 403
          ? "Clave Higgsfield sin autorización read:usage o expirada."
          : "Higgsfield no pudo responder; intenta más tarde." };
      const report = await response.json() as Report;
      if (!Array.isArray(report.data) || typeof report.has_more !== "boolean")
        return {status:"unavailable",reason:"El reporte Higgsfield devolvió datos incompletos."};
      if (typeof report.generated_at === "string") updatedAt=report.generated_at;
      for (const item of report.data) {
        if (typeof item.id !== "string" || seen.has(item.id)) continue;
        seen.add(item.id);
        const credits = typeof item.credits === "string" || typeof item.credits === "number"
          ? Number(item.credits) : NaN;
        if (!Number.isFinite(credits) || credits < 0 || credits > 1e9)
          return {status:"unavailable",reason:"No se pudo interpretar un importe del proveedor."};
        sum += credits;
        if (item.type === "generation") generations++;
        const actorId = typeof item.actor?.user_id === "string" ? item.actor.user_id : "unknown";
        const existing=actors.get(actorId) ?? {
          display:cleanLabel(item.actor?.name),spentCredits:0,generations:0
        };
        existing.spentCredits += credits;
        if (item.type === "generation") existing.generations++;
        actors.set(actorId,existing);
      }
      if (!report.has_more) return {
        status:"connected",start,end,updatedAt,spentCredits:round(sum),generations,
        members:[...actors.values()].map(v=>({...v,spentCredits:round(v.spentCredits)}))
          .sort((a,b)=>b.spentCredits-a.spentCredits).slice(0,20),
      };
      if (typeof report.next_page !== "string" || !report.next_page || report.next_page.length > 2500)
        return {status:"incomplete",reason:"El reporte indicó más páginas sin paginación válida."};
      nextPage=report.next_page;
    }
    return {status:"incomplete",reason:"El reporte supera 10.000 operaciones. No se presenta un total incompleto."};
  } catch {
    return { status:"unavailable",reason:"No se pudo consultar Higgsfield en este momento." };
  }
}
