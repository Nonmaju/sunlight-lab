import { groundGrid, wallGrid, sunHours } from '../core/sunhours.js';
import { northVec } from '../core/setback.js';
import { instantMs, sunDirection } from '../core/sun.js';

self.onmessage = ({ data: { state } }) => {
  const t0 = performance.now();
  const { site, volumes, settings } = state;
  const points = [
    ...groundGrid(site, volumes, settings.gridSpacing),
    ...wallGrid(volumes, settings.gridSpacing, northVec(site.northAngleDeg)),
  ];
  // 점마다 같은 시각(10분 격자, 이분법 구간)의 태양 방향을 다시 계산하지 않도록 메모이즈(결과 동일, 측정상 병목은 태양 위치 계산)
  const sunCache = new Map();
  const sunAt = (m) => {
    let d = sunCache.get(m);
    if (!d) sunCache.set(m, d = sunDirection(instantMs(settings.date, m, settings.timeBasis, settings.lon), settings.lat, settings.lon, site.northAngleDeg));
    return d;
  };
  const values = [];
  for (let i = 0; i < points.length; i++) {
    values.push(sunHours(points[i].p, volumes, sunAt));
    if (i % 200 === 0) self.postMessage({ type: 'progress', done: i, total: points.length });
  }
  self.postMessage({ type: 'done', points, values, ms: performance.now() - t0 });
};
