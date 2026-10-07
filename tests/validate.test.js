import test from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../core/validate.js';

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
