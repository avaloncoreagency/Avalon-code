import { lstatSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { requireOwner } from "@/lib/auth/session";
import { manifest, type Asset, type Manifest } from "@/lib/creative-bridge/continuity";
import { CreativeControls } from "./controls";
import { CreativeGallery } from "./gallery";
import { assetState, isLocalMediaPath, projectState, type GalleryAsset, type GalleryLink, type GalleryProject } from "./gallery-logic";
import styles from "./layout.module.css";

export const dynamic = "force-dynamic";

type ProjectRow = {
  id: string; name: string; module: string; version: number;
  client_id: string | null; settings: unknown; updated_at: string | null;
};
type LeadRow = { id: string; company: string };
type ClientRow = { id: string; legal_name: string };
type SaleRow = { id: string; sale_number: string };

const object = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const value = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;
const date = (v: string | null | undefined): string => v && /^\d{4}-\d{2}-\d{2}/.test(v)
  ? v.slice(0, 10) : "fecha no registrada";
const short = (v: string) => v.slice(0, 8);

const SERVICES: Record<string, { title: string; href: string }> = {
  website: { title: "Website Designer", href: "/admin/workspace/website-designer" },
  ecommerce: { title: "E-commerce Designer", href: "/admin/workspace/ecommerce-designer" },
  crm_creator: { title: "CRM Creator", href: "/admin/workspace/crm-creator" },
  marketing: { title: "Marketing Hub", href: "/admin/workspace/marketing-hub" },
};

function safeEvidence(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash
      ? u.href : null;
  } catch { return null; }
}

/** Presence check only: byte integrity and SHA-256 verification remain Claude's importer's responsibility. */
function presentOnDisk(asset: Asset): boolean {
  if (asset.state !== "ready" || !isLocalMediaPath(asset) || !asset.public_path) return false;
  try {
    const file = lstatSync(join(process.cwd(), "public", asset.public_path.slice(1)));
    return file.isFile() && !file.isSymbolicLink() && file.size > 0;
  } catch { return false; }
}

function galleryAssets(checkpoint: Manifest): GalleryAsset[] {
  const present = new Set(checkpoint.assets.filter(presentOnDisk).map(a => a.id));
  return checkpoint.assets.map(asset => {
    const poster = asset.kind === "video"
      ? checkpoint.assets.find(candidate =>
        candidate.kind === "image" && candidate.state === "ready" &&
        candidate.storage_ref === asset.reduced_motion_ref && present.has(candidate.id))
      : null;
    const state = assetState(asset, present.has(asset.id), asset.kind !== "video" || Boolean(poster));
    return {
      id: asset.id,
      kind: asset.kind,
      alt: asset.alt,
      originalState: asset.state,
      state,
      publicPath: state === "imported" ? asset.public_path ?? null : null,
      posterPath: poster?.public_path ?? null,
      jobRef: asset.job_ref,
      sha256: asset.sha256,
    };
  });
}

function projectGallery(
  project: ProjectRow,
  leads: Map<string, string>,
  clients: Map<string, string>
): GalleryProject {
  const settings = object(project.settings);
  const creative = object(settings.creative);
  const operations = object(settings.operations);
  const raw = settings.creative_continuity;
  let checkpoint: Manifest | null = null;
  let invalidManifest = false;
  if (raw != null) {
    try { checkpoint = manifest(raw); } catch { invalidManifest = true; }
  }
  const assets = checkpoint ? galleryAssets(checkpoint) : [];
  const sourceState = value(creative.state) ?? "reference_only";
  const clientId = value(project.client_id);
  const leadId = value(operations.client_lead_id);
  const clientKey = clientId ? `client:${clientId}` : leadId ? `lead:${leadId}` : "unassigned";
  const clientLabel = clientId
    ? clients.get(clientId) ?? `Cliente vinculado (${short(clientId)})`
    : leadId ? leads.get(leadId) ?? `Empresa en CRM (${short(leadId)})` : "Sin cliente vinculado";
  const evidence: GalleryLink[] = [];
  const reported = checkpoint?.evidence;
  for (const [label, url] of [
    ["PR", reported?.pull_request], ["CI", reported?.ci_url],
    ["Preview", reported?.preview_url], ["Demostración", reported?.demo_url],
    ["Producción reportada", reported?.production_url],
  ] as const) {
    const href = safeEvidence(url);
    if (href) evidence.push({ label, href });
  }
  const service = SERVICES[project.module] ?? { title: "Otro servicio", href: "/admin/workspace" };
  return {
    id: project.id, name: project.name, module: project.module,
    service: service.title, serviceHref: service.href,
    version: project.version, updatedAt: date(project.updated_at),
    state: projectState(assets, sourceState, invalidManifest),
    clientKey, clientLabel,
    clientHref: clientId ? `/admin/workspace/crm/clients/${clientId}`
      : leadId ? `/admin/workspace/clients/${leadId}` : null,
    leadHref: leadId ? `/admin/workspace/clients/${leadId}` : null,
    saleHref: value(creative.verified_sale_id)
      ? `/admin/workspace/crm/sales/${value(creative.verified_sale_id)}` : null,
    agent: checkpoint?.agent ?? value(creative.agent) ?? "Agente no registrado",
    sourceRef: checkpoint?.project_ref ?? value(creative.source_ref) ?? value(creative.higgsfield_ref),
    branch: checkpoint?.branch ?? null,
    headSha: checkpoint?.head_sha ?? null,
    ci: checkpoint?.ci ?? null,
    evidence, assets,
    approval: "Sin evidencia de aprobación humana verificada",
  };
}

export default async function CreativeBridge() {
  const { supabase } = await requireOwner();
  const [projects, leads, sales, clients] = await Promise.all([
    supabase.from("os_projects").select("id,name,module,version,client_id,settings,updated_at")
      .eq("settings->creative->>provider", "higgsfield").order("updated_at", { ascending: false }).limit(100),
    supabase.from("crm_leads").select("id,company").eq("archived", false).order("company").limit(100),
    supabase.from("crm_sales").select("id,sale_number").eq("status", "confirmed")
      .order("created_at", { ascending: false }).limit(100),
    supabase.from("crm_clients").select("id,legal_name").order("legal_name").limit(200),
  ]);
  const rows = (projects.data ?? []) as ProjectRow[];
  const leadRows = (leads.data ?? []) as LeadRow[];
  const saleRows = (sales.data ?? []) as SaleRow[];
  const clientRows = (clients.data ?? []) as ClientRow[];
  const names = new Map(leadRows.map(l => [l.id, l.company]));
  const clientNames = new Map(clientRows.map(c => [c.id, c.legal_name]));
  const gallery = rows.map(p => projectGallery(p, names, clientNames));
  return <Suite>
    <section className={styles.bridge} aria-label="Creative Bridge">
      <header className={styles.hero}>
        <div className={styles.heroBadge}>AVALON OS / HIGGSFIELD</div>
        <h1>Avalon Creative Bridge</h1>
        <p>Biblioteca de trabajos visuales, productos digitales y clientes en un mismo lugar. Solo mostramos recursos incorporados al almacenamiento autorizado; un enlace registrado no significa publicación ni aprobación.</p>
        <nav aria-label="Accesos rápidos del Creative Bridge" className={styles.quickLinks}>
          <a href="#creative-library">Biblioteca</a>
          <a href="#creative-actions">Gestión y checkpoints</a>
          <Link href="/admin/workspace/marketing-hub">Marketing Hub</Link>
          <Link href="/admin/workspace/crm/leads">CRM</Link>
        </nav>
      </header>
      {projects.error ? <div className={styles.error} role="alert">No se pudo leer la biblioteca. Revisa permisos y migraciones aprobadas; no se muestran recursos inventados.</div> :
        <CreativeGallery projects={gallery} />}
      <section className={styles.management} id="creative-actions" aria-labelledby="creative-actions-title">
        <div className={styles.sectionIntro}>
          <div>
            <span className={styles.eyebrow}>Operaciones autorizadas</span>
            <h2 id="creative-actions-title">Gestión de productos y checkpoints</h2>
            <p>Las asociaciones y checkpoints se guardan mediante el backend existente. Ninguna acción aquí genera contenido ni publica una web.</p>
          </div>
        </div>
        {leads.error || sales.error || clients.error ?
          <p role="alert" className={styles.warning}>La información de algunas relaciones CRM no está disponible. Comprueba la conexión antes de vincular proyectos.</p> : null}
        {!projects.error ? <CreativeControls projects={rows} leads={leadRows} sales={saleRows} /> : null}
      </section>
      <p className={styles.disclaimer}>La generación Higgsfield, aprobación humana, entrega firmada, integridad SHA-256 y publicación externa son controles independientes. La biblioteca no los sustituye.</p>
    </section>
  </Suite>;
}
