import { ccw, pointInPolygon, rayCrossings } from './geom.js';

export function isLit(p, sunDir, volumes) {
  if (sunDir.z <= 0) return false;
  const h = Math.hypot(sunDir.x, sunDir.y);
  if (h < 1e-9) {
    const p2 = [p[0], p[1]];
    return !volumes.some((v) => pointInPolygon(p2, v.footprint) && v.z0 + v.h > p[2]);
  }
  const u = [sunDir.x / h, sunDir.y / h], tan = sunDir.z / h;
  // 변 위의 점이 반개구간 규칙 때문에 "밖"으로 판정돼 진입 교차(s≈0)를 놓치지 않도록, 태양 쪽으로 1e-6m 이동(z는 그대로).
  const p2 = [p[0] + 1e-6 * u[0], p[1] + 1e-6 * u[1]];
  for (const v of volumes) {
    const top = v.z0 + v.h;
    if (p[2] >= top - 1e-9) continue;
    const f = v.footprint;
    const ss = rayCrossings(p2, u, f);
    const bounds = pointInPolygon(p2, f) ? [0, ...ss] : ss;
    for (let i = 0; i + 1 < bounds.length; i += 2) {
      if (bounds[i + 1] - bounds[i] < 1e-9) continue; // 접선(폭 0) 통과는 그림자 아님
      const zA = p[2] + bounds[i] * tan, zB = p[2] + bounds[i + 1] * tan;
      if (zB > v.z0 + 1e-9 && zA < top - 1e-9) return false;
    }
  }
  return true;
}

export function groundGrid(site, volumes, spacing, margin = 15) {
  const xs = site.polygon.map((q) => q[0]), ys = site.polygon.map((q) => q[1]);
  const x0 = Math.min(...xs) - margin, y0 = Math.min(...ys) - margin;
  const nx = Math.floor((Math.max(...xs) + margin - x0) / spacing) + 1;
  const ny = Math.floor((Math.max(...ys) + margin - y0) / spacing) + 1;
  const pts = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const x = x0 + i * spacing, y = y0 + j * spacing;
      if (volumes.some((v) => v.z0 <= 0.05 && pointInPolygon([x, y], v.footprint))) continue; // 필로티(z0>0.05) 아래 지반점은 유지
      pts.push({ p: [x, y, 0.05], kind: 'ground' });
    }
  }
  return pts;
}

export function wallGrid(volumes, spacing, north) {
  const pts = [];
  for (const v of volumes.filter((q) => q.role === 'neighbor')) {
    const poly = ccw(v.footprint);
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length];
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      if (len < 1e-9) return; // 중복 꼭짓점
      const nx = dy / len, ny = -dx / len;
      if (nx * north[0] + ny * north[1] > 0.5) return; // 북향 벽은 일조 없음 → 제외
      const nu = Math.max(1, Math.round(len / spacing)), nv = Math.max(1, Math.round(v.h / spacing));
      for (let iu = 0; iu < nu; iu++) {
        for (let iv = 0; iv < nv; iv++) {
          const t = (iu + 0.5) / nu, z = v.z0 + ((iv + 0.5) * v.h) / nv;
          pts.push({ p: [a[0] + dx * t + nx * 0.02, a[1] + dy * t + ny * 0.02, z], kind: 'wall' });
        }
      }
    });
  }
  return pts;
}

// 10분 샘플링 후 일조↔그늘 전이를 이분법으로 약 0.15초 정밀도까지 보정(샘플 양자화 오차 제거).
// ponytail: 샘플 사이(10분 미만)에 완전히 끼어든 그림자, 또는 그늘 샘플 둘 사이의 10분 미만 양지 틈을 놓친다. 필요하면 stepMin을 줄인다.
export function sunHours(p, volumes, sunAt, { startMin = 540, endMin = 900, stepMin = 10 } = {}) {
  const lit = (m) => isLit(p, sunAt(m), volumes);
  const bisect = (a, b, litAtA) => {
    for (let k = 0; k < 12; k++) {
      const mid = (a + b) / 2;
      if (lit(mid) === litAtA) a = mid; else b = mid;
    }
    return (a + b) / 2;
  };
  const n = Math.round((endMin - startMin) / stepMin);
  const ms = [], on = [];
  for (let i = 0; i <= n; i++) { ms.push(startMin + i * stepMin); on.push(lit(ms[i])); }
  const runs = [];
  let t0 = null;
  for (let i = 0; i <= n; i++) {
    if (on[i] && t0 === null) t0 = i === 0 ? ms[0] : bisect(ms[i - 1], ms[i], false);
    if (!on[i] && t0 !== null) { runs.push([t0, bisect(ms[i - 1], ms[i], true)]); t0 = null; }
  }
  if (t0 !== null) runs.push([t0, ms[n]]);
  return {
    maxContinuousMin: runs.reduce((m, [a, b]) => Math.max(m, b - a), 0),
    totalMin: runs.reduce((s, [a, b]) => s + (b - a), 0),
  };
}
