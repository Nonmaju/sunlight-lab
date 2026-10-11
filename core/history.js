// 되돌리기/다시 실행 이력. 상태는 JSON 문자열 스냅샷으로만 다룬다(DOM·Three.js 무관).
// record(before): 변경 "직전" 스냅샷을 넘기면, 현재 스냅샷과 다를 때만 한 단계로 기록한다.
// 같은 key가 coalesceMs 안에 이어지면(슬라이더 등) 첫 변경 직전 스냅샷 하나만 남겨 한 단계로 묶는다.
export function createHistory({ snapshot, restore, max = 100, coalesceMs = 600, now = () => Date.now() }) {
  let past = [], future = [], lastKey = '', lastAt = 0;
  return {
    record(before, key = '') {
      if (before === snapshot()) return false;
      const t = now();
      const merge = key !== '' && key === lastKey && t - lastAt < coalesceMs;
      lastKey = key; lastAt = t;
      if (merge) return false;
      past.push(before);
      if (past.length > max) past.shift();
      future = [];
      return true;
    },
    undo() {
      if (!past.length) return false;
      future.push(snapshot());
      lastKey = '';
      restore(past.pop());
      return true;
    },
    redo() {
      if (!future.length) return false;
      past.push(snapshot());
      lastKey = '';
      restore(future.pop());
      return true;
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  };
}
