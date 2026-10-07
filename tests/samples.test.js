import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLES, cloneState } from '../core/samples.js';
import { checkSetback } from '../core/setback.js';
import { validate } from '../core/validate.js';
import { coverage } from '../core/coverage.js';

for (const [name, s] of Object.entries(SAMPLES)) {
  test(`${name}: 입력 검증 통과`, () => assert.deepEqual(validate(s.site, s.volumes).errors, []));
}

test('violation 샘플: 사선 위반 있음', () => {
  const r = checkSetback(SAMPLES.violation.site, SAMPLES.violation.volumes, SAMPLES.violation.settings.setbackParams);
  assert.ok(r.some((x) => x.violates));
});

test('violation 샘플: A의 maxExcess는 5 (정북 4m → 허용 10m, 15-10)', () => {
  const s = SAMPLES.violation;
  const r = checkSetback(s.site, s.volumes, s.settings.setbackParams);
  const a = r.find((x) => x.id === 'A');
  assert.ok(Math.abs(a.maxExcess - 5) < 1e-6, String(a.maxExcess));
});

test('compliant 샘플: 내 건물 위반 없음', () => {
  const s = SAMPLES.compliant;
  const r = checkSetback(s.site, s.volumes.filter((v) => v.role === 'mine'), s.settings.setbackParams);
  assert.ok(r.every((x) => !x.violates), JSON.stringify(r.map((x) => [x.id, x.maxExcess])));
});

test('두 샘플의 건폐율은 같은 대지에서 308/600', () => {
  for (const s of Object.values(SAMPLES)) {
    const c = coverage(s.site, s.volumes, s.settings);
    assert.ok(Math.abs(c.coverageRatio - 308 / 600) < 1e-9);
  }
});

test('cloneState는 깊은 복사', () => {
  const c = cloneState(SAMPLES.violation);
  c.volumes[0].h = 999;
  assert.notEqual(SAMPLES.violation.volumes[0].h, 999);
});
