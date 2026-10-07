import { area, pointInPolygon, selfIntersects } from './geom.js';

function checkPoly(poly, label, errors) {
  if (!Array.isArray(poly) || poly.length < 3) { errors.push(`${label}: 꼭짓점이 3개 이상 필요합니다`); return false; }
  if (Math.abs(area(poly)) < 1e-9) { errors.push(`${label}: 면적이 0입니다`); return false; }
  if (selfIntersects(poly)) { errors.push(`${label}: 변이 서로 교차합니다`); return false; }
  return true;
}

export function validate(site, volumes) {
  const errors = [], warnings = [];
  const siteOk = checkPoly(site.polygon, '대지', errors);
  for (const v of volumes) {
    const label = `볼륨 ${v.id}`;
    const ok = checkPoly(v.footprint, label, errors);
    if (!(v.h > 0)) errors.push(`${label}: 높이는 0보다 커야 합니다`);
    if (!(v.z0 >= 0)) errors.push(`${label}: 바닥 높이는 0 이상이어야 합니다`);
    if (ok && siteOk && v.role === 'mine' && !v.footprint.every((q) => pointInPolygon(q, site.polygon)))
      errors.push(`${label}: 내 건물이 대지 밖으로 나갑니다`);
  }
  return { errors, warnings };
}
