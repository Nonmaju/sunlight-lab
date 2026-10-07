import { SAMPLES, cloneState } from '../core/samples.js';
import { validate } from '../core/validate.js';
import { checkSetback } from '../core/setback.js';
import { coverage } from '../core/coverage.js';
import { instantMs, sunDirection } from '../core/sun.js';
import { createView } from './view3d.js';

export const state = { ...cloneState(SAMPLES.violation), view: { mode: 'shadow', metric: 'continuous' } };
let heat = null; // Task 8에서 채움
const view = createView(document.getElementById('view3d'));
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
  const key = JSON.stringify({ site, volumes, d: settings.date, b: settings.timeBasis, la: settings.lat, lo: settings.lon, g: settings.gridSpacing });
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
      heatStatus.running = false; heatStatus.error = String(e.message || e);
      listeners.forEach((fn) => fn(state, null));
    };
    w.postMessage({ state: JSON.parse(JSON.stringify({ site, volumes, settings })) });
  }, 300);
}
onRender(() => requestHeat());

render();
