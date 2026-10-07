import test from 'node:test';
import assert from 'node:assert/strict';
import { area, ccw, pointInPolygon, rayHit, rayCrossings, segCross, clipConvex, unionArea, selfIntersects } from '../core/geom.js';

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('area: CCW 양수, CW 음수, ccw()는 CCW로 정렬', () => {
  near(area(rect(0, 0, 10, 5)), 50);
  near(area([...rect(0, 0, 10, 5)].reverse()), -50);
  assert.ok(area(ccw([...rect(0, 0, 10, 5)].reverse())) > 0);
});

test('pointInPolygon: 오목 L자', () => {
  const L = [[0, 0], [20, 0], [20, 15], [10, 15], [10, 30], [0, 30]];
  assert.equal(pointInPolygon([5, 25], L), true);
  assert.equal(pointInPolygon([15, 25], L), false);
  assert.equal(pointInPolygon([15, 10], L), true);
});

test('rayHit: 정북(+y) 광선이 y=30 변을 s=26에서 만남, 범위 밖이면 null', () => {
  near(rayHit([5, 4], [0, 1], [20, 30], [0, 30]), 26);
  assert.equal(rayHit([25, 4], [0, 1], [20, 30], [0, 30]), null);
  assert.equal(rayHit([5, 4], [1, 0], [20, 30], [0, 30]), null); // 평행
});

test('rayHit: 반개구간이라 꼭짓점을 지나는 광선은 정확히 한 번만 잡힌다', () => {
  const sq = rect(0, 0, 10, 10);
  let v = 0;
  for (let i = 0; i < 4; i++) if (rayHit([-5, -5], [1, 1], sq[i], sq[(i + 1) % 4]) !== null) v++;
  // 대각선 광선은 꼭짓점 (0,0)과 (10,10)을 지난다. 반개구간 [0,1)에서는 공유 꼭짓점이
  // 두 변 중 정확히 한 변(시작점 쪽)에만 속하므로 꼭짓점마다 1번, 합계 2번이다.
  assert.equal(v, 2);
});

test('segCross: 진교차만', () => {
  assert.equal(segCross([0, 0], [10, 10], [0, 10], [10, 0]), true);
  assert.equal(segCross([0, 0], [10, 0], [10, 0], [20, 5]), false);
});

test('clipConvex: 사각형과 평행사변형 교차', () => {
  const quad = [[0, 24], [20, 24], [20, 30], [0, 30]];
  const out = clipConvex(rect(3, 4, 17, 26), quad);
  near(Math.abs(area(out)), 14 * 2);
});

test('clipConvex: 완전히 밖이면 빈 배열', () => {
  assert.equal(clipConvex(rect(0, 0, 1, 1), rect(5, 5, 6, 6)).length, 0);
});

test('unionArea: 겹치는 두 정사각형 = 175, 떨어진 두 개 = 합, 동일 도형 = 단일', () => {
  near(unionArea([rect(0, 0, 10, 10), rect(5, 5, 15, 15)]), 175);
  near(unionArea([rect(0, 0, 10, 10), rect(20, 0, 30, 10)]), 200);
  near(unionArea([rect(0, 0, 10, 10), rect(0, 0, 10, 10)]), 100);
});

test('unionArea: 삼각형(경계 교차) 포함', () => {
  const tri = [[0, 0], [10, 0], [0, 10]];
  near(unionArea([tri, rect(0, 0, 5, 5)]), 50); // 사각형은 삼각형에 완전히 포함
  near(unionArea([tri, rect(0, 0, 10, 10)]), 100);
});

test('selfIntersects: 나비넥타이 true, 정상 false', () => {
  assert.equal(selfIntersects([[0, 0], [10, 10], [10, 0], [0, 10]]), true);
  assert.equal(selfIntersects(rect(0, 0, 10, 10)), false);
});

test('rayCrossings: 정점 통과/접선/정상 교차', () => {
  const q = Math.SQRT1_2, sq = rect(0, 0, 10, 10);
  const diag = rayCrossings([-5, -5], [q, q], sq); // 대각선: 모서리 (0,0),(10,10) 통과 → 정확히 2
  assert.equal(diag.length, 2);
  near(diag[0], 5 * Math.SQRT2); near(diag[1], 15 * Math.SQRT2);
  const graze = rayCrossings([-5, 5], [q, -q], sq); // 모서리 (0,0)만 스침 → 짝수
  assert.equal(graze.length % 2, 0);
  graze.forEach((s) => near(s, 5 * Math.SQRT2));
  const prop = rayCrossings([5, -5], [0, 1], sq);
  assert.equal(prop.length, 2); near(prop[0], 5); near(prop[1], 15);
});
