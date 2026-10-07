import { area, unionArea } from './geom.js';

// 연면적의 층수 환산은 임시 규칙(spec 확인 과제 4): floor(h / floorHeight), 최소 1층.
export function coverage(site, volumes, { floorHeight = 3 } = {}) {
  const mine = volumes.filter((v) => v.role === 'mine');
  const siteArea = Math.abs(area(site.polygon));
  const buildingArea = unionArea(mine.map((v) => v.footprint));
  const gfa = mine.reduce(
    (s, v) => s + Math.abs(area(v.footprint)) * Math.max(1, Math.floor(v.h / floorHeight + 1e-9)), 0);
  return { siteArea, buildingArea, gfa, coverageRatio: buildingArea / siteArea, far: gfa / siteArea };
}
