/**
 * Avalon Ultimate — The Living Universe. One WebGL scene, four connected universes, one camera path driven by scroll:
 *   T 0→1  THE IGNITION   chrome Avalon mark inside a breathing energy core, gyroscope rings, orbital particles
 *   T 1→2  THE LAUNCH     the camera dives through the core into a tunnel of light streaks and gates
 *   T 2→3  GROWTH ENGINE  a core feeding six orbiting service modules through pulsing links
 *   T 3→4  GROWTH TREE    the engine's energy runs down a conduit into a metallic tree that grows with the scroll
 *   T > 4  ambient        the camera sinks below the roots into the particle field (the page is never frozen)
 * Everything is procedural (no downloads). Loaded lazily by living-universe.tsx; never imported on the server.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export const ENGINE_COUNT = 6;
export const APPLE_COUNT = 10;
export type Frame = { t: number; engine: Float32Array; tree: Float32Array; grow: number };
export type UniverseHandle = {
  setTimeline(t: number): void;
  setPointer(nx: number, ny: number): void;
  pulse(nx: number, ny: number): void;
  setEngineActive(i: number): void;
  setEngineHover(i: number | null): void;
  setAppleActive(i: number | null): void;
  onFrame(cb: ((f: Frame) => void) | null): void;
  resize(): void; start(): void; stop(): void; dispose(): void;
};

const COL = { midnight: 0x050610, electric: 0x2979ff, violet: 0x7847ff, magenta: 0xd946ef, orange: 0xff8736, cyan: 0x30daf4, silver: 0xe8ecf5 };
const MODULE_COLORS = [COL.electric, COL.orange, COL.cyan, COL.magenta, COL.violet, COL.silver];
const ENGINE = new THREE.Vector3(0, 0, -130);
const TREE = new THREE.Vector3(0, -46, -130);
const TAU = Math.PI * 2;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => { const x = clamp((v - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
function rng(seed: number) { let s = seed >>> 0; return () => { s += 0x6d2b79f5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function glowTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d")!; const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.22, "rgba(255,255,255,.55)"); r.addColorStop(0.55, "rgba(255,255,255,.13)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Stable procedural micro-surface, no external texture loading and no runtime noise. */
function brushedSurfaceTexture() {
  const size = 256, c = document.createElement("canvas"); c.width = c.height = size;
  const ctx = c.getContext("2d")!, image = ctx.createImageData(size, size), random = rng(8572);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const band = 9 * Math.sin(y * .64 + Math.sin(x * .035) * 1.8);
    const grain = (random() - .5) * 44 + band + 4 * Math.sin(x * .22 + y * .04);
    const shade = Math.round(clamp(196 + grain, 110, 244)), idx = (y * size + x) * 4;
    image.data[idx] = shade; image.data[idx + 1] = shade; image.data[idx + 2] = shade; image.data[idx + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 5);
  tex.anisotropy = 4;
  return tex;
}

/** Molded apple shape with shoulders, five subtly asymmetric lobes and an indented stem. */
function appleGeometry() {
  const radius = .19, geo = new THREE.SphereGeometry(radius, 36, 26);
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const v = clamp(y / radius, -1, 1), angle = Math.atan2(z, x);
    const lobe = 1 + .043 * Math.cos(angle * 5) * Math.pow(Math.abs(v), 2.5);
    const shoulder = 1.06 + .095 * v - .12 * v * v;
    const dimple = v > .62 ? .069 * Math.pow((v - .62) / .38, 2) : v < -.82 ? -.022 * Math.pow((-v - .82) / .18, 2) : 0;
    pos.setXYZ(i, x * shoulder * lobe, y - dimple, z * shoulder * lobe);
  }
  pos.needsUpdate = true; geo.computeVertexNormals(); return geo;
}

const SOFT_POINT = `varying float vAlpha; varying vec3 vCol;
void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, .0, d); gl_FragColor = vec4(vCol, a * a * vAlpha); }`;

export function createUniverse(canvas: HTMLCanvasElement, opts: { mobile: boolean; ambientOnly: boolean; onTooSlow?: () => void }): UniverseHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.mobile, alpha: false, powerPreference: "high-performance" });
  // A 4K output is a pixel budget, not a forced 4K render on every phone.
  // 3840×2160 max on desktop; preserve sharp Retina rendering within the mobile thermal budget.
  const maxPixels = opts.mobile ? 3_000_000 : 8_294_400;
  const baseDpr = Math.min(window.devicePixelRatio || 1, opts.mobile ? 2 : 2.5);
  const limitDpr = (w: number, h: number) => Math.min(baseDpr, Math.sqrt(maxPixels / Math.max(1, w * h)));
  let dpr = Math.max(.8, limitDpr(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight));
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(COL.midnight, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(COL.midnight, 0.02);
  const pmrem = new THREE.PMREMGenerator(renderer);
  // Studio environment: a dark room with coloured light walls, so chrome reflects brand light instead of a white box.
  const studio = new THREE.Scene(); studio.background = new THREE.Color(0x04050c);
  const wall = (hex: number, k: number, x: number, y: number, z: number, w: number, h: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); studio.add(m);
  };
  // Large softboxes build broad highlights; thin strip panels reveal curvature and metallic edges.
  wall(0xffffff, 4.5, 0, 9, 4, 11, 4); wall(COL.electric, 5.5, -9, 2, 3, 5, 10); wall(COL.violet, 5.5, 9, 1, -2, 5, 10);
  wall(COL.cyan, 4, 0, -1, -10, 13, 2.2); wall(COL.orange, 3.8, 5, -8, 4, 5, 2.5); wall(COL.magenta, 3.5, -6, -7, -5, 4, 3);
  wall(0xffffff, 6, 3, 3, 10, .35, 7); wall(0xe0efff, 4, -3, 6, 8, .25, 5);
  wall(COL.cyan, 3.5, 5, 0, 10, .22, 9);
  const env = pmrem.fromScene(studio, 0.035).texture;
  studio.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
  scene.environment = env; scene.environmentIntensity = 1.15;
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 220);
  scene.add(camera);
  // Lights ride with the camera so every universe gets the same cinematic key/rim/warm setup.
  const key = new THREE.PointLight(0x9fd8ff, 60, 60); key.position.set(5, 4, 2); camera.add(key);
  const rim = new THREE.PointLight(COL.violet, 90, 60); rim.position.set(-6, 2, -6); camera.add(rim);
  const warm = new THREE.PointLight(COL.orange, 30, 50); warm.position.set(1, -5, -3); camera.add(warm);

  const glowTex = glowTexture(), microSurface = brushedSurfaceTexture();
  const disposables: { dispose(): void }[] = [glowTex, microSurface, env, pmrem];
  const track = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };
  const sprite = (color: number, size: number, opacity = 1) => {
    const s = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })));
    s.scale.setScalar(size); return s;
  };
  const chrome = (color = 0xcfd6ee, roughness = 0.23) => track(new THREE.MeshPhysicalMaterial({
    color, metalness: .96, roughness, envMapIntensity: 1.65, roughnessMap: microSurface,
    bumpMap: opts.mobile ? null : microSurface, bumpScale: .014,
    clearcoat: .24, clearcoatRoughness: .15,
  }));
  const liquid = () => track(new THREE.MeshPhysicalMaterial({
    color: 0xe9eefb, metalness: .94, roughness: .17, envMapIntensity: 1.9,
    roughnessMap: microSurface, bumpMap: opts.mobile ? null : microSurface, bumpScale: .009,
    iridescence: .24, iridescenceIOR: 1.5, iridescenceThicknessRange: [160, 330],
    clearcoat: .78, clearcoatRoughness: .1,
  }));
  const t0 = performance.now();
  const time = { value: 0 };

  // ── Ambient particle field: wraps around the camera, so it exists everywhere along the journey ──────────────────
  const N = opts.mobile ? 1800 : 5200, BOX = 60;
  const pGeo = track(new THREE.BufferGeometry());
  { const r = rng(7), pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = (r() - .5) * BOX; pos[i * 3 + 1] = (r() - .5) * BOX; pos[i * 3 + 2] = (r() - .5) * BOX; seed[i] = r(); }
    pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); pGeo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1)); }
  const pUni = { uTime: time, uCam: { value: new THREE.Vector3() }, uSize: { value: 1 }, uWarm: { value: 0 } };
  const particles = new THREE.Points(pGeo, track(new THREE.ShaderMaterial({
    uniforms: pUni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uTime; uniform vec3 uCam; uniform float uSize; uniform float uWarm; attribute float aSeed; varying float vAlpha; varying vec3 vCol;
      void main(){ vec3 p = position; p.y += sin(uTime*.15 + aSeed*6.283)*.7; p.x += cos(uTime*.11 + aSeed*12.)*.7; p.z += uTime*.3*(.3+aSeed);
        vec3 rel = mod(p - uCam + ${BOX / 2}., ${BOX}.) - ${BOX / 2}.; vec4 mv = viewMatrix * vec4(uCam + rel, 1.);
        gl_Position = projectionMatrix * mv; float d = -mv.z;
        gl_PointSize = uSize * (.5 + aSeed) / max(d, .6);
        float tw = .65 + .35 * sin(uTime * (1. + aSeed * 2.) + aSeed * 40.);
        vAlpha = smoothstep(${BOX / 2}., 10., d) * smoothstep(.4, 2.5, d) * (.25 + .75 * fract(aSeed * 7.)) * tw;
        vec3 cool = mix(vec3(.16,.47,1.), vec3(.47,.28,1.), fract(aSeed*3.)); cool = mix(cool, vec3(.19,.85,.96), step(.82, fract(aSeed*11.)));
        vCol = mix(cool, vec3(1.,.53,.21), uWarm * step(.6, fract(aSeed*5.))); }`,
    fragmentShader: SOFT_POINT,
  })));
  particles.frustumCulled = false; scene.add(particles);

  // ── Touch / click ripples ─────────────────────────────────────────────────────────────────────────────────────
  const ringGeo = track(new THREE.RingGeometry(0.985, 1, 128));
  const ripples = Array.from({ length: 6 }, () => {
    const m = new THREE.Mesh(ringGeo, track(new THREE.MeshBasicMaterial({ color: COL.cyan, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })));
    m.visible = false; scene.add(m); return { m, age: 9, max: 1 };
  });
  let rippleIdx = 0;
  const spawnRipple = (at: THREE.Vector3, max: number, color: number) => {
    const r = ripples[rippleIdx++ % ripples.length]; r.m.position.copy(at); r.m.quaternion.copy(camera.quaternion); r.age = 0; r.max = max;
    (r.m.material as THREE.MeshBasicMaterial).color.setHex(color); r.m.visible = true;
  };

  // Shared state
  let T = 0, Ts = 0, px = 0, py = 0, pxs = 0, pys = 0, boost = 0, kick = 0, travel = 0;
  let engineActive = 0, engineHover: number | null = null, appleActive: number | null = null, orbitBase = Math.PI / 2;
  let frameCb: ((f: Frame) => void) | null = null;
  const frame: Frame = { t: 0, engine: new Float32Array(ENGINE_COUNT * 4), tree: new Float32Array(APPLE_COUNT * 3), grow: 0 };
  let aspect = 1, fit = 1, width = 1, height = 1;
  const updaters: ((dt: number, t: number) => void)[] = [];

  if (!opts.ambientOnly) {
    // ── Energy core (shared look for Ignition and the Growth Engine) ────────────────────────────────────────────
    const energyMat = (a: number, b: number) => track(new THREE.ShaderMaterial({
      uniforms: { uTime: time, uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) }, uPower: { value: 1 } },
      vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform float uPower; varying vec3 vN; varying vec3 vP; varying vec3 vV;
        void main(){ float f = pow(1. - max(dot(normalize(vN), normalize(vV)), 0.), 2.);
          float n = sin(vP.x*6.+uTime*1.3)*sin(vP.y*7.-uTime*1.1)*sin(vP.z*5.+uTime*.9);
          float bands = .5 + .5*sin(vP.y*13. + n*3.5 + uTime*2.);
          vec3 col = mix(uA, uB, bands)*(.5+.7*n) + f*vec3(.55,.8,1.)*1.5; gl_FragColor = vec4(col*uPower, 1.); }`,
    }));
    const sphereGeo = track(new THREE.SphereGeometry(1, 48, 32));
    const buildRings = (parent: THREE.Group, radii: number[]) => radii.map((r, i) => {
      const ring = new THREE.Mesh(track(new THREE.TorusGeometry(r, 0.035 + i * 0.008, 16, 120)), chrome(i === 1 ? 0xbcc8ff : 0xdfe5f7, 0.1));
      ring.rotation.set(0.6 + i * 1.1, i * 0.9, i * 0.5); parent.add(ring); return ring;
    });

    // ── I · THE IGNITION ────────────────────────────────────────────────────────────────────────────────────────
    const core = new THREE.Group(); scene.add(core);
    const coreGlow = sprite(COL.electric, 9, 0.55); core.add(coreGlow);
    const coreGlow2 = sprite(COL.violet, 5, 0.5); core.add(coreGlow2);
    const coreEnergy = new THREE.Mesh(sphereGeo, energyMat(COL.electric, COL.violet)); coreEnergy.scale.setScalar(0.62); core.add(coreEnergy);
    const coreRings = buildRings(core, [1.55, 1.85, 2.2]);
    const P = (x: number, y: number) => new THREE.Vector2((x - 70) / 52, (63 - y) / 52);
    const markGeo = track(new THREE.ExtrudeGeometry([new THREE.Shape([P(70, 12), P(131, 112), P(99, 112), P(70, 62), P(40, 112), P(9, 112)]), new THREE.Shape([P(70, 79), P(91, 115), P(49, 115)])],
      { depth: 0.24, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 3 }));
    markGeo.translate(0, 0.05, -0.12);
    const mark = new THREE.Mesh(markGeo, liquid()); mark.position.z = 0.75; core.add(mark);
    const markEdges = new THREE.LineSegments(track(new THREE.EdgesGeometry(markGeo, 30)), track(new THREE.LineBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })));
    mark.add(markEdges);
    // Orbital particles that converge at birth.
    const ON = opts.mobile ? 260 : 620; const oGeo = track(new THREE.BufferGeometry());
    { const r = rng(21), a = new Float32Array(ON * 4), tilt = new Float32Array(ON * 2);
      for (let i = 0; i < ON; i++) { const band = i % 3; a[i * 4] = 1.5 + band * 0.42 + r() * 0.3; a[i * 4 + 1] = r() * TAU; a[i * 4 + 2] = (0.25 + r() * 0.5) * (band === 1 ? -1 : 1); a[i * 4 + 3] = r();
        tilt[i * 2] = 0.5 + band * 1.05 + (r() - .5) * 0.25; tilt[i * 2 + 1] = band * 0.8 + (r() - .5) * 0.25; }
      oGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(ON * 3), 3)); oGeo.setAttribute("aO", new THREE.BufferAttribute(a, 4)); oGeo.setAttribute("aTilt", new THREE.BufferAttribute(tilt, 2)); }
    const oUni = { uTime: time, uBirth: { value: 0 }, uSize: { value: 1 }, uScale: { value: 1 } };
    const orbiters = new THREE.Points(oGeo, track(new THREE.ShaderMaterial({ uniforms: oUni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uTime, uBirth, uSize, uScale; attribute vec4 aO; attribute vec2 aTilt; varying float vAlpha; varying vec3 vCol;
        void main(){ float a = aO.y + uTime*aO.z; float r = aO.x * mix(5., 1., uBirth) * uScale; vec3 p = vec3(cos(a)*r, 0., sin(a)*r);
          float cx = cos(aTilt.x), sx = sin(aTilt.x); p = vec3(p.x, p.y*cx - p.z*sx, p.y*sx + p.z*cx);
          float cz = cos(aTilt.y), sz = sin(aTilt.y); p = vec3(p.x*cz - p.y*sz, p.x*sz + p.y*cz, p.z);
          vec4 mv = modelViewMatrix*vec4(p,1.); gl_Position = projectionMatrix*mv; gl_PointSize = uSize*(.45+aO.w)/max(-mv.z,.5);
          vAlpha = (.35+.65*aO.w)*smoothstep(0.,.25,uBirth); vCol = mix(vec3(.16,.47,1.), vec3(.6,.4,1.), aO.w); vCol = mix(vCol, vec3(.19,.85,.96), step(.85, aO.w)); }`,
      fragmentShader: SOFT_POINT })));
    orbiters.frustumCulled = false; core.add(orbiters);
    let born = false;

    // ── II · THE LAUNCH ─────────────────────────────────────────────────────────────────────────────────────────
    const SN = opts.mobile ? 150 : 340; const sGeo = track(new THREE.BufferGeometry());
    { const r = rng(99), a = new Float32Array(SN * 2 * 4), e = new Float32Array(SN * 2);
      for (let i = 0; i < SN; i++) { const ang = r() * TAU, rad = 2.4 + r() * r() * 9, z = r() * 120, len = 1.5 + r() * 5, seed = r();
        for (let k = 0; k < 2; k++) { const o = (i * 2 + k) * 4; a[o] = ang; a[o + 1] = rad; a[o + 2] = z; a[o + 3] = len * 10 + seed; e[i * 2 + k] = k; } }
      sGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SN * 2 * 3), 3)); sGeo.setAttribute("aS", new THREE.BufferAttribute(a, 4)); sGeo.setAttribute("aEnd", new THREE.BufferAttribute(e, 1)); }
    const sUni = { uTravel: { value: 0 }, uStretch: { value: 0 }, uIntensity: { value: 0 } };
    const streaks = new THREE.LineSegments(sGeo, track(new THREE.ShaderMaterial({ uniforms: sUni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uTravel, uStretch, uIntensity; attribute vec4 aS; attribute float aEnd; varying float vAlpha; varying vec3 vCol;
        void main(){ float seed = fract(aS.w); float len = floor(aS.w) / 10.;
          float z = -116. + mod(aS.z + uTravel*(.6+seed), 120.) + aEnd*len*(1.+uStretch);
          float rad = aS.y + sin(z*.05 + seed*6.283)*.6; vec3 p = vec3(cos(aS.x)*rad, sin(aS.x)*rad, z);
          vec4 mv = viewMatrix*vec4(p,1.); gl_Position = projectionMatrix*mv;
          float edge = smoothstep(-116., -100., z) * (1. - smoothstep(-8., 3., z));
          vAlpha = uIntensity * edge * (.12 + .88*aEnd) * (.35 + .65*seed);
          vCol = mix(vec3(.16,.47,1.), vec3(.47,.28,1.), fract(seed*3.)); vCol = mix(vCol, vec3(.19,.85,.96), step(.7, fract(seed*7.))); vCol = mix(vCol, vec3(1.,.53,.21), step(.9, fract(seed*13.))); }`,
      fragmentShader: `varying float vAlpha; varying vec3 vCol; void main(){ gl_FragColor = vec4(vCol, vAlpha); }` })));
    streaks.frustumCulled = false; scene.add(streaks);
    const gates = Array.from({ length: 8 }, (_, i) => {
      const g = new THREE.Mesh(track(new THREE.TorusGeometry(3.4 + (i % 3) * 0.7, 0.025, 8, 6 + (i % 2) * 90)), track(new THREE.MeshBasicMaterial({ color: [COL.electric, COL.violet, COL.cyan][i % 3], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })));
      g.position.z = -16 - i * 11.5; scene.add(g); return g;
    });

    // ── III · THE GROWTH ENGINE ─────────────────────────────────────────────────────────────────────────────────
    const engine = new THREE.Group(); engine.position.copy(ENGINE); scene.add(engine);
    engine.add(sprite(COL.electric, 8, 0.5));
    const engEnergy = new THREE.Mesh(sphereGeo, energyMat(COL.cyan, COL.electric)); engEnergy.scale.setScalar(0.85); engine.add(engEnergy);
    const engRings = buildRings(engine, [1.25, 1.5]);
    const moduleGeos: THREE.BufferGeometry[] = [
      new RoundedBoxGeometry(1.25, .82, .12, 4, .065),             // website: beveled display housing
      new RoundedBoxGeometry(.82, .82, .82, 4, .07),                 // e-commerce: machined package
      new THREE.CylinderGeometry(0.5, 0.5, 0.85, 28, 3),             // CRM: a data store
      new THREE.ConeGeometry(0.55, 1.0, 28, 1, true),                // marketing: a megaphone
      new THREE.TorusGeometry(0.46, 0.16, 16, 40),                   // communication: a headset ring
      new THREE.OctahedronGeometry(0.62, 0),                         // automation: a spark
    ].map(track);
    const modules = moduleGeos.map((geo, i) => {
      const g = new THREE.Group();
      const mesh = new THREE.Mesh(geo, chrome(0xd6dcf2, 0.16)); if (i === 3) { mesh.rotation.z = -Math.PI / 2; (mesh.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide; }
      const edges = new THREE.LineSegments(track(new THREE.EdgesGeometry(geo, 25)), track(new THREE.LineBasicMaterial({ color: MODULE_COLORS[i], transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })));
      mesh.add(edges);
      if (i === 0) {
        // Deep glossy glass in a rounded bezel gives the website object real surface depth.
        const screen = new THREE.Mesh(track(new RoundedBoxGeometry(1.07, .64, .026, 3, .035)),
          track(new THREE.MeshPhysicalMaterial({ color: 0x132c4b, metalness: .24, roughness: .11,
            clearcoat: 1, clearcoatRoughness: .06, envMapIntensity: 1.6, emissive: 0x07162d, emissiveIntensity: .22 })));
        screen.position.z = .077; mesh.add(screen);
        const stripe = new THREE.Mesh(track(new THREE.BoxGeometry(.78, .018, .007)),
          track(new THREE.MeshBasicMaterial({ color: COL.cyan, transparent: true, opacity: .65 })));
        stripe.position.set(0, .17, .094); screen.add(stripe);
      }
      if (i === 1) {
        const band = new THREE.Mesh(track(new RoundedBoxGeometry(.89, .10, .89, 2, .022)),
          chrome(0x98b2d5, .31)); band.position.y = .05; mesh.add(band);
      }
      const halo = sprite(MODULE_COLORS[i], 2.15, 0.3); g.add(halo, mesh); engine.add(g);
      return { g, mesh, halo, pos: new THREE.Vector3(), s: 1 };
    });
    const linkGeo = track(new THREE.BufferGeometry());
    const linkPos = new Float32Array((ENGINE_COUNT + 1) * 2 * 3), linkU = new Float32Array((ENGINE_COUNT + 1) * 2 * 2);
    for (let i = 0; i <= ENGINE_COUNT; i++) { linkU[i * 4] = 0; linkU[i * 4 + 1] = i; linkU[i * 4 + 2] = 1; linkU[i * 4 + 3] = i; }
    linkGeo.setAttribute("position", new THREE.BufferAttribute(linkPos, 3)); linkGeo.setAttribute("aU", new THREE.BufferAttribute(linkU, 2));
    const linkUni = { uTime: time, uActive: { value: 0 } };
    const links = new THREE.LineSegments(linkGeo, track(new THREE.ShaderMaterial({ uniforms: linkUni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec2 aU; varying vec2 vU; void main(){ vU = aU; gl_Position = projectionMatrix*viewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform float uTime; uniform float uActive; varying vec2 vU;
        void main(){ float on = 1. - step(.5, abs(vU.y - uActive)); float len = mix(9., 60., step(5.5, vU.y));
          float pulse = smoothstep(.9, 1., sin(vU.x*len - uTime*(3.+on*3.) + vU.y*1.7));
          vec3 c = mix(vec3(.16,.47,1.), vec3(.19,.85,.96), pulse); gl_FragColor = vec4(c, (.12 + .2*on) + pulse*(.6+.4*on)); }` })));
    links.frustumCulled = false; scene.add(links);

    // ── IV · THE GROWTH TREE ────────────────────────────────────────────────────────────────────────────────────
    type Seg = { a: THREE.Vector3; b: THREE.Vector3; r0: number; r1: number; t0: number; t1: number };
    const tree = new THREE.Group(); tree.position.copy(TREE); scene.add(tree);
    const R = rng(4242); const segs: Seg[] = [], roots: Seg[] = []; const tips: { p: THREE.Vector3; t: number }[] = [];
    const up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();
    const branch = (list: Seg[], a: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number, t0: number, isRoot: boolean) => {
      const b = a.clone().addScaledVector(dir, len); const t1 = t0 + len;
      list.push({ a, b, r0: rad, r1: rad * 0.7, t0, t1 });
      if (depth === 0) { if (!isRoot) tips.push({ p: b, t: t1 }); return; }
      const kids = isRoot ? 2 : depth >= 4 ? 3 : 2;
      for (let k = 0; k < kids; k++) {
        const axis = tmp.set(R() - .5, isRoot ? 0 : (R() - .5) * 0.4, R() - .5).cross(dir).normalize().clone();
        const d = dir.clone().applyAxisAngle(axis, (isRoot ? 0.5 : 0.42) + R() * 0.35).applyAxisAngle(dir, (k / kids) * TAU + R());
        if (isRoot) { d.y = Math.min(d.y, -0.12); } else { d.y += 0.22; }
        branch(list, b, d.normalize(), len * (0.74 + R() * 0.1), rad * 0.68, depth - 1, t1, isRoot);
      }
    };
    branch(segs, new THREE.Vector3(0, 0, 0), up.clone(), 2.5, 0.34, opts.mobile ? 4 : 5, 0, false);
    for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU + R(); branch(roots, new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(Math.cos(a) * 0.9, -0.45, Math.sin(a) * 0.9).normalize(), 1.9, 0.13, 3, 0, true); }
    const tMax = Math.max(...segs.map(s => s.t1)), rMax = Math.max(...roots.map(s => s.t1));
    const buildSegs = (list: Seg[], norm: number, from: number, span: number) => mergeGeometries(list.map(s => {
      const dir = tmp.subVectors(s.b, s.a); const len = dir.length();
      const g = new THREE.CylinderGeometry(s.r1, s.r0, len, 7, 1, true); g.translate(0, len / 2, 0);
      const n = g.attributes.position.count, base = new Float32Array(n * 3), tt = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const top = g.attributes.position.getY(i) > len / 2 ? 1 : 0; base.set([s.a.x, s.a.y, s.a.z], i * 3); tt.set([from + (s.t0 / norm) * span, from + (s.t1 / norm) * span, top], i * 3); }
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize())); g.translate(s.a.x, s.a.y, s.a.z);
      g.setAttribute("aBase", new THREE.BufferAttribute(base, 3)); g.setAttribute("aT", new THREE.BufferAttribute(tt, 3)); return g;
    }));
    const growUni = { uGrow: { value: 0 }, uTime: time };
    const growMat = (m: THREE.MeshStandardMaterial, flow: string) => {
      m.onBeforeCompile = sh => {
        sh.uniforms.uGrow = growUni.uGrow; sh.uniforms.uTime = growUni.uTime;
        sh.vertexShader = "attribute vec3 aBase; attribute vec3 aT; uniform float uGrow; varying float vT;\n" + sh.vertexShader.replace("#include <begin_vertex>",
          `float gk = clamp((uGrow - aT.x) / max(aT.y - aT.x, 1e-4), 0., 1.); float gv = mix(min(1., gk*4.), gk, aT.z); vec3 transformed = aBase + (position - aBase) * gv; vT = mix(aT.x, aT.y, aT.z);`);
        sh.fragmentShader = "uniform float uGrow; uniform float uTime; varying float vT;\n" + sh.fragmentShader.replace("#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>\n float fl = smoothstep(.93, 1., sin(vT*46. - uTime*1.5)); totalEmissiveRadiance += ${flow} * fl * step(vT, uGrow);`);
      };
      return m;
    };
    const trunkGeo = track(buildSegs(segs, tMax, 0.2, 0.8));
    tree.add(new THREE.Mesh(trunkGeo, growMat(chrome(0x9aacc6, 0.36), "vec3(.19,.6,1.) * .48")));
    const rootGeo = track(buildSegs(roots, rMax, 0, 0.24));
    tree.add(new THREE.Mesh(rootGeo, growMat(track(new THREE.MeshStandardMaterial({ color: 0x1b2f66, metalness: 0.7, roughness: 0.35, emissive: COL.electric, emissiveIntensity: 0.7 })), "vec3(.19,.85,.96) * 1.3")));
    const tipT = (t: number) => 0.2 + (t / tMax) * 0.8;
    // Leaves: glints at every tip and along the last twigs.
    const leafPts: number[] = [], leafT: number[] = [];
    for (const s of segs) if (s.r0 < 0.12) for (let k = 0; k < (opts.mobile ? 5 : 9); k++) { const f = 0.3 + R() * 0.7; leafPts.push(s.a.x + (s.b.x - s.a.x) * f + (R() - .5) * 0.5, s.a.y + (s.b.y - s.a.y) * f + (R() - .5) * 0.5, s.a.z + (s.b.z - s.a.z) * f + (R() - .5) * 0.5); leafT.push(tipT(s.t0 + (s.t1 - s.t0) * f), R()); }
    const leafGeo = track(new THREE.BufferGeometry()); leafGeo.setAttribute("position", new THREE.Float32BufferAttribute(leafPts, 3)); leafGeo.setAttribute("aL", new THREE.Float32BufferAttribute(leafT, 2));
    const leafUni = { uTime: time, uGrow: growUni.uGrow, uSize: { value: 1 } };
    const leaves = new THREE.Points(leafGeo, track(new THREE.ShaderMaterial({ uniforms: leafUni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uTime, uGrow, uSize; attribute vec2 aL; varying float vAlpha; varying vec3 vCol;
        void main(){ vec3 p = position; p.x += sin(uTime*.7 + aL.y*20.)*.06; p.y += cos(uTime*.5 + aL.y*33.)*.05;
          vec4 mv = modelViewMatrix*vec4(p,1.); gl_Position = projectionMatrix*mv; float on = smoothstep(aL.x, aL.x+.05, uGrow);
          gl_PointSize = uSize*(.5+aL.y)*on/max(-mv.z,.5); vAlpha = on*(.45+.55*sin(uTime*(1.+aL.y*2.)+aL.y*50.)*.5+.3);
          vCol = mix(vec3(.47,.28,1.), vec3(.19,.85,.96), aL.y); vCol = mix(vCol, vec3(.91,.93,.96), step(.8, aL.y)); }`,
      fragmentShader: SOFT_POINT })));
    tree.add(leaves);
    // Apples: ten well-spread tips.
    const chosen: { p: THREE.Vector3; t: number }[] = [];
    for (const c of [...tips].sort((a, b) => Math.atan2(a.p.z, a.p.x) - Math.atan2(b.p.z, b.p.x))) {
      if (chosen.length >= APPLE_COUNT) break;
      if (chosen.every(o => o.p.distanceTo(c.p) > 1.25) && Math.abs(c.p.z) < 3.2) chosen.push(c);
    }
    for (const c of tips) { if (chosen.length >= APPLE_COUNT) break; if (!chosen.includes(c)) chosen.push(c); }
    const appleGeo = track(appleGeometry());
    const stemGeo = track(new THREE.CylinderGeometry(.009, .014, .11, 8));
    const leafGeo = track(new THREE.SphereGeometry(.066, 12, 8));
    const stemMat = chrome(0x839aa9, .38), leafMat = chrome(0x4dbea5, .34);
    const apples = chosen.slice(0, APPLE_COUNT).sort((a, b) => a.t - b.t).map((c, i) => {
      const color = i % 3 === 1 ? 0xb064d8 : 0xe6a15c;
      // Dim, refractive-looking enamel under physically rendered softboxes; not a flat self-lit ball.
      const m = new THREE.Mesh(appleGeo, track(new THREE.MeshPhysicalMaterial({
        color, metalness: .28, roughness: .14, envMapIntensity: 2.2,
        clearcoat: 1, clearcoatRoughness: .07,
        iridescence: .13, iridescenceIOR: 1.48, iridescenceThicknessRange: [130, 270],
        emissive: color, emissiveIntensity: .17,
      })));
      m.position.copy(c.p).add(new THREE.Vector3(0, -0.24, 0));
      m.rotation.y = i * 1.3;
      const stem = new THREE.Mesh(stemGeo, stemMat); stem.position.set(0, .148, 0); stem.rotation.z = .15; m.add(stem);
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.set(.062, .18, .007); leaf.scale.set(1.2, .22, .78); leaf.rotation.z = -.55; m.add(leaf);
      const halo = sprite(i % 3 === 1 ? COL.magenta : COL.orange, 1.25, .3);
      m.add(halo); tree.add(m);
      return { m, halo, t: tipT(c.t), s: 0 };
    });
    const ground = sprite(COL.electric, 1, 0.5); ground.scale.set(15, 2.6, 1); ground.position.y = 0.1; tree.add(ground);
    const treeTop = Math.max(...tips.map(t => t.p.y));

    const wp = new THREE.Vector3(), front = new THREE.Vector3();
    updaters.push((dt, t) => {
      // I · Ignition. The birth runs on wall-clock time so a slow device still gets the full sequence.
      const w = (performance.now() - t0) / 1000;
      const birth = smooth(0.15, 2.3, w); oUni.uBirth.value = birth;
      if (!born && w > 1.9) { born = true; spawnRipple(core.position, 9, COL.cyan); }
      const dive = smooth(1.0, 1.07, Ts); core.visible = Ts < 1.4;
      if (core.visible) {
        const breathe = 1 + Math.sin(t * 1.4) * 0.04 + kick * 0.25;
        coreEnergy.scale.setScalar(0.62 * breathe * smooth(0, 1.1, w) * (1 - dive));
        (coreEnergy.material as THREE.ShaderMaterial).uniforms.uPower.value = 0.9 + kick * 1.2 + Math.sin(t * 2.1) * 0.08;
        coreGlow.scale.setScalar((7 + Math.sin(t * 1.4) * 0.6 + kick * 5) * (0.3 + 0.7 * birth)); coreGlow2.scale.setScalar(4.2 + kick * 3);
        const ringS = smooth(0.5, 1.9, w) * (1 + smooth(0.9, 1.08, Ts) * 7);
        coreRings.forEach((r, i) => { r.scale.setScalar(Math.max(0.001, ringS)); r.rotation.x += dt * (0.25 + i * 0.12); r.rotation.y += dt * (0.18 - i * 0.1); });
        const m = smooth(1.1, 2.4, w) * (1 - dive); mark.scale.setScalar(Math.max(0.001, 1.12 * m));
        mark.rotation.y = pxs * 0.45 + Math.sin(t * 0.5) * 0.12; mark.rotation.x = -pys * 0.3; mark.position.y = Math.sin(t * 0.9) * 0.05;
        core.rotation.y = pxs * 0.2; core.rotation.x = -pys * 0.12;
        oUni.uScale.value = 1 + kick * 0.5 + smooth(0.9, 1.08, Ts) * 4;
      }
      // II · Launch
      const launch = smooth(0.72, 1.12, Ts) * (1 - smooth(1.95, 2.12, Ts));
      streaks.visible = launch > 0.01; sUni.uIntensity.value = launch; sUni.uStretch.value = boost * 5 + launch * 1.5;
      travel += dt * (14 + launch * 22 + boost * 160); sUni.uTravel.value = travel;
      gates.forEach((g, i) => { g.visible = launch > 0.01; (g.material as THREE.MeshBasicMaterial).opacity = launch * 0.75; g.rotation.z += dt * (i % 2 ? 0.3 : -0.22) * (1 + boost * 6); });
      pUni.uWarm.value = launch * 0.6 + boost * 0.4;
      // III · Growth Engine
      engine.visible = Ts > 1.55 && Ts < 3.6; links.visible = engine.visible || (Ts > 2.8 && Ts < 4.4);
      if (engine.visible) {
        const target = Math.PI / 2 - engineActive * (TAU / ENGINE_COUNT);
        let d = (target - orbitBase) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; orbitBase += d * Math.min(1, dt * 3.2);
        engEnergy.scale.setScalar(0.85 * (1 + Math.sin(t * 1.6) * 0.05 + kick * 0.2));
        engRings.forEach((r, i) => { r.rotation.x += dt * (0.3 + i * 0.2); r.rotation.z += dt * 0.2; });
        const wideE = aspect >= 1.15, rx = wideE ? 3.9 : 2.25, rz = wideE ? 2.4 : 1.7, ms = wideE ? 0.92 : 0.62;
        modules.forEach((mo, i) => {
          const a = orbitBase + i * (TAU / ENGINE_COUNT) + Math.sin(t * 0.25 + i) * 0.03;
          // Tilted orbit: the module facing the camera sits low in front of the core, the far ones ride above it.
          mo.pos.set(Math.cos(a) * rx, -Math.sin(a) * (wideE ? 1.5 : 1.25) + Math.sin(t * 0.8 + i * 1.7) * 0.12, Math.sin(a) * rz);
          const on = i === engineActive ? 1 : i === engineHover ? 0.5 : 0; mo.s += ((0.86 + on * 0.46) - mo.s) * Math.min(1, dt * 5);
          mo.g.position.copy(mo.pos); mo.g.scale.setScalar(mo.s * ms);
          mo.mesh.rotation.y += dt * (0.35 + on * 0.5); mo.mesh.rotation.x = Math.sin(t * 0.5 + i) * 0.18 + (i === 3 ? 0 : 0.1);
          (mo.halo.material as THREE.SpriteMaterial).opacity = 0.3 + on * 0.55 + Math.sin(t * 2 + i) * 0.05;
          linkPos.set([ENGINE.x, ENGINE.y, ENGINE.z, ENGINE.x + mo.pos.x, ENGINE.y + mo.pos.y, ENGINE.z + mo.pos.z], i * 6);
          wp.copy(mo.pos).add(ENGINE).project(camera);
          frame.engine.set([(wp.x * 0.5 + 0.5) * width, (-wp.y * 0.5 + 0.5) * height, mo.s, wp.z < 1 ? Math.sin(a) : -2], i * 4);
        });
        linkUni.uActive.value = engineActive;
      }
      // Conduit: the engine feeds the tree.
      linkPos.set([ENGINE.x, ENGINE.y - 1, ENGINE.z, TREE.x, TREE.y + treeTop * 0.55, TREE.z], ENGINE_COUNT * 6);
      (linkGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      // IV · Growth Tree
      tree.visible = Ts > 2.85 && Ts < 4.7;
      // Overshoot to 1.12 so the last twigs, leaves and apples (birth time ≈ 1) finish growing too.
      const grow = smooth(3.04, 3.78, Ts) * 1.12; growUni.uGrow.value = grow; frame.grow = Math.min(1, grow);
      if (tree.visible) {
        tree.rotation.y = Math.sin(t * 0.18) * 0.1 + pxs * 0.14; tree.rotation.z = Math.sin(t * 0.35) * 0.012;
        tree.updateMatrixWorld();
        apples.forEach((ap, i) => {
          const on = appleActive === i ? 1 : 0; const target = smooth(ap.t, ap.t + 0.07, grow) * (1 + on * 0.6 + Math.sin(t * 2.2 + i * 1.3) * 0.07);
          ap.s += (target - ap.s) * Math.min(1, dt * 6); ap.m.scale.setScalar(Math.max(0.001, ap.s));
          (ap.m.material as THREE.MeshPhysicalMaterial).emissiveIntensity = .17 + on * .65 + Math.sin(t * 1.7 + i) * .08;
          (ap.halo.material as THREE.SpriteMaterial).opacity = .24 + on * .43;
          wp.setFromMatrixPosition(ap.m.matrixWorld); front.copy(wp).project(camera);
          frame.tree.set([(front.x * 0.5 + 0.5) * width, (-front.y * 0.5 + 0.5) * height, front.z < 1 ? Math.min(1, ap.s) : 0], i * 3);
        });
        ground.scale.set(15 * (0.3 + grow * 0.7), 2.6, 1);
      }
    });
  }

  // ── Camera path ───────────────────────────────────────────────────────────────────────────────────────────────
  const cp = new THREE.Vector3(), cl = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  type Key = [number, [number, number, number], [number, number, number]];
  const keys = (): Key[] => {
    // Wide screens keep copy on one side and the installation on the other; portrait screens stack them
    // (installation above, panel below). Offsets are expressed as a fraction of the visible half-height at that distance.
    const m = 1 / fit, wide = aspect >= 1.15, half = Math.tan((46 * Math.PI) / 360);
    const d0 = (wide ? 10 : 17) * m, dE = 11.5 * m, dT = (wide ? 16 : 16) * m;
    const ox = wide ? -2.7 : 0, oy = wide ? 0 : -0.62 * half * d0;
    const ex = wide ? -2.4 : 0, ey = wide ? 0.25 : -0.3 * half * dE, tx = wide ? -3.2 : 0, ty = wide ? 0.2 : -0.16 * half * dT;
    return [
      [0, [ox, oy + 0.2, d0], [ox, oy, 0]],
      [1, [0, 0, 6 * m], [0, 0, 0]],
      [2, [ex, 1.5 + ey, ENGINE.z + dE], [ex, ey, ENGINE.z]],
      [2.69, [ex + 0.8, 1.7 + ey, ENGINE.z + dE - 0.5], [ex, ey, ENGINE.z]],
      [3.08, [tx, TREE.y + 4.6 + ty, TREE.z + dT + 1.5], [tx, TREE.y + 4.2 + ty, TREE.z]],
      [4, [tx + 0.5, TREE.y + 5.4 + ty, TREE.z + dT], [tx, TREE.y + 4.9 + ty, TREE.z]],
      [5, [tx, TREE.y - 16, TREE.z + dT], [tx, TREE.y - 18, TREE.z]],
    ];
  };
  let K = keys();
  const moveCamera = () => {
    const t = clamp(opts.ambientOnly ? 0 : Ts, 0, 5); let i = 0; while (i < K.length - 2 && t > K[i + 1][0]) i++;
    const k0 = K[i], k1 = K[i + 1]; let f = clamp((t - k0[0]) / (k1[0] - k0[0]), 0, 1); f = f * f * (3 - 2 * f);
    cp.lerpVectors(a.fromArray(k0[1]), b.fromArray(k1[1]), f); cl.lerpVectors(a.fromArray(k0[2]), b.fromArray(k1[2]), f);
    if (opts.ambientOnly) { cp.set(Math.sin(time.value * 0.05) * 2, Math.cos(time.value * 0.04) * 1.5, 12); cl.set(0, 0, 0); }
    cp.x += pxs * 0.55; cp.y += -pys * 0.35 + Math.sin(time.value * 0.4) * 0.05;
    camera.position.copy(cp); camera.lookAt(cl);
    camera.fov = 46 + boost * 14 + smooth(1.05, 1.5, Ts) * (1 - smooth(1.6, 2, Ts)) * 12; camera.updateProjectionMatrix();
  };

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    width = w; height = h; aspect = w / h; fit = aspect < 1 ? clamp(aspect * 1.3, 0.5, 1) : 1;
    // Guard maximum framebuffer size even after rotation, split-screen or external display changes.
    const maxDpr = Math.max(.75, limitDpr(w, h));
    if (dpr > maxDpr) { dpr = maxDpr; renderer.setPixelRatio(dpr); }
    renderer.setSize(w, h, false); camera.aspect = aspect; camera.updateProjectionMatrix(); K = keys();
    const ps = h * dpr; pUni.uSize.value = ps * 0.085;
    scene.traverse(o => { const u = (o as THREE.Points).material as THREE.ShaderMaterial | undefined; if (o !== particles && u && u.uniforms && u.uniforms.uSize) u.uniforms.uSize.value = ps * 0.11; });
  };

  let raf = 0, running = false, last = 0, lastProjection = 0;
  let qualityTime = 0, qualityFrames = 0, fastestMs = 1000 / 60, poorWindows = 0, strongWindows = 0;
  let particleFraction = 1;
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const rawMs = Math.max(1, now - last);
    const dt = Math.min(0.05, rawMs / 1000 || 0.016); last = now; time.value += dt;
    // A jump link (e.g. hero → quote form) cuts to the destination instead of fast-forwarding through every universe.
    if (Math.abs(T - Ts) > 1.3) Ts = T; else Ts += (T - Ts) * Math.min(1, dt * 5.5); pxs += (px - pxs) * Math.min(1, dt * 4); pys += (py - pys) * Math.min(1, dt * 4);
    boost = Math.max(0, boost - dt * 1.4); kick = Math.max(0, kick - dt * 1.8);
    pUni.uCam.value.copy(camera.position);
    moveCamera(); camera.updateMatrixWorld();
    for (const u of updaters) u(dt, time.value);
    for (const r of ripples) if (r.m.visible) { r.age += dt; const k = r.age / 1.15; if (k >= 1) { r.m.visible = false; continue; } r.m.scale.setScalar(0.2 + r.max * (1 - (1 - k) * (1 - k))); (r.m.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.85; }
    frame.t = Ts;
    // Project HTML hit targets at 60 fps desktop/30 mobile while the actual scene is
    // free to render at native 60/90/120 Hz. DOM layout must not cap GPU animation.
    if (now - lastProjection >= (opts.mobile ? 1000 / 30 : 1000 / 60)) {
      frameCb?.(frame); lastProjection = now;
    }
    renderer.render(scene, camera);
    // Continuous frame-budget governor rather than a one-time "first 120 frames" downgrade.
    // requestAnimationFrame naturally follows 60/90/120 Hz screens where supported.
    if (rawMs < 120 && rawMs > 4) {
      qualityTime += Math.min(rawMs, 70); qualityFrames++;
      fastestMs = Math.min(fastestMs, rawMs);
    }
    if (qualityFrames >= 120) {
      const average = qualityTime / qualityFrames;
      const refreshBudget = fastestMs < 12.4 ? 1000 / 120 : 1000 / 60;
      const cap = Math.max(.75, limitDpr(width, height));
      canvas.dataset.refreshBudget = refreshBudget < 12 ? "120" : "60";
      if (average > refreshBudget * 1.19) {
        poorWindows++; strongWindows = 0;
        if (dpr > .76) {
          dpr = Math.max(.75, dpr - .18); renderer.setPixelRatio(dpr); resize();
          particleFraction = Math.max(.5, particleFraction - .1);
          pGeo.setDrawRange(0, Math.floor(N * particleFraction));
        } else if (poorWindows >= 5) opts.onTooSlow?.();
      } else if (average < refreshBudget * 1.07 && dpr < cap - .05) {
        strongWindows++; poorWindows = 0;
        if (strongWindows >= 3) {
          dpr = Math.min(cap, dpr + .12); renderer.setPixelRatio(dpr); resize();
          particleFraction = Math.min(1, particleFraction + .1);
          pGeo.setDrawRange(0, Math.floor(N * particleFraction));
          strongWindows = 0;
        }
      } else { poorWindows = 0; strongWindows = 0; }
      canvas.dataset.renderScale = dpr.toFixed(2);
      qualityTime = 0; qualityFrames = 0; fastestMs = 1000 / 60;
    }
  };

  const ndc = new THREE.Vector3();
  resize();
  return {
    setTimeline(t) { T = t; },
    setPointer(nx, ny) { px = nx; py = ny; },
    pulse(nx, ny) {
      ndc.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize().multiplyScalar(7).add(camera.position);
      const zone = Ts < 0.95 ? COL.cyan : Ts < 2.05 ? COL.orange : Ts < 3.05 ? COL.electric : COL.magenta;
      spawnRipple(ndc, 2.4, zone); kick = 1;
      if (!opts.ambientOnly && Ts < 0.95) spawnRipple(a.set(0, 0, 0), 7, COL.violet);
      if (Ts > 0.8 && Ts < 2.1) boost = 1;
    },
    setEngineActive(i) { const next = clamp(Math.round(i), 0, ENGINE_COUNT - 1); if (next !== engineActive) kick = Math.max(kick, .45); engineActive = next; },
    setEngineHover(i) { engineHover = i; },
    setAppleActive(i) { if (i !== appleActive && i !== null) kick = Math.max(kick, .65); appleActive = i; },
    onFrame(cb) { frameCb = cb; },
    resize,
    start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(tick); },
    stop() { running = false; cancelAnimationFrame(raf); },
    dispose() {
      running = false; cancelAnimationFrame(raf); frameCb = null;
      for (const d of disposables) d.dispose();
      renderer.dispose();
    },
  };
}
