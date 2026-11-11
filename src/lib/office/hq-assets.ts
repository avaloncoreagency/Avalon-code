// Higgsfield-produced assets for Avalon HQ. A path is set ONLY after the file was downloaded, verified (GLB structure +
// SHA-256) and imported through scripts/creative-bridge/import-asset.cjs (12 MiB cap unchanged). Job ids are real
// Higgsfield generations (see docs/office/HQ_0350.md); they are not secrets.
// The imported files are OPTIMIZED DERIVATIVES of the Higgsfield GLBs: geometry untouched, the four PBR textures of each
// model resized to ≤1024 px JPEG (11.5–15.1 MB → 1.1–1.5 MB) so the office loads on a phone.
export type HqAssetKey = "station" | "pod" | "ops";
export type HqAsset = {
  key: HqAssetKey; label: string; higgsfield_job: string; source_image_job: string;
  path: string | null; sha256: string | null; source_bytes: number; bytes: number | null; derivative: string | null;
};

const DERIVATIVE = "texturas ≤1024 px JPEG; geometría original";
export const HQ_ASSETS: Record<HqAssetKey, HqAsset> = {
  station: { key: "station", label: "Estación de manager", higgsfield_job: "d1e875d2-069a-4fcc-8cf4-73b259785e27", source_image_job: "7f4d5597-16b9-4c17-9d79-346f11c3ce52",
    path: "/creative-bridge/0e4257d078c2289071869d5f44f6f360b3669130d81231e51e2f7e11de220c5e.glb", sha256: "0e4257d078c2289071869d5f44f6f360b3669130d81231e51e2f7e11de220c5e", source_bytes: 11529812, bytes: 1093788, derivative: DERIVATIVE },
  pod: { key: "pod", label: "Estación reservada", higgsfield_job: "8a56b6cb-d52b-470b-b00d-76a8c2daab3b", source_image_job: "56cef512-50d8-43b1-a039-74f1fb080a7f",
    path: "/creative-bridge/cdb1613c9dd296775210f29467b790996f0e9636e9aca5ee8deaaa2a09a6f3bf.glb", sha256: "cdb1613c9dd296775210f29467b790996f0e9636e9aca5ee8deaaa2a09a6f3bf", source_bytes: 11524756, bytes: 1170576, derivative: DERIVATIVE },
  ops: { key: "ops", label: "Mesa de operaciones", higgsfield_job: "c0a35fe5-8a3a-463e-9cde-3602b9395311", source_image_job: "a42e00b2-76aa-4581-9834-de0708cf3ec1",
    path: "/creative-bridge/5cbaadffe7c91736bca140621d6f39ec43eb17f2a74634d524bfb485aa61ded8.glb", sha256: "5cbaadffe7c91736bca140621d6f39ec43eb17f2a74634d524bfb485aa61ded8", source_bytes: 15084004, bytes: 1451040, derivative: DERIVATIVE },
};

export const importedAssets = () => Object.values(HQ_ASSETS).filter(a => a.path && a.sha256);
