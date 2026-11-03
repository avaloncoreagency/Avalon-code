/**
 * Pure isometric camera math. Coordinates are SVG world units, not device pixels.
 * ViewBox zoom stays anchored to the fingers/cursor, with hard room bounds.
 */
export type Camera = { zoom: number; panX: number; panY: number };
export type CameraBounds = { minX: number; minY: number; width: number; height: number };
export type Anchor = { x: number; y: number };

export const OFFICE_MIN_ZOOM = 1;
export const OFFICE_MAX_ZOOM = 3.6;
export const INITIAL_CAMERA: Camera = { zoom: 1, panX: 0, panY: 0 };

const finite = (n: number, fallback: number) => Number.isFinite(n) ? n : fallback;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const safeAnchor = (a: Anchor): Anchor => ({
  x: clamp(finite(a.x, 0.5), 0, 1),
  y: clamp(finite(a.y, 0.5), 0, 1),
});

export function clampOfficeCamera(camera: Camera, bounds: CameraBounds): Camera {
  const zoom = clamp(finite(camera.zoom, 1), OFFICE_MIN_ZOOM, OFFICE_MAX_ZOOM);
  const maxPanX = bounds.width * (1 - 1 / zoom) / 2;
  const maxPanY = bounds.height * (1 - 1 / zoom) / 2;
  return {
    zoom,
    panX: clamp(finite(camera.panX, 0), -maxPanX, maxPanX),
    panY: clamp(finite(camera.panY, 0), -maxPanY, maxPanY),
  };
}

export function officeViewport(camera: Camera, bounds: CameraBounds) {
  const c = clampOfficeCamera(camera, bounds);
  const width = bounds.width / c.zoom, height = bounds.height / c.zoom;
  return {
    x: bounds.minX + (bounds.width - width) / 2 + c.panX,
    y: bounds.minY + (bounds.height - height) / 2 + c.panY,
    width, height,
  };
}

/** Zoom at a point, optionally moving the focal point as fingers move. */
export function zoomOfficeAt(
  camera: Camera, bounds: CameraBounds, requestedZoom: number,
  previous: Anchor = { x: 0.5, y: 0.5 }, next: Anchor = previous,
): Camera {
  const oldView = officeViewport(camera, bounds);
  const z = clamp(finite(requestedZoom, camera.zoom), OFFICE_MIN_ZOOM, OFFICE_MAX_ZOOM);
  const p = safeAnchor(previous), q = safeAnchor(next);
  const nextWidth = bounds.width / z, nextHeight = bounds.height / z;
  const worldX = oldView.x + p.x * oldView.width;
  const worldY = oldView.y + p.y * oldView.height;
  return clampOfficeCamera({
    zoom: z,
    panX: worldX - q.x * nextWidth - (bounds.minX + (bounds.width - nextWidth) / 2),
    panY: worldY - q.y * nextHeight - (bounds.minY + (bounds.height - nextHeight) / 2),
  }, bounds);
}

/** Pan by world units, not CSS pixels. Negative delta moves the view to the right. */
export function panOfficeBy(camera: Camera, bounds: CameraBounds, deltaX: number, deltaY: number): Camera {
  return clampOfficeCamera({
    zoom: camera.zoom, panX: camera.panX + finite(deltaX, 0), panY: camera.panY + finite(deltaY, 0),
  }, bounds);
}

/** SVG defaults to preserveAspectRatio=xMidYMid meet: account for letterboxing. */
export function officePointerAnchor(
  clientX: number, clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  camera: Camera, bounds: CameraBounds,
): Anchor {
  const view = officeViewport(camera, bounds);
  const scale = Math.min(rect.width / view.width, rect.height / view.height);
  if (!Number.isFinite(scale) || scale <= 0) return { x: 0.5, y: 0.5 };
  const drawnW = view.width * scale, drawnH = view.height * scale;
  return safeAnchor({
    x: (clientX - rect.left - (rect.width - drawnW) / 2) / drawnW,
    y: (clientY - rect.top - (rect.height - drawnH) / 2) / drawnH,
  });
}
