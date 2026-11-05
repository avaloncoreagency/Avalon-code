"use client";
// Avalon HQ — the ONE interactive 3D headquarters. Real data only:
// • manager stations: GET /admin/workspace/crm/office/manager-activity (nothing animates unless a run is genuinely running;
//   the Higgsfield desk monitors only light up during a real run);
// • owner desks: real members and presence passed in by the Office (no invented people);
// • five reserved seats for Samuel's future team: empty cubicles, no account, no automation.
// Models: Higgsfield GLBs imported through the Creative Bridge (optimized derivatives, see src/lib/office/hq-assets.ts);
// procedural furniture is only a fallback if a model cannot load.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isHqTap, trackHqPointerMove, type HqPointerStart } from "@/lib/office/hq-tap";
import Link from "next/link";
import type * as THREE from "three";
import { HQ_STATIONS, stationView, type StationView } from "@/lib/office/hq-layout";
import { HQ_ASSETS, importedAssets } from "@/lib/office/hq-assets";
import type { ManagerActivity } from "@/lib/agents/policy";
import styles from "./hq-3d.module.css";

export type HqActivity = { managers: ManagerActivity[]; meta: { kill_switch: boolean; automatic_enabled: boolean; executor_kind: string } };
type Activity = HqActivity;
export type HqPerson = { id: string; name: string; initials: string; subtitle: string; presence: "active" | "busy" | "inactive" };
type Preset = "overview" | "managers" | "team" | "direction" | "ops";
type Perf = { firstFrameMs: number | null; modelsMs: number | null; calls: number; triangles: number; textures: number; tier: "desktop" | "mobile" };

const ACTIVITY_URL = "/admin/workspace/crm/office/manager-activity";
const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
/** Presence colours — same meaning as the directory: green available, amber busy, red off hours / away. */
export const PRESENCE_COLOR: Record<HqPerson["presence"], number> = { active: 0x2fd39a, busy: 0xffb347, inactive: 0xff5a6e };
const PRESENCE_TEXT: Record<HqPerson["presence"], string> = { active: "Disponible", busy: "Ocupado", inactive: "Fuera de horario" };
/** Up to four owner desks on the east/west wings, facing the operations table. */
const DIRECTION_SLOTS = [[-10.4, -0.4], [10.4, -0.4], [-10.6, 2.8], [10.6, 2.8]] as const;

function supportsWebGL(): boolean {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

export function Hq3d({ team = [], onSelectPerson, onActivityChange }: { team?: HqPerson[]; onSelectPerson?: (id: string) => void; onActivityChange?: (value: HqActivity | null) => void }) {
  const mount = useRef<HTMLDivElement>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [activityError, setActivityError] = useState(false);
  // Only the most recently requested manager snapshot may update the 3D scene.
  const activitySequence = useRef(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [cameraPreset, setCameraPreset] = useState<Preset | null>("overview");
  const [lite, setLite] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState<number | null>(null);
  const [perf, setPerf] = useState<Perf | null>(null);
  const api = useRef<{ focus: (id: string | null) => void; preset: (p: Preset) => void; update: (views: Record<string, StationView>, people: HqPerson[], act: Activity | null) => void } | null>(null);
  const teamRef = useRef(team); teamRef.current = team;
  const selectPerson = useRef(onSelectPerson); selectPerson.current = onSelectPerson;
  const activityListener = useRef(onActivityChange); activityListener.current = onActivityChange;
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const cameraPresetRef = useRef(cameraPreset); cameraPresetRef.current = cameraPreset;
  const chooseStation = useCallback((id: string | null) => { setSelected(id); setCameraPreset(id ? null : "overview"); }, []);

  const views = useMemo(() => Object.fromEntries(HQ_STATIONS.map(s => [s.id, stationView(s, activityError ? null : activity?.managers ?? [])])), [activity, activityError]);
  const people = useMemo(() => team.slice(0, DIRECTION_SLOTS.length), [team]);
  const teamKey = people.map(p => `${p.id}:${p.presence}`).join("|");

  const load = useCallback(async () => {
    const sequence = ++activitySequence.current;
    try {
      const r = await fetch(ACTIVITY_URL, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const next = await r.json() as HqActivity;
      // Slow/failed older requests must not overwrite newer real telemetry.
      if (sequence !== activitySequence.current) return;
      setActivity(next); setActivityError(false); activityListener.current?.(next);
    } catch {
      if (sequence !== activitySequence.current) return;
      setActivity(null); setActivityError(true); activityListener.current?.(null);
    }
  }, []);

  useEffect(() => {
    setLite(!supportsWebGL() || new URLSearchParams(location.search).get("vista") === "ligera");
    void load();
    // Safari may suspend intervals while backgrounded; refresh immediately on return.
    const onActivityVisibility = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onActivityVisibility);
    const t = setInterval(onActivityVisibility, 20000);
    return () => {
      activitySequence.current++; // Invalidate responses that finish after unmount.
      clearInterval(t);
      document.removeEventListener("visibilitychange", onActivityVisibility);
    };
  }, [load]);

  // Build the scene once; data changes only re-tint lights and redraw the real-data screens.
  useEffect(() => {
    if (lite !== false || !mount.current) return;
    let disposed = false; let cleanup = () => {};
    const t0 = performance.now();
    (async () => {
      const T = await import("three");
      const [{ OrbitControls }, { CSS2DRenderer, CSS2DObject }, { RoomEnvironment }, { RoundedBoxGeometry }] = await Promise.all([
        import("three/examples/jsm/controls/OrbitControls.js"), import("three/examples/jsm/renderers/CSS2DRenderer.js"),
        import("three/examples/jsm/environments/RoomEnvironment.js"), import("three/examples/jsm/geometries/RoundedBoxGeometry.js"),
      ]);
      if (disposed || !mount.current) return;
      const el = mount.current;
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const mobile = matchMedia("(max-width: 760px), (pointer: coarse)").matches;
      const renderer = new T.WebGLRenderer({ antialias: !mobile, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
      renderer.setSize(el.clientWidth, el.clientHeight);
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
      renderer.shadowMap.enabled = !mobile; renderer.shadowMap.type = T.PCFSoftShadowMap;
      el.appendChild(renderer.domElement);
      const labels = new CSS2DRenderer(); labels.setSize(el.clientWidth, el.clientHeight);
      labels.domElement.className = styles.labels; el.appendChild(labels.domElement);

      const scene = new T.Scene();
      scene.background = new T.Color(0x040714);
      scene.fog = new T.Fog(0x040714, 26, 52);
      const pmrem = new T.PMREMGenerator(renderer);
      const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTex; scene.environmentIntensity = 0.55;
      const camera = new T.PerspectiveCamera(mobile ? 58 : 42, el.clientWidth / el.clientHeight, 0.1, 140);
      const home = mobile ? new T.Vector3(0, 30, 12) : new T.Vector3(0, 13.5, 19.5);
      camera.position.copy(home);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = !reduced; controls.dampingFactor = 0.08;
      controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 3.5; controls.maxDistance = 34; controls.enablePan = !mobile;
      controls.target.set(0, mobile ? 0 : 1, mobile ? 0 : -1.5);

      // ── Light: low ambient + one soft key with shadows + Avalon cyan/violet/blue accents ─────────────────────────────
      scene.add(new T.HemisphereLight(0x9cb8ff, 0x0b0618, 0.35));
      const key = new T.DirectionalLight(0xfff4e8, 1.35); key.position.set(7, 16, 9);
      key.castShadow = !mobile; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
      Object.assign(key.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 2, far: 40 });
      scene.add(key);
      // Low-cost, shadow-free cool fill: separates the original Higgsfield PBR models from the dark back wall.
      const rim = new T.DirectionalLight(0x8eaaff, 0.52); rim.position.set(-8, 10, -7); scene.add(rim);
      for (const [c, x, z, i] of [[0x22e6ff, -10, -7, 30], [0x8f5cff, 10, -7, 30], [0x3d7bff, 0, 10, 26], [0xc04bd9, 0, -12, 18]] as const) {
        const l = new T.PointLight(c, i, 24, 1.7); l.position.set(x, 5.2, z); scene.add(l);
      }

      // ── Canvas textures (signage, floor, real-data screens) ───────────────────────────────────────────────────────
      const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) => {
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        const g = c.getContext("2d")!; draw(g);
        const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = mobile ? 2 : 8;
        if (repeat) { tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.repeat.set(...repeat); }
        return { tex, canvas: c, g };
      };
      const floorTex = canvasTex(512, 512, g => {
        g.fillStyle = "#0b1022"; g.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 380; i++) { g.fillStyle = `rgba(${120 + Math.random() * 60},${140 + Math.random() * 60},255,${Math.random() * 0.035})`; g.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 30, 1 + Math.random() * 3); }
        g.strokeStyle = "rgba(120,140,220,0.16)"; g.lineWidth = 2; g.strokeRect(1, 1, 510, 510);
      }, [12, 12]);

      // ── Architecture ──────────────────────────────────────────────────────────────────────────────────────────────
      const metal = new T.MeshStandardMaterial({ color: 0xafbdd6, metalness: 0.82, roughness: 0.34 });
      const darkMetal = new T.MeshStandardMaterial({ color: 0x1b2038, metalness: 0.85, roughness: 0.35 });
      const floor = new T.Mesh(new T.CircleGeometry(16, mobile ? 48 : 96), new T.MeshStandardMaterial({ map: floorTex.tex, color: 0xffffff, metalness: 0.26, roughness: 0.44 }));
      floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
      const carpet = new T.Mesh(new T.RingGeometry(2.9, 5.2, mobile ? 48 : 96), new T.MeshStandardMaterial({ color: 0x141a3a, roughness: 0.95, metalness: 0 }));
      carpet.rotation.x = -Math.PI / 2; carpet.position.y = 0.006; carpet.receiveShadow = true; scene.add(carpet);
      const ledMat = (c: number, i = 2.2) => new T.MeshStandardMaterial({ color: 0x050816, emissive: c, emissiveIntensity: i });
      for (const [r, c] of [[5.25, 0x22e6ff], [11.3, 0x6b5cff], [15.3, 0x22e6ff]] as const) {
        const strip = new T.Mesh(new T.TorusGeometry(r, 0.025, 6, mobile ? 64 : 160), ledMat(c, 1.6)); strip.rotation.x = Math.PI / 2; strip.position.y = 0.02; scene.add(strip);
      }
      // Glass curtain wall with metal mullions and two transoms (front opening towards the camera).
      const arcStart = Math.PI * 0.12, arcLen = Math.PI * 1.76;
      const glass = new T.Mesh(new T.CylinderGeometry(15.6, 15.6, 7.2, mobile ? 48 : 96, 1, true, arcStart, arcLen),
        new T.MeshPhysicalMaterial({ color: 0x2a3a78, transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0.2, clearcoat: 1, side: T.DoubleSide, depthWrite: false }));
      glass.position.y = 3.6; scene.add(glass);
      const mullions = mobile ? 20 : 36;
      const mullion = new T.BoxGeometry(0.09, 7.2, 0.14);
      for (let i = 0; i <= mullions; i++) {
        const a = arcStart + (arcLen * i) / mullions;
        const m = new T.Mesh(mullion, metal); m.position.set(Math.sin(a) * 15.6, 3.6, Math.cos(a) * 15.6); m.rotation.y = a; scene.add(m);
      }
      for (const y of [0.05, 2.6]) {
        const tr = new T.Mesh(new T.TorusGeometry(15.6, 0.05, 6, mobile ? 64 : 160, arcLen), y === 2.6 ? darkMetal : metal);
        tr.rotation.x = Math.PI / 2; tr.rotation.z = -arcStart - Math.PI / 2 + Math.PI; tr.position.y = y; scene.add(tr);
      }

      // Back wall with Avalon signage and two real-data wall screens.
      const wall = new T.Mesh(new T.CylinderGeometry(15.2, 15.2, 6.6, mobile ? 32 : 64, 1, true, Math.PI * 0.78, Math.PI * 0.44),
        new T.MeshStandardMaterial({ color: 0x0b1024, metalness: 0.4, roughness: 0.55, side: T.BackSide }));
      wall.position.y = 3.3; scene.add(wall);
      const sign = canvasTex(1024, 192, g => {
        const grad = g.createLinearGradient(0, 0, 1024, 0); grad.addColorStop(0, "#22e6ff"); grad.addColorStop(1, "#c04bd9");
        g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = grad;
        let size = 90; do { g.font = `600 ${size}px system-ui, sans-serif`; size -= 4; } while (g.measureText("AVALON CORE AGENCY").width > 940 && size > 30);
        g.fillText("AVALON CORE AGENCY", 512, 84); g.font = "500 34px system-ui, sans-serif"; g.fillStyle = "#a9b2d9"; g.fillText("HEADQUARTERS · OPERATIONS", 512, 158);
      });
      const signMesh = new T.Mesh(new T.PlaneGeometry(9, 1.7), new T.MeshBasicMaterial({ map: sign.tex, transparent: true, toneMapped: false }));
      signMesh.position.set(0, 4.75, -14.2); scene.add(signMesh); // curved back wall: at x=±4.5 it sits at z≈-14.5
      const wallScreen = canvasTex(768, 432, () => {});
      const wallMesh = new T.Mesh(new T.PlaneGeometry(5.6, 3.15), new T.MeshBasicMaterial({ map: wallScreen.tex, toneMapped: false }));
      wallMesh.position.set(0, 2.35, -14.8); scene.add(wallMesh);
      const screenFrame = new T.Mesh(new RoundedBoxGeometry(5.85, 3.4, 0.08, 3, 0.05), darkMetal); screenFrame.position.set(0, 2.35, -14.86); scene.add(screenFrame);
      const drawWall = (act: Activity | null) => {
        const g = wallScreen.g; const W = 768, H = 432;
        g.fillStyle = "#060a1c"; g.fillRect(0, 0, W, H);
        g.fillStyle = "#22e6ff"; g.font = "600 30px system-ui, sans-serif"; g.fillText("ESTADO OPERATIVO · DATOS REALES", 32, 54);
        const ms = act?.managers ?? [];
        const count = (st: string) => ms.filter(m => m.status === st).length;
        const rows: [string, string, string][] = act ? [
          ["En ejecución", String(count("running")), count("running") ? "#22e6ff" : "#8e97c2"],
          ["Completadas (última)", String(count("completed")), "#2fd39a"],
          ["Fallidas / bloqueadas", String(count("failed") + count("blocked")), count("failed") + count("blocked") ? "#ff5a6e" : "#8e97c2"],
          ["Modo automático", act.meta.automatic_enabled ? "Activado" : "Desactivado", "#e7ebff"],
          ["Interruptor de emergencia", act.meta.kill_switch ? "ACTIVO" : "Inactivo", act.meta.kill_switch ? "#ff5a6e" : "#2fd39a"],
        ] : [["Actividad", "Sin datos", "#8e97c2"]];
        rows.forEach(([k, v, c], i) => {
          g.fillStyle = "#a9b2d9"; g.font = "400 28px system-ui, sans-serif"; g.fillText(k, 32, 120 + i * 62);
          g.fillStyle = c; g.font = "600 34px system-ui, sans-serif"; g.textAlign = "right"; g.fillText(v, W - 32, 120 + i * 62); g.textAlign = "left";
        });
        wallScreen.tex.needsUpdate = true;
      };

      // Planters (sculptural, low poly) at the perimeter.
      const potMat = new T.MeshStandardMaterial({ color: 0xd9dde8, metalness: 0.1, roughness: 0.4 });
      const leafMat = new T.MeshStandardMaterial({ color: 0x2f6b4f, roughness: 0.8, flatShading: true });
      for (const a of mobile ? [0.35, 1.65] : [0.3, 0.85, 1.15, 1.7]) {
        const ang = Math.PI * a; const x = Math.cos(ang) * 13.8, z = -Math.sin(ang) * 13.8;
        const pot = new T.Mesh(new T.CylinderGeometry(0.5, 0.38, 0.9, 24), potMat); pot.position.set(x, 0.45, z); pot.castShadow = !mobile; scene.add(pot);
        const leaves = new T.Mesh(new T.IcosahedronGeometry(0.85, 1), leafMat); leaves.position.set(x, 1.5, z); leaves.scale.set(1, 1.25, 1); leaves.castShadow = !mobile; scene.add(leaves);
      }

      // ── Stations ──────────────────────────────────────────────────────────────────────────────────────────────────
      type StationRef = { group: THREE.Group; furniture: THREE.Object3D[]; halo: THREE.MeshBasicMaterial; light: THREE.PointLight | null;
        screen: ReturnType<typeof canvasTex> | null; panel: THREE.Mesh | null; monitorMats: THREE.MeshStandardMaterial[]; animate: boolean };
      const pickables: THREE.Object3D[] = [];
      const stations: Record<string, StationRef> = {};
      const deskMat = new T.MeshPhysicalMaterial({ color: 0xe9edf7, metalness: 0.2, roughness: 0.3, clearcoat: 0.8 });
      const topGeo = new RoundedBoxGeometry(2.1, 0.08, 0.95, 3, 0.04);
      const haloGeo = new T.RingGeometry(1.35, 1.46, mobile ? 40 : 72);
      const hitGeo = new T.BoxGeometry(2.6, 2.4, 2.4);
      const panelGeo = new T.PlaneGeometry(mobile ? 2.4 : 2.1, mobile ? 1.2 : 1.05);
      const fallbackDesk = (g: THREE.Group, accent: number) => {
        const top = new T.Mesh(topGeo, deskMat); top.position.y = 0.92; top.castShadow = top.receiveShadow = !mobile;
        const legL = new T.Mesh(new T.BoxGeometry(0.06, 0.9, 0.8), metal); legL.position.set(-0.98, 0.46, 0);
        const legR = legL.clone(); legR.position.x = 0.98;
        const mon = new T.Mesh(new RoundedBoxGeometry(1.4, 0.62, 0.05, 2, 0.02), new T.MeshStandardMaterial({ color: 0x0a0f22, emissive: accent, emissiveIntensity: 0.15 }));
        mon.position.set(0, 1.42, -0.3);
        const parts = [top, legL, legR, mon]; parts.forEach(p => g.add(p)); return parts;
      };
      const addStation = (id: string, x: number, z: number, facing: number, kind: "manager" | "reserved" | "person", text: string, aria: string, onClick: () => void) => {
        const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = facing; g.userData.station = id;
        const halo = new T.MeshBasicMaterial({ color: 0x47507a, transparent: true, opacity: 0.55, toneMapped: false });
        const pad = new T.Mesh(haloGeo, halo); pad.rotation.x = -Math.PI / 2; pad.position.y = 0.025; g.add(pad);
        const hit = new T.Mesh(hitGeo, new T.MeshBasicMaterial({ visible: false })); hit.position.y = 1.2; hit.userData.station = id; g.add(hit); pickables.push(hit);
        let screen: ReturnType<typeof canvasTex> | null = null; let panel: THREE.Mesh | null = null;
        if (kind !== "reserved") {
          // Floating real-data panel above the desk (the only "screen" whose content is meaningful).
          screen = canvasTex(512, 256, () => {});
          const plane = new T.Mesh(panelGeo, new T.MeshBasicMaterial({ map: screen.tex, transparent: true, toneMapped: false, depthWrite: false }));
          // World-space billboard above the desk: always readable from the current camera.
          plane.position.set(x, 2.75, z); plane.renderOrder = 2;
          plane.onBeforeRender = (_r, _s, cam) => { plane.quaternion.copy(cam.quaternion); };
          scene.add(plane); panel = plane;
        }
        const tag = document.createElement("button");
        tag.type = "button"; tag.className = kind === "reserved" ? `${styles.tag} ${styles.tagReserved}` : kind === "person" ? `${styles.tag} ${styles.tagPerson}` : styles.tag;
        tag.textContent = text; tag.setAttribute("aria-label", aria); tag.addEventListener("click", onClick);
        const label = new CSS2DObject(tag); label.position.set(0, kind === "reserved" ? 2.1 : 3.55, 0); g.add(label);
        const light = kind === "manager" && !mobile ? new T.PointLight(0x47507a, 0, 4.5, 2) : null;
        if (light) { light.position.set(0, 1.7, 0.4); g.add(light); }
        scene.add(g);
        stations[id] = { group: g, furniture: fallbackDesk(g, kind === "reserved" ? 0x2a1d3a : 0x1a2a5a), halo, light, screen, panel, monitorMats: [], animate: false };
      };
      for (const s of HQ_STATIONS) addStation(s.id, s.x, s.z, s.facing, s.kind, s.label, `${s.label}: ${s.role}`, () => chooseStation(s.id));
      const personIds: string[] = [];
      DIRECTION_SLOTS.forEach(([x, z], i) => {
        const id = `person-${i}`; personIds.push(id);
        addStation(id, x, z, Math.atan2(-x, -z), "person", "", "Escritorio de dirección", () => { const p = teamRef.current[i]; if (p) selectPerson.current?.(p.id); });
        stations[id].group.visible = false; if (stations[id].panel) stations[id].panel!.visible = false;
      });

      // Central operations table (Higgsfield model) + hologram that turns only while real runs are in progress.
      const ops = new T.Group(); scene.add(ops);
      // Raised satin-metal presentation platform; uses existing Three.js geometry and no external assets.
      const opsBase = new T.Mesh(new T.CylinderGeometry(2.8, 3, 0.16, mobile ? 40 : 72),
        new T.MeshPhysicalMaterial({ color: 0x142345, metalness: 0.62, roughness: 0.38, clearcoat: 0.55 }));
      opsBase.position.y = 0.09; opsBase.receiveShadow = !mobile; ops.add(opsBase);
      const opsFallback = new T.Mesh(new T.CylinderGeometry(2.1, 2.3, 0.16, 64), deskMat); opsFallback.position.y = 1; ops.add(opsFallback);
      const holoMat = new T.MeshBasicMaterial({ color: 0x22e6ff, transparent: true, opacity: 0.5, toneMapped: false });
      const holo = new T.Group(); holo.position.y = 2.6; ops.add(holo);
      for (const [r, tilt] of [[1.1, 0], [0.8, 0.6], [0.55, -0.5]] as const) { const ring = new T.Mesh(new T.TorusGeometry(r, 0.012, 6, 96), holoMat); ring.rotation.x = Math.PI / 2 + tilt; holo.add(ring); }
      const opsTag = document.createElement("button"); opsTag.type = "button"; opsTag.className = `${styles.tag} ${styles.tagOps}`; opsTag.textContent = "Mesa de operaciones";
      opsTag.addEventListener("click", () => { setSelected(null); setCameraPreset("ops"); api.current?.preset("ops"); });
      const opsLabel = new CSS2DObject(opsTag); opsLabel.position.set(0, 3.6, 0); ops.add(opsLabel);

      // ── Higgsfield models (verified imports); fallback furniture stays hidden-in-waiting ───────────────────────────
      const tModels = performance.now();
      let modelsMs: number | null = null;
      if (importedAssets().length) {
        const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
        const manager = new T.LoadingManager();
        manager.onProgress = (_u, loaded, total) => !disposed && setLoading(Math.round((loaded / total) * 100));
        manager.onLoad = () => { if (!disposed) { setLoading(null); modelsMs = Math.round(performance.now() - tModels); invalidate(); } };
        manager.onError = () => { if (!disposed) setLoading(null); };
        const loader = new GLTFLoader(manager);
        const prepare = (root: THREE.Object3D, width: number) => {
          const box = new T.Box3().setFromObject(root); const dim = box.getSize(new T.Vector3());
          root.scale.multiplyScalar(width / Math.max(dim.x, dim.z, 0.001));
          const b2 = new T.Box3().setFromObject(root); root.position.y -= b2.min.y;
          root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = !mobile; m.receiveShadow = !mobile; } });
        };
        const place = (path: string | null, ids: string[], width: number, monitors: boolean) => path && loader.load(path, gltf => {
          if (disposed) return;
          prepare(gltf.scene, width);
          for (const id of ids) {
            const st = stations[id]; if (!st) continue;
            st.furniture.forEach(f => (f.visible = false));
            const copy = gltf.scene.clone(true);
            copy.rotation.y = Math.PI; // models face +z; stations face the operations table
            if (monitors) copy.traverse(o => {
              const m = o as THREE.Mesh;
              if (m.isMesh && (m.material as THREE.MeshStandardMaterial).emissiveMap) {
                const mat = (m.material as THREE.MeshStandardMaterial).clone(); mat.emissiveIntensity = 0.12; m.material = mat; st.monitorMats.push(mat);
              }
            });
            st.group.add(copy);
          }
          api.current?.update(lastViews, teamRef.current.slice(0, DIRECTION_SLOTS.length), lastActivity);
        });
        place(HQ_ASSETS.station.path, [...HQ_STATIONS.filter(s => s.kind === "manager").map(s => s.id), ...personIds], 2.2, true);
        place(HQ_ASSETS.pod.path, HQ_STATIONS.filter(s => s.kind === "reserved").map(s => s.id), 2.0, false);
        if (HQ_ASSETS.ops.path) loader.load(HQ_ASSETS.ops.path, gltf => {
          if (disposed) return; prepare(gltf.scene, 4.4); opsFallback.visible = false; ops.add(gltf.scene); invalidate();
        });
      }

      // ── Real-data screens ─────────────────────────────────────────────────────────────────────────────────────────
      const drawScreen = (st: StationRef, title: string, color: number, line1: string, line2: string) => {
        if (!st.screen) return; const g = st.screen.g;
        g.clearRect(0, 0, 512, 256);
        g.fillStyle = "rgba(6,10,28,0.86)"; g.beginPath(); g.roundRect(4, 4, 504, 248, 22); g.fill();
        g.strokeStyle = hex(color); g.lineWidth = 4; g.stroke();
        g.fillStyle = hex(color); g.beginPath(); g.arc(40, 52, 12, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#e7ebff"; g.font = "700 40px system-ui, sans-serif"; g.fillText(title, 64, 66);
        g.fillStyle = "#c9d0f5"; g.font = "500 28px system-ui, sans-serif"; g.fillText(line1.slice(0, 30), 26, 140);
        g.fillStyle = "#8e97c2"; g.font = "400 24px system-ui, sans-serif"; g.fillText(line2.slice(0, 36), 26, 196);
        st.screen.tex.needsUpdate = true;
      };
      let lastViews: Record<string, StationView> = {}; let lastActivity: Activity | null = null;

      // ── Interaction ───────────────────────────────────────────────────────────────────────────────────────────────
      // Time-based camera flights (same duration on any device, unlike a per-frame lerp on a slow GPU).
      let flight: { from: THREE.Vector3; to: THREE.Vector3; lookFrom: THREE.Vector3; lookTo: THREE.Vector3; t0: number } | null = null;
      const FLIGHT_MS = 750;
      const ray = new T.Raycaster(); const ptr = new T.Vector2();
      const activePointers = new Set<number>();
      let tapStart: HqPointerStart | null = null;
      const onDown = (e: PointerEvent) => {
        activePointers.add(e.pointerId);
        // A second finger, non-primary pointer or right click cancels station picking.
        tapStart = activePointers.size === 1 && e.isPrimary && e.button === 0
          ? { pointerId: e.pointerId, x: e.clientX, y: e.clientY, timeMs: performance.now() } : null;
      };
      // Track the entire gesture: an orbit drag that returns to its starting point is still not a tap.
      const onMove = (e: PointerEvent) => {
        tapStart = trackHqPointerMove(tapStart, e.pointerId, e.clientX, e.clientY);
      };
      const onUp = (e: PointerEvent) => {
        activePointers.delete(e.pointerId);
        const started = tapStart;
        tapStart = null;
        // A fast orbit drag used to count as a tap; test distance and multi-touch too.
        if (!isHqTap(started, e.pointerId, e.clientX, e.clientY, performance.now(), activePointers.size)) return;
        const r = renderer.domElement.getBoundingClientRect();
        ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ptr, camera);
        const id = ray.intersectObjects(pickables.filter(p => p.parent?.visible))[0]?.object.userData.station as string | undefined;
        if (id?.startsWith("person-")) { const p = teamRef.current[Number(id.slice(7))]; if (p) selectPerson.current?.(p.id); return; }
        chooseStation(id ?? null);
      };
      renderer.domElement.addEventListener("pointerdown", onDown);
      renderer.domElement.addEventListener("pointermove", onMove);
      renderer.domElement.addEventListener("pointerup", onUp);
      const onCancel = (e: PointerEvent) => { activePointers.delete(e.pointerId); tapStart = null; };
      renderer.domElement.addEventListener("pointercancel", onCancel);
      // Safari can lose pointer capture during tab/app switches without pointerup/cancel.
      // Clear the gesture so a stale finger cannot block the next station tap.
      const onLostCapture = (e: PointerEvent) => { activePointers.delete(e.pointerId); tapStart = null; };
      const onWindowBlur = () => { activePointers.clear(); tapStart = null; };
      renderer.domElement.addEventListener("lostpointercapture", onLostCapture);
      window.addEventListener("blur", onWindowBlur);
      const fly = (pos: THREE.Vector3, look: THREE.Vector3) => {
        if (reduced) { camera.position.copy(pos); controls.target.copy(look); invalidate(); return; }
        flight = { from: camera.position.clone(), to: pos, lookFrom: controls.target.clone(), lookTo: look, t0: performance.now() }; invalidate();
      };
      const PRESETS: Record<Preset, [THREE.Vector3, THREE.Vector3]> = {
        overview: [home.clone(), mobile ? new T.Vector3(0, 0, 0) : new T.Vector3(0, 1, -1.5)],
        managers: [new T.Vector3(0, 6.5, 4.5), new T.Vector3(0, 1.2, -6.5)],
        team: [new T.Vector3(0, 6.5, -4.5), new T.Vector3(0, 1.2, 6.5)],
        direction: [new T.Vector3(0, mobile ? 30 : 23, mobile ? 6 : 5), new T.Vector3(0, 0.3, 0.8)],
        ops: [new T.Vector3(3.5, 5.2, 5.5), new T.Vector3(0, 1.6, 0)],
      };

      api.current = {
        preset: p => fly(...PRESETS[p]),
        focus: id => {
          const s = HQ_STATIONS.find(x => x.id === id);
          if (!s) return fly(...PRESETS.overview);
          fly(new T.Vector3(s.x * 0.45, 4.6, s.z * 0.45 + (s.z < 0 ? 3.2 : -3.2)), new T.Vector3(s.x, 1.4, s.z));
        },
        update: (v, team, act) => {
          lastViews = v; lastActivity = act;
          for (const s of HQ_STATIONS) {
            const st = stations[s.id]; const sv = v[s.id]; if (!st || !sv) continue;
            st.halo.color.setHex(sv.color); st.animate = sv.animate;
            // Desk monitors glow only for a real run in progress; otherwise they rest dim.
            for (const m of st.monitorMats) m.emissiveIntensity = sv.status === "running" ? 1 : sv.status === "idle" ? 0.08 : 0.22;
            if (st.light) { st.light.color.setHex(sv.color); st.light.intensity = sv.status === "running" ? 2.2 : sv.status === "idle" ? 0 : 0.6; }
            if (s.kind === "manager") drawScreen(st, s.label, sv.color, sv.headline, sv.finished_at ? `Última: ${new Date(sv.finished_at).toLocaleString("es", { dateStyle: "short", timeStyle: "short" })}` : "Sin ejecuciones registradas");
          }
          personIds.forEach((id, i) => {
            const st = stations[id]; const p = team[i];
            st.group.visible = !!p; if (st.panel) st.panel.visible = !!p;
            if (!p) return;
            st.halo.color.setHex(PRESENCE_COLOR[p.presence]);
            for (const m of st.monitorMats) m.emissiveIntensity = p.presence === "active" ? 0.35 : 0.08;
            const tag = st.group.children.find(c => (c as THREE.Object3D & { isCSS2DObject?: boolean }).isCSS2DObject) as unknown as { element: HTMLElement } | undefined;
            if (tag) { tag.element.textContent = p.name; tag.element.setAttribute("aria-label", `${p.name}: ${PRESENCE_TEXT[p.presence]}. Abrir perfil`); }
            drawScreen(st, p.initials + " · Dirección", PRESENCE_COLOR[p.presence], p.name, PRESENCE_TEXT[p.presence]);
          });
          holoMat.opacity = HQ_STATIONS.some(s => v[s.id]?.animate) ? 0.75 : 0.28;
          drawWall(act);
          invalidate();
        },
      };

      // ── Render on demand: frames only while something moves (saves battery on phones) ──────────────────────────────
      const clock = new T.Clock(); let frame = 0; let running = false; let first: number | null = null;
      const animating = () => !reduced && Object.values(stations).some(s => s.animate);
      function invalidate() { if (!running && !document.hidden) { running = true; frame = requestAnimationFrame(tick); } }
      const tick = () => {
        const t = clock.getElapsedTime();
        const anim = animating();
        if (anim) {
          holo.rotation.y = t * 0.4;
          for (const st of Object.values(stations)) st.halo.opacity = st.animate ? 0.55 + Math.sin(t * 4) * 0.35 : 0.55;
        }
        let moving = false;
        if (flight) {
          const k = Math.min(1, (performance.now() - flight.t0) / FLIGHT_MS);
          const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // ease-in-out cubic
          camera.position.lerpVectors(flight.from, flight.to, e); controls.target.lerpVectors(flight.lookFrom, flight.lookTo, e);
          moving = k < 1; if (k >= 1) flight = null;
        }
        const changed = controls.update();
        renderer.render(scene, camera); labels.render(scene, camera);
        if (first === null) { first = Math.round(performance.now() - t0); }
        if (anim || moving || changed) frame = requestAnimationFrame(tick); else running = false;
      };
      controls.addEventListener("change", invalidate);
      const onResize = () => {
        camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix();
        renderer.setSize(el.clientWidth, el.clientHeight); labels.setSize(el.clientWidth, el.clientHeight); invalidate();
      };
      const ro = new ResizeObserver(onResize); ro.observe(el);
      const onVisibility = () => { if (document.hidden) { cancelAnimationFrame(frame); running = false; } else invalidate(); };
      document.addEventListener("visibilitychange", onVisibility);
      const perfTimer = setInterval(() => {
        if (disposed) return;
        const p: Perf = { firstFrameMs: first, modelsMs, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, tier: mobile ? "mobile" : "desktop" };
        setPerf(p); (window as unknown as { __hqPerf?: Perf }).__hqPerf = p;
      }, 1500);
      cleanup = () => {
        cancelAnimationFrame(frame); ro.disconnect(); clearInterval(perfTimer); document.removeEventListener("visibilitychange", onVisibility);
        renderer.domElement.removeEventListener("pointerdown", onDown); renderer.domElement.removeEventListener("pointermove", onMove);
        renderer.domElement.removeEventListener("pointerup", onUp);
        renderer.domElement.removeEventListener("pointercancel", onCancel);
        renderer.domElement.removeEventListener("lostpointercapture", onLostCapture);
        window.removeEventListener("blur", onWindowBlur);
        controls.dispose(); envTex.dispose(); pmrem.dispose();
        scene.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose(); const mat = m.material; (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach(x => { (x as THREE.MeshStandardMaterial).map?.dispose(); x.dispose(); }); });
        renderer.dispose(); el.replaceChildren(); api.current = null;
      };
      api.current.update(viewsRef.current, teamRef.current.slice(0, DIRECTION_SLOTS.length), activityRef.current);
      if (selectedRef.current) api.current.focus(selectedRef.current);
      else api.current.preset(cameraPresetRef.current ?? "overview");
      invalidate();
    })().catch(() => setLite(true));
    return () => { disposed = true; cleanup(); };
  }, [lite, chooseStation]);

  const viewsRef = useRef(views); viewsRef.current = views;
  const activityRef = useRef(activity); activityRef.current = activity;
  useEffect(() => { api.current?.update(views, people, activity); }, [views, teamKey, activity]); // eslint-disable-line react-hooks/exhaustive-deps
  // A camera shortcut must not be overwritten by the old selected=null → overview effect.
  useEffect(() => { if (selected) api.current?.focus(selected); else if (cameraPreset) api.current?.preset(cameraPreset); }, [selected, cameraPreset]);

  const station = HQ_STATIONS.find(s => s.id === selected) ?? null;
  const view = station ? views[station.id] : null;

  async function act(body: Record<string, unknown>) {
    setBusy(true); setNotice("");
    try {
      const r = await fetch("/admin/workspace/crm/office/manager-run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      setNotice(r.ok ? (j.status ? `Resultado: ${j.status}${j.error_code ? ` (${j.error_code})` : ""}` : "Hecho") : (j.error ?? "No se pudo completar la acción"));
      await load();
    } catch { setNotice("No se pudo contactar el motor. No se confirma ninguna ejecución."); }
    finally { setBusy(false); }
  }

  const imported = importedAssets();
  const runningCount = activity?.managers.filter(m => m.status === "running").length ?? null;
  return (
    <section className={styles.hq} data-panel-open={station ? "true" : "false"} aria-label="Avalon HQ">
      <header className={styles.bar}>
        <div>
          <span className={styles.eyebrow}>AVALON CORE AGENCY · CONTROL ROOM</span>
          <h1>Avalon HQ</h1>
          <p>
            {activityError ? "Actividad no disponible." : activity ? `Motor de managers · automático ${activity.meta.automatic_enabled ? "activado" : "desactivado"}${activity.meta.kill_switch ? " · INTERRUPTOR DE EMERGENCIA ACTIVO" : ""}` : "Cargando actividad real…"}
          </p>
        </div>
        <div className={styles.barActions}>
          <button type="button" disabled={busy} onClick={() => act({ mission: "daily" })}>Iniciar misión diaria</button>
          <button type="button" disabled={busy || !activity} onClick={() => act({ kill_switch: !activity?.meta.kill_switch })} className={activity?.meta.kill_switch ? styles.danger : undefined}>
            {activity?.meta.kill_switch ? "Reanudar managers" : "Detener todo"}
          </button>
          <button type="button" onClick={() => setLite(v => !v)}>{lite ? "Vista 3D" : "Vista ligera"}</button>
        </div>
      </header>
      <div className={styles.statusStrip} aria-label="Estado verificable de la oficina">
        <span><strong>{HQ_STATIONS.filter(s => s.kind === "manager").length}</strong> estaciones de managers</span>
        <span><strong>{HQ_STATIONS.filter(s => s.kind === "reserved").length}</strong> reservadas · sin trabajadores</span>
        <span className={styles.liveState} data-state={activityError ? "unavailable" : runningCount && runningCount > 0 ? "running" : "idle"}>
          {activityError ? "Estado no disponible" : runningCount === null ? "Consultando actividad…" : `${runningCount} ejecutando ahora · datos del motor`}
        </span>
      </div>

      {lite === false && (
        <div className={styles.stageWrap}>
          <div ref={mount} className={styles.stage} role="group" aria-label="Oficina 3D: cinco managers, cinco puestos reservados, dirección y mesa de operaciones. Use las etiquetas o la vista ligera para seleccionar." />
          <nav className={styles.cams} aria-label="Vistas de cámara">
            {([["overview", "General"], ["managers", "Managers"], ["team", "Equipo"], ["direction", "Dirección"], ["ops", "Operaciones"]] as const).map(([p, l]) => (
              <button key={p} type="button" aria-pressed={cameraPreset === p && !selected}
                onClick={() => { setSelected(null); setCameraPreset(p); api.current?.preset(p); }}>{l}</button>
            ))}
          </nav>
          <p className={styles.gestureHint}>Arrastra para girar · pellizca para acercar · toca una estación</p>
          {loading !== null && <p className={styles.loading} role="status">Cargando modelos 3D de Higgsfield… {loading}%</p>}
        </div>
      )}
      {lite !== false && (
        <div className={styles.liteWrap}>
          <h2 className={styles.liteTitle}>Managers y estaciones</h2>
          <ol className={styles.lite}>
            {HQ_STATIONS.map(s => (
              <li key={s.id}>
                <button type="button" onClick={() => chooseStation(s.id)} className={s.kind === "reserved" ? styles.reservedCard : undefined} aria-pressed={selected === s.id}>
                  <span className={styles.dot} style={{ background: hex(views[s.id].color) }} aria-hidden />
                  <strong>{s.label}</strong><small>{s.kind === "manager" ? views[s.id].headline : s.role}</small>
                </button>
              </li>
            ))}
          </ol>
          {people.length > 0 && <>
            <h2 className={styles.liteTitle}>Dirección</h2>
            <ol className={styles.lite}>
              {people.map(p => (
                <li key={p.id}><button type="button" onClick={() => onSelectPerson?.(p.id)}>
                  <span className={styles.dot} style={{ background: hex(PRESENCE_COLOR[p.presence]) }} aria-hidden />
                  <strong>{p.name}</strong><small>{PRESENCE_TEXT[p.presence]} · {p.subtitle}</small>
                </button></li>
              ))}
            </ol>
          </>}
        </div>
      )}

      {station && view && (
        <aside className={styles.panel} aria-live="polite">
          <button type="button" className={styles.close} onClick={() => { chooseStation(null); api.current?.preset("overview"); }}>← Vista general</button>
          <h2>{station.label}</h2>
          <p className={styles.role}>{station.role}</p>
          <p className={styles.status}><span className={styles.dot} style={{ background: hex(view.color) }} aria-hidden /> {activityError && station.kind === "manager" ? "Estado no disponible" : view.headline}{view.error_code ? ` · ${view.error_code}` : ""}</p>
          <p>{view.detail}</p>
          {station.kind === "manager" && (
            <>
              {view.finished_at && <p className={styles.meta}>Última finalización: {new Date(view.finished_at).toLocaleString("es")}</p>}
              <div className={styles.actions}>
                <button type="button" disabled={busy} onClick={() => act({ manager_key: station.manager })}>Ejecutar su tarea ahora</button>
                <Link href="/admin/workspace/crm/office/manager-work">Historial y evidencias</Link>
              </div>
              <p className={styles.meta}>Ejecutor determinista sobre Supabase (reglas). El análisis con IA gratuita y las tareas de código de REN se registran en GitHub (Issue #134).</p>
            </>
          )}
          {station.kind === "reserved" && <p className={styles.meta}>Puesto vacío reservado. Sin cuenta, sin IA y sin automatizaciones hasta que un propietario lo asigne a una persona real.</p>}
          {notice && <p className={styles.notice}>{notice}</p>}
        </aside>
      )}

      <footer className={styles.foot}>
        <span>{imported.length ? `${imported.length} modelos 3D de Higgsfield verificados (SHA-256) e integrados — derivados optimizados (${imported.map(a => `${a.label} ${(a.bytes! / 1048576).toFixed(1)} MB`).join(" · ")}).` : "Sin modelos de Higgsfield importados: geometría propia."}</span>
        {perf && <span className={styles.perf} data-testid="hq-perf">Rendimiento ({perf.tier}): primer fotograma {perf.firstFrameMs ?? "—"} ms · modelos {perf.modelsMs ?? "—"} ms · {perf.calls} draw calls · {Math.round(perf.triangles / 1000)}k triángulos</span>}
      </footer>
    </section>
  );
}
