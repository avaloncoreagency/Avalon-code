import { getOwnerSession } from "@/lib/auth/session";
import { getProject, run } from "@/lib/os/data";
import { centsToInput, isUuid, slugify } from "@/lib/os/domain";
import { toCsv } from "@/lib/os/exporters";
import { download, exportError, stamp } from "@/lib/os/export-route";

export const dynamic = "force-dynamic";
type Row = { name: string; sku: string; category: string; description: string; price_cents: number; inventory: number; image_url: string; status: string; updated_at: string };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getOwnerSession();
  if (!session) return exportError("unauthorized");
  if (!isUuid(id)) return exportError("not_found");
  const project = await getProject(session.supabase, "ecommerce", id);
  if (project.error) return exportError(project.error);
  if (!project.data) return exportError("not_found");
  const currency = typeof project.data.settings?.currency === "string" ? project.data.settings.currency : "USD";
  const products = await run<Row[]>(session.supabase.from("os_store_products")
    .select("name,sku,category,description,price_cents,inventory,image_url,status,updated_at").eq("project_id", id).order("name").limit(5000));
  if (products.error) return exportError(products.error);
  const csv = toCsv(
    ["name", "sku", "category", "price", "currency", "inventory", "status", "image_url", "description", "updated_at"],
    (products.data ?? []).map(p => [p.name, p.sku, p.category, centsToInput(p.price_cents, currency), currency, p.inventory, p.status, p.image_url, p.description, p.updated_at]),
  );
  return download(csv, `${slugify(project.data.name) || "store"}-products-${stamp()}.csv`, "text/csv; charset=utf-8");
}
