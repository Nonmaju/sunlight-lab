import test from 'node:test';
import assert from 'node:assert/strict';
import { isLit, groundGrid, wallGrid, sunHours } from '../core/sunhours.js';
import { sunPosition, sunDirection, instantMs } from '../core/sun.js';
import { pointInPolygon } from '../core/geom.js';

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const LAT = 37.5665, LON = 126.978;
const south45 = { x: 0, y: -Math.SQRT1_2, z: Math.SQRT1_2 }; // 고도 45°, 정남

test('isLit: 벽(높이 10) 북쪽 점은 거리에 따라 그늘/양지 (고도 45° → 그림자 길이 10)', () => {
  const wall = [{ id: 'w', footprint: rect(-1000, 0, 1000, 1), z0: 0, h: 10, role: 'mine' }];
  assert.equal(isLit([0, 6, 0.05], south45, wall), false); // 벽 북면에서 5m → 그늘
  assert.equal(isLit([0, 12, 0.05], south45, wall), true); // 벽 북면에서 11m → 양지
  assert.equal(isLit([0, -3, 0.05], south45, wall), true); // 벽 남쪽은 양지
});

test('isLit: 태양이 지평선 아래면 false, 건물 안 점은 그늘', () => {
  assert.equal(isLit([0, 0, 1], { x: 0, y: -1, z: -0.1 }, []), false);
  const b = [{ id: 'b', footprint: rect(0, 0, 10, 10), z0: 0, h: 5, role: 'mine' }];
  assert.equal(isLit([5, 5, 0.05], south45, b), false);
});

test('isLit: 광선이 볼륨 위로 지나가면 양지 (낮은 상자, 높은 태양)', () => {
  const low = [{ id: 'l', footprint: rect(-5, 0, 5, 2), z0: 0, h: 1, role: 'mine' }];
  const high = { x: 0, y: -0.2, z: Math.sqrt(1 - 0.04) };
  assert.equal(isLit([0, 4, 0.05], high, low), true);
});

test('groundGrid: 볼륨 바닥 위 점 제외, 모든 점 z>0', () => {
  const site = { polygon: rect(0, 0, 20, 30), northAngleDeg: 0, edges: [] };
  const vols = [{ id: 'a', footprint: rect(5, 5, 15, 15), z0: 0, h: 9, role: 'mine' }];
  const g = groundGrid(site, vols, 2, 5);
  assert.ok(g.length > 100);
  assert.ok(g.every((q) => !pointInPolygon([q.p[0], q.p[1]], vols[0].footprint) && q.p[2] > 0));
});

test('groundGrid: 필로티(공중 볼륨) 아래 지반점은 유지, 접지 볼륨 아래는 제외', () => {
  const site = { polygon: rect(0, 0, 20, 30), northAngleDeg: 0, edges: [] };
  const mk = (z0) => [{ id: 'a', footprint: rect(5, 5, 15, 15), z0, h: 9, role: 'mine' }];
  const under = (g) => g.filter((q) => pointInPolygon([q.p[0], q.p[1]], rect(5, 5, 15, 15))).length;
  assert.ok(under(groundGrid(site, mk(3), 2, 5)) > 0);
  assert.equal(under(groundGrid(site, mk(0), 2, 5)), 0);
});

test('wallGrid: 10×10×6 이웃 박스, 간격 2 → 북향 제외 3면 × (5×3) = 45점, 모두 박스 밖', () => {
  const fp = rect(0, 0, 10, 10);
  const w = wallGrid([{ id: 'n', footprint: fp, z0: 0, h: 6, role: 'neighbor' }], 2, [0, 1]);
  assert.equal(w.length, 45);
  assert.ok(w.every((q) => !pointInPolygon([q.p[0], q.p[1]], fp)));
  assert.equal(wallGrid([{ id: 'm', footprint: fp, z0: 0, h: 6, role: 'mine' }], 2, [0, 1]).length, 0);
});

test('sunHours: 긴 벽 북쪽 점의 연속/누적 시간 = 1초 단위 전수 스캔(손 닫힌형식) ±0.1분', () => {
  // 무한 벽 가정: 점은 0.05 + D·tan(alt)/|cos(az-180°)| >= H 일 때만 양지 (벽 두께 1m는 그림자 판정에 영향 없음)
  const H = 10, D = 20;
  const wall = [{ id: 'w', footprint: rect(-1000, 0, 1000, 1), z0: 0, h: H, role: 'mine' }];
  const p = [0, 1 + D, 0.05];
  const sunAt = (m) => sunDirection(instantMs('2026-12-22', m, 'KST', LON), LAT, LON, 0);
  const lit = (m) => {
    const { altitude, azimuth } = sunPosition(instantMs('2026-12-22', m, 'KST', LON), LAT, LON);
    if (altitude <= 0) return false;
    const c = Math.abs(Math.cos(((azimuth - 180) * Math.PI) / 180));
    return 0.05 + (D * Math.tan((altitude * Math.PI) / 180)) / c >= H;
  };
  let total = 0, run = 0, best = 0;
  for (let t = 540; t < 900; t += 1 / 60) {
    if (lit(t)) { total += 1 / 60; run += 1 / 60; best = Math.max(best, run); } else run = 0;
  }
  const r = sunHours(p, wall, sunAt);
  assert.ok(total > 30, `fixture가 의미 있으려면 양지 구간이 있어야 함: ${total}`);
  assert.ok(Math.abs(r.totalMin - total) < 0.1, `total ${r.totalMin} vs ${total}`);
  assert.ok(Math.abs(r.maxContinuousMin - best) < 0.1, `cont ${r.maxContinuousMin} vs ${best}`);
});

test('sunHours: 가리는 것이 없으면 09~15시 전체 360분', () => {
  const sunAt = (m) => sunDirection(instantMs('2026-12-22', m, 'KST', LON), LAT, LON, 0);
  const r = sunHours([0, 0, 1], [], sunAt);
  assert.ok(Math.abs(r.totalMin - 360) < 1e-6 && Math.abs(r.maxContinuousMin - 360) < 1e-6);
});

test('isLit: 태양 광선이 상자 꼭짓점을 정확히 지날 때(R6) 물리적으로 올바름', () => {
  const box = [{ id: 'b', footprint: rect(0, 0, 10, 10), z0: 0, h: 10, role: 'mine' }];
  const sun = { x: 0.5, y: 0.5, z: Math.SQRT1_2 }; // 수평 (+1,+1)/√2, 고도 45°
  assert.equal(isLit([-5, -5, 0.05], sun, box), false); // 광선이 모서리 (0,0)→(10,10) 대각선으로 상자를 관통 → 그늘
  assert.equal(isLit([-5, 5, 0.05], { x: 0.5, y: -0.5, z: Math.SQRT1_2 }, box), true); // 모서리 (0,0)만 스침 → 양지
});

test('isLit: 바닥 변 위의 점 (정남 45° 태양, 상자 10×10×10)', () => {
  const box = [{ id: 'b', footprint: rect(0, 0, 10, 10), z0: 0, h: 10, role: 'mine' }];
  assert.equal(isLit([5, 10, 0.05], south45, box), false); // 북쪽 변 = 북벽 밑동, 광선이 상자를 지남 → 그늘
  assert.equal(isLit([5, 0, 0.05], south45, box), true); // 남쪽 변 = 태양 쪽 밖, 광선이 상자에서 멀어짐 → 양지
  // 동쪽 변(x=10)은 광선이 변과 평행(접선)이라 모호 → 단언 생략
});

test('isLit: 점이 상자 지붕 높이 이상이면 양지, 태양이 정수리면 바닥 안만 그늘', () => {
  const box = [{ id: 'b', footprint: rect(0, 0, 10, 10), z0: 0, h: 10, role: 'mine' }];
  assert.equal(isLit([5, 12, 10], south45, box), true);
  const up = { x: 0, y: 0, z: 1 };
  assert.equal(isLit([5, 5, 0.05], up, box), false);
  assert.equal(isLit([15, 5, 0.05], up, box), true);
});

test('wallGrid: 연속 중복 꼭짓점(길이 0 변)이 있어도 NaN 없음', () => {
  const v = { id: 'n', footprint: [[0, 0], [10, 0], [10, 0], [10, 10], [0, 10]], z0: 0, h: 6, role: 'neighbor' };
  const pts = wallGrid([v], 2, [0, 1]);
  assert.ok(pts.length > 0);
  assert.ok(pts.every((q) => q.p.every(Number.isFinite)));
});

test('isLit: 공중에 뜬 볼륨(z0=5, h=2) 아래 지표 점 — 낮은 남쪽 태양은 통과(양지), 높은 태양은 가려짐', () => {
  const box = [{ id: 'f', footprint: rect(0, 0, 10, 10), z0: 5, h: 2, role: 'mine' }];
  const low = { x: 0, y: -Math.cos(0.17), z: Math.sin(0.17) }; // 고도 ≈ 9.7°: 남쪽 변(5m)에서 높이 ≈ 1m < z0
  assert.equal(isLit([5, 5, 0.05], low, box), true);
  assert.equal(isLit([5, 5, 0.05], south45, box), false); // 45°: 남쪽 변에서 높이 5.05 > z0 → 하부 가림
  assert.equal(isLit([5, 5, 0.05], { x: 0, y: 0, z: 1 }, box), false); // 정오 수직 태양
  assert.equal(isLit([5, 5, 8], south45, box), true); // 볼륨 위쪽 점
});
