import { area, clipConvex, rayHit } from './geom.js';

// 시행령 제86조① 기본값(건축조례로 정하는 범위의 하한). 조례에 따라 달라질 수 있어 상수가 아니라 파라미터.
export const DEFAULT_PARAMS = { lowH: 10, lowD: 1.5, ratio: 0.5 };

export const requiredDistance = (z, p = DEFAULT_PARAMS) => (z <= p.lowH ? p.lowD : z * p.ratio);

export function allowedHeight(L, p = DEFAULT_PARAMS) {
  if (L < p.lowD) return 0;
  if (L < p.lowH * p.ratio) return p.lowH;
  return L / p.ratio;
}

export const northVec = (deg) => [Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180)];

export function activeEdges(site) {
  const poly = site.polygon, n = northVec(site.northAngleDeg);
  const sgn = area(poly) >= 0 ? 1 : -1;
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const e = site.edges?.[i] ?? {};
    const tag = e.tag ?? '인접대지';
    if (tag === '적용제외') continue;
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    const outward = [(sgn * dy) / len, (-sgn * dx) / len];
    if (outward[0] * n[0] + outward[1] * n[1] <= 1e-6) continue; // 북향 변만
    const w = tag === '도로·공원 등' ? e.width ?? 0 : 0;
    out.push({
      index: i,
      a: [a[0] + n[0] * w, a[1] + n[1] * w],
      b: [b[0] + n[0] * w, b[1] + n[1] * w],
    });
  }
  return out;
}

export function zCuts(z0, top, p = DEFAULT_PARAMS) {
  const cuts = [z0];
  if (z0 < p.lowH && p.lowH < top) cuts.push(p.lowH);
  for (let k = 1; p.lowH + k * 0.5 < top - 1e-9; k++) {
    const z = p.lowH + k * 0.5;
    if (z > z0 + 1e-9) cuts.push(z);
  }
  cuts.push(top);
  return cuts.filter((z, i) => i === 0 || z > cuts[i - 1] + 1e-9);
}

// ponytail: 밴드 상단 높이의 요구거리를 밴드 전체에 적용(최대 0.25m 보수적), 서로 다른 변의 쓸어낸 영역은 합집합이라
// 가까운 변이 적용제외인데 먼 변이 걸리는 드문 경우 과다 표시(보수적). 정밀화가 필요하면 first-crossing 변만 사용.
export function checkSetback(site, volumes, p = DEFAULT_PARAMS) {
  const n = northVec(site.northAngleDeg), edges = activeEdges(site);
  return volumes.map((v) => {
    const cuts = zCuts(v.z0, v.z0 + v.h, p);
    const pieces = [];
    for (let k = 0; k + 1 < cuts.length; k++) {
      const za = cuts[k], zb = cuts[k + 1], d = requiredDistance(zb, p);
      for (const e of edges) {
        const quad = [e.a, e.b, [e.b[0] - n[0] * d, e.b[1] - n[1] * d], [e.a[0] - n[0] * d, e.a[1] - n[1] * d]];
        const poly = clipConvex(v.footprint, quad);
        if (poly.length >= 3 && Math.abs(area(poly)) > 1e-6) pieces.push({ poly, z0: za, z1: zb, edge: e.index });
      }
    }
    let maxExcess = 0;
    for (const pc of pieces) {
      const e = edges.find((x) => x.index === pc.edge);
      let minL = Infinity;
      for (const q of pc.poly) {
        const s = rayHit(q, n, e.a, e.b, true);
        if (s !== null && s >= -1e-9) minL = Math.min(minL, Math.max(0, s));
      }
      if (minL < Infinity) maxExcess = Math.max(maxExcess, pc.z1 - Math.max(allowedHeight(minL, p), v.z0));
    }
    return { id: v.id, violates: pieces.length > 0, maxExcess, pieces };
  });
}

// 허용 사선 면의 단면: 정북 거리 L → 허용 높이 z (뷰에서 반투명 면으로 그림)
export function profile(p = DEFAULT_PARAMS, Lmax = 14) {
  return [[p.lowD, 0], [p.lowD, p.lowH], [p.lowH * p.ratio, p.lowH], [Lmax, Lmax / p.ratio]];
}
