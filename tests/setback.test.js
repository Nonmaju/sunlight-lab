import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PARAMS as P, requiredDistance, allowedHeight, northVec, activeEdges, zCuts, checkSetback, profile } from '../core/setback.js';
import { pointInPolygon, rayHit } from '../core/geom.js';

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const SITE = (over = {}) => ({ polygon: rect(0, 0, 20, 30), northAngleDeg: 0, edges: [], ...over });
const vol = (footprint, h, z0 = 0) => ({ id: 'v', footprint, z0, h, role: 'mine' });
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('requiredDistance / allowedHeight (spec 2절 수치, 파라미터화)', () => {
  assert.equal(requiredDistance(10), 1.5);
  assert.equal(requiredDistance(12), 6);
  assert.equal(allowedHeight(1, P), 0);
  assert.equal(allowedHeight(4, P), 10);
  assert.equal(allowedHeight(8, P), 16);
  assert.equal(requiredDistance(12, { lowH: 9, lowD: 2, ratio: 0.5 }), 6); // 파라미터 변경 가능
});

test('zCuts: 10m 경계와 0.5m 간격, 상단 포함', () => {
  assert.deepEqual(zCuts(0, 12), [0, 10, 10.5, 11, 11.5, 12]);
  assert.deepEqual(zCuts(0, 9), [0, 9]);
  assert.deepEqual(zCuts(9, 15).slice(0, 3), [9, 10, 10.5]);
});

test('정북 4m 이격의 12m 박스: 위반, 최대 초과 2m (손계산: 허용 10m)', () => {
  const [r] = checkSetback(SITE(), [vol(rect(3, 4, 17, 26), 12)]);
  assert.equal(r.violates, true);
  near(r.maxExcess, 2);
});

test('높이 정확히 10m, 정북 2m: 합격 / 10.5m: 위반 (10m 단차)', () => {
  assert.equal(checkSetback(SITE(), [vol(rect(3, 4, 17, 28), 10)])[0].violates, false);
  assert.equal(checkSetback(SITE(), [vol(rect(3, 4, 17, 28), 10.5)])[0].violates, true);
});

test('높이 15m: 정북 22.5m 선까지 허용 — y=22는 합격, y=23은 위반', () => {
  assert.equal(checkSetback(SITE(), [vol(rect(3, 4, 17, 22), 15)])[0].violates, false);
  assert.equal(checkSetback(SITE(), [vol(rect(3, 4, 17, 23), 15)])[0].violates, true);
});

test('도로 변(폭 6m) 태그: 경계가 정북으로 6m 이동 → 같은 박스가 합격', () => {
  const edges = [{}, {}, { tag: '도로·공원 등', width: 6 }, {}];
  assert.equal(checkSetback(SITE({ edges }), [vol(rect(3, 4, 17, 26), 12)])[0].violates, false);
});

test('적용제외 태그: 정북 인접 대지가 주거지역이 아님 → 판정 안 함', () => {
  const edges = [{}, {}, { tag: '적용제외' }, {}];
  assert.equal(checkSetback(SITE({ edges }), [vol(rect(3, 4, 17, 26), 21)])[0].violates, false);
});

test('L자 대지: 정북 변이 바로 위에 있는 박스만 위반 (손계산)', () => {
  const L = [[0, 0], [20, 0], [20, 15], [10, 15], [10, 30], [0, 30]];
  const site = SITE({ polygon: L });
  assert.equal(checkSetback(site, [vol(rect(12, 8, 18, 13), 12)])[0].violates, true);  // L=2 < 6
  assert.equal(checkSetback(site, [vol(rect(2, 8, 8, 13), 12)])[0].violates, false);   // 위는 y=30 (L=17)
});

test('속성 테스트: 판정 영역 = 정북 광선 정의 (북 0°, 30°, -45° 회전)', () => {
  for (const ang of [0, 30, -45]) {
    const site = SITE({ northAngleDeg: ang });
    const fp = rect(3, 4, 17, 26);
    const [r] = checkSetback(site, [vol(fp, 21)]);
    const n = northVec(ang);
    const edges = activeEdges(site);
    const cuts = zCuts(0, 21);
    let checked = 0;
    for (let x = 3.05; x < 17; x += 0.7) {
      for (let y = 4.05; y < 26; y += 0.7) {
        for (let k = 1; k < cuts.length; k++) {
          const zb = cuts[k], d = requiredDistance(zb);
          const ss = edges.map((e) => rayHit([x, y], n, e.a, e.b, true)).filter((s) => s !== null && s >= 0);
          if (ss.some((s) => Math.abs(s - d) < 1e-6)) continue; // 경계 위 점은 제외
          const expected = ss.some((s) => s < d);
          const actual = r.pieces.some((pc) => pc.z1 === zb && pointInPolygon([x, y], pc.poly));
          assert.equal(actual, expected, `ang=${ang} (${x},${y}) z=${zb}`);
          checked++;
        }
      }
    }
    assert.ok(checked > 500);
  }
});

test('공중에 뜬 볼륨(z0>0): 초과량은 볼륨 자신의 두께까지만 (손계산)', () => {
  // 대지 정북 경계 y=30, 볼륨 y=28~29(L=1 → 허용 0m), z0=8, 상단 10 → 초과 = 10 - max(0, 8) = 2 (이전 공식은 10)
  const [r] = checkSetback(SITE(), [vol(rect(3, 28, 17, 29), 2, 8)]);
  assert.equal(r.violates, true);
  near(r.maxExcess, 2);
});

test('적층 볼륨(z0=12, h=3, 정북 4m): 상단 15, 허용 10 → 초과 = 15 - max(10, 12) = 3', () => {
  // 손계산: 상단 15m, L=4 → allowedHeight=10 → 12~15 구간 전체가 초과. v.z0=12가 허용 10보다 높아 초과 = 상단 − z0 = 3.
  const [r] = checkSetback(SITE(), [vol(rect(3, 4, 17, 26), 3, 12)]);
  assert.equal(r.violates, true);
  near(r.maxExcess, 3);
});

test('profile: Lmax가 크면 끝점 [Lmax, 2·Lmax], 작으면 꺾임점(5m) 뒤로 클램프', () => {
  assert.deepEqual(profile(P, 40).at(-1), [40, 80]);
  assert.deepEqual(profile(P, 3).at(-1), [6, 12]); // lowH*ratio + 1 = 6
});
