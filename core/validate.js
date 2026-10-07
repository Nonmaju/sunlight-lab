import { area, pointInPolygon, pointOnBoundary, segCross, selfIntersects } from './geom.js';

function checkPoly(poly, label, errors) {
  if (!Array.isArray(poly) || poly.length < 3) { errors.push(`${label}: 꼭짓점이 3개 이상 필요합니다`); return false; }
  if (Math.abs(area(poly)) < 1e-9) { errors.push(`${label}: 면적이 0입니다`); return false; }
  if (selfIntersects(poly)) { errors.push(`${label}: 변이 서로 교차합니다`); return false; }
  return true;
}

// 꼭짓점이 모두 대지 안/경계 위이고 어떤 변도 대지 변을 가로지르지 않으면 포함(경계 접촉 허용).
function insideSite(fp, site) {
  if (!fp.every((q) => pointInPolygon(q, site) || pointOnBoundary(q, site))) return false;
  for (let i = 0; i < fp.length; i++)
    for (let j = 0; j < site.length; j++)
      if (segCross(fp[i], fp[(i + 1) % fp.length], site[j], site[(j + 1) % site.length])) return false;
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
    if (ok && siteOk && v.role === 'mine' && !insideSite(v.footprint, site.polygon))
      errors.push(`${label}: 내 건물이 대지 밖으로 나갑니다`);
  }
  return { errors, warnings };
}
