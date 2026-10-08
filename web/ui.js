import { state, setState, render, onRender, heatStatus, HEAT_DATE } from './main.js';
import { SAMPLES, cloneState } from '../core/samples.js';
import { HEAT_STOPS, HEAT_MAX_MIN } from './view3d.js';
import { validate, validateState, realDate } from '../core/validate.js';

const $ = (s) => document.querySelector(s);
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nextId = () => 'V' + (Math.max(0, ...state.volumes.map((v) => +/^V(\d+)$/.exec(v.id)?.[1] || 0)) + 1);
const mut = (fn) => { fn(state); render(); };
// 숫자 입력 가드: 비유한·범위 밖 값은 이전 값으로 복원(상태 변경/렌더 없음)
const numField = (input, get, min, set) => (input.onchange = () => {
  const v = Number(input.value);
  if (input.value.trim() === '' || !Number.isFinite(v) || v < min) { input.value = get(); return; }
  mut((s) => set(s, v));
});
const ASSUMPTIONS = [
  '지표면은 평지로 가정(제119조 평균 수평면 미적용)',
  '옥탑·승강기탑 높이 예외 미적용(전체 높이 산입)',
  '조례값 대신 시행령 하한 기본 적용(1.5m / 10m / 높이의 1/2)',
  '정북 방향 직선 거리로 측정(국토부 해석 미확인)',
  '제86조②1·2호 미모델링, ②3호는 변 태그 「적용제외」로 수동 지정',
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
  <h3>한도(선택 입력)</h3>
  <label>건폐율 한도(%) <input id="lim-cov" type="number" step="1" min="0"></label>
  <label>용적률 한도(%) <input id="lim-far" type="number" step="1" min="0"></label>
  <h3>보기</h3>
  <div class="row" id="modes">
    <button data-m="shadow">그림자</button><button data-m="heat">일조 히트맵</button><button data-m="setback">사선 검토</button>
  </div>
  <div class="row" id="metrics"><button data-k="continuous">연속</button><button data-k="total">누적</button></div>
  <h3>파일</h3>
  <div class="row"><button id="export">JSON 내보내기</button><button id="import">불러오기</button><input id="file" type="file" accept="application/json" hidden></div>
</div>`));
const load = (j) => { Object.assign(state, cloneState(j)); selEdge = null; fitted = false; render(); };
$('#s-vio').onclick = () => load(SAMPLES.violation);
$('#s-ok').onclick = () => load(SAMPLES.compliant);
numField($('#north'), () => state.site.northAngleDeg, -Infinity, (s, v) => { s.site.northAngleDeg = v; });
$('#date').onchange = (e) => {
  if (!realDate(e.target.value)) { e.target.value = state.settings.date; return; }
  mut((s) => { s.settings.date = e.target.value; });
};
$('#time').oninput = (e) => mut((s) => { s.settings.timeMin = +e.target.value; });
$('#basis').onchange = (e) => mut((s) => { s.settings.timeBasis = e.target.value; });
numField($('#fh'), () => state.settings.floorHeight, 2, (s, v) => { s.settings.floorHeight = v; });
numField($('#gs'), () => state.settings.gridSpacing, 0.5, (s, v) => { s.settings.gridSpacing = v; });
const limField = (input, key) => (input.onchange = () => {
  const t = input.value.trim(), v = Number(t);
  if (t !== '' && !(Number.isFinite(v) && v >= 0)) { input.value = state.limits[key] ?? ''; return; }
  mut((s) => { s.limits[key] = t === '' ? null : v; });
});
limField($('#lim-cov'), 'coverage');
limField($('#lim-far'), 'far');
document.querySelectorAll('#modes button').forEach((b) => (b.onclick = () => mut((s) => { s.view.mode = b.dataset.m; })));
document.querySelectorAll('#metrics button').forEach((b) => (b.onclick = () => mut((s) => { s.view.metric = b.dataset.k; })));
$('#add-box').onclick = () => mut((s) => {
  const xs = s.site.polygon.map((p) => p[0]), ys = s.site.polygon.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  s.volumes.push({ id: nextId(), footprint: [[cx - 4, cy - 4], [cx + 4, cy - 4], [cx + 4, cy + 4], [cx - 4, cy + 4]], z0: 0, h: 9, role: 'mine' });
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
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  try {
    const r = validateState(JSON.parse(await f.text()));
    if (r.errors.length) { alert(['불러오기 실패:', ...r.errors.slice(0, 3)].join(String.fromCharCode(10))); return; }
    load(r.state);
  } catch (err) { alert('불러오기 실패: ' + err.message); }
};


function renderVolumes() {
  const box = $('#vols');
  box.innerHTML = '';
  state.volumes.forEach((v, i) => {
    const row = el(`<div class="row"><b>${esc(v.id)}</b>
      <select><option value="mine">내 건물</option><option value="neighbor">이웃</option></select>
      z0<input type="number" step="0.5" value="${v.z0}"> h<input type="number" step="0.5" value="${v.h}">
      <button>삭제</button></div>`);
    const [sel, z0, h, del] = [row.querySelector('select'), ...row.querySelectorAll('input'), row.querySelector('button')];
    sel.value = v.role;
    sel.onchange = () => mut((s) => { s.volumes[i].role = sel.value; });
    numField(z0, () => state.volumes[i].z0, 0, (s, v) => { s.volumes[i].z0 = v; });
    numField(h, () => state.volumes[i].h, 0.1, (s, v) => { s.volumes[i].h = v; });
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
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; fitted = false; } // 크기 변하면 다시 맞춤
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
  else state.volumes.push({ id: nextId(), footprint: drawing.pts, z0: 0, h: 9, role: 'mine' });
  drawing = null; setTool('select'); fitted = false; render();
}
canvas.addEventListener('dblclick', () => { if (drawing) { drawing.pts.pop(); finishDrawing(); } });
window.addEventListener('keydown', (e) => { if (e.key === 'Enter') finishDrawing(); if (e.key === 'Escape') { drawing = null; setTool('select'); drawPlan(); } });

function setTool(t) { tool = t; document.querySelectorAll('#toolbar button').forEach((b) => b.classList.toggle('on', b.dataset.t === t)); }
const toolbar = el(`<div id="toolbar" class="row"><button data-t="select" class="on">선택/이동</button><button data-t="site">대지 그리기</button><button data-t="volume">볼륨 그리기</button><small>클릭으로 꼭짓점 추가, 더블클릭/Enter로 닫기</small></div>`);
toolbar.querySelectorAll('button').forEach((b) => (b.onclick = () => { drawing = null; setTool(b.dataset.t); }));
$('#tabs').after(toolbar);
const coordBox = el(`<details id="coord"><summary>좌표 직접 입력</summary>
  <div class="row"><select id="coord-sel"></select><button id="coord-apply">적용</button></div>
  <textarea id="coord-text" rows="6" style="width:100%" spellcheck="false" placeholder="한 줄에 한 점: x y"></textarea>
  <div id="coord-msg" class="err"></div></details>`);
toolbar.after(coordBox);
document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => { toolbar.hidden = coordBox.hidden = b.dataset.tab === '3d'; }));

// 선택한 다각형(대지/볼륨)의 좌표 텍스트 ↔ 상태
const coordSel = $('#coord-sel'), coordText = $('#coord-text'), coordMsg = $('#coord-msg');
const volOf = (v) => state.volumes.find((x) => 'v:' + encodeURIComponent(String(x.id)) === v); // id 기준(볼륨 삭제·정렬에도 선택 유지)
const coordPoly = (st, v) => (v === 'site' ? st.site.polygon : volOf(v)?.footprint);
let coordDirty = false; // 적용 전 편집 중이면 다시 그릴 때 덮어쓰지 않는다
const fillCoord = () => { coordDirty = false; coordText.value = coordPoly(state, coordSel.value).map(([x, y]) => `${x} ${y}`).join('\n'); };
coordText.oninput = () => { coordDirty = true; };
function refreshCoord() {
  const prev = coordSel.value;
  coordSel.innerHTML = ['<option value="site">대지</option>', ...state.volumes.map((v) => `<option value="v:${encodeURIComponent(String(v.id))}">볼륨 ${esc(v.id)}</option>`)].join('');
  const kept = [...coordSel.options].some((o) => o.value === prev);
  coordSel.value = kept ? prev : 'site';
  if (!kept || !coordDirty) fillCoord();
}
coordSel.onchange = () => { coordMsg.textContent = ''; fillCoord(); };
$('#coord-apply').onclick = () => {
  const pts = coordText.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.split(/[\s,]+/).map(Number));
  if (pts.length < 3 || pts.some((p) => p.length !== 2 || !p.every(Number.isFinite))) { coordMsg.textContent = '꼭짓점 3개 이상, 줄마다 숫자 두 개(x y)가 필요합니다'; return; }
  const sel = coordSel.value, c = cloneState({ site: state.site, volumes: state.volumes, settings: state.settings });
  if (sel === 'site') {
    if (pts.length !== c.site.polygon.length) c.site.edges = pts.map(() => ({ tag: '인접대지' })); // 꼭짓점 수가 바뀌면 변 태그 초기화
    c.site.polygon = pts;
  } else c.volumes.find((x) => 'v:' + encodeURIComponent(String(x.id)) === sel).footprint = pts;
  const { errors } = validate(c.site, c.volumes);
  if (errors.length) { coordMsg.textContent = errors[0]; return; }
  coordMsg.textContent = '';
  coordDirty = false;
  mut((s) => { s.site = c.site; s.volumes = c.volumes; selEdge = null; fitted = false; });
};

function showEdgePanel() {
  const p = $('#edge-panel');
  if (selEdge === null) { p.hidden = true; return; }
  state.site.edges ??= [];
  const e = (state.site.edges[selEdge] ??= { tag: '인접대지' });
  p.hidden = false;
  p.innerHTML = `변 ${selEdge + 1}: <select>${['인접대지', '도로·공원 등', '적용제외'].map((t) => `<option ${t === e.tag ? 'selected' : ''}>${t}</option>`).join('')}</select> 폭(m)<input type="number" step="0.5" min="0" value="${e.width ?? 0}">`;
  const [sel, w] = [p.querySelector('select'), p.querySelector('input')];
  sel.onchange = () => mut((s) => { s.site.edges[selEdge].tag = sel.value; });
  numField(w, () => state.site.edges[selEdge].width ?? 0, 0, (s, v) => { s.site.edges[selEdge].width = v; });
}

// ───────── 오른쪽 패널 ─────────
const right = $('#right');
const stops = HEAT_STOPS.map((c) => `rgb(${c.join(',')})`).join(',');
onRender((s, d) => {
  if (!d) { const st = $('#heat-status'); if (st) st.textContent = heatStatus.error ? `히트맵 계산 오류: ${heatStatus.error}` : `히트맵 계산 중 ${heatStatus.done}/${heatStatus.total}`; return; }
  $('#north').value = s.site.northAngleDeg;
  $('#date').value = s.settings.date;
  $('#time').value = s.settings.timeMin;
  $('#time-l').textContent = `${String(Math.floor(s.settings.timeMin / 60)).padStart(2, '0')}:${String(s.settings.timeMin % 60).padStart(2, '0')}`;
  $('#basis').value = s.settings.timeBasis;
  $('#fh').value = s.settings.floorHeight;
  $('#gs').value = s.settings.gridSpacing;
  $('#lim-cov').value = s.limits.coverage ?? '';
  $('#lim-far').value = s.limits.far ?? '';
  document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.m === s.view.mode));
  document.querySelectorAll('#metrics button').forEach((b) => b.classList.toggle('on', b.dataset.k === s.view.metric));
  renderVolumes();
  refreshCoord();
  showEdgePanel();
  drawPlan();
  const pct = (v) => (v * 100).toFixed(1) + '%';
  const lim = (ratio, l) => (l === null ? '' : ` <small>한도 ${l}% — ${ratio * 100 > l + 1e-9 ? '<b class="err">초과</b>' : '이내'}</small>`);
  right.innerHTML = `
    <div class="disclaimer" style="display:inline-block">참고용, 법적 효력 없음</div>
    ${d.errors.length ? `<h3 class="err">입력 오류</h3><ul class="err">${d.errors.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : `
    <h3>건폐율·용적률</h3>
    <div>대지면적 ${d.cov.siteArea.toFixed(1)}㎡ · 건축면적 ${d.cov.buildingArea.toFixed(1)}㎡ · 연면적 ${d.cov.gfa.toFixed(1)}㎡</div>
    <div><b>건폐율 ${pct(d.cov.coverageRatio)}</b>${lim(d.cov.coverageRatio, s.limits.coverage)} · <b>용적률 ${pct(d.cov.far)}</b>${lim(d.cov.far, s.limits.far)} <small>(법정 한도는 앱에 내장하지 않음)</small></div>
    <h3>정북 사선</h3>
    ${d.violations.map((r) => `<div>${esc(r.id)}: ${r.violates ? `<b class="err">위반</b> (최대 초과 ${r.maxExcess.toFixed(2)}m)` : '위반 없음'}</div>`).join('') || '내 건물 없음'}
    <h3>일조 히트맵</h3>
    <div id="heat-status">${heatStatus.error ? `히트맵 계산 오류: ${esc(heatStatus.error)}` : heatStatus.running ? '계산 중…' : heatStatus.ms ? `계산 ${Math.round(heatStatus.ms)}ms` : ''}</div>
    <div class="legend" style="background:linear-gradient(90deg,${stops})"></div>
    <div style="position:relative;height:1.4em"><small style="position:absolute;left:0">0</small><small id="tick2" style="position:absolute;left:${(120 / HEAT_MAX_MIN) * 100}%;transform:translateX(-50%);white-space:nowrap">2시간(참고 기준)</small><small style="position:absolute;right:0">${HEAT_MAX_MIN / 60}시간</small></div>
    <small>지표: ${s.view.metric === 'total' ? '누적' : '연속'} · 동지(${HEAT_DATE}) 09~15시 · 격자 ${s.settings.gridSpacing}m · ${s.settings.timeBasis}<br>
    2시간 기준은 제86조③2호(공동주택 동간거리 대체 기준) 표현에서 가져온 참고 기준입니다.</small>`}
    <details open><summary>가정 목록</summary><ol>${ASSUMPTIONS.map((a) => `<li>${a}</li>`).join('')}</ol></details>`;
});
new ResizeObserver(drawPlan).observe(canvas);
render();
