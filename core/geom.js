export const area = (poly) => {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
};

export const ccw = (poly) => (area(poly) >= 0 ? poly : [...poly].reverse());

export function pointInPolygon([px, py], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// p + s*d 가 선분 a-b 와 만나는 s (없으면 null). s는 음수일 수 있으니 호출자가 거른다.
export function rayHit(p, d, a, b, closed = false) {
  const ex = b[0] - a[0], ey = b[1] - a[1];
  const den = d[0] * ey - d[1] * ex;
  if (Math.abs(den) < 1e-12) return null;
  const apx = a[0] - p[0], apy = a[1] - p[1];
  const s = (apx * ey - apy * ex) / den;
  const u = (apx * d[1] - apy * d[0]) / den;
  const ok = closed ? u >= -1e-9 && u <= 1 + 1e-9 : u >= 0 && u < 1;
  return ok ? s : null;
}

const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
export const segCross = (a, b, c, d) =>
  orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0;

function lineInter(p, q, a, b) {
  const dx = q[0] - p[0], dy = q[1] - p[1], ex = b[0] - a[0], ey = b[1] - a[1];
  const t = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / (dx * ey - dy * ex);
  return [p[0] + t * dx, p[1] + t * dy];
}

// subject는 오목해도 됨(면적은 정확, 분리된 조각은 폭 0 다리로 이어질 수 있음). clip은 볼록.
export function clipConvex(subject, clip) {
  const c = ccw(clip);
  let out = subject;
  for (let i = 0; i < c.length && out.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length];
    const inside = (p) => orient(a, b, p) >= -1e-12;
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j], prev = input[(j + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(lineInter(prev, cur, a, b));
        out.push(cur);
      } else if (inside(prev)) out.push(lineInter(prev, cur, a, b));
    }
  }
  return out;
}

function crossLength(polys, x) {
  const iv = [];
  for (const poly of polys) {
    const ys = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if ((a[0] <= x) !== (b[0] <= x)) ys.push(a[1] + ((x - a[0]) * (b[1] - a[1])) / (b[0] - a[0]));
    }
    ys.sort((p, q) => p - q);
    for (let k = 0; k + 1 < ys.length; k += 2) iv.push([ys[k], ys[k + 1]]);
  }
  iv.sort((p, q) => p[0] - q[0]);
  let total = 0, end = -Infinity;
  for (const [s, e] of iv) {
    if (e <= end) continue;
    total += e - Math.max(s, end);
    end = e;
  }
  return total;
}

// 슬래브 방식: 꼭짓점·교차점의 x로 나눈 구간 안에서는 단면 길이가 x에 대해 선형이므로 중점 값 × 폭이 정확하다.
export function unionArea(polys) {
  const xs = new Set();
  const edges = [];
  for (const p of polys) {
    p.forEach((a, i) => { xs.add(a[0]); edges.push([a, p[(i + 1) % p.length]]); });
  }
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const [a, b] = edges[i], [c, d] = edges[j];
      if (segCross(a, b, c, d)) xs.add(lineInter(a, b, c, d)[0]);
    }
  }
  const sorted = [...xs].sort((p, q) => p - q);
  let total = 0;
  for (let i = 0; i + 1 < sorted.length; i++) {
    const w = sorted[i + 1] - sorted[i];
    if (w < 1e-12) continue;
    total += crossLength(polys, sorted[i] + w / 2) * w;
  }
  return total;
}

export function selfIntersects(poly) {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segCross(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return true;
    }
  }
  return false;
}

// p: [x,y], d: unit direction [dx,dy], poly: vertices. Returns the sorted ray parameters s > 1e-9 where the ray crosses the polygon boundary.
// Side rule: an edge counts iff its endpoints lie on different sides of the ray's line, with "side" = cross(d, v - p) > 0.
// Proper crossing -> 1, tangent graze -> 0 or 2, ray through a vertex that enters/leaves -> exactly 1.
export function rayCrossings(p, d, poly) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const sa = d[0] * (a[1] - p[1]) - d[1] * (a[0] - p[0]);
    const sb = d[0] * (b[1] - p[1]) - d[1] * (b[0] - p[0]);
    if ((sa > 0) === (sb > 0)) continue;
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const den = d[0] * ey - d[1] * ex;
    const s = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / den;
    if (s > 1e-9) out.push(s);
  }
  return out.sort((x, y) => x - y);
}

// p가 다각형 어느 변 위에 있는가 (선분까지 거리 <= eps).
export function pointOnBoundary([px, py], poly, eps = 1e-9) {
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / l2));
    if (Math.hypot(px - (ax + t * ex), py - (ay + t * ey)) <= eps) return true;
  }
  return false;
}
