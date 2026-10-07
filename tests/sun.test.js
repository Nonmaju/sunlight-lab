import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { sunPosition, instantMs, sunDirection } from '../core/sun.js';
import { northVec } from '../core/setback.js';

const require = createRequire(import.meta.url);
const SunCalc = require('suncalc');
const LAT = 37.5665, LON = 126.978;
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

function noonScan(date, basis) {
  let best = { altitude: -90, azimuth: 0, m: 0 };
  for (let m = 11 * 60; m <= 14 * 60; m++) {
    const p = sunPosition(instantMs(date, m, basis, LON), LAT, LON);
    if (p.altitude > best.altitude) best = { ...p, m };
  }
  return best;
}

test('동지 정오 고도 = 90 - 위도 + 적위 (손계산 약 28.99°)', () => {
  const best = noonScan('2026-12-22', 'KST');
  assert.ok(Math.abs(best.altitude - 28.99) < 0.3, `altitude=${best.altitude}`);
  assert.ok(angDiff(best.azimuth, 180) < 1, `azimuth=${best.azimuth}`);
});

test('진태양시 12:00 = 태양 남중 (고도 최대, 방위 180°)', () => {
  const max = noonScan('2026-12-22', 'KST').altitude;
  const p = sunPosition(instantMs('2026-12-22', 720, '진태양시', LON), LAT, LON);
  assert.ok(Math.abs(p.altitude - max) < 0.05, `alt=${p.altitude} max=${max}`);
  assert.ok(angDiff(p.azimuth, 180) < 0.5, `az=${p.azimuth}`);
});

test('SunCalc 교차검증 (09~15시, 3개 날짜) — 허용 오차는 시작값, 어긋나면 원인 기록 후 조정', () => {
  for (const date of ['2026-03-20', '2026-06-21', '2026-12-22']) {
    for (let m = 540; m <= 900; m += 30) {
      const ms = instantMs(date, m, 'KST', LON);
      const mine = sunPosition(ms, LAT, LON);
      const sc = SunCalc.getPosition(new Date(ms), LAT, LON); // 방위: 남쪽 기준, 서쪽 양수, 라디안
      const alt = (sc.altitude * 180) / Math.PI;
      const az = (((sc.azimuth * 180) / Math.PI + 180) % 360 + 360) % 360;
      assert.ok(Math.abs(mine.altitude - alt) < 0.3, `${date} ${m}: alt ${mine.altitude} vs ${alt}`);
      assert.ok(angDiff(mine.azimuth, az) < 0.5, `${date} ${m}: az ${mine.azimuth} vs ${az}`);
    }
  }
});

test('NOAA 계산기 기준값 fixture (손으로 옮긴 값, 오차 0.15°)', () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/noaa-seoul-2026-12-22.json', import.meta.url)));
  assert.ok(fx.rows.length >= 3, 'fixture rows를 채워야 한다');
  assert.ok(fx.source && fx.retrieved, 'source/retrieved 기록 필요');
  for (const r of fx.rows) {
    const [hh, mm] = r.time.split(':').map(Number);
    const p = sunPosition(instantMs(fx.date, hh * 60 + mm, 'KST', fx.lon), fx.lat, fx.lon);
    assert.ok(Math.abs(p.altitude - r.elevation) < 0.15, `${r.time} alt ${p.altitude} vs ${r.elevation}`);
    assert.ok(angDiff(p.azimuth, r.azimuth) < 0.15, `${r.time} az ${p.azimuth} vs ${r.azimuth}`);
  }
});

test('sunDirection: northAngle 0이면 정오 태양은 -y(남쪽), 90이면 -x', () => {
  const ms = instantMs('2026-12-22', 720, '진태양시', LON);
  const a = sunDirection(ms, LAT, LON, 0);
  assert.ok(a.y < -0.5 && Math.abs(a.x) < 0.05 && a.z > 0.4);
  assert.ok(Math.abs(Math.hypot(a.x, a.y, a.z) - 1) < 1e-9);
  const b = sunDirection(ms, LAT, LON, 90);
  assert.ok(b.x < -0.5 && Math.abs(b.y) < 0.05);
});

test('sunDirection 좌표 규약: 방위 0°(정북)은 northVec(angle), 방위 180°는 그 반대 (R10)', () => {
  const unit = (d) => { const h = Math.hypot(d.x, d.y); return [d.x / h, d.y / h]; };
  for (const ang of [0, 30, -45]) {
    const n = northVec(ang);
    // 남반구(-37.57°) 동지 정오: 태양이 정북쪽, 방위 ≈ 0°
    const north = sunDirection(instantMs('2026-12-22', 720, '진태양시', LON), -LAT, LON, ang);
    assert.ok(angDiff(north.azimuth, 0) < 0.5, `az=${north.azimuth}`);
    const un = unit(north);
    assert.ok(Math.abs(un[0] - n[0]) < 0.01 && Math.abs(un[1] - n[1]) < 0.01, `ang=${ang} ${un} vs ${n}`);
    // 서울 정오: 방위 ≈ 180° → -northVec
    const south = sunDirection(instantMs('2026-12-22', 720, '진태양시', LON), LAT, LON, ang);
    const us = unit(south);
    assert.ok(Math.abs(us[0] + n[0]) < 0.01 && Math.abs(us[1] + n[1]) < 0.01, `ang=${ang} ${us} vs ${-n[0]},${-n[1]}`);
  }
});

test('NOAA fixture 잔차 = 대기굴절: 기하 고도 + Bennett 굴절 보정이 0.01° 안에서 일치', () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/noaa-seoul-2026-12-22.json', import.meta.url)));
  // Bennett: R[분] = 1 / tan((h + 7.31/(h + 4.4))°), h = 고도(°)
  const bennett = (h) => 1 / Math.tan(((h + 7.31 / (h + 4.4)) * Math.PI) / 180) / 60;
  for (const r of fx.rows) {
    const [hh, mm] = r.time.split(':').map(Number);
    const p = sunPosition(instantMs(fx.date, hh * 60 + mm, 'KST', fx.lon), fx.lat, fx.lon);
    const refracted = p.altitude + bennett(p.altitude);
    assert.ok(Math.abs(refracted - r.elevation) < 0.01, `${r.time}: ${refracted} vs ${r.elevation}`);
  }
});
