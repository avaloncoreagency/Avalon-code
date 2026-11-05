import type { Asset } from "@/lib/creative-bridge/continuity";

/** Presentation states. "Imported" is local library availability, NOT publication or approval. */
export type GalleryStatus = "imported" | "pending" | "blocked" | "reference";
export type GalleryAsset = {
  id: string;
  kind: Asset["kind"];
  alt: string;
  state: GalleryStatus;
  originalState: Asset["state"];
  publicPath: string | null;
  posterPath: string | null;
  jobRef: string | null;
  sha256: string | null;
};
export type GalleryLink = { label: string; href: string };
export type GalleryProject = {
  id: string;
  name: string;
  service: string;
  module: string;
  serviceHref: string;
  version: number;
  updatedAt: string;
  state: GalleryStatus;
  clientKey: string;
  clientLabel: string;
  clientHref: string | null;
  leadHref: string | null;
  saleHref: string | null;
  agent: string;
  sourceRef: string | null;
  branch: string | null;
  headSha: string | null;
  ci: string | null;
  evidence: GalleryLink[];
  assets: GalleryAsset[];
  approval: string;
};

const EXTENSIONS: Record<Asset["kind"], readonly string[]> = {
  image: ["png", "jpg", "jpeg", "webp"],
  video: ["mp4"],
  model: ["glb"],
};

/** Only paths from the approved importer's content-addressed public directory. */
export function isLocalMediaPath(asset: Asset): boolean {
  if (!asset.public_path || !asset.sha256) return false;
  const match = /^\/creative-bridge\/([a-f0-9]{64})\.([a-z0-9]+)$/.exec(asset.public_path);
  return Boolean(match && match[1] === asset.sha256 && EXTENSIONS[asset.kind]?.includes(match[2]));
}

export function assetState(asset: Asset, localFilePresent: boolean, videoPosterPresent = true): GalleryStatus {
  if (asset.state === "failed" || asset.state === "cancelled") return "blocked";
  if (asset.state === "pending" || asset.state === "generating") return "pending";
  if (asset.state === "ready" && isLocalMediaPath(asset) &&
      localFilePresent && (asset.kind !== "video" || videoPosterPresent)) return "imported";
  return "blocked";
}

export function projectState(assets: readonly GalleryAsset[], sourceState: string, invalidManifest: boolean): GalleryStatus {
  if (invalidManifest || ["blocked", "failed", "cancelled"].includes(sourceState) ||
      assets.some(a => a.state === "blocked")) return "blocked";
  if (assets.some(a => a.state === "imported")) return "imported";
  if (assets.some(a => a.state === "pending") ||
      ["draft", "pending", "generating", "in_review"].includes(sourceState)) return "pending";
  return "reference";
}

export const GALLERY_LABELS: Record<GalleryStatus, string> = {
  imported: "Importado",
  pending: "Pendiente",
  blocked: "Bloqueado",
  reference: "Referencia sin verificar",
};

export function filterGallery(items: readonly GalleryProject[], filters: {
  search: string; client: string; service: string; state: string;
}): GalleryProject[] {
  const needle = filters.search.trim().toLocaleLowerCase("es");
  return items.filter(item =>
    (filters.client === "all" || item.clientKey === filters.client) &&
    (filters.service === "all" || item.module === filters.service) &&
    (filters.state === "all" || item.state === filters.state) &&
    (!needle || [item.name, item.clientLabel, item.service, item.sourceRef ?? ""]
      .some(part => part.toLocaleLowerCase("es").includes(needle)))
  );
}
