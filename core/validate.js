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

// ───────── JSON 가져오기용 스키마 검증 (문자열 숫자는 강제 변환하지 않고 거부) ─────────
const TAGS = ['인접대지', '도로·공원 등', '적용제외'];
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isPts = (a, lo, hi) => Array.isArray(a) && a.length >= lo && a.length <= hi && a.every((p) => Array.isArray(p) && p.length === 2 && fin(p[0]) && fin(p[1]));
const realDate = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
export { realDate };

export function validateState(obj) {
  const errors = [];
  const top = [];
  if (!isObj(obj) || !isObj(obj.site)) top.push('site(대지) 객체가 필요합니다');
  if (!isObj(obj) || !Array.isArray(obj.volumes)) top.push('volumes(볼륨) 배열이 필요합니다');
  if (!isObj(obj) || !isObj(obj.settings)) top.push('settings(설정) 객체가 필요합니다');
  if (top.length) return { errors: top, state: null };
  const { site, volumes, settings: st } = obj;
  if (!isPts(site.polygon, 3, 500)) errors.push('site.polygon: 꼭짓점 3~500개의 [x,y] 유한 숫자 배열이어야 합니다');
  if (!fin(site.northAngleDeg)) errors.push('site.northAngleDeg: 유한한 숫자여야 합니다');
  if (site.edges !== undefined) {
    if (!Array.isArray(site.edges)) errors.push('site.edges: 배열이어야 합니다');
    else if (Array.isArray(site.polygon) && site.edges.length !== site.polygon.length) errors.push('site.edges: 길이가 대지 꼭짓점 수와 같아야 합니다');
    else site.edges.forEach((e, i) => {
      if (!isObj(e) || !TAGS.includes(e.tag)) errors.push(`site.edges[${i}].tag: 인접대지/도로·공원 등/적용제외 중 하나여야 합니다`);
      else if (e.width !== undefined && !(fin(e.width) && e.width >= 0)) errors.push(`site.edges[${i}].width: 0 이상의 숫자여야 합니다`);
    });
  }
  if (!Array.isArray(volumes) || volumes.length > 200) errors.push('volumes: 0~200개의 배열이어야 합니다');
  else volumes.forEach((v, i) => {
    const p = `volumes[${i}]`;
    if (!isObj(v)) { errors.push(`${p}: 객체여야 합니다`); return; }
    if (!(typeof v.id === 'string' || fin(v.id))) errors.push(`${p}.id: 문자열 또는 숫자여야 합니다`);
    if (!isPts(v.footprint, 3, 500)) errors.push(`${p}.footprint: 꼭짓점 3~500개의 [x,y] 유한 숫자 배열이어야 합니다`);
    if (!(fin(v.z0) && v.z0 >= 0)) errors.push(`${p}.z0: 0 이상의 숫자여야 합니다`);
    if (!(fin(v.h) && v.h > 0)) errors.push(`${p}.h: 0보다 큰 숫자여야 합니다`);
    if (!['mine', 'neighbor'].includes(v.role)) errors.push(`${p}.role: mine 또는 neighbor여야 합니다`);
  });
  if (!realDate(st.date)) errors.push('settings.date: 실제 존재하는 YYYY-MM-DD 날짜여야 합니다');
  if (!(fin(st.timeMin) && st.timeMin >= 0 && st.timeMin <= 1440)) errors.push('settings.timeMin: 0~1440 사이 숫자여야 합니다');
  if (!['KST', '진태양시'].includes(st.timeBasis)) errors.push('settings.timeBasis: KST 또는 진태양시여야 합니다');
  if (!(fin(st.lat) && Math.abs(st.lat) <= 90)) errors.push('settings.lat: -90~90 사이 숫자여야 합니다');
  if (!(fin(st.lon) && Math.abs(st.lon) <= 180)) errors.push('settings.lon: -180~180 사이 숫자여야 합니다');
  if (!(fin(st.floorHeight) && st.floorHeight >= 2)) errors.push('settings.floorHeight: 2 이상의 숫자여야 합니다');
  if (!(fin(st.gridSpacing) && st.gridSpacing >= 0.5)) errors.push('settings.gridSpacing: 0.5 이상의 숫자여야 합니다');
  const sp = st.setbackParams;
  if (!isObj(sp) || !['lowH', 'lowD', 'ratio'].every((k) => fin(sp[k]) && sp[k] > 0)) errors.push('settings.setbackParams: lowH, lowD, ratio가 모두 0보다 큰 숫자여야 합니다');
  if (errors.length) return { errors, state: null };
  const state = JSON.parse(JSON.stringify({ site, volumes, settings: st }));
  state.volumes.forEach((v) => { v.id = String(v.id); });
  if (!state.site.edges) state.site.edges = state.site.polygon.map(() => ({ tag: '인접대지' }));
  return { errors, state };
}
