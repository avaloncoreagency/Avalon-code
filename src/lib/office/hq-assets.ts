// Higgsfield-produced assets for Avalon HQ. A path is set ONLY after the file was downloaded, verified (GLB structure +
// SHA-256) and imported through scripts/creative-bridge/import-asset.cjs. Until then the scene uses procedural geometry
// and says so. Job ids are real Higgsfield generations (see docs/office/HQ_0350.md); they are not secrets.
export type HqAssetKey = "station" | "pod" | "ops";
export type HqAsset = { key: HqAssetKey; label: string; higgsfield_job: string; source_image_job: string; path: string | null; sha256: string | null };

export const HQ_ASSETS: Record<HqAssetKey, HqAsset> = {
  station: { key: "station", label: "Estación de manager", higgsfield_job: "d1e875d2-069a-4fcc-8cf4-73b259785e27", source_image_job: "7f4d5597-16b9-4c17-9d79-346f11c3ce52", path: null, sha256: null },
  pod: { key: "pod", label: "Estación reservada", higgsfield_job: "8a56b6cb-d52b-470b-b00d-76a8c2daab3b", source_image_job: "56cef512-50d8-43b1-a039-74f1fb080a7f", path: null, sha256: null },
  ops: { key: "ops", label: "Mesa de operaciones", higgsfield_job: "c0a35fe5-8a3a-463e-9cde-3602b9395311", source_image_job: "a42e00b2-76aa-4581-9834-de0708cf3ec1", path: null, sha256: null },
};

export const importedAssets = () => Object.values(HQ_ASSETS).filter(a => a.path && a.sha256);
