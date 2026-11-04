"use client";
// Avalon HQ — interactive 3D headquarters. Real data only: station status comes from
// GET /admin/workspace/crm/office/manager-activity; nothing animates unless a run is genuinely running.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type * as THREE from "three";
import { HQ_STATIONS, stationView, type Station, type StationView } from "@/lib/office/hq-layout";
import { HQ_ASSETS, importedAssets } from "@/lib/office/hq-assets";
import type { ManagerActivity } from "@/lib/agents/policy";
import styles from "./hq-3d.module.css";

type Activity = { managers: ManagerActivity[]; meta: { kill_switch: boolean; automatic_enabled: boolean; executor_kind: string } };
const ACTIVITY_URL = "/admin/workspace/crm/office/manager-activity";

function supportsWebGL(): boolean {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

export function Hq3d() {
  const mount = useRef<HTMLDivElement>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [activityError, setActivityError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [lite, setLite] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const api = useRef<{ focus: (id: string | null) => void; update: (views: Record<string, StationView>) => void } | null>(null);

  const views = useMemo(() => Object.fromEntries(HQ_STATIONS.map(s => [s.id, stationView(s, activityError ? null : activity?.managers ?? [])])), [activity, activityError]);

  const load = useCallback(async () => {
    try {
      const r = await fetch(ACTIVITY_URL, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      setActivity(await r.json()); setActivityError(false);
    } catch { setActivityError(true); }
  }, []);

  useEffect(() => {
    setLite(!supportsWebGL() || new URLSearchParams(location.search).get("vista") === "ligera");
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 20000);
    return () => clearInterval(t);
  }, [load]);

  // Build the scene once; status changes only recolor it.
  useEffect(() => {
    if (lite !== false || !mount.current) return;
    let disposed = false; let cleanup = () => {};
    (async () => {
      const T = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      const { CSS2DRenderer, CSS2DObject } = await import("three/examples/jsm/renderers/CSS2DRenderer.js");
      if (disposed || !mount.current) return;
      const el = mount.current;
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const mobile = matchMedia("(max-width: 760px)").matches;
      const renderer = new T.WebGLRenderer({ antialias: !mobile, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
      renderer.setSize(el.clientWidth, el.clientHeight);
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      el.appendChild(renderer.domElement);
      const labels = new CSS2DRenderer(); labels.setSize(el.clientWidth, el.clientHeight);
      labels.domElement.className = styles.labels; el.appendChild(labels.domElement);

      const scene = new T.Scene();
      scene.background = new T.Color(0x050816);
      scene.fog = new T.Fog(0x050816, 22, 46);
      const camera = new T.PerspectiveCamera(mobile ? 58 : 45, el.clientWidth / el.clientHeight, 0.1, 120);
      const home = new T.Vector3(0, mobile ? 17 : 13, mobile ? 19 : 16);
      camera.position.copy(home);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = !reduced; controls.maxPolarAngle = Math.PI * 0.46; controls.minDistance = 4; controls.maxDistance = 30;
      controls.target.set(0, 0.6, 0);

      scene.add(new T.HemisphereLight(0x8fb4ff, 0x120a24, 0.55));
      const key = new T.DirectionalLight(0xffffff, 1.1); key.position.set(6, 14, 8); scene.add(key);
      for (const [c, x, z] of [[0x22e6ff, -9, -6], [0x8f5cff, 9, -6], [0xff4fd8, 0, 9]] as const) {
        const l = new T.PointLight(c, 26, 22, 1.6); l.position.set(x, 4.5, z); scene.add(l);
      }

      // Architecture: polished floor, glass curtain wall, light ribs.
      const floor = new T.Mesh(new T.CircleGeometry(16, 64), new T.MeshStandardMaterial({ color: 0x0b1024, metalness: 0.6, roughness: 0.28 }));
      floor.rotation.x = -Math.PI / 2; scene.add(floor);
      const ring = new T.Mesh(new T.RingGeometry(3.1, 3.18, 64), new T.MeshBasicMaterial({ color: 0x22e6ff, transparent: true, opacity: 0.55 }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; scene.add(ring);
      const glass = new T.Mesh(new T.CylinderGeometry(15.5, 15.5, 7, 64, 1, true, Math.PI * 0.15, Math.PI * 1.7),
        new T.MeshPhysicalMaterial({ color: 0x1b2a5a, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.1, side: T.BackSide }));
      glass.position.y = 3.5; scene.add(glass);
      for (let i = 0; i < 24; i++) {
        const a = Math.PI * 0.15 + (Math.PI * 1.7 * i) / 23;
        const rib = new T.Mesh(new T.BoxGeometry(0.08, 7, 0.08), new T.MeshStandardMaterial({ color: 0x2b3566, emissive: i % 3 ? 0x1a1f4a : 0x5a2bd6, emissiveIntensity: 0.6 }));
        rib.position.set(Math.cos(a) * 15.4, 3.5, Math.sin(a) * 15.4); scene.add(rib);
      }

      // Central operations table + holographic column.
      const ops = new T.Group();
      ops.add(new T.Mesh(new T.CylinderGeometry(2.2, 2.4, 0.18, 48), new T.MeshPhysicalMaterial({ color: 0x0d1230, metalness: 0.5, roughness: 0.15, clearcoat: 1 })));
      ops.children[0].position.y = 1;
      const base = new T.Mesh(new T.CylinderGeometry(0.6, 0.9, 1, 24), new T.MeshStandardMaterial({ color: 0x3a4170, metalness: 0.9, roughness: 0.3 }));
      base.position.y = 0.5; ops.add(base);
      const holo = new T.Mesh(new T.ConeGeometry(1.6, 2.4, 6, 1, true), new T.MeshBasicMaterial({ color: 0x22e6ff, wireframe: true, transparent: true, opacity: 0.35 }));
      holo.position.y = 2.4; holo.rotation.x = Math.PI; ops.add(holo); scene.add(ops);

      // Ten stations.
      const pickables: THREE.Object3D[] = [];
      const stationMeshes: Record<string, { screen: THREE.MeshStandardMaterial; halo: THREE.MeshBasicMaterial; group: THREE.Group }> = {};
      for (const s of HQ_STATIONS) {
        const g = new T.Group(); g.position.set(s.x, 0, s.z); g.rotation.y = s.facing; g.userData.station = s.id;
        const desk = new T.Mesh(new T.BoxGeometry(2.2, 0.1, 1), new T.MeshPhysicalMaterial({ color: s.kind === "manager" ? 0xe9edf7 : 0x2a2f45, metalness: 0.3, roughness: 0.35, clearcoat: 0.6 }));
        desk.position.y = 0.95; desk.userData.furniture = true; g.add(desk);
        const leg = new T.Mesh(new T.BoxGeometry(1.8, 0.9, 0.08), new T.MeshStandardMaterial({ color: 0x8a93b8, metalness: 0.9, roughness: 0.3 }));
        leg.position.set(0, 0.47, -0.3); leg.userData.furniture = true; g.add(leg);
        const screen = new T.MeshStandardMaterial({ color: 0x0a0f22, emissive: 0x000000, emissiveIntensity: 1.2 });
        const monitor = new T.Mesh(new T.BoxGeometry(1.5, 0.8, 0.04), screen); monitor.position.set(0, 1.55, -0.35); g.add(monitor);
        const chair = new T.Mesh(new T.CylinderGeometry(0.32, 0.32, 0.7, 20), new T.MeshStandardMaterial({ color: s.kind === "manager" ? 0x1c2142 : 0x3a2246, roughness: 0.6 }));
        chair.position.set(0, 0.55, 0.75); chair.userData.furniture = true; g.add(chair);
        const halo = new T.MeshBasicMaterial({ color: 0x47507a, transparent: true, opacity: 0.5 });
        const pad = new T.Mesh(new T.RingGeometry(1.3, 1.42, 40), halo); pad.rotation.x = -Math.PI / 2; pad.position.y = 0.02; g.add(pad);
        const hit = new T.Mesh(new T.BoxGeometry(2.6, 2.2, 2.2), new T.MeshBasicMaterial({ visible: false }));
        hit.position.y = 1.1; hit.userData.station = s.id; g.add(hit); pickables.push(hit);
        const tag = document.createElement("button");
        tag.type = "button"; tag.className = s.kind === "manager" ? styles.tag : `${styles.tag} ${styles.tagReserved}`;
        tag.textContent = s.label; tag.setAttribute("aria-label", `${s.label}: ${s.role}`);
        tag.addEventListener("click", () => setSelected(s.id));
        const label = new CSS2DObject(tag); label.position.set(0, 2.35, -0.3); g.add(label);
        scene.add(g); stationMeshes[s.id] = { screen, halo, group: g };
      }

      // Higgsfield GLB assets replace procedural furniture only when verified files exist. Status screen and halo stay
      // procedural so the state shown always comes from real data.
      if (importedAssets().length) {
        const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
        const loader = new GLTFLoader();
        const fit = (obj: THREE.Object3D, size: number) => {
          const box = new T.Box3().setFromObject(obj); const dim = box.getSize(new T.Vector3());
          obj.scale.multiplyScalar(size / Math.max(dim.x, dim.z, 0.001));
          const b2 = new T.Box3().setFromObject(obj); obj.position.y -= b2.min.y;
        };
        const place = (path: string | null, kind: "manager" | "reserved") => path && loader.load(path, gltf => {
          if (disposed) return;
          fit(gltf.scene, 2.3);
          for (const s of HQ_STATIONS.filter(x => x.kind === kind)) {
            const g = stationMeshes[s.id].group;
            g.children.filter(c => c.userData.furniture).forEach(c => (c.visible = false));
            g.add(gltf.scene.clone(true));
          }
        });
        place(HQ_ASSETS.station.path, "manager");
        place(HQ_ASSETS.pod.path, "reserved");
        const op = HQ_ASSETS.ops.path;
        if (op) loader.load(op, gltf => { if (disposed) return; fit(gltf.scene, 4.4); ops.children.filter(c => c !== holo).forEach(c => (c.visible = false)); ops.add(gltf.scene); });
      }

      let target: THREE.Vector3 | null = null; let targetLook: THREE.Vector3 | null = null;
      const ray = new T.Raycaster(); const ptr = new T.Vector2(); let downAt = 0;
      renderer.domElement.addEventListener("pointerdown", () => { downAt = performance.now(); });
      renderer.domElement.addEventListener("pointerup", e => {
        if (performance.now() - downAt > 300) return; // a drag, not a tap
        const r = renderer.domElement.getBoundingClientRect();
        ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ptr, camera);
        const hit = ray.intersectObjects(pickables)[0];
        setSelected(hit ? hit.object.userData.station : null);
      });

      api.current = {
        focus: id => {
          const s = HQ_STATIONS.find(x => x.id === id);
          if (!s) { target = home.clone(); targetLook = new T.Vector3(0, 0.6, 0); }
          else { target = new T.Vector3(s.x * 0.35, 6.5, s.z * 0.35 + (s.z < 0 ? 4 : -4)); targetLook = new T.Vector3(s.x, 1.1, s.z); }
          if (reduced && target && targetLook) { camera.position.copy(target); controls.target.copy(targetLook); target = targetLook = null; }
        },
        update: v => {
          for (const [id, m] of Object.entries(stationMeshes)) {
            const sv = v[id]; if (!sv) continue;
            m.screen.emissive.setHex(sv.status === "idle" ? 0x111633 : sv.color);
            m.halo.color.setHex(sv.color); m.group.userData.animate = sv.animate;
          }
        },
      };

      const clock = new T.Clock(); let frame = 0;
      const tick = () => {
        frame = requestAnimationFrame(tick);
        const t = clock.getElapsedTime();
        if (!reduced) { holo.rotation.y = t * 0.25; ring.material.opacity = 0.45 + Math.sin(t * 1.2) * 0.1; }
        for (const m of Object.values(stationMeshes)) {
          // Pulse ONLY for a genuinely running execution.
          m.halo.opacity = m.group.userData.animate && !reduced ? 0.55 + Math.sin(t * 4) * 0.35 : 0.5;
        }
        if (target && targetLook) {
          camera.position.lerp(target, 0.08); controls.target.lerp(targetLook, 0.08);
          if (camera.position.distanceTo(target) < 0.05) target = targetLook = null;
        }
        controls.update(); renderer.render(scene, camera); labels.render(scene, camera);
      };
      tick();
      const onResize = () => {
        camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix();
        renderer.setSize(el.clientWidth, el.clientHeight); labels.setSize(el.clientWidth, el.clientHeight);
      };
      addEventListener("resize", onResize);
      const onVisibility = () => { if (document.hidden) cancelAnimationFrame(frame); else tick(); };
      document.addEventListener("visibilitychange", onVisibility);
      cleanup = () => {
        cancelAnimationFrame(frame); removeEventListener("resize", onResize); document.removeEventListener("visibilitychange", onVisibility);
        controls.dispose();
        scene.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose(); const mat = m.material; (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach(x => x.dispose()); });
        renderer.dispose(); el.replaceChildren(); api.current = null;
      };
      api.current.update(views);
    })().catch(() => setLite(true));
    return () => { disposed = true; cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lite]);

  useEffect(() => { api.current?.update(views); }, [views]);
  useEffect(() => { api.current?.focus(selected); }, [selected]);

  const station = HQ_STATIONS.find(s => s.id === selected) ?? null;
  const view = station ? views[station.id] : null;

  async function act(body: Record<string, unknown>) {
    setBusy(true); setNotice("");
    try {
      const r = await fetch("/admin/workspace/crm/office/manager-run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      setNotice(r.ok ? (j.status ? `Resultado: ${j.status}${j.error_code ? ` (${j.error_code})` : ""}` : "Hecho") : (j.error ?? "No se pudo completar la acción"));
      await load();
    } finally { setBusy(false); }
  }

  const imported = importedAssets().length;
  return (
    <section className={styles.hq} aria-label="Avalon HQ">
      <header className={styles.bar}>
        <div>
          <h1>Avalon HQ</h1>
          <p>
            {activityError ? "Actividad no disponible." : activity ? `Motor determinista · automático ${activity.meta.automatic_enabled ? "activado" : "desactivado"}${activity.meta.kill_switch ? " · INTERRUPTOR DE EMERGENCIA ACTIVO" : ""}` : "Cargando actividad real…"}
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

      {lite === false && <div ref={mount} className={styles.stage} role="img" aria-label="Oficina 3D con diez estaciones. Use la lista o las etiquetas para seleccionar." />}
      {lite !== false && (
        <ol className={styles.lite}>
          {HQ_STATIONS.map(s => (
            <li key={s.id}>
              <button type="button" onClick={() => setSelected(s.id)} className={s.kind === "reserved" ? styles.reservedCard : undefined} aria-pressed={selected === s.id}>
                <span className={styles.dot} style={{ background: `#${views[s.id].color.toString(16).padStart(6, "0")}` }} aria-hidden />
                <strong>{s.label}</strong><small>{s.kind === "manager" ? views[s.id].headline : s.role}</small>
              </button>
            </li>
          ))}
        </ol>
      )}

      {station && view && (
        <aside className={styles.panel} aria-live="polite">
          <button type="button" className={styles.close} onClick={() => setSelected(null)}>← Vista general</button>
          <h2>{station.label}</h2>
          <p className={styles.role}>{station.role}</p>
          <p className={styles.status}><span className={styles.dot} style={{ background: `#${view.color.toString(16).padStart(6, "0")}` }} aria-hidden /> {view.headline}{view.error_code ? ` · ${view.error_code}` : ""}</p>
          <p>{view.detail}</p>
          {station.kind === "manager" && (
            <>
              {view.finished_at && <p className={styles.meta}>Última finalización: {new Date(view.finished_at).toLocaleString("es")}</p>}
              <div className={styles.actions}>
                <button type="button" disabled={busy} onClick={() => act({ manager_key: station.manager })}>Ejecutar su tarea ahora</button>
                <Link href="/admin/workspace/crm/office/manager-work">Historial y evidencias</Link>
              </div>
              <p className={styles.meta}>Ejecutor determinista (reglas). No es un modelo de IA ni programa de forma autónoma.</p>
            </>
          )}
          {station.kind === "reserved" && <p className={styles.meta}>Los propietarios podrán asignar esta estación a una persona invitada desde la administración de miembros.</p>}
          {notice && <p className={styles.notice}>{notice}</p>}
        </aside>
      )}

      <footer className={styles.foot}>
        {imported ? `${imported} recursos 3D de Higgsfield verificados e integrados.` : "Recursos 3D de Higgsfield generados y pendientes de importar con verificación; la escena usa geometría propia mientras tanto."}
      </footer>
    </section>
  );
}
