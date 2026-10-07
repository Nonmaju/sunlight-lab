# 일조·일조권 사선 검토기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대지와 건축물 매스를 입력하면 날짜·시각별 그림자, 동지 일조 히트맵, 정북 사선 위반 부위, 건폐율·용적률을 보여주는 브라우저 전용 정적 사이트를 만든다.

**Architecture:** 순수 JS 코어(`core/`: sun, geom, setback, sunhours, coverage, validate, samples)가 모든 계산을 하고 `node --test`로 검증한다. 웹 레이어(`web/`)는 입력 UI, Three.js 표시, Web Worker(히트맵 계산)만 담당하며 코어만 호출한다. 일조는 측정점→태양 방향 CPU 광선 검사, 사선은 정북 경계 변을 정북 방향으로 쓸어낸 영역과 볼륨 슬라이스의 2D 클리핑으로 계산한다.

**Tech Stack:** Node ≥ 20(`node --test`), 브라우저 ES modules(빌드 없음), Three.js(CDN import map, 버전 고정), SunCalc(devDependency, 테스트 교차검증 전용)

**Spec:** `docs/superpowers/specs/2026-10-07-sunlight-lab-design.md`

## Global Constraints

- 비용 0, GPU 가정 없음, 정적 사이트(서버 없음), 유료 API·외부 지형/건물 API 없음. 사용자가 입력한 매스만 사용.
- 빌드 스텝·프레임워크 없음. 일반 HTML/JS 모듈. 로직 테스트는 `node --test`(core만 대상).
- UI 문구는 모두 한국어. 상단 고정 문구 "참고용, 법적 효력 없음".
- 법 조문 수치는 spec 2절의 원문 인용만 사용한다(제86조① 10m / 1.5m / 높이의 1/2, 기본 파라미터이며 조례로 달라질 수 있음). 기억에서 새 수치를 만들지 않는다.
- 팀 Auto-BIM 저장소 코드 재사용 금지.
- **배포·공개는 사용자 명시 승인 후에만.** 이 플랜에는 배포 작업이 없다.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- 실행하지 않은 것은 "미확인"이라고 보고한다(특히 화면 동작, 성능).
- 좌표계: 대지 로컬 미터, x 오른쪽, y 위, z 높이. `northAngleDeg` = 정북이 +y로부터 시계방향으로 몇 도인지(0이면 정북이 +y). 진방위 β(북에서 시계방향)는 평면 방위 β + northAngleDeg 이며 벡터는 `(sin, cos)`.

## 스펙 대비 변경점 (사용자 보고 대상)

1. **`core/sun.js`는 NOAA 알고리즘을 직접 구현**한다(SunCalc 래핑 아님). SunCalc는 CommonJS/UMD라 브라우저 ES module에서 바로 쓰기 어렵고, 직접 구현하면 의존성이 줄어든다. SunCalc는 테스트의 교차검증 용도로만 쓴다. (spec 4·5·7절 문구를 Task 1에서 수정)
2. **연면적(확인 과제 4)은 임시 규칙**: 볼륨별 `floor(h / floorHeight)`층(최소 1)으로 환산, `floorHeight` 기본 3.0m, 설정 가능. UI 가정 목록에 9번으로 추가한다.
3. 사선 슬라이스 밴드는 상단 높이 기준 요구거리를 쓰므로 밴드 안에서 최대 0.25m 보수적이다(spec 5.1의 슬라이스 방식 그대로, 한계를 명시).
4. 정북 직선거리 해석, 표준시/진태양시, 서울 조례값은 spec 9절 확인 과제로 남는다. 이 플랜은 그것들을 해결하지 않는다.

## File Structure

```
package.json                     scripts: test, dev
core/geom.js                     다각형·광선·클리핑·합집합 면적 (순수)
core/sun.js                      NOAA 태양 위치, 시각 기준 변환, 태양 방향 벡터
core/setback.js                  정북 사선 판정, 허용 프로파일
core/sunhours.js                 광선 검사, 측정 격자, 일조시간(연속/누적)
core/coverage.js                 건폐율·용적률
core/validate.js                 입력 검증
core/samples.js                  샘플 2종(데이터)
tests/*.test.js                  core 단위 테스트
tests/fixtures/noaa-seoul-2026-12-22.json   NOAA 계산기 기준값(손으로 옮김)
web/index.html, style.css        페이지
web/main.js                      상태, 계산 호출, 렌더 루프
web/view3d.js                    Three.js 뷰
web/heat.worker.js               히트맵 계산 Worker
web/ui.js                        평면 편집 캔버스, 폼, 결과 패널
README.md                        사용법, 가정, 검증 현황
```

---

### Task 1: 프로젝트 골격 + 태양 위치 (`core/sun.js`)

**Files:**
- Create: `package.json`, `core/sun.js`, `tests/sun.test.js`, `tests/fixtures/noaa-seoul-2026-12-22.json`
- Modify: `.gitignore`(node_modules 확인), `docs/superpowers/specs/2026-10-07-sunlight-lab-design.md`(spec 변경점 반영)

**Interfaces:**
- Produces:
  - `solarParams(ms: number) -> { decl: number /*deg*/, eqTime: number /*min*/ }`
  - `sunPosition(ms: number, latDeg: number, lonDeg: number) -> { altitude: number /*deg, 대기굴절 미포함*/, azimuth: number /*deg, 북 기준 시계방향 0~360*/ }`
  - `instantMs(dateStr: 'YYYY-MM-DD', minutes: number, basis: 'KST'|'진태양시', lonDeg: number) -> number /*UTC ms*/`
  - `sunDirection(ms, latDeg, lonDeg, northAngleDeg) -> { x, y, z, altitude, azimuth }` (단위 벡터, 평면 좌표, 태양 쪽을 향함)

- [ ] **Step 1: 골격 파일 작성**

`package.json`:
```json
{
  "name": "sunlight-lab",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "dev": "python -m http.server 8000"
  },
  "devDependencies": {
    "suncalc": "^1.9.0"
  }
}
```
Run: `node --version` — Expected: v20 이상. 아니면 중단하고 사용자에게 보고.
Run: `npm install` 후 `cat .gitignore` — `node_modules/`가 없으면 한 줄 추가.

- [ ] **Step 2: 실패하는 테스트 작성** — `tests/sun.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { sunPosition, instantMs, sunDirection } from '../core/sun.js';

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
```

- [ ] **Step 3: NOAA fixture 채우기 (수동, 값은 반드시 직접 읽어서 기록)**

내장 브라우저로 https://gml.noaa.gov/grad/solcalc/ 를 열어 위도 37.5665, 경도 126.978, 시간대 UTC+9, 날짜 2026-12-22 로 설정하고 09:00, 12:00, 15:00 의 "Solar Elevation (deg)"와 "Azimuth (deg)"를 읽는다. 굴절 보정값과 미보정값이 따로 있으면 **미보정(geometric)** 값을 쓰고, 없으면 보정값과 함께 `note`에 그 사실을 적는다. 읽지 못하면 이 단계를 "미확인"으로 보고하고 Step 4~6의 fixture 테스트는 실패 상태로 둔 채 사용자에게 알린다(값을 추측해서 채우지 않는다).

`tests/fixtures/noaa-seoul-2026-12-22.json`:
```json
{
  "source": "https://gml.noaa.gov/grad/solcalc/",
  "retrieved": "<조회한 날짜>",
  "date": "2026-12-22",
  "lat": 37.5665,
  "lon": 126.978,
  "tzHours": 9,
  "note": "<굴절 보정 여부 등>",
  "rows": [
    { "time": "09:00", "elevation": 0, "azimuth": 0 },
    { "time": "12:00", "elevation": 0, "azimuth": 0 },
    { "time": "15:00", "elevation": 0, "azimuth": 0 }
  ]
}
```
(`0` 값은 읽은 실제 값으로 교체한다. 0이 남아 있으면 테스트가 실패하므로 누락이 드러난다.)

- [ ] **Step 4: 실패 확인**

Run: `node --test tests/sun.test.js`
Expected: FAIL — `Cannot find module '../core/sun.js'`

- [ ] **Step 5: 구현** — `core/sun.js`

```js
const rad = Math.PI / 180;
const deg = 180 / Math.PI;

const julianDay = (ms) => ms / 86400000 + 2440587.5;

// NOAA 태양 계산식(General Solar Position Calculations)
export function solarParams(ms) {
  const jc = (julianDay(ms) - 2451545) / 36525;
  const L0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360;
  const M = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
  const C =
    Math.sin(M * rad) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) +
    Math.sin(2 * M * rad) * (0.019993 - 0.000101 * jc) +
    Math.sin(3 * M * rad) * 0.000289;
  const omega = 125.04 - 1934.136 * jc;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * rad);
  const eps0 = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * rad);
  const decl = Math.asin(Math.sin(eps * rad) * Math.sin(lambda * rad)) * deg;
  const y = Math.tan((eps * rad) / 2) ** 2;
  const eqTime =
    4 * deg * (
      y * Math.sin(2 * L0 * rad) -
      2 * e * Math.sin(M * rad) +
      4 * e * y * Math.sin(M * rad) * Math.cos(2 * L0 * rad) -
      0.5 * y * y * Math.sin(4 * L0 * rad) -
      1.25 * e * e * Math.sin(2 * M * rad)
    );
  return { decl, eqTime };
}

export function sunPosition(ms, latDeg, lonDeg) {
  const { decl, eqTime } = solarParams(ms);
  const utcMin = ((((ms % 86400000) + 86400000) % 86400000) / 60000);
  const trueSolarMin = (((utcMin + eqTime + 4 * lonDeg) % 1440) + 1440) % 1440;
  const ha = trueSolarMin / 4 - 180;
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  const lat = latDeg * rad, d = decl * rad;
  const cosZen = clamp(Math.sin(lat) * Math.sin(d) + Math.cos(lat) * Math.cos(d) * Math.cos(ha * rad));
  const zen = Math.acos(cosZen);
  const altitude = 90 - zen * deg;
  const sinZen = Math.sin(zen);
  let azimuth = 180;
  if (sinZen > 1e-9) {
    const a = Math.acos(clamp((Math.sin(lat) * cosZen - Math.sin(d)) / (Math.cos(lat) * sinZen))) * deg;
    azimuth = ha > 0 ? (a + 180) % 360 : (540 - a) % 360;
  }
  return { altitude, azimuth };
}

// 'KST': 표준시(UTC+9) 시계 시각. '진태양시': 겉보기 태양시(남중 = 12:00).
export function instantMs(dateStr, minutes, basis, lonDeg) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  if (basis === 'KST') return utcMidnight + (minutes - 540) * 60000;
  let ms = utcMidnight + (minutes - 4 * lonDeg) * 60000;
  for (let i = 0; i < 3; i++) ms = utcMidnight + (minutes - solarParams(ms).eqTime - 4 * lonDeg) * 60000;
  return ms;
}

export function sunDirection(ms, latDeg, lonDeg, northAngleDeg) {
  const { altitude, azimuth } = sunPosition(ms, latDeg, lonDeg);
  const b = (azimuth + northAngleDeg) * rad;
  const h = Math.cos(altitude * rad);
  return { x: Math.sin(b) * h, y: Math.cos(b) * h, z: Math.sin(altitude * rad), altitude, azimuth };
}
```

- [ ] **Step 6: 통과 확인**

Run: `node --test tests/sun.test.js`
Expected: PASS (fixture 값을 채웠다면 4개 모두). SunCalc 교차검증이 허용 오차를 넘으면 어느 쪽이 맞는지 NOAA fixture 값으로 판정하고, 오차 기준을 바꿀 때는 이유를 테스트 주석에 적는다.

- [ ] **Step 7: spec 수정 및 커밋**

spec 4절 "의존 라이브러리는 SunCalc, Three.js 두 개"를 "런타임 의존은 Three.js 하나(SunCalc는 테스트 교차검증용 devDependency)"로, 4절 `sun` 행의 "(SunCalc 래핑, 방위 규약 변환)"을 "(NOAA 알고리즘 직접 구현, 방위 규약 변환)"으로, 7절의 "SunCalc 결과를 (a) 별도로 직접 구현한 NOAA 알고리즘"을 "직접 구현한 NOAA 알고리즘 결과를 (a) SunCalc"로 고친다.
```bash
git add package.json package-lock.json .gitignore core/sun.js tests/sun.test.js tests/fixtures docs/superpowers/specs
git commit -m "feat(core): NOAA sun position with SunCalc cross-check and fixture

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 기하 라이브러리 (`core/geom.js`)

**Files:**
- Create: `core/geom.js`, `tests/geom.test.js`

**Interfaces:**
- Produces:
  - `area(poly) -> number` (부호 있는 면적, CCW 양수), `ccw(poly) -> poly`
  - `pointInPolygon(p: [x,y], poly) -> boolean`
  - `rayHit(p, d, a, b, closed=false) -> number|null` (p + s·d 가 선분 ab와 만나는 s. `closed=false`면 반개구간 [0,1)로 꼭짓점 이중 계산 방지, `true`면 닫힌 구간에 1e-9 허용오차)
  - `segCross(a, b, c, d) -> boolean` (진교차만)
  - `clipConvex(subject, clip) -> poly` (Sutherland–Hodgman, clip은 볼록)
  - `unionArea(polys) -> number` (정확, 슬래브 방식)
  - `selfIntersects(poly) -> boolean`

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/geom.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { area, ccw, pointInPolygon, rayHit, segCross, clipConvex, unionArea, selfIntersects } from '../core/geom.js';

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('area: CCW 양수, CW 음수, ccw()는 CCW로 정렬', () => {
  near(area(rect(0, 0, 10, 5)), 50);
  near(area([...rect(0, 0, 10, 5)].reverse()), -50);
  assert.ok(area(ccw([...rect(0, 0, 10, 5)].reverse())) > 0);
});

test('pointInPolygon: 오목 L자', () => {
  const L = [[0, 0], [20, 0], [20, 15], [10, 15], [10, 30], [0, 30]];
  assert.equal(pointInPolygon([5, 25], L), true);
  assert.equal(pointInPolygon([15, 25], L), false);
  assert.equal(pointInPolygon([15, 10], L), true);
});

test('rayHit: 정북(+y) 광선이 y=30 변을 s=26에서 만남, 범위 밖이면 null', () => {
  near(rayHit([5, 4], [0, 1], [20, 30], [0, 30]), 26);
  assert.equal(rayHit([25, 4], [0, 1], [20, 30], [0, 30]), null);
  assert.equal(rayHit([5, 4], [1, 0], [20, 30], [0, 30]), null); // 평행
});

test('rayHit: 반개구간이라 꼭짓점을 지나는 광선은 정확히 한 번만 잡힌다', () => {
  const sq = rect(0, 0, 10, 10);
  let hits = 0;
  for (let i = 0; i < 4; i++) if (rayHit([5, -5], [0.5, 0.5 * 2], sq[i], sq[(i + 1) % 4]) !== null) hits++;
  // 대각선으로 (10,5)쪽이 아닌 꼭짓점 (10,10)? 방향 (1,2)·s: s=5 → (10,5)... 꼭짓점 직격 케이스는 아래 전용 테스트
  assert.ok(hits % 2 === 0);
  let v = 0;
  for (let i = 0; i < 4; i++) if (rayHit([-5, -5], [1, 1], sq[i], sq[(i + 1) % 4]) !== null) v++;
  assert.equal(v, 2); // (0,0)과 (10,10)을 한 번씩 → 변 4개 중 정확히 2번
});

test('segCross: 진교차만', () => {
  assert.equal(segCross([0, 0], [10, 10], [0, 10], [10, 0]), true);
  assert.equal(segCross([0, 0], [10, 0], [10, 0], [20, 5]), false);
});

test('clipConvex: 사각형과 평행사변형 교차', () => {
  const quad = [[0, 24], [20, 24], [20, 30], [0, 30]];
  const out = clipConvex(rect(3, 4, 17, 26), quad);
  near(Math.abs(area(out)), 14 * 2);
});

test('clipConvex: 완전히 밖이면 빈 배열', () => {
  assert.equal(clipConvex(rect(0, 0, 1, 1), rect(5, 5, 6, 6)).length, 0);
});

test('unionArea: 겹치는 두 정사각형 = 175, 떨어진 두 개 = 합, 동일 도형 = 단일', () => {
  near(unionArea([rect(0, 0, 10, 10), rect(5, 5, 15, 15)]), 175);
  near(unionArea([rect(0, 0, 10, 10), rect(20, 0, 30, 10)]), 200);
  near(unionArea([rect(0, 0, 10, 10), rect(0, 0, 10, 10)]), 100);
});

test('unionArea: 삼각형(경계 교차) 포함', () => {
  const tri = [[0, 0], [10, 0], [0, 10]];
  near(unionArea([tri, rect(0, 0, 5, 5)]), 50); // 사각형은 삼각형에 완전히 포함
  near(unionArea([tri, rect(0, 0, 10, 10)]), 100);
});

test('selfIntersects: 나비넥타이 true, 정상 false', () => {
  assert.equal(selfIntersects([[0, 0], [10, 10], [10, 0], [0, 10]]), true);
  assert.equal(selfIntersects(rect(0, 0, 10, 10)), false);
});
```
(2번째 `rayHit` 테스트의 첫 부분은 단순 짝수성 점검이다. 핵심은 마지막 `v === 2` 단언이다.)

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/geom.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: 구현** — `core/geom.js`

```js
export const area = (poly) => {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
};

export const ccw = (poly) => (area(poly) >= 0 ? poly : [...poly].reverse());

export function pointInPolygon([px, py], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// p + s*d 가 선분 a-b 와 만나는 s (없으면 null). s는 음수일 수 있으니 호출자가 거른다.
export function rayHit(p, d, a, b, closed = false) {
  const ex = b[0] - a[0], ey = b[1] - a[1];
  const den = d[0] * ey - d[1] * ex;
  if (Math.abs(den) < 1e-12) return null;
  const apx = a[0] - p[0], apy = a[1] - p[1];
  const s = (apx * ey - apy * ex) / den;
  const u = (apx * d[1] - apy * d[0]) / den;
  const ok = closed ? u >= -1e-9 && u <= 1 + 1e-9 : u >= 0 && u < 1;
  return ok ? s : null;
}

const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
export const segCross = (a, b, c, d) =>
  orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0;

function lineInter(p, q, a, b) {
  const dx = q[0] - p[0], dy = q[1] - p[1], ex = b[0] - a[0], ey = b[1] - a[1];
  const t = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / (dx * ey - dy * ex);
  return [p[0] + t * dx, p[1] + t * dy];
}

// subject는 오목해도 됨(면적은 정확, 분리된 조각은 폭 0 다리로 이어질 수 있음). clip은 볼록.
export function clipConvex(subject, clip) {
  const c = ccw(clip);
  let out = subject;
  for (let i = 0; i < c.length && out.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length];
    const inside = (p) => orient(a, b, p) >= -1e-12;
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j], prev = input[(j + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(lineInter(prev, cur, a, b));
        out.push(cur);
      } else if (inside(prev)) out.push(lineInter(prev, cur, a, b));
    }
  }
  return out;
}

function crossLength(polys, x) {
  const iv = [];
  for (const poly of polys) {
    const ys = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if ((a[0] <= x) !== (b[0] <= x)) ys.push(a[1] + ((x - a[0]) * (b[1] - a[1])) / (b[0] - a[0]));
    }
    ys.sort((p, q) => p - q);
    for (let k = 0; k + 1 < ys.length; k += 2) iv.push([ys[k], ys[k + 1]]);
  }
  iv.sort((p, q) => p[0] - q[0]);
  let total = 0, end = -Infinity;
  for (const [s, e] of iv) {
    if (e <= end) continue;
    total += e - Math.max(s, end);
    end = e;
  }
  return total;
}

// 슬래브 방식: 꼭짓점·교차점의 x로 나눈 구간 안에서는 단면 길이가 x에 대해 선형이므로 중점 값 × 폭이 정확하다.
export function unionArea(polys) {
  const xs = new Set();
  const edges = [];
  for (const p of polys) {
    p.forEach((a, i) => { xs.add(a[0]); edges.push([a, p[(i + 1) % p.length]]); });
  }
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const [a, b] = edges[i], [c, d] = edges[j];
      if (segCross(a, b, c, d)) xs.add(lineInter(a, b, c, d)[0]);
    }
  }
  const sorted = [...xs].sort((p, q) => p - q);
  let total = 0;
  for (let i = 0; i + 1 < sorted.length; i++) {
    const w = sorted[i + 1] - sorted[i];
    if (w < 1e-12) continue;
    total += crossLength(polys, sorted[i] + w / 2) * w;
  }
  return total;
}

export function selfIntersects(poly) {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segCross(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return true;
    }
  }
  return false;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/geom.test.js`
Expected: PASS (10개). `rayHit` 꼭짓점 테스트가 실패하면 반개구간 규칙(`u >= 0 && u < 1`)부터 점검한다.

- [ ] **Step 5: 커밋**
```bash
git add core/geom.js tests/geom.test.js
git commit -m "feat(core): polygon, ray, clip and union-area primitives

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 정북 사선 판정 (`core/setback.js`)

**Files:**
- Create: `core/setback.js`, `tests/setback.test.js`

**Interfaces:**
- Consumes: `area, pointInPolygon, clipConvex, rayHit` from `core/geom.js`
- Produces:
  - `DEFAULT_PARAMS = { lowH: 10, lowD: 1.5, ratio: 0.5 }`
  - `requiredDistance(z, params?) -> number`
  - `allowedHeight(L, params?) -> number` (정북 거리 L에서 허용되는 최대 높이)
  - `northVec(northAngleDeg) -> [x, y]`
  - `activeEdges(site) -> [{ index, a, b }]` (북향 변 중 `적용제외`가 아닌 것, `도로·공원 등` 태그는 폭만큼 정북으로 이동한 좌표)
  - `zCuts(z0, top, params?) -> number[]` (오름차순 경계 높이)
  - `checkSetback(site, volumes, params?) -> [{ id, violates, maxExcess, pieces: [{ poly, z0, z1, edge }] }]`
  - `profile(params?, Lmax?) -> [[L, z], …]` (뷰의 허용 사선 면용)
- site 형식: `{ polygon, northAngleDeg, edges: [{ tag: '인접대지'|'도로·공원 등'|'적용제외', width? }] }` (`edges`는 비어 있어도 됨 → 모두 `인접대지`)

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/setback.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PARAMS as P, requiredDistance, allowedHeight, northVec, activeEdges, zCuts, checkSetback } from '../core/setback.js';
import { pointInPolygon, rayHit } from '../core/geom.js';

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const SITE = (over = {}) => ({ polygon: rect(0, 0, 20, 30), northAngleDeg: 0, edges: [], ...over });
const vol = (footprint, h, z0 = 0) => ({ id: 'v', footprint, z0, h, role: 'mine' });
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('requiredDistance / allowedHeight (spec 2절 수치, 파라미터화)', () => {
  assert.equal(requiredDistance(10), 1.5);
  assert.equal(requiredDistance(12), 6);
  assert.equal(allowedHeight(1, P), 0);
  assert.equal(allowedHeight(4, P), 10);
  assert.equal(allowedHeight(8, P), 16);
  assert.equal(requiredDistance(12, { lowH: 9, lowD: 2, ratio: 0.5 }), 6); // 파라미터 변경 가능
});

test('zCuts: 10m 경계와 0.5m 간격, 상단 포함', () => {
  assert.deepEqual(zCuts(0, 12), [0, 10, 10.5, 11, 11.5, 12]);
  assert.deepEqual(zCuts(0, 9), [0, 9]);
  assert.deepEqual(zCuts(9, 15).slice(0, 3), [9, 10, 10.5]);
});

test('정북 4m 이격의 12m 박스: 위반, 최대 초과 2m (손계산: 허용 10m)', () => {
  const [r] = checkSetback(SITE(), [vol(rect(3, 4, 17, 26), 12)]);
  assert.equal(r.violates, true);
  near(r.maxExcess, 2);
});

test('높이 정확히 10m, 정북 2m: 합격 / 10.5m: 위반 (10m 단차)', () => {
  assert.equal(checkSetback(SITE(), [vol(rect(3, 4, 17, 28), 10)])[0].violates, false);
  assert.equal(checkSetback(SITE(), [vol(rect(3, 4, 17, 28), 10.5)])[0].violates, true);
});

test('높이 15m: 정북 22.5m 선까지 허용 — y=22는 합격, y=23은 위반', () => {
  assert.equal(checkSetback(SITE(), [vol(rect(3, 4, 17, 22), 15)])[0].violates, false);
  assert.equal(checkSetback(SITE(), [vol(rect(3, 4, 17, 23), 15)])[0].violates, true);
});

test('도로 변(폭 6m) 태그: 경계가 정북으로 6m 이동 → 같은 박스가 합격', () => {
  const edges = [{}, {}, { tag: '도로·공원 등', width: 6 }, {}];
  assert.equal(checkSetback(SITE({ edges }), [vol(rect(3, 4, 17, 26), 12)])[0].violates, false);
});

test('적용제외 태그: 정북 인접 대지가 주거지역이 아님 → 판정 안 함', () => {
  const edges = [{}, {}, { tag: '적용제외' }, {}];
  assert.equal(checkSetback(SITE({ edges }), [vol(rect(3, 4, 17, 26), 21)])[0].violates, false);
});

test('L자 대지: 정북 변이 바로 위에 있는 박스만 위반 (손계산)', () => {
  const L = [[0, 0], [20, 0], [20, 15], [10, 15], [10, 30], [0, 30]];
  const site = SITE({ polygon: L });
  assert.equal(checkSetback(site, [vol(rect(12, 8, 18, 13), 12)])[0].violates, true);  // L=2 < 6
  assert.equal(checkSetback(site, [vol(rect(2, 8, 8, 13), 12)])[0].violates, false);   // 위는 y=30 (L=17)
});

test('속성 테스트: 판정 영역 = 정북 광선 정의 (북 0°, 30°, -45° 회전)', () => {
  for (const ang of [0, 30, -45]) {
    const site = SITE({ northAngleDeg: ang });
    const fp = rect(3, 4, 17, 26);
    const [r] = checkSetback(site, [vol(fp, 21)]);
    const n = northVec(ang);
    const edges = activeEdges(site);
    const cuts = zCuts(0, 21);
    let checked = 0;
    for (let x = 3.05; x < 17; x += 0.7) {
      for (let y = 4.05; y < 26; y += 0.7) {
        for (let k = 1; k < cuts.length; k++) {
          const zb = cuts[k], d = requiredDistance(zb);
          const ss = edges.map((e) => rayHit([x, y], n, e.a, e.b, true)).filter((s) => s !== null && s >= 0);
          if (ss.some((s) => Math.abs(s - d) < 1e-6)) continue; // 경계 위 점은 제외
          const expected = ss.some((s) => s < d);
          const actual = r.pieces.some((pc) => pc.z1 === zb && pointInPolygon([x, y], pc.poly));
          assert.equal(actual, expected, `ang=${ang} (${x},${y}) z=${zb}`);
          checked++;
        }
      }
    }
    assert.ok(checked > 500);
  }
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/setback.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: 구현** — `core/setback.js`

```js
import { area, clipConvex, rayHit } from './geom.js';

// 시행령 제86조① 기본값(건축조례로 정하는 범위의 하한). 조례에 따라 달라질 수 있어 상수가 아니라 파라미터.
export const DEFAULT_PARAMS = { lowH: 10, lowD: 1.5, ratio: 0.5 };

export const requiredDistance = (z, p = DEFAULT_PARAMS) => (z <= p.lowH ? p.lowD : z * p.ratio);

export function allowedHeight(L, p = DEFAULT_PARAMS) {
  if (L < p.lowD) return 0;
  if (L < p.lowH * p.ratio) return p.lowH;
  return L / p.ratio;
}

export const northVec = (deg) => [Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180)];

export function activeEdges(site) {
  const poly = site.polygon, n = northVec(site.northAngleDeg);
  const sgn = area(poly) >= 0 ? 1 : -1;
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const e = site.edges?.[i] ?? {};
    const tag = e.tag ?? '인접대지';
    if (tag === '적용제외') continue;
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    const outward = [(sgn * dy) / len, (-sgn * dx) / len];
    if (outward[0] * n[0] + outward[1] * n[1] <= 1e-6) continue; // 북향 변만
    const w = tag === '도로·공원 등' ? e.width ?? 0 : 0;
    out.push({
      index: i,
      a: [a[0] + n[0] * w, a[1] + n[1] * w],
      b: [b[0] + n[0] * w, b[1] + n[1] * w],
    });
  }
  return out;
}

export function zCuts(z0, top, p = DEFAULT_PARAMS) {
  const cuts = [z0];
  if (z0 < p.lowH && p.lowH < top) cuts.push(p.lowH);
  for (let k = 1; p.lowH + k * 0.5 < top - 1e-9; k++) {
    const z = p.lowH + k * 0.5;
    if (z > z0 + 1e-9) cuts.push(z);
  }
  cuts.push(top);
  return cuts.filter((z, i) => i === 0 || z > cuts[i - 1] + 1e-9);
}

// ponytail: 밴드 상단 높이의 요구거리를 밴드 전체에 적용(최대 0.25m 보수적), 서로 다른 변의 쓸어낸 영역은 합집합이라
// 가까운 변이 적용제외인데 먼 변이 걸리는 드문 경우 과다 표시(보수적). 정밀화가 필요하면 first-crossing 변만 사용.
export function checkSetback(site, volumes, p = DEFAULT_PARAMS) {
  const n = northVec(site.northAngleDeg), edges = activeEdges(site);
  return volumes.map((v) => {
    const cuts = zCuts(v.z0, v.z0 + v.h, p);
    const pieces = [];
    for (let k = 0; k + 1 < cuts.length; k++) {
      const za = cuts[k], zb = cuts[k + 1], d = requiredDistance(zb, p);
      for (const e of edges) {
        const quad = [e.a, e.b, [e.b[0] - n[0] * d, e.b[1] - n[1] * d], [e.a[0] - n[0] * d, e.a[1] - n[1] * d]];
        const poly = clipConvex(v.footprint, quad);
        if (poly.length >= 3 && Math.abs(area(poly)) > 1e-6) pieces.push({ poly, z0: za, z1: zb, edge: e.index });
      }
    }
    let maxExcess = 0;
    for (const pc of pieces) {
      const e = edges.find((x) => x.index === pc.edge);
      let minL = Infinity;
      for (const q of pc.poly) {
        const s = rayHit(q, n, e.a, e.b, true);
        if (s !== null && s >= -1e-9) minL = Math.min(minL, Math.max(0, s));
      }
      if (minL < Infinity) maxExcess = Math.max(maxExcess, pc.z1 - allowedHeight(minL, p));
    }
    return { id: v.id, violates: pieces.length > 0, maxExcess, pieces };
  });
}

// 허용 사선 면의 단면: 정북 거리 L → 허용 높이 z (뷰에서 반투명 면으로 그림)
export function profile(p = DEFAULT_PARAMS, Lmax = 14) {
  return [[p.lowD, 0], [p.lowD, p.lowH], [p.lowH * p.ratio, p.lowH], [Lmax, Lmax / p.ratio]];
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/setback.test.js`
Expected: PASS (9개). 속성 테스트가 실패하면 실패 메시지의 `(x,y) z=` 점이 경계 근처인지 먼저 확인하고, 경계가 아니면 `activeEdges`의 북향 판정과 `quad` 방향을 점검한다.

- [ ] **Step 5: 커밋**
```bash
git add core/setback.js tests/setback.test.js
git commit -m "feat(core): north-side setback check via swept-edge clipping

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 일조시간 (`core/sunhours.js`)

**Files:**
- Create: `core/sunhours.js`, `tests/sunhours.test.js`

**Interfaces:**
- Consumes: `pointInPolygon, rayHit, ccw` from `core/geom.js`; `sunDirection, instantMs` from `core/sun.js` (테스트에서)
- Produces:
  - `isLit(p: [x,y,z], sunDir: {x,y,z}, volumes) -> boolean`
  - `groundGrid(site, volumes, spacing, margin=15) -> [{ p: [x,y,z], kind: 'ground' }]` (볼륨 바닥 안 점 제외)
  - `wallGrid(volumes, spacing, north: [x,y]) -> [{ p, kind: 'wall' }]` (`role==='neighbor'` 볼륨의 북향 아닌 외벽, 벽면에서 0.02m 띄움)
  - `sunHours(p, volumes, sunAt: (minutes)=>sunDir, opts?) -> { maxContinuousMin, totalMin }` (`opts = { startMin=540, endMin=900, stepMin=10 }`)
- 볼륨 형식: `{ id, footprint, z0, h, role }`

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/sunhours.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { isLit, groundGrid, wallGrid, sunHours } from '../core/sunhours.js';
import { sunPosition, sunDirection, instantMs } from '../core/sun.js';
import { pointInPolygon } from '../core/geom.js';

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const LAT = 37.5665, LON = 126.978;
const south45 = { x: 0, y: -Math.SQRT1_2, z: Math.SQRT1_2 }; // 고도 45°, 정남

test('isLit: 벽(높이 10) 북쪽 점은 거리에 따라 그늘/양지 (고도 45° → 그림자 길이 10)', () => {
  const wall = [{ id: 'w', footprint: rect(-1000, 0, 1000, 1), z0: 0, h: 10, role: 'mine' }];
  assert.equal(isLit([0, 6, 0.05], south45, wall), false); // 벽 북면에서 5m → 그늘
  assert.equal(isLit([0, 12, 0.05], south45, wall), true); // 벽 북면에서 11m → 양지
  assert.equal(isLit([0, -3, 0.05], south45, wall), true); // 벽 남쪽은 양지
});

test('isLit: 태양이 지평선 아래면 false, 건물 안 점은 그늘', () => {
  assert.equal(isLit([0, 0, 1], { x: 0, y: -1, z: -0.1 }, []), false);
  const b = [{ id: 'b', footprint: rect(0, 0, 10, 10), z0: 0, h: 5, role: 'mine' }];
  assert.equal(isLit([5, 5, 0.05], south45, b), false);
});

test('isLit: 광선이 볼륨 위로 지나가면 양지 (낮은 상자, 높은 태양)', () => {
  const low = [{ id: 'l', footprint: rect(-5, 0, 5, 2), z0: 0, h: 1, role: 'mine' }];
  const high = { x: 0, y: -0.2, z: Math.sqrt(1 - 0.04) };
  assert.equal(isLit([0, 4, 0.05], high, low), true);
});

test('groundGrid: 볼륨 바닥 위 점 제외, 모든 점 z>0', () => {
  const site = { polygon: rect(0, 0, 20, 30), northAngleDeg: 0, edges: [] };
  const vols = [{ id: 'a', footprint: rect(5, 5, 15, 15), z0: 0, h: 9, role: 'mine' }];
  const g = groundGrid(site, vols, 2, 5);
  assert.ok(g.length > 100);
  assert.ok(g.every((q) => !pointInPolygon([q.p[0], q.p[1]], vols[0].footprint) && q.p[2] > 0));
});

test('wallGrid: 10×10×6 이웃 박스, 간격 2 → 북향 제외 3면 × (5×3) = 45점, 모두 박스 밖', () => {
  const fp = rect(0, 0, 10, 10);
  const w = wallGrid([{ id: 'n', footprint: fp, z0: 0, h: 6, role: 'neighbor' }], 2, [0, 1]);
  assert.equal(w.length, 45);
  assert.ok(w.every((q) => !pointInPolygon([q.p[0], q.p[1]], fp)));
  assert.equal(wallGrid([{ id: 'm', footprint: fp, z0: 0, h: 6, role: 'mine' }], 2, [0, 1]).length, 0);
});

test('sunHours: 긴 벽 북쪽 점의 연속/누적 시간 = 1초 단위 전수 스캔(손 닫힌형식) ±0.1분', () => {
  // 무한 벽 가정: 점은 0.05 + D·tan(alt)/|cos(az-180°)| >= H 일 때만 양지 (벽 두께 1m는 그림자 판정에 영향 없음)
  const H = 10, D = 20;
  const wall = [{ id: 'w', footprint: rect(-1000, 0, 1000, 1), z0: 0, h: H, role: 'mine' }];
  const p = [0, 1 + D, 0.05];
  const sunAt = (m) => sunDirection(instantMs('2026-12-22', m, 'KST', LON), LAT, LON, 0);
  const lit = (m) => {
    const { altitude, azimuth } = sunPosition(instantMs('2026-12-22', m, 'KST', LON), LAT, LON);
    if (altitude <= 0) return false;
    const c = Math.abs(Math.cos(((azimuth - 180) * Math.PI) / 180));
    return 0.05 + (D * Math.tan((altitude * Math.PI) / 180)) / c >= H;
  };
  let total = 0, run = 0, best = 0;
  for (let t = 540; t < 900; t += 1 / 60) {
    if (lit(t)) { total += 1 / 60; run += 1 / 60; best = Math.max(best, run); } else run = 0;
  }
  const r = sunHours(p, wall, sunAt);
  assert.ok(total > 30, `fixture가 의미 있으려면 양지 구간이 있어야 함: ${total}`);
  assert.ok(Math.abs(r.totalMin - total) < 0.1, `total ${r.totalMin} vs ${total}`);
  assert.ok(Math.abs(r.maxContinuousMin - best) < 0.1, `cont ${r.maxContinuousMin} vs ${best}`);
});

test('sunHours: 가리는 것이 없으면 09~15시 전체 360분', () => {
  const sunAt = (m) => sunDirection(instantMs('2026-12-22', m, 'KST', LON), LAT, LON, 0);
  const r = sunHours([0, 0, 1], [], sunAt);
  assert.ok(Math.abs(r.totalMin - 360) < 1e-6 && Math.abs(r.maxContinuousMin - 360) < 1e-6);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/sunhours.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: 구현** — `core/sunhours.js`

```js
import { ccw, pointInPolygon, rayHit } from './geom.js';

export function isLit(p, sunDir, volumes) {
  if (sunDir.z <= 0) return false;
  const h = Math.hypot(sunDir.x, sunDir.y);
  const p2 = [p[0], p[1]];
  if (h < 1e-9) {
    return !volumes.some((v) => pointInPolygon(p2, v.footprint) && v.z0 + v.h > p[2]);
  }
  const u = [sunDir.x / h, sunDir.y / h], tan = sunDir.z / h;
  for (const v of volumes) {
    const top = v.z0 + v.h;
    if (p[2] >= top - 1e-9) continue;
    const ss = [];
    const f = v.footprint;
    for (let i = 0; i < f.length; i++) {
      const s = rayHit(p2, u, f[i], f[(i + 1) % f.length]);
      if (s !== null && s > 1e-9) ss.push(s);
    }
    ss.sort((a, b) => a - b);
    const bounds = pointInPolygon(p2, f) ? [0, ...ss] : ss;
    for (let i = 0; i + 1 < bounds.length; i += 2) {
      const zA = p[2] + bounds[i] * tan, zB = p[2] + bounds[i + 1] * tan;
      if (zB > v.z0 + 1e-9 && zA < top - 1e-9) return false;
    }
  }
  return true;
}

export function groundGrid(site, volumes, spacing, margin = 15) {
  const xs = site.polygon.map((q) => q[0]), ys = site.polygon.map((q) => q[1]);
  const x0 = Math.min(...xs) - margin, y0 = Math.min(...ys) - margin;
  const nx = Math.floor((Math.max(...xs) + margin - x0) / spacing) + 1;
  const ny = Math.floor((Math.max(...ys) + margin - y0) / spacing) + 1;
  const pts = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const x = x0 + i * spacing, y = y0 + j * spacing;
      if (volumes.some((v) => pointInPolygon([x, y], v.footprint))) continue;
      pts.push({ p: [x, y, 0.05], kind: 'ground' });
    }
  }
  return pts;
}

export function wallGrid(volumes, spacing, north) {
  const pts = [];
  for (const v of volumes.filter((q) => q.role === 'neighbor')) {
    const poly = ccw(v.footprint);
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length];
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      const nx = dy / len, ny = -dx / len;
      if (nx * north[0] + ny * north[1] > 0.5) return; // 북향 벽은 일조 없음 → 제외
      const nu = Math.max(1, Math.round(len / spacing)), nv = Math.max(1, Math.round(v.h / spacing));
      for (let iu = 0; iu < nu; iu++) {
        for (let iv = 0; iv < nv; iv++) {
          const t = (iu + 0.5) / nu, z = v.z0 + ((iv + 0.5) * v.h) / nv;
          pts.push({ p: [a[0] + dx * t + nx * 0.02, a[1] + dy * t + ny * 0.02, z], kind: 'wall' });
        }
      }
    });
  }
  return pts;
}

// 10분 샘플링 후 일조↔그늘 전이를 이분법으로 약 0.15초 정밀도까지 보정(샘플 양자화 오차 제거).
// ponytail: 샘플 사이(10분 미만)에 완전히 끼어든 그림자는 놓친다. 필요하면 stepMin을 줄인다.
export function sunHours(p, volumes, sunAt, { startMin = 540, endMin = 900, stepMin = 10 } = {}) {
  const lit = (m) => isLit(p, sunAt(m), volumes);
  const bisect = (a, b, litAtA) => {
    for (let k = 0; k < 12; k++) {
      const mid = (a + b) / 2;
      if (lit(mid) === litAtA) a = mid; else b = mid;
    }
    return (a + b) / 2;
  };
  const n = Math.round((endMin - startMin) / stepMin);
  const ms = [], on = [];
  for (let i = 0; i <= n; i++) { ms.push(startMin + i * stepMin); on.push(lit(ms[i])); }
  const runs = [];
  let t0 = null;
  for (let i = 0; i <= n; i++) {
    if (on[i] && t0 === null) t0 = i === 0 ? ms[0] : bisect(ms[i - 1], ms[i], false);
    if (!on[i] && t0 !== null) { runs.push([t0, bisect(ms[i - 1], ms[i], true)]); t0 = null; }
  }
  if (t0 !== null) runs.push([t0, ms[n]]);
  return {
    maxContinuousMin: runs.reduce((m, [a, b]) => Math.max(m, b - a), 0),
    totalMin: runs.reduce((s, [a, b]) => s + (b - a), 0),
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/sunhours.test.js`
Expected: PASS (7개). 긴 벽 테스트의 `total > 30` 단언이 실패하면 H/D를 조정해 양지 구간이 생기게 한다(예: D=25).

- [ ] **Step 5: 커밋**
```bash
git add core/sunhours.js tests/sunhours.test.js
git commit -m "feat(core): ray-cast sunlight hours with bisection-refined transitions

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 건폐율·용적률, 입력 검증 (`core/coverage.js`, `core/validate.js`)

**Files:**
- Create: `core/coverage.js`, `core/validate.js`, `tests/coverage.test.js`, `tests/validate.test.js`

**Interfaces:**
- Consumes: `area, unionArea, selfIntersects, pointInPolygon` from `core/geom.js`
- Produces:
  - `coverage(site, volumes, { floorHeight=3 }?) -> { siteArea, buildingArea, gfa, coverageRatio, far }` (`role==='mine'` 볼륨만, 건축면적 = 바닥 다각형 합집합, 연면적 = Σ 면적 × max(1, floor(h/floorHeight)))
  - `validate(site, volumes) -> { errors: string[], warnings: string[] }` (오류가 있으면 계산하지 않는다)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/coverage.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { coverage } from '../core/coverage.js';

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const SITE = { polygon: rect(0, 0, 20, 30), northAngleDeg: 0, edges: [] };
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('단일 볼륨: 14×22, 높이 15 → 5층(floorHeight 3), 건폐율 308/600', () => {
  const c = coverage(SITE, [{ id: 'a', footprint: rect(3, 4, 17, 26), z0: 0, h: 15, role: 'mine' }]);
  near(c.siteArea, 600); near(c.buildingArea, 308); near(c.gfa, 308 * 5);
  near(c.coverageRatio, 308 / 600); near(c.far, (308 * 5) / 600);
});

test('겹치는 볼륨: 건축면적은 합집합, 연면적은 볼륨별 합', () => {
  const c = coverage(SITE, [
    { id: 'a', footprint: rect(0, 0, 10, 10), z0: 0, h: 6, role: 'mine' },
    { id: 'b', footprint: rect(5, 5, 15, 15), z0: 6, h: 6, role: 'mine' },
  ]);
  near(c.buildingArea, 175); near(c.gfa, 100 * 2 + 100 * 2);
});

test('neighbor 볼륨은 제외, floorHeight 변경 반영', () => {
  const vols = [
    { id: 'a', footprint: rect(0, 0, 10, 10), z0: 0, h: 8, role: 'mine' },
    { id: 'n', footprint: rect(0, 0, 10, 10), z0: 0, h: 80, role: 'neighbor' },
  ];
  near(coverage(SITE, vols, { floorHeight: 4 }).gfa, 200);
});
```

`tests/validate.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../core/validate.js';

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const SITE = { polygon: rect(0, 0, 20, 30), northAngleDeg: 0, edges: [] };
const v = (over) => ({ id: 'a', footprint: rect(3, 4, 17, 26), z0: 0, h: 10, role: 'mine', ...over });

test('정상 입력은 오류 없음', () => assert.deepEqual(validate(SITE, [v()]).errors, []));
test('꼭짓점 3개 미만', () => assert.ok(validate({ ...SITE, polygon: [[0, 0], [1, 1]] }, []).errors.length > 0));
test('자기교차 대지', () => assert.ok(validate({ ...SITE, polygon: [[0, 0], [10, 10], [10, 0], [0, 10]] }, []).errors.length > 0));
test('높이 0 이하', () => assert.ok(validate(SITE, [v({ h: 0 })]).errors.length > 0));
test('z0 음수', () => assert.ok(validate(SITE, [v({ z0: -1 })]).errors.length > 0));
test('내 건물이 대지 밖이면 오류, 이웃 건물은 대지 밖이어도 정상', () => {
  assert.ok(validate(SITE, [v({ footprint: rect(15, 4, 25, 26) })]).errors.length > 0);
  assert.deepEqual(validate(SITE, [v({ role: 'neighbor', footprint: rect(2, 33, 18, 43) })]).errors, []);
});
test('자기교차 볼륨', () => assert.ok(validate(SITE, [v({ footprint: [[3, 4], [10, 10], [10, 4], [3, 10]] })]).errors.length > 0));
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/coverage.test.js tests/validate.test.js`
Expected: FAIL — modules not found

- [ ] **Step 3: 구현**

`core/coverage.js`:
```js
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
```

`core/validate.js`:
```js
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
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/coverage.test.js tests/validate.test.js`
Expected: PASS (3 + 7)

- [ ] **Step 5: 커밋**
```bash
git add core/coverage.js core/validate.js tests/coverage.test.js tests/validate.test.js
git commit -m "feat(core): coverage/FAR calculation and input validation

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 샘플 시나리오 (`core/samples.js`)

**Files:**
- Create: `core/samples.js`, `tests/samples.test.js`

**Interfaces:**
- Consumes: `checkSetback`, `validate`, `coverage`
- Produces: `SAMPLES: { violation: State, compliant: State }`, `State = { site, volumes, settings }`, `settings = { date, timeMin, timeBasis, lat, lon, floorHeight, gridSpacing, setbackParams }`; `cloneState(s) -> State` (깊은 복사)
- 두 샘플은 같은 대지(20×30, 정북 +y)와 같은 정북 이웃 건물(x 2~18, y 33~43, 높이 12)을 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/samples.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLES, cloneState } from '../core/samples.js';
import { checkSetback } from '../core/setback.js';
import { validate } from '../core/validate.js';
import { coverage } from '../core/coverage.js';

for (const [name, s] of Object.entries(SAMPLES)) {
  test(`${name}: 입력 검증 통과`, () => assert.deepEqual(validate(s.site, s.volumes).errors, []));
}

test('violation 샘플: 사선 위반 있음', () => {
  const r = checkSetback(SAMPLES.violation.site, SAMPLES.violation.volumes, SAMPLES.violation.settings.setbackParams);
  assert.ok(r.some((x) => x.violates));
});

test('compliant 샘플: 내 건물 위반 없음', () => {
  const s = SAMPLES.compliant;
  const r = checkSetback(s.site, s.volumes.filter((v) => v.role === 'mine'), s.settings.setbackParams);
  assert.ok(r.every((x) => !x.violates), JSON.stringify(r.map((x) => [x.id, x.maxExcess])));
});

test('두 샘플의 건폐율은 같은 대지에서 308/600', () => {
  for (const s of Object.values(SAMPLES)) {
    const c = coverage(s.site, s.volumes, s.settings);
    assert.ok(Math.abs(c.coverageRatio - 308 / 600) < 1e-9);
  }
});

test('cloneState는 깊은 복사', () => {
  const c = cloneState(SAMPLES.violation);
  c.volumes[0].h = 999;
  assert.notEqual(SAMPLES.violation.volumes[0].h, 999);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/samples.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: 구현** — `core/samples.js`

```js
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

const site = () => ({
  polygon: rect(0, 0, 20, 30),
  northAngleDeg: 0,
  zone: '일반주거지역',
  edges: [{ tag: '인접대지' }, { tag: '인접대지' }, { tag: '인접대지' }, { tag: '인접대지' }],
});

const settings = () => ({
  date: '2026-12-22', // 동지일(KST 기준으로 사용). 날짜는 KASI 월력요항으로 확인 필요(README 확인 과제)
  timeMin: 720,
  timeBasis: 'KST',
  lat: 37.5665,
  lon: 126.978,
  floorHeight: 3,
  gridSpacing: 2,
  setbackParams: { lowH: 10, lowD: 1.5, ratio: 0.5 },
});

const neighbor = () => ({ id: 'N1', footprint: rect(2, 33, 18, 43), z0: 0, h: 12, role: 'neighbor' });

export const SAMPLES = {
  // 5층(15m) 단순 박스: 정북 4m 이격이라 허용 높이 10m를 초과 → 위반
  violation: {
    site: site(),
    volumes: [{ id: 'A', footprint: rect(3, 4, 17, 26), z0: 0, h: 15, role: 'mine' }, neighbor()],
    settings: settings(),
  },
  // 같은 연면적 규모로 사선에 맞춰 후퇴한 2단 매스: 1단 9m(정북 4m), 2단 15m(정북 8m ≥ 7.5m)
  compliant: {
    site: site(),
    volumes: [
      { id: 'A1', footprint: rect(3, 4, 17, 26), z0: 0, h: 9, role: 'mine' },
      { id: 'A2', footprint: rect(3, 4, 17, 22), z0: 9, h: 6, role: 'mine' },
      neighbor(),
    ],
    settings: settings(),
  },
};

export const cloneState = (s) => JSON.parse(JSON.stringify(s));
```

- [ ] **Step 4: 통과 확인**

Run: `node --test`
Expected: 전체 PASS (지금까지 모든 core 테스트). 샘플 테스트가 실패하면 좌표/높이를 조정하되 "위반 샘플은 위반, 합격 샘플은 위반 0"과 "두 샘플의 대지·이웃 동일"만 지킨다.

- [ ] **Step 5: 커밋**
```bash
git add core/samples.js tests/samples.test.js
git commit -m "feat(core): violation and stepped-compliant sample scenarios

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 웹 골격 + 3D 뷰 (그림자, 볼륨, 사선 오버레이)

**Files:**
- Create: `web/index.html`, `web/style.css`, `web/main.js`, `web/view3d.js`

**Interfaces:**
- Consumes: `SAMPLES, cloneState`(samples), `validate`, `checkSetback, activeEdges, northVec, profile`(setback), `coverage`, `instantMs, sunDirection`(sun)
- Produces (이후 Task가 사용):
  - `createView(container) -> { update(state, ctx) }`, `ctx = { mode: 'shadow'|'heat'|'setback', sunDir, violations, heat, metric }`, `heat = { points: [{p, kind}], values: [{maxContinuousMin, totalMin}] } | null`
  - `heatColor(minutes) -> [r,g,b]`(0~1), `HEAT_MAX_MIN = 360`, `HEAT_STOPS`(CSS 범례용)
  - `main.js`의 `state`(`{ site, volumes, settings, view: { mode, metric } }`)와 `render()`, `setState(next)`

- [ ] **Step 1: Three.js 버전 고정**

Run: `npm install --save-dev three` 후 `npm ls three --depth=0` 로 버전을 확인한다(이 값을 `<THREE_VERSION>`으로 사용). three는 CDN import map으로만 쓰므로 devDependency 설치는 버전 확인 용도다.

- [ ] **Step 2: `web/index.html`**

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>일조·일조권 사선 검토기</title>
  <link rel="stylesheet" href="style.css">
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@<THREE_VERSION>/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@<THREE_VERSION>/examples/jsm/"
    }
  }
  </script>
</head>
<body>
  <header><strong>일조·일조권 사선 검토기</strong><span class="disclaimer">참고용, 법적 효력 없음</span></header>
  <main>
    <aside id="left"></aside>
    <section id="center">
      <nav id="tabs">
        <button data-tab="plan" class="on">평면 편집</button>
        <button data-tab="3d">3D 뷰</button>
      </nav>
      <canvas id="plan"></canvas>
      <div id="view3d" hidden></div>
    </section>
    <aside id="right"></aside>
  </main>
  <script type="module" src="main.js"></script>
</body>
</html>
```
`<THREE_VERSION>`을 Step 1에서 확인한 실제 버전 문자열로 교체한다(두 곳).

- [ ] **Step 3: `web/style.css`**

```css
* { box-sizing: border-box; }
body { margin: 0; font: 14px/1.5 system-ui, "Malgun Gothic", sans-serif; color: #222; background: #fafafa; }
header { display: flex; justify-content: space-between; align-items: center; padding: 8px 16px; background: #1f2d3d; color: #fff; }
.disclaimer { background: #c0392b; padding: 2px 10px; border-radius: 4px; font-weight: 600; }
main { display: grid; grid-template-columns: 280px 1fr 300px; height: calc(100vh - 42px); }
aside { overflow: auto; padding: 12px; background: #fff; border-right: 1px solid #ddd; }
#right { border-right: 0; border-left: 1px solid #ddd; }
#center { position: relative; display: flex; flex-direction: column; min-width: 0; }
#tabs { display: flex; gap: 4px; padding: 6px; background: #eef1f4; }
#tabs button, aside button { padding: 4px 10px; border: 1px solid #bbb; border-radius: 4px; background: #fff; cursor: pointer; }
#tabs button.on, aside button.on { background: #1f2d3d; color: #fff; }
#plan, #view3d { flex: 1; min-height: 0; width: 100%; }
#view3d { position: relative; }
h3 { margin: 14px 0 6px; font-size: 14px; }
label { display: block; margin: 4px 0; }
input[type=number] { width: 70px; }
.row { display: flex; gap: 6px; align-items: center; margin: 4px 0; flex-wrap: wrap; }
.legend { height: 10px; border-radius: 3px; margin: 4px 0; }
.err { color: #c0392b; }
details { margin: 8px 0; }
@media (max-width: 900px) { main { grid-template-columns: 1fr; height: auto; } #plan, #view3d { height: 60vh; } }
```

- [ ] **Step 4: `web/view3d.js`**

```js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { activeEdges, northVec, profile } from '../core/setback.js';

export const HEAT_MAX_MIN = 360;
export const HEAT_STOPS = [[0x44, 0x01, 0x54], [0x21, 0x90, 0x8d], [0xfd, 0xe7, 0x25]]; // viridis 3점 보간
export function heatColor(minutes) {
  const t = Math.min(Math.max(minutes / HEAT_MAX_MIN, 0), 1) * 2;
  const i = Math.min(Math.floor(t), 1), f = t - i;
  const a = HEAT_STOPS[i], b = HEAT_STOPS[i + 1];
  return [0, 1, 2].map((k) => (a[k] + (b[k] - a[k]) * f) / 255);
}

const TAG_COLOR = { 인접대지: 0x2c3e50, '도로·공원 등': 0x2980b9, 적용제외: 0x95a5a6 };

export function createView(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2f2f2);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 2000);
  camera.up.set(0, 0, 1);
  camera.position.set(-40, -70, 60);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(10, 15, 5);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 0.7));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 1, far: 500 });
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
  ground.receiveShadow = true;
  ground.position.z = -0.02;
  scene.add(ground);
  const dyn = new THREE.Group();
  scene.add(dyn);

  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(container);
  renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

  const prism = (footprint, z0, h, material, shadow = true) => {
    const shape = new THREE.Shape(footprint.map(([x, y]) => new THREE.Vector2(x, y)));
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }), material);
    m.position.z = z0;
    m.castShadow = shadow;
    m.receiveShadow = true;
    return m;
  };

  function clear() {
    dyn.traverse((o) => { o.geometry?.dispose?.(); });
    dyn.clear();
  }

  function setbackSurface(site, params) {
    const n = northVec(site.northAngleDeg), prof = profile(params);
    const pos = [];
    for (const e of activeEdges(site)) {
      for (let k = 0; k + 1 < prof.length; k++) {
        const [L0, z0] = prof[k], [L1, z1] = prof[k + 1];
        const P = (pt, L, z) => [pt[0] - n[0] * L, pt[1] - n[1] * L, z];
        const q = [P(e.a, L0, z0), P(e.b, L0, z0), P(e.b, L1, z1), P(e.a, L1, z1)];
        pos.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x27ae60, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
  }

  function heatPoints(heat, metric) {
    const pos = new Float32Array(heat.points.length * 3), col = new Float32Array(heat.points.length * 3);
    heat.points.forEach((q, i) => {
      pos.set(q.p, i * 3);
      const v = heat.values[i];
      col.set(heatColor(metric === 'total' ? v.totalMin : v.maxContinuousMin), i * 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ size: 7, sizeAttenuation: false, vertexColors: true }));
  }

  function update(state, ctx) {
    clear();
    const { site, volumes, settings } = state;
    const { mode, sunDir, violations, heat, metric } = ctx;
    // 태양: 조명 방향은 코어의 태양 벡터만 사용 (그림자와 계산 결과가 같은 태양을 본다)
    const up = sunDir && sunDir.z > 0;
    sun.intensity = up ? 1.6 : 0;
    if (up) sun.position.set(10 + sunDir.x * 200, 15 + sunDir.y * 200, sunDir.z * 200);
    sun.target.position.set(10, 15, 0);
    sun.target.updateMatrixWorld();
    // 대지 경계(변 태그별 색)
    site.polygon.forEach((a, i) => {
      const b = site.polygon[(i + 1) % site.polygon.length];
      const tag = site.edges?.[i]?.tag ?? '인접대지';
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a[0], a[1], 0.05), new THREE.Vector3(b[0], b[1], 0.05)]);
      dyn.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: TAG_COLOR[tag] ?? 0x2c3e50 })));
    });
    // 볼륨
    const ghost = mode !== 'shadow';
    for (const v of volumes) {
      const color = v.role === 'neighbor' ? 0x9aa5b1 : 0x3b82c4;
      const mat = new THREE.MeshStandardMaterial({ color, transparent: ghost, opacity: ghost ? 0.35 : 1 });
      dyn.add(prism(v.footprint, v.z0, v.h, mat, !ghost));
    }
    if (mode === 'setback') {
      dyn.add(setbackSurface(site, settings.setbackParams));
      for (const r of violations ?? []) {
        for (const pc of r.pieces) {
          dyn.add(prism(pc.poly, pc.z0, pc.z1 - pc.z0, new THREE.MeshBasicMaterial({ color: 0xe74c3c, transparent: true, opacity: 0.85 }), false));
        }
      }
    }
    if (mode === 'heat' && heat) dyn.add(heatPoints(heat, metric));
  }

  resize();
  return { update, resize };
}
```

- [ ] **Step 5: `web/main.js` (이 Task에서는 뷰 연결까지, 편집 UI는 Task 9)**

```js
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
```

- [ ] **Step 6: 브라우저에서 확인 (자동 테스트 없음, 내장 브라우저로 직접)**

Run: `npm run dev` (백그라운드, http://localhost:8000/web/ 서빙). `mcp__Claude_Browser__preview_start`의 `url`로 `http://localhost:8000/web/` 를 열고 "3D 뷰" 탭 클릭, `read_console_messages`로 오류 확인.
Expected: 3D 뷰에 대지 경계선, 파란 박스, 회색 이웃 건물, 그림자가 보이고 콘솔 오류 없음. 확인하지 못한 항목은 최종 보고에 "미확인"으로 적는다.

- [ ] **Step 7: 커밋**
```bash
git add web package.json package-lock.json
git commit -m "feat(web): page shell and Three.js view (shadows, volumes, setback overlay)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 히트맵 Worker와 오버레이

**Files:**
- Create: `web/heat.worker.js`
- Modify: `web/main.js`

**Interfaces:**
- Consumes: `groundGrid, wallGrid, sunHours`(sunhours), `northVec`(setback), `instantMs, sunDirection`(sun), `setHeat`(main)
- Produces: Worker 프로토콜 — 요청 `{ state }`, 응답 `{ type: 'progress', done, total }` 와 `{ type: 'done', points, values, ms }`; `main.js`가 `requestHeat()`를 입력 변경 시 호출(디바운스 300ms, 이전 Worker는 `terminate()`로 취소)

- [ ] **Step 1: `web/heat.worker.js`**

```js
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
```
참고: 시각 창은 기본 09:00~15:00이며 `timeBasis`가 `KST`면 표준시 시계 기준, `진태양시`면 겉보기 태양시 기준이다.

- [ ] **Step 2: `web/main.js`에 히트 요청 추가** (파일 맨 아래 `render();` 위에 삽입)

```js
let worker = null, heatTimer = null, heatKey = '';
export const heatStatus = { running: false, done: 0, total: 0, ms: null };

function requestHeat() {
  const { errors } = validate(state.site, state.volumes);
  if (errors.length) return;
  const { site, volumes, settings } = state;
  const key = JSON.stringify({ site, volumes, d: settings.date, b: settings.timeBasis, la: settings.lat, lo: settings.lon, g: settings.gridSpacing });
  if (key === heatKey) return; // 태양 시각(timeMin)은 히트맵에 영향 없음
  heatKey = key;
  clearTimeout(heatTimer);
  heatTimer = setTimeout(() => {
    worker?.terminate(); // 이전 작업 취소
    worker = new Worker(new URL('./heat.worker.js', import.meta.url), { type: 'module' });
    heatStatus.running = true; heatStatus.done = 0; heatStatus.total = 0;
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') { heatStatus.done = data.done; heatStatus.total = data.total; listeners.forEach((fn) => fn(state, null)); }
      else { heatStatus.running = false; heatStatus.ms = data.ms; setHeat({ points: data.points, values: data.values }); }
    };
    worker.postMessage({ state: JSON.parse(JSON.stringify({ site, volumes, settings })) });
  }, 300);
}
onRender(() => requestHeat());
```
(`onRender` 리스너는 `derived === null`로도 호출되므로 이후 UI 리스너(Task 9)는 `derived`가 null이면 진행률만 갱신하게 작성한다.)

- [ ] **Step 3: 브라우저 확인과 성능 기록**

내장 브라우저에서 3D 탭 → (Task 9 전이라 모드 버튼이 없으므로) 콘솔 도구로 `import('./main.js').then(m => { m.state.view.mode='heat'; m.render(); })` 실행. 점들이 viridis 색으로 지반과 이웃 건물 남·동·서향 벽에 나타나는지 확인한다. 워커 소요 시간 `heatStatus.ms`를 읽어 기록한다.
Expected: 점이 보이고 콘솔 오류 없음. `gridSpacing`을 0.5로 바꿔 한 번 더 측정해 두 값을 README에 적는다(Opus의 "약 1초"는 미측정 추정이었으므로 실측값으로 대체). 5초를 넘으면 기본 `gridSpacing`을 키우고 이유를 README에 기록한다.

- [ ] **Step 4: 커밋**
```bash
git add web
git commit -m "feat(web): heatmap worker with cancellation and viridis overlay

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 입력 UI (평면 편집, 폼, 결과 패널, 샘플, JSON)

**Files:**
- Create: `web/ui.js`
- Modify: `web/main.js`(ui 연결 한 줄)

**Interfaces:**
- Consumes: `state, setState, render, onRender, heatStatus`(main), `SAMPLES, cloneState`(samples), `HEAT_STOPS, HEAT_MAX_MIN`(view3d)
- Produces: 없음(리프). 왼쪽 패널·평면 캔버스·오른쪽 패널을 구성한다.

- [ ] **Step 1: `web/ui.js`**

```js
import { state, setState, render, onRender, heatStatus } from './main.js';
import { SAMPLES, cloneState } from '../core/samples.js';
import { HEAT_STOPS } from './view3d.js';

const $ = (s) => document.querySelector(s);
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
const mut = (fn) => { fn(state); render(); };
const ASSUMPTIONS = [
  '지표면은 평지로 가정(제119조 평균 수평면 미적용)',
  '옥탑·승강기탑 높이 예외 미적용(전체 높이 산입)',
  '조례값 대신 시행령 하한 기본 적용(1.5m / 10m / 높이의 1/2)',
  '정북 방향 직선 거리로 측정(국토부 해석 미확인)',
  '제86조②1·2호 미모델링, ②3호는 변 태그 `적용제외`로 수동 지정',
  '오목한 대지·여러 변이 겹치는 경우 보수적(과다 표시 가능)',
  '시각 기준(표준시/진태양시) 기본값 미확정 — 토글로 비교',
  '연면적 층수 환산은 임시 규칙: floor(높이 / 층고), 층고 기본 3.0m',
  '참고용, 법적 효력 없음',
];

// ───────── 왼쪽 패널 ─────────
const left = $('#left');
left.append(el(`<div>
  <h3>샘플</h3>
  <div class="row"><button id="s-vio">사선 위반 사례</button><button id="s-ok">계단형 합격 사례</button></div>
  <h3>대지</h3>
  <label>정북 방향(°) <input id="north" type="number" step="1"> <small>+y에서 시계방향</small></label>
  <div id="edge-panel" class="row" hidden></div>
  <h3>볼륨</h3><div id="vols"></div>
  <div class="row"><button id="add-box">직사각형 볼륨 추가</button></div>
  <h3>설정</h3>
  <label>날짜 <input id="date" type="date"></label>
  <label>시각 <input id="time" type="range" min="360" max="1080" step="10"> <span id="time-l"></span></label>
  <label>시각 기준 <select id="basis"><option value="KST">표준시(KST)</option><option value="진태양시">진태양시</option></select></label>
  <label>층고(m) <input id="fh" type="number" step="0.1" min="2"></label>
  <label>격자 간격(m) <input id="gs" type="number" step="0.5" min="0.5"></label>
  <h3>보기</h3>
  <div class="row" id="modes">
    <button data-m="shadow">그림자</button><button data-m="heat">일조 히트맵</button><button data-m="setback">사선 검토</button>
  </div>
  <div class="row" id="metrics"><button data-k="continuous">연속</button><button data-k="total">누적</button></div>
  <h3>파일</h3>
  <div class="row"><button id="export">JSON 내보내기</button><button id="import">불러오기</button><input id="file" type="file" accept="application/json" hidden></div>
</div>`));
$('#s-vio').onclick = () => { Object.assign(state, cloneState(SAMPLES.violation)); render(); };
$('#s-ok').onclick = () => { Object.assign(state, cloneState(SAMPLES.compliant)); render(); };
$('#north').onchange = (e) => mut((s) => { s.site.northAngleDeg = +e.target.value; });
$('#date').onchange = (e) => mut((s) => { s.settings.date = e.target.value; });
$('#time').oninput = (e) => mut((s) => { s.settings.timeMin = +e.target.value; });
$('#basis').onchange = (e) => mut((s) => { s.settings.timeBasis = e.target.value; });
$('#fh').onchange = (e) => mut((s) => { s.settings.floorHeight = +e.target.value; });
$('#gs').onchange = (e) => mut((s) => { s.settings.gridSpacing = +e.target.value; });
document.querySelectorAll('#modes button').forEach((b) => (b.onclick = () => mut((s) => { s.view.mode = b.dataset.m; })));
document.querySelectorAll('#metrics button').forEach((b) => (b.onclick = () => mut((s) => { s.view.metric = b.dataset.k; })));
$('#add-box').onclick = () => mut((s) => {
  const xs = s.site.polygon.map((p) => p[0]), ys = s.site.polygon.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  s.volumes.push({ id: 'V' + (s.volumes.length + 1), footprint: [[cx - 4, cy - 4], [cx + 4, cy - 4], [cx + 4, cy + 4], [cx - 4, cy + 4]], z0: 0, h: 9, role: 'mine' });
});
$('#export').onclick = () => {
  const { site, volumes, settings } = state;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ site, volumes, settings }, null, 2)], { type: 'application/json' }));
  a.download = 'sunlight-lab.json';
  a.click();
};
$('#import').onclick = () => $('#file').click();
$('#file').onchange = async (e) => {
  try {
    const j = JSON.parse(await e.target.files[0].text());
    if (!j.site || !j.volumes || !j.settings) throw new Error('site/volumes/settings 필요');
    Object.assign(state, cloneState(j));
    render();
  } catch (err) { alert('불러오기 실패: ' + err.message); }
};

function renderVolumes() {
  const box = $('#vols');
  box.innerHTML = '';
  state.volumes.forEach((v, i) => {
    const row = el(`<div class="row"><b>${v.id}</b>
      <select><option value="mine">내 건물</option><option value="neighbor">이웃</option></select>
      z0<input type="number" step="0.5" value="${v.z0}"> h<input type="number" step="0.5" value="${v.h}">
      <button>삭제</button></div>`);
    const [sel, z0, h, del] = [row.querySelector('select'), ...row.querySelectorAll('input'), row.querySelector('button')];
    sel.value = v.role;
    sel.onchange = () => mut((s) => { s.volumes[i].role = sel.value; });
    z0.onchange = () => mut((s) => { s.volumes[i].z0 = +z0.value; });
    h.onchange = () => mut((s) => { s.volumes[i].h = +h.value; });
    del.onclick = () => mut((s) => { s.volumes.splice(i, 1); });
    box.append(row);
  });
}

// ───────── 평면 편집 캔버스 ─────────
const canvas = $('#plan'), ctx2 = canvas.getContext('2d');
const T = { scale: 8, ox: 60, oy: 0 };
let tool = 'select', drawing = null, drag = null, selEdge = null, fitted = false;
const toS = ([x, y]) => [T.ox + x * T.scale, T.oy - y * T.scale];
const toW = (sx, sy) => [Math.round(((sx - T.ox) / T.scale) * 10) / 10, Math.round(((T.oy - sy) / T.scale) * 10) / 10];

function fit() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  canvas.width = w; canvas.height = h;
  const pts = [...state.site.polygon, ...state.volumes.flatMap((v) => v.footprint)];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const bw = Math.max(...xs) - Math.min(...xs) + 10, bh = Math.max(...ys) - Math.min(...ys) + 10;
  T.scale = Math.min(w / bw, h / bh);
  T.ox = (w - (Math.max(...xs) + Math.min(...xs)) * T.scale) / 2;
  T.oy = h - (h - (Math.max(...ys) - Math.min(...ys)) * T.scale) / 2 + Math.min(...ys) * T.scale;
}

const EDGE_COLOR = { 인접대지: '#2c3e50', '도로·공원 등': '#2980b9', 적용제외: '#95a5a6' };
function drawPlan() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  if (!fitted && w) { fit(); fitted = true; }
  const c = ctx2;
  c.clearRect(0, 0, canvas.width, canvas.height);
  const poly = (pts, close = true) => { c.beginPath(); pts.forEach((p, i) => { const [x, y] = toS(p); i ? c.lineTo(x, y) : c.moveTo(x, y); }); if (close) c.closePath(); };
  state.volumes.forEach((v) => {
    poly(v.footprint);
    c.fillStyle = v.role === 'neighbor' ? 'rgba(150,160,170,.5)' : 'rgba(59,130,196,.45)';
    c.fill(); c.strokeStyle = '#34495e'; c.lineWidth = 1; c.stroke();
    const [x, y] = toS(v.footprint[0]); c.fillStyle = '#222'; c.fillText(`${v.id} h${v.h}`, x + 3, y - 3);
  });
  const sp = state.site.polygon;
  sp.forEach((a, i) => {
    const b = sp[(i + 1) % sp.length], tag = state.site.edges?.[i]?.tag ?? '인접대지';
    poly([a, b], false);
    c.strokeStyle = EDGE_COLOR[tag]; c.lineWidth = i === selEdge ? 5 : 2.5; c.stroke();
  });
  [...sp, ...state.volumes.flatMap((v) => v.footprint)].forEach((p) => { const [x, y] = toS(p); c.fillStyle = '#c0392b'; c.fillRect(x - 3, y - 3, 6, 6); });
  if (drawing) { poly(drawing.pts, false); c.strokeStyle = '#e67e22'; c.lineWidth = 2; c.stroke(); }
  // 정북 화살표
  const a = (state.site.northAngleDeg * Math.PI) / 180, cx = canvas.width - 40, cy = 50;
  c.strokeStyle = '#c0392b'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.sin(a) * 28, cy - Math.cos(a) * 28); c.stroke();
  c.fillStyle = '#c0392b'; c.fillText('정북', cx + Math.sin(a) * 34 - 8, cy - Math.cos(a) * 34);
}

function hit(sx, sy) {
  const near = (p) => { const [x, y] = toS(p); return Math.hypot(x - sx, y - sy) < 8; };
  for (let i = 0; i < state.site.polygon.length; i++) if (near(state.site.polygon[i])) return { kind: 'site', idx: i };
  for (let vi = 0; vi < state.volumes.length; vi++)
    for (let i = 0; i < state.volumes[vi].footprint.length; i++) if (near(state.volumes[vi].footprint[i])) return { kind: 'vol', vi, idx: i };
  return null;
}
function hitEdge(sx, sy) {
  const sp = state.site.polygon;
  for (let i = 0; i < sp.length; i++) {
    const [x1, y1] = toS(sp[i]), [x2, y2] = toS(sp[(i + 1) % sp.length]);
    const L2 = (x2 - x1) ** 2 + (y2 - y1) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((sx - x1) * (x2 - x1) + (sy - y1) * (y2 - y1)) / L2));
    if (Math.hypot(sx - (x1 + t * (x2 - x1)), sy - (y1 + t * (y2 - y1))) < 6) return i;
  }
  return null;
}
const xy = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

canvas.addEventListener('mousedown', (e) => {
  const [sx, sy] = xy(e);
  if (tool !== 'select') { drawing ??= { pts: [] }; drawing.pts.push(toW(sx, sy)); drawPlan(); return; }
  drag = hit(sx, sy);
  if (!drag) { selEdge = hitEdge(sx, sy); showEdgePanel(); drawPlan(); }
});
canvas.addEventListener('mousemove', (e) => {
  if (!drag) return;
  const [sx, sy] = xy(e), p = toW(sx, sy);
  if (drag.kind === 'site') state.site.polygon[drag.idx] = p; else state.volumes[drag.vi].footprint[drag.idx] = p;
  render();
});
window.addEventListener('mouseup', () => { drag = null; });
function finishDrawing() {
  if (!drawing || drawing.pts.length < 3) { drawing = null; return; }
  if (tool === 'site') { state.site.polygon = drawing.pts; state.site.edges = drawing.pts.map(() => ({ tag: '인접대지' })); selEdge = null; }
  else state.volumes.push({ id: 'V' + (state.volumes.length + 1), footprint: drawing.pts, z0: 0, h: 9, role: 'mine' });
  drawing = null; setTool('select'); fitted = false; render();
}
canvas.addEventListener('dblclick', () => { if (drawing) { drawing.pts.pop(); finishDrawing(); } });
window.addEventListener('keydown', (e) => { if (e.key === 'Enter') finishDrawing(); if (e.key === 'Escape') { drawing = null; setTool('select'); drawPlan(); } });

function setTool(t) { tool = t; document.querySelectorAll('#toolbar button').forEach((b) => b.classList.toggle('on', b.dataset.t === t)); }
const toolbar = el(`<div id="toolbar" class="row"><button data-t="select" class="on">선택/이동</button><button data-t="site">대지 그리기</button><button data-t="volume">볼륨 그리기</button><small>클릭으로 꼭짓점 추가, 더블클릭/Enter로 닫기</small></div>`);
toolbar.querySelectorAll('button').forEach((b) => (b.onclick = () => { drawing = null; setTool(b.dataset.t); }));
$('#tabs').after(toolbar);

function showEdgePanel() {
  const p = $('#edge-panel');
  if (selEdge === null) { p.hidden = true; return; }
  const e = (state.site.edges[selEdge] ??= { tag: '인접대지' });
  p.hidden = false;
  p.innerHTML = `변 ${selEdge + 1}: <select>${['인접대지', '도로·공원 등', '적용제외'].map((t) => `<option ${t === e.tag ? 'selected' : ''}>${t}</option>`).join('')}</select> 폭(m)<input type="number" step="0.5" min="0" value="${e.width ?? 0}">`;
  const [sel, w] = [p.querySelector('select'), p.querySelector('input')];
  sel.onchange = () => mut((s) => { s.site.edges[selEdge].tag = sel.value; });
  w.onchange = () => mut((s) => { s.site.edges[selEdge].width = +w.value; });
}

// ───────── 오른쪽 패널 ─────────
const right = $('#right');
const stops = HEAT_STOPS.map((c) => `rgb(${c.join(',')})`).join(',');
onRender((s, d) => {
  if (!d) { const st = $('#heat-status'); if (st) st.textContent = `히트맵 계산 중 ${heatStatus.done}/${heatStatus.total}`; return; }
  $('#north').value = s.site.northAngleDeg;
  $('#date').value = s.settings.date;
  $('#time').value = s.settings.timeMin;
  $('#time-l').textContent = `${String(Math.floor(s.settings.timeMin / 60)).padStart(2, '0')}:${String(s.settings.timeMin % 60).padStart(2, '0')}`;
  $('#basis').value = s.settings.timeBasis;
  $('#fh').value = s.settings.floorHeight;
  $('#gs').value = s.settings.gridSpacing;
  document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.m === s.view.mode));
  document.querySelectorAll('#metrics button').forEach((b) => b.classList.toggle('on', b.dataset.k === s.view.metric));
  renderVolumes();
  showEdgePanel();
  drawPlan();
  const pct = (v) => (v * 100).toFixed(1) + '%';
  right.innerHTML = `
    <div class="disclaimer" style="display:inline-block">참고용, 법적 효력 없음</div>
    ${d.errors.length ? `<h3 class="err">입력 오류</h3><ul class="err">${d.errors.map((x) => `<li>${x}</li>`).join('')}</ul>` : `
    <h3>건폐율·용적률</h3>
    <div>대지면적 ${d.cov.siteArea.toFixed(1)}㎡ · 건축면적 ${d.cov.buildingArea.toFixed(1)}㎡ · 연면적 ${d.cov.gfa.toFixed(1)}㎡</div>
    <div><b>건폐율 ${pct(d.cov.coverageRatio)}</b> · <b>용적률 ${pct(d.cov.far)}</b> <small>(법정 한도는 앱에 내장하지 않음)</small></div>
    <h3>정북 사선</h3>
    ${d.violations.map((r) => `<div>${r.id}: ${r.violates ? `<b class="err">위반</b> (최대 초과 ${r.maxExcess.toFixed(2)}m)` : '위반 없음'}</div>`).join('') || '내 건물 없음'}
    <h3>일조 히트맵</h3>
    <div id="heat-status">${heatStatus.running ? '계산 중…' : heatStatus.ms ? `계산 ${Math.round(heatStatus.ms)}ms` : ''}</div>
    <div class="legend" style="background:linear-gradient(90deg,${stops})"></div>
    <div class="row" style="justify-content:space-between"><small>0</small><small>2시간(참고 기준)</small><small>6시간</small></div>
    <small>지표: ${s.view.metric === 'total' ? '누적' : '연속'} · 동지 09~15시 · 격자 ${s.settings.gridSpacing}m · ${s.settings.timeBasis}<br>
    2시간 기준은 제86조③2호(공동주택 동간거리 대체 기준) 표현에서 가져온 참고 기준입니다.</small>`}
    <details open><summary>가정 목록</summary><ol>${ASSUMPTIONS.map((a) => `<li>${a}</li>`).join('')}</ol></details>`;
});
new ResizeObserver(drawPlan).observe(canvas);
render();
```

- [ ] **Step 2: `web/main.js` 맨 아래에 ui 연결 추가** (`render();` 뒤에 한 줄)

```js
import('./ui.js'); // ui.js는 main.js의 state/render를 import한다
```
(`ui.js`가 `main.js`를 import하고 `main.js`가 `ui.js`를 동적 import하므로 순환은 동적 import로 끊긴다. 이미 `render()` 호출 이후라 리스너 등록 직후 `ui.js` 마지막 줄의 `render()`가 첫 화면을 그린다.)

- [ ] **Step 3: 브라우저에서 기능별 확인**

내장 브라우저로 `http://localhost:8000/web/` 를 열어 하나씩 확인하고 결과를 기록한다.
1. 처음 화면: 평면 탭에 대지 사각형, 위반 샘플 박스, 이웃 건물, 정북 화살표가 보이고 오른쪽 패널에 건폐율 51.3%, 용적률 257%(연면적 1540㎡), "A: 위반 (최대 초과 5.00m)" 가 나오는가 (손계산: 15m 박스, L=4 → 허용 10m → 초과 5m).
2. `계단형 합격 사례` 클릭 → 오른쪽 "위반 없음", 용적률 238%.
3. 3D 탭: `그림자`에서 시각 슬라이더를 움직이면 그림자 방향이 바뀌고, `사선 검토`에서 위반 샘플은 빨간 조각과 초록 반투명 사선 면이 보이고 합격 샘플은 빨간 조각이 없는가.
4. `일조 히트맵`: 점이 나타나고 `연속/누적` 토글 시 색이 바뀌는가, 점 계산 후 `계산 NNNms`가 표시되는가.
5. 평면에서 꼭짓점 드래그, 변 클릭 후 태그를 `적용제외`로 바꾸면(정북 변) 위반이 사라지는가, `도로·공원 등` 폭 6 → 합격인가(샘플 위반 박스는 L=4+6=10, 허용 높이 20m).
6. 자기교차하도록 꼭짓점을 끌면 오른쪽에 "변이 서로 교차합니다" 오류가 나오고 3D가 멈추는가.
7. JSON 내보내기 → 불러오기 왕복이 되는가.
`read_console_messages`에서 오류가 없는지 확인한다. 확인하지 못한 항목은 최종 보고에 "미확인"으로 적는다.

- [ ] **Step 4: 커밋**
```bash
git add web
git commit -m "feat(web): plan editor, forms, results panel, samples, JSON import/export

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 최종 검증, README, 스펙 동기화

**Files:**
- Create: `README.md`(기존 파일이 있으면 Modify)
- Modify: `docs/superpowers/specs/2026-10-07-sunlight-lab-design.md`

- [ ] **Step 1: 전체 테스트와 정리 확인**

Run: `node --test`
Expected: 전체 PASS. 실패/건너뜀이 있으면 그대로 기록한다(특히 NOAA fixture가 비어 있으면 실패해야 정상이며 "미확인"으로 보고).

- [ ] **Step 2: 화면 그림자와 계산 결과 일치 회귀 확인(수동 1회)**

내장 브라우저에서 위반 샘플을 3D `그림자` 모드, 시각 12:00, 표준시(KST)로 두고 이웃 건물 남쪽 벽에 닿는 그림자 높이를 눈으로 확인한 뒤, 같은 조건에서 코어 함수로 벽 점의 `isLit`을 콘솔에서 호출해 둘이 같은 쪽(그늘/양지)인지 비교한다(`import('/core/sunhours.js')` 등). 일치/불일치를 README "검증 현황"에 그대로 적는다. 불일치하면 원인(태양 벡터 단위, 좌표축)을 추적하고 고친다.

- [ ] **Step 3: `README.md` 작성**

반드시 포함: 한 줄 설명, 실행법(`npm install` → `npm test`, `npm run dev` → http://localhost:8000/web/), 구조, 기능, **가정 목록**(UI와 동일 9개), **확인 과제**(spec 9절 4개 + 동지 날짜 KASI 확인 + 평균 수평면·옥탑 예외 미적용), **검증 현황**(통과한 테스트 수, NOAA fixture 값 기입 여부, 히트맵 실측 시간 두 값, 화면 확인 항목별 확인/미확인), "참고용, 법적 효력 없음", "배포 전 사용자 승인 필요".

- [ ] **Step 4: 스펙 동기화**

spec 5.5의 가정 목록에 "9. 연면적 층수 환산은 임시 규칙(floor(h/floorHeight), 층고 기본 3.0m)"을 추가하고, 6절 설정에 `floorHeight`·`gridSpacing`을 명시한다. 구현하며 달라진 점이 있으면 spec에 반영하고 변경 이유를 한 줄씩 적는다.

- [ ] **Step 5: 커밋**
```bash
git add README.md docs/superpowers/specs
git commit -m "docs: README with assumptions and verification status; sync spec

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: 사용자 보고(배포 금지)**

완료 보고에 포함: 통과한 테스트와 실패/미확인 항목, 히트맵 실측 시간, 화면 확인 항목별 결과, 열려 있는 확인 과제 4개. **배포하거나 저장소를 공개하지 않는다.** 공개·배포는 사용자의 명시 승인을 받은 뒤 별도 작업으로 한다.

---

## Self-Review (플랜 작성 후 점검)

**Spec 커버리지**
- 정북 사선(제86조①②⑥): Task 3 (`적용제외`, 도로 폭 이동, 슬라이스·초과 높이), 뷰 오버레이 Task 7, 변 태그 UI Task 9 ✓
- 일조 히트맵 연속/누적 토글, 지반+이웃 벽면, 이분법 보정, Worker 취소: Task 4, 8, 9 ✓
- 그림자 뷰(날짜·시각, KST/진태양시): Task 1(`instantMs`), 7, 9 ✓
- 건폐율·용적률: Task 5, 9 ✓ (한도 비내장)
- 샘플 2종: Task 6, 9 ✓
- JSON 내보내기·불러오기: Task 9 ✓
- 입력 검증: Task 5, 9 ✓
- 검증 계획(sun: SunCalc·NOAA fixture·손계산, setback 손계산, sunhours 닫힌형식, coverage, 그림자 일치): Task 1~5, 10 ✓
- 가정 목록·고정 문구: Task 9, 10 ✓
- 확인 과제 4개: 해결하지 않고 README로 이월(Task 10) ✓

**플레이스홀더 점검:** `<THREE_VERSION>`(Task 7 Step 1에서 확인한 값으로 교체하는 명시 단계), NOAA fixture 값(Step 3에서 직접 읽어 채우는 명시 단계, 추측 금지). 그 외 TBD/TODO 없음.

**타입 일관성:** `checkSetback` 반환 `{ id, violates, maxExcess, pieces: [{ poly, z0, z1, edge }] }`가 Task 3 정의와 Task 6·7·9 사용처에서 일치. `sunHours` 반환 `{ maxContinuousMin, totalMin }`가 Task 4 정의와 Task 7 `heatPoints`(`v.totalMin`, `v.maxContinuousMin`)에서 일치. `settings` 키(`date, timeMin, timeBasis, lat, lon, floorHeight, gridSpacing, setbackParams`)가 Task 6 정의와 Task 7~9 사용처에서 일치. `heat = { points, values }` 형식이 Task 7, 8에서 일치.

**알려진 한계(구현 중 확인):** 이 플랜의 코드는 아직 한 줄도 실행하지 않았다. 허용 오차(SunCalc 교차검증 0.3°/0.5°, NOAA 0.15°)는 시작값이며, 어긋나면 원인을 기록하고 조정한다. 히트맵 속도는 Task 8에서 실측한다.
