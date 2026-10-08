import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { activeEdges, northVec, profile } from '../core/setback.js';

export const HEAT_MAX_MIN = 360;
export const HEAT_STOPS = [[0x44, 0x01, 0x54], [0x21, 0x90, 0x8d], [0xfd, 0xe7, 0x25]]; // viridis 3점 보간
export function heatColor(minutes) {
  const t = Math.min(Math.max(minutes / HEAT_MAX_MIN, 0), 1) * 2;
  const i = Math.min(Math.floor(t), 1), f = t - i;
  const a = HEAT_STOPS[i], b = HEAT_STOPS[i + 1];
  return [0, 1, 2].map((k) => (a[k] + (b[k] - a[k]) * f) / 255);
}

const TAG_COLOR = { 인접대지: 0x2c3e50, '도로·공원 등': 0x2980b9, 적용제외: 0x95a5a6 };

export function createView(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2f2f2);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 2000);
  camera.up.set(0, 0, 1);
  camera.position.set(-40, -70, 60);
  const controls = new OrbitControls(camera, renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 0.7));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 1, far: 500 });
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
  ground.receiveShadow = true;
  ground.position.z = -0.02;
  scene.add(ground);
  const dyn = new THREE.Group();
  scene.add(dyn);

  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(container);
  renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

  const prism = (footprint, z0, h, material, shadow = true) => {
    const shape = new THREE.Shape(footprint.map(([x, y]) => new THREE.Vector2(x, y)));
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }), material);
    m.position.z = z0;
    m.castShadow = shadow;
    m.receiveShadow = true;
    return m;
  };

  function clear() {
    dyn.traverse((o) => { o.geometry?.dispose?.(); [].concat(o.material ?? []).forEach((m) => m.dispose?.()); });
    dyn.clear();
  }

  function setbackSurface(site, params, maxTop) {
    const n = northVec(site.northAngleDeg), prof = profile(params, Math.max(14, maxTop * params.ratio + 2));
    const pos = [];
    for (const e of activeEdges(site)) {
      for (let k = 0; k + 1 < prof.length; k++) {
        const [L0, z0] = prof[k], [L1, z1] = prof[k + 1];
        const P = (pt, L, z) => [pt[0] - n[0] * L, pt[1] - n[1] * L, z];
        const q = [P(e.a, L0, z0), P(e.b, L0, z0), P(e.b, L1, z1), P(e.a, L1, z1)];
        pos.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x27ae60, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
  }

  function heatPoints(heat, metric) {
    const pos = new Float32Array(heat.points.length * 3), col = new Float32Array(heat.points.length * 3);
    heat.points.forEach((q, i) => {
      pos.set(q.p, i * 3);
      const v = heat.values[i];
      col.set(heatColor(metric === 'total' ? v.totalMin : v.maxContinuousMin), i * 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ size: 7, sizeAttenuation: false, vertexColors: true }));
  }

  function update(state, ctx) {
    clear();
    const { site, volumes, settings } = state;
    const { mode, sunDir, violations, heat, metric } = ctx;
    // 태양: 조명 방향은 코어의 태양 벡터만 사용 (그림자와 계산 결과가 같은 태양을 본다)
    // 장면(대지+볼륨)의 실제 범위에서 조명 목표·그림자 카메라·궤도 중심을 유도한다 (원점에서 멀리 떨어진 대지도 그림자가 나오도록)
    const pts = [...site.polygon, ...volumes.flatMap((v) => v.footprint)];
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const maxTop = Math.max(0, ...volumes.map((v) => v.z0 + v.h));
    const radius = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + maxTop;
    const sc = sun.shadow.camera, ext = radius * 1.3;
    Object.assign(sc, { left: -ext, right: ext, top: ext, bottom: -ext, far: radius * 4 + 200 });
    sc.updateProjectionMatrix();
    sun.target.position.set(cx, cy, 0);
    sun.target.updateMatrixWorld();
    const up = sunDir && sunDir.z > 0;
    sun.intensity = up ? 1.6 : 0;
    if (up) { const d = radius * 3 + 100; sun.position.set(cx + sunDir.x * d, cy + sunDir.y * d, sunDir.z * d); }
    ground.position.set(cx, cy, -0.02);
    ground.scale.setScalar(Math.max(1, (radius * 6) / 400));
    if (!view.center || Math.hypot(cx - view.center[0], cy - view.center[1]) > 1) {
      const t = controls.target, from = view.center ? [t.x, t.y] : null;
      t.set(cx, cy, 5);
      if (from) camera.position.add({ x: cx - from[0], y: cy - from[1], z: 0 }); // 궤도 중심이 옮겨지면 카메라도 같이 이동
      else camera.position.set(cx - 40, cy - 70, 60);
      view.center = [cx, cy];
    }
    // 대지 경계(변 태그별 색)
    site.polygon.forEach((a, i) => {
      const b = site.polygon[(i + 1) % site.polygon.length];
      const tag = site.edges?.[i]?.tag ?? '인접대지';
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a[0], a[1], 0.05), new THREE.Vector3(b[0], b[1], 0.05)]);
      dyn.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: TAG_COLOR[tag] ?? 0x2c3e50 })));
    });
    // 볼륨
    const ghost = mode !== 'shadow';
    for (const v of volumes) {
      const color = v.role === 'neighbor' ? 0x9aa5b1 : 0x3b82c4;
      const mat = new THREE.MeshStandardMaterial({ color, transparent: ghost, opacity: ghost ? 0.35 : 1 });
      dyn.add(prism(v.footprint, v.z0, v.h, mat, !ghost));
    }
    if (mode === 'setback') {
      dyn.add(setbackSurface(site, settings.setbackParams, maxTop));
      for (const r of violations ?? []) {
        for (const pc of r.pieces) {
          dyn.add(prism(pc.poly, pc.z0, pc.z1 - pc.z0, new THREE.MeshBasicMaterial({ color: 0xe74c3c, transparent: true, opacity: 0.85 }), false));
        }
      }
    }
    if (mode === 'heat' && heat) dyn.add(heatPoints(heat, metric));
  }

  resize();
  const view = { update, resize, center: null };
  return view;
}
