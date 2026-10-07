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

render();
