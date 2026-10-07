import test from 'node:test';
import assert from 'node:assert/strict';
import { coverage } from '../core/coverage.js';
import { unionArea } from '../core/geom.js';

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const SITE = { polygon: rect(0, 0, 20, 30), northAngleDeg: 0, edges: [] };
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('단일 볼륨: 14×22, 높이 15 → 5층(floorHeight 3), 건폐율 308/600', () => {
  const c = coverage(SITE, [{ id: 'a', footprint: rect(3, 4, 17, 26), z0: 0, h: 15, role: 'mine' }]);
  near(c.siteArea, 600); near(c.buildingArea, 308); near(c.gfa, 308 * 5);
  near(c.coverageRatio, 308 / 600); near(c.far, (308 * 5) / 600);
});

test('겹치는 볼륨: 건축면적은 합집합, 연면적은 볼륨별 합', () => {
  const c = coverage(SITE, [
    { id: 'a', footprint: rect(0, 0, 10, 10), z0: 0, h: 6, role: 'mine' },
    { id: 'b', footprint: rect(5, 5, 15, 15), z0: 6, h: 6, role: 'mine' },
  ]);
  near(c.buildingArea, 175); near(c.gfa, 100 * 2 + 100 * 2);
});

test('neighbor 볼륨은 제외, floorHeight 변경 반영', () => {
  const vols = [
    { id: 'a', footprint: rect(0, 0, 10, 10), z0: 0, h: 8, role: 'mine' },
    { id: 'n', footprint: rect(0, 0, 10, 10), z0: 0, h: 80, role: 'neighbor' },
  ];
  near(coverage(SITE, vols, { floorHeight: 4 }).gfa, 200);
});

test('unionArea: 기울어진 두 변이 교차하는 삼각형 쌍', () => {
  // A=(0,0),(10,0),(5,10) 위로 뾰족, B=(0,10),(10,10),(5,0) 아래로 뾰족. 각 면적 50.
  // 높이 y에서 A 폭 = 10-y, B 폭 = y, 둘 다 x=5 중심이므로 교집합 폭 = min(y, 10-y).
  // 두 기울어진 변은 y=5(꼭짓점 y가 아닌 슬래브 중간)에서 교차.
  // 교집합 = ∫0..5 y dy + ∫5..10 (10-y) dy = 12.5 + 12.5 = 25 → 합집합 = 50+50-25 = 75.
  near(unionArea([[[0, 0], [10, 0], [5, 10]], [[0, 10], [10, 10], [5, 0]]]), 75, 1e-9);
});
