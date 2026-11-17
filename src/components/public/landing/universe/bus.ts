import type { Frame, UniverseHandle } from "./scene";

/**
 * Tiny in-page bus between the WebGL scene and the DOM stages. Scroll progress is published by LivingUniverse even
 * when the scene never loads (no WebGL), so the stages still advance; projected positions exist only while it is live.
 */
type FrameListener = (f: Frame) => void;
type ProgressListener = (t: number) => void;
const frames = new Set<FrameListener>(), progress = new Set<ProgressListener>();
let handle: UniverseHandle | null = null, lastT = 0;

export const universeBus = {
  attach(h: UniverseHandle) { handle = h; h.setTimeline(lastT); h.onFrame(f => { for (const l of frames) l(f); }); },
  detach() { handle?.onFrame(null); handle = null; },
  publish(t: number) { lastT = t; handle?.setTimeline(t); for (const l of progress) l(t); },
  onFrame(l: FrameListener) { frames.add(l); return () => { frames.delete(l); }; },
  onProgress(l: ProgressListener) { progress.add(l); l(lastT); return () => { progress.delete(l); }; },
  engine(i: number) { handle?.setEngineActive(i); },
  engineHover(i: number | null) { handle?.setEngineHover(i); },
  apple(i: number | null) { handle?.setAppleActive(i); },
};
