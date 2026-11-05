"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./media.module.css";

/** Read-only, on-demand GLB viewer; never generates or changes creative media. */
export function CreativeModel({ src, label }: { src: string; label: string }) {
  const mount = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open || !mount.current) return;
    let disposed = false;
    let cleanup = () => {};
    setFailed(false);
    setLoaded(false);
    (async () => {
      const [T, { GLTFLoader }, { OrbitControls }] = await Promise.all([
        import("three"),
        import("three/examples/jsm/loaders/GLTFLoader.js"),
        import("three/examples/jsm/controls/OrbitControls.js"),
      ]);
      if (disposed || !mount.current) return;
      const root = mount.current;
      const renderer = new T.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "low-power" });
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      root.appendChild(renderer.domElement);

      const scene = new T.Scene();
      const camera = new T.PerspectiveCamera(45, 1, 0.01, 1000);
      scene.add(new T.HemisphereLight(0xffffff, 0x5e668d, 2));
      const light = new T.DirectionalLight(0xffffff, 2);
      light.position.set(4, 7, 5);
      scene.add(light);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = false; // No perpetual animation or idle battery drain.
      controls.enablePan = false;
      controls.minDistance = 0.4;
      controls.maxDistance = 80;

      const resize = () => {
        const width = Math.max(1, root.clientWidth);
        const height = Math.max(1, root.clientHeight);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        renderer.render(scene, camera);
      };
      controls.addEventListener("change", resize);
      const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
      observer?.observe(root);
      resize();

      new GLTFLoader().load(src, gltf => {
        if (disposed) return;
        const bounds = new T.Box3().setFromObject(gltf.scene);
        if (bounds.isEmpty()) { setFailed(true); return; }
        const center = bounds.getCenter(new T.Vector3());
        const size = bounds.getSize(new T.Vector3());
        gltf.scene.position.sub(center);
        scene.add(gltf.scene);
        const r = Math.max(size.x, size.y, size.z, 0.2);
        camera.position.set(r * 1.8, r * 1.2, r * 2.5);
        camera.near = Math.max(0.001, r / 200);
        camera.far = Math.max(100, r * 30);
        controls.minDistance = Math.max(0.1, r / 2);
        controls.maxDistance = Math.max(10, r * 12);
        camera.updateProjectionMatrix();
        controls.target.set(0, 0, 0);
        controls.update();
        resize();
        setLoaded(true);
      }, undefined, () => { if (!disposed) setFailed(true); });

      cleanup = () => {
        observer?.disconnect();
        controls.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
        scene.clear();
      };
    })().catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; cleanup(); };
  }, [open, src]);

  return <div className={styles.modelBlock}>
    {!open ? <button type="button" className={styles.modelButton} onClick={() => setOpen(true)}>
      Ver modelo 3D · abrir bajo demanda
    </button> : <>
      <div ref={mount} className={styles.modelCanvas} role="img" aria-label={`Vista 3D interactiva: ${label}`} />
      <p className={styles.modelStatus} role="status">
        {failed ? "No se pudo abrir el modelo en este dispositivo." :
          loaded ? "Modelo cargado · arrastra para rotar y pellizca para acercar." : "Cargando modelo verificado…"}
      </p>
      <button type="button" className={styles.modelButton} onClick={() => setOpen(false)}>Cerrar vista 3D</button>
    </>}
    <a className={styles.sourceLink} href={src} target="_blank" rel="noopener noreferrer">Abrir archivo GLB original</a>
  </div>;
}
