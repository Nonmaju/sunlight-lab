import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLES } from '../core/samples.js';
import { wallGrid, sunHours } from '../core/sunhours.js';
import { northVec } from '../core/setback.js';
import { instantMs, sunDirection } from '../core/sun.js';

// 워커와 같은 계산(동지 상수 날짜, 같은 sunAt)으로 이웃 벽의 일조를 샘플별로 비교한다.
const HEAT_DATE = '2026-12-22';
function neighborWalls(s) {
  const { site, volumes, settings } = s;
  const sunAt = (m) => sunDirection(instantMs(HEAT_DATE, m, settings.timeBasis, settings.lon), settings.lat, settings.lon, site.northAngleDeg);
  const pts = wallGrid(volumes, settings.gridSpacing, northVec(site.northAngleDeg));
  const vals = pts.map((q) => sunHours(q.p, volumes, sunAt).maxContinuousMin);
  return { n: vals.length, avg: vals.reduce((a, b) => a + b, 0) / vals.length, ge120: vals.filter((v) => v >= 120).length };
}

test('샘플 히트맵: 합격(계단형) 샘플이 위반 샘플보다 이웃 벽 일조가 엄격히 좋다', () => {
  const v = neighborWalls(SAMPLES.violation), c = neighborWalls(SAMPLES.compliant);
  console.log('violation', v, 'compliant', c);
  assert.equal(v.n, c.n);
  assert.ok(v.n > 0);
  assert.ok(c.avg > v.avg, `avg ${c.avg} vs ${v.avg}`);
  assert.ok(c.ge120 > v.ge120, `>=120min ${c.ge120} vs ${v.ge120}`);
});
