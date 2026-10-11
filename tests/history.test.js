import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../core/history.js';

// 상태 = 숫자 하나. 스냅샷은 문자열.
const make = (opts = {}) => {
  const box = { v: 0, t: 0 };
  const h = createHistory({ snapshot: () => String(box.v), restore: (s) => { box.v = Number(s); }, now: () => box.t, ...opts });
  const set = (v, key) => { const b = String(box.v); box.v = v; return h.record(b, key); };
  return { box, h, set };
};

test('record: 값이 달라졌을 때만 기록하고, 같으면 무시', () => {
  const { h, set } = make();
  assert.equal(set(0), false);
  assert.equal(h.canUndo(), false);
  assert.equal(set(1), true);
  assert.equal(h.canUndo(), true);
});

test('undo/redo: 순서대로 복원되고 끝에서는 false', () => {
  const { box, h, set } = make();
  set(1); set(2); set(3);
  assert.equal(h.undo(), true); assert.equal(box.v, 2);
  assert.equal(h.undo(), true); assert.equal(box.v, 1);
  assert.equal(h.undo(), true); assert.equal(box.v, 0);
  assert.equal(h.undo(), false);
  assert.equal(h.redo(), true); assert.equal(box.v, 1);
  assert.equal(h.redo(), true); assert.equal(box.v, 2);
  assert.equal(h.redo(), true); assert.equal(box.v, 3);
  assert.equal(h.redo(), false);
});

test('새 변경을 기록하면 다시 실행 이력이 사라진다', () => {
  const { box, h, set } = make();
  set(1); set(2);
  h.undo();
  assert.equal(h.canRedo(), true);
  set(9);
  assert.equal(h.canRedo(), false);
  h.undo();
  assert.equal(box.v, 1);
});

test('같은 key가 coalesceMs 안에 이어지면 한 단계로 묶인다(첫 변경 직전 상태로 복원)', () => {
  const { box, h, set } = make({ coalesceMs: 600 });
  box.t = 0; set(1, 'time');
  box.t = 200; set(2, 'time');
  box.t = 400; set(3, 'time');
  h.undo();
  assert.equal(box.v, 0);
  assert.equal(h.canUndo(), false);
});

test('key가 다르거나 간격이 지나면 새 단계', () => {
  const { box, h, set } = make({ coalesceMs: 600 });
  box.t = 0; set(1, 'time');
  box.t = 100; set(2, 'date');
  box.t = 2000; set(3, 'date');
  h.undo(); assert.equal(box.v, 2);
  h.undo(); assert.equal(box.v, 1);
  h.undo(); assert.equal(box.v, 0);
});

test('undo 직후에는 같은 key라도 묶이지 않는다', () => {
  const { box, h, set } = make({ coalesceMs: 600 });
  box.t = 0; set(1, 'time');
  h.undo();
  box.t = 100; set(5, 'time');
  h.undo();
  assert.equal(box.v, 0);
});

test('max를 넘으면 가장 오래된 단계부터 버린다', () => {
  const { box, h, set } = make({ max: 3 });
  for (let i = 1; i <= 5; i++) set(i);
  let n = 0;
  while (h.undo()) n++;
  assert.equal(n, 3);
  assert.equal(box.v, 2);
});
