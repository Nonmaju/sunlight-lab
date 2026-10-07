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
  const sunAt = (m) =>
    sunDirection(instantMs(settings.date, m, settings.timeBasis, settings.lon), settings.lat, settings.lon, site.northAngleDeg);
  const values = [];
  for (let i = 0; i < points.length; i++) {
    values.push(sunHours(points[i].p, volumes, sunAt));
    if (i % 200 === 0) self.postMessage({ type: 'progress', done: i, total: points.length });
  }
  self.postMessage({ type: 'done', points, values, ms: performance.now() - t0 });
};
