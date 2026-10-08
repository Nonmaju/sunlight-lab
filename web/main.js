import { SAMPLES, cloneState } from '../core/samples.js';
import { validate } from '../core/validate.js';
import { checkSetback } from '../core/setback.js';
import { coverage } from '../core/coverage.js';
import { instantMs, sunDirection } from '../core/sun.js';
import { createView } from './view3d.js';

// 동지일. 날짜는 KASI 월력요항으로 확인 필요(spec §9). 히트맵은 항상 이 날짜로 계산한다.
export const HEAT_DATE = '2026-12-22';

export const state = { ...cloneState(SAMPLES.violation), view: { mode: 'shadow', metric: 'continuous' }, limits: { coverage: null, far: null } }; // limits: UI 전용(내보내기·validateState 대상 아님)
let heat = null; // Task 8에서 채움
function makeView() {
  const el = document.getElementById('view3d');
  try { return createView(el); } catch (e) { // WebGL 미지원/초기화 실패: 3D만 끄고 평면도는 유지
    console.error(e);
    el.textContent = '이 브라우저에서는 3D 뷰(WebGL)를 쓸 수 없습니다. 평면도와 수치 결과는 그대로 사용할 수 있습니다.';
    return { update() {}, resize() {} };
  }
}
const view = makeView();
const listeners = [];
export const onRender = (fn) => listeners.push(fn);

export function setState(next) {
  Object.assign(state, next);
  render();
}

export function render() {
  const { site, volumes, settings } = state;
  const { errors, warnings } = validate(site, volumes);
  let derived = { errors, warnings, violations: [], cov: null, sunDir: null };
  if (!errors.length) {
    const ms = instantMs(settings.date, settings.timeMin, settings.timeBasis, settings.lon);
    derived = {
      errors, warnings,
      violations: checkSetback(site, volumes.filter((v) => v.role === 'mine'), settings.setbackParams),
      cov: coverage(site, volumes, settings),
      sunDir: sunDirection(ms, settings.lat, settings.lon, site.northAngleDeg),
    };
    view.update(state, { mode: state.view.mode, sunDir: derived.sunDir, violations: derived.violations, heat, metric: state.view.metric });
  }
  listeners.forEach((fn) => fn(state, derived));
}

export const setHeat = (h) => { heat = h; render(); };

document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
  const is3d = b.dataset.tab === '3d';
  document.getElementById('plan').hidden = is3d;
  document.getElementById('view3d').hidden = !is3d;
  if (is3d) view.resize();
}));

let worker = null, heatTimer = null, heatKey = '';
export const heatStatus = { running: false, done: 0, total: 0, ms: null, error: null, spawns: 0 }; // spawns: 검증용 카운터

function cancelHeat() {
  clearTimeout(heatTimer);
  worker?.terminate();
  worker = null;
  heatStatus.running = false;
}

function requestHeat() {
  const { errors } = validate(state.site, state.volumes);
  if (errors.length) { cancelHeat(); heatKey = ''; heat = null; return; }
  const { site, volumes, settings } = state;
  const key = JSON.stringify({ site, volumes, b: settings.timeBasis, la: settings.lat, lo: settings.lon, g: settings.gridSpacing });
  if (key === heatKey) return; // 태양 시각(timeMin)은 히트맵에 영향 없음
  heatKey = key;
  cancelHeat(); // 이전 작업 즉시 취소
  heatStatus.running = true; heatStatus.error = null;
  setHeat(null); // 낡은 히트맵 제거 (재렌더 시 key 동일 → 재진입 없음)
  heatTimer = setTimeout(() => {
    const w = worker = new Worker(new URL('./heat.worker.js', import.meta.url), { type: 'module' });
    heatStatus.spawns++;
    heatStatus.done = 0; heatStatus.total = 0;
    w.onmessage = ({ data }) => {
      if (w !== worker) return;
      if (data.type === 'progress') { heatStatus.done = data.done; heatStatus.total = data.total; listeners.forEach((fn) => fn(state, null)); }
      else { heatStatus.running = false; heatStatus.ms = data.ms; setHeat({ points: data.points, values: data.values }); }
    };
    w.onerror = (e) => {
      if (w !== worker) return;
      w.terminate(); worker = null; heatKey = ''; // 같은 입력으로 재시도하면 다시 실행되도록
      heatStatus.running = false; heatStatus.error = String(e.message || e);
      listeners.forEach((fn) => fn(state, null));
    };
    w.postMessage({ state: JSON.parse(JSON.stringify({ site, volumes, settings: { ...settings, date: HEAT_DATE } })) });
  }, 300);
}
onRender((_, d) => { if (d) requestHeat(); }); // 진행/오류 알림(d=null)에는 재요청하지 않는다 (오류 시 무한 재시도 방지)

render();

import('./ui.js').catch((err) => { // ui.js는 main.js의 state/render를 import한다
  console.error(err);
  document.getElementById('left').textContent = '화면을 불러오지 못했습니다. 콘솔을 확인하세요.';
});
