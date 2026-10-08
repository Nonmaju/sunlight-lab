import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, validateState } from '../core/validate.js';
import { SAMPLES, cloneState } from '../core/samples.js';

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const SITE = { polygon: rect(0, 0, 20, 30), northAngleDeg: 0, edges: [] };
const v = (over) => ({ id: 'a', footprint: rect(3, 4, 17, 26), z0: 0, h: 10, role: 'mine', ...over });

test('정상 입력은 오류 없음', () => assert.deepEqual(validate(SITE, [v()]).errors, []));
test('꼭짓점 3개 미만', () => assert.ok(validate({ ...SITE, polygon: [[0, 0], [1, 1]] }, []).errors.length > 0));
test('자기교차 대지', () => assert.ok(validate({ ...SITE, polygon: [[0, 0], [10, 10], [10, 0], [0, 10]] }, []).errors.length > 0));
test('높이 0 이하', () => assert.ok(validate(SITE, [v({ h: 0 })]).errors.length > 0));
test('z0 음수', () => assert.ok(validate(SITE, [v({ z0: -1 })]).errors.length > 0));
test('내 건물이 대지 밖이면 오류, 이웃 건물은 대지 밖이어도 정상', () => {
  assert.ok(validate(SITE, [v({ footprint: rect(15, 4, 25, 26) })]).errors.length > 0);
  assert.deepEqual(validate(SITE, [v({ role: 'neighbor', footprint: rect(2, 33, 18, 43) })]).errors, []);
});
test('자기교차 볼륨', () => assert.ok(validate(SITE, [v({ footprint: [[3, 4], [10, 10], [10, 4], [3, 10]] })]).errors.length > 0));

test('경계 접촉(제로 이격)은 정상: 대지 전체, NE 모서리, 동쪽 변만, 북쪽 변만', () => {
  for (const fp of [rect(0, 0, 20, 30), rect(10, 20, 20, 30), rect(10, 5, 20, 15), rect(5, 20, 15, 30)])
    assert.deepEqual(validate(SITE, [v({ footprint: fp })]).errors, []);
});
test('동쪽으로 튀어나오면 오류', () => assert.ok(validate(SITE, [v({ footprint: rect(15, 4, 25, 26) })]).errors.length > 0));
test('오목 대지: 꼭짓점은 모두 안이지만 변이 홈을 가로지르면 오류', () => {
  const L = { ...SITE, polygon: [[0, 0], [20, 0], [20, 15], [10, 15], [10, 30], [0, 30]] };
  assert.ok(validate(L, [v({ footprint: [[5, 5], [5, 25], [15, 13]] })]).errors.length > 0);
  assert.deepEqual(validate(L, [v({ footprint: rect(2, 2, 8, 12) })]).errors, []);
});

// ── validateState ──
const S = () => cloneState(SAMPLES.violation);
const bad = (mut) => { const s = S(); mut(s); const r = validateState(s); assert.ok(r.errors.length > 0, 'should reject'); assert.equal(r.state, null); };
test('validateState: 샘플 통과 + 깊은 복사 동일', () => {
  for (const k of ['violation', 'compliant']) { const r = validateState(SAMPLES[k]); assert.deepEqual(r.errors, []); assert.deepEqual(r.state, SAMPLES[k]); assert.notEqual(r.state.site, SAMPLES[k].site); }
});
test('validateState: 최상위 구조', () => { assert.ok(validateState(null).errors.length); assert.ok(validateState([]).errors.length); assert.ok(validateState({}).errors.length >= 3); });
test('validateState: site 거부', () => {
  bad((s) => { s.site.polygon = [[0, 0], [1, 1]]; });
  bad((s) => { s.site.polygon[0] = ['1', 2]; });
  bad((s) => { s.site.polygon[0] = [NaN, 2]; });
  bad((s) => { s.site.polygon[0] = [1e6, 2]; });
  bad((s) => { s.volumes[0].footprint[0] = [0, -1e9]; });
  bad((s) => { s.site.northAngleDeg = '0'; });
});
test('validateState: edges 거부/보충', () => {
  bad((s) => { s.site.edges = [{ tag: '인접대지' }]; });
  bad((s) => { s.site.edges[0].tag = 'x'; });
  bad((s) => { s.site.edges[0].width = -1; });
  const s = S(); delete s.site.edges; const r = validateState(s);
  assert.deepEqual(r.errors, []); assert.deepEqual(r.state.site.edges, [1, 2, 3, 4].map(() => ({ tag: '인접대지' })));
});
test('validateState: volumes 거부', () => {
  bad((s) => { s.volumes = {}; });
  bad((s) => { s.volumes = Array(201).fill(S().volumes[0]); });
  bad((s) => { s.volumes[0].h = '15'; });
  bad((s) => { s.volumes[0].h = 0; });
  bad((s) => { s.volumes[0].z0 = -1; });
  bad((s) => { s.volumes[0].role = 'x'; });
  bad((s) => { delete s.volumes[0].footprint; });
  bad((s) => { s.volumes[0].id = null; });
});
test('validateState: 숫자 id는 문자열로 정규화', () => {
  const s = S(); s.volumes[0].id = 7; assert.equal(validateState(s).state.volumes[0].id, '7');
});
test('validateState: settings 거부', () => {
  bad((s) => { s.settings.date = '2026-02-30'; });
  bad((s) => { s.settings.date = ''; });
  bad((s) => { s.settings.timeMin = 1441; });
  bad((s) => { s.settings.timeBasis = 'UTC'; });
  bad((s) => { s.settings.lat = 91; });
  bad((s) => { s.settings.lon = -181; });
  bad((s) => { s.settings.floorHeight = 1; });
  bad((s) => { s.settings.gridSpacing = 0; });
  bad((s) => { delete s.settings.setbackParams; });
  bad((s) => { s.settings.setbackParams.ratio = 0; });
});
test('연속된 꼭짓점이 같으면 오류', () => {
  const r = validate({ ...SITE, polygon: [[0, 0], [20, 0], [20, 0], [20, 30], [0, 30]] }, []);
  assert.ok(r.errors.some((e) => e.includes('연속된 꼭짓점이 같습니다')), r.errors.join('|'));
});
