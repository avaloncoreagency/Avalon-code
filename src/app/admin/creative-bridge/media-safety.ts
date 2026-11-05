import type { Asset } from '@/lib/creative-bridge/continuity';
import type { CreativeCatalogState } from './catalog';

/**
 * Preview only registered, checksum-shaped LOCAL media routes.
 * This is not a byte-integrity check, a license check or Higgsfield job verification.
 * GLB is deliberately not previewable until the signed backend manifest supports it.
 */
export function safeCreativeMediaPath(asset: Asset): string | null {
  if (asset.state !== 'ready' || typeof asset.public_path !== 'string' ||
      typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(asset.sha256)) return null;
  const extension = asset.kind === 'image' ? '(?:png|jpe?g|webp)' : asset.kind === 'video' ? 'mp4' : null;
  if (!extension) return null;
  const expected = new RegExp('^/creative-bridge/' + asset.sha256 + '\\.' + extension + '$', 'i');
  return expected.test(asset.public_path) ? asset.public_path : null;
}

/** A blocked/pending/reference-only project must not render media from a ready asset. */
export function previewPathForStatus(status: CreativeCatalogState, asset: Asset): string | null {
  return status === 'imported' ? safeCreativeMediaPath(asset) : null;
}

export function safeReducedMotionImage(video: Asset, assets: readonly Asset[]): Asset | null {
  if (video.kind !== 'video' || !safeCreativeMediaPath(video) ||
      typeof video.reduced_motion_ref !== 'string' || !video.reduced_motion_ref) return null;
  return assets.find(asset => asset.kind === 'image' &&
    asset.storage_ref === video.reduced_motion_ref && Boolean(safeCreativeMediaPath(asset))) ?? null;
}
