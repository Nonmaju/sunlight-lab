// 라이트/다크 테마. 직접 고른 값만 localStorage에 저장하고 OS 설정은 따라가지 않는다(기본 라이트).
// 다크 3D 장면은 두 안(E1: 어두운 바닥+점 테두리, E2: 슬레이트 중간톤)을 비교하려고 ?scene=e1|e2 로 고를 수 있다.
const KEY = 'sunlight-theme';
const listeners = [];

const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const write = (v) => { try { localStorage.setItem(KEY, v); } catch { /* 저장 불가 환경은 무시 */ } };

let name = read() === 'dark' ? 'dark' : 'light';
const sceneKey = () => (new URLSearchParams(location.search).get('scene') === 'e1' ? 'e1' : 'e2');

// Three.js 장면 색(0xRRGGBB) — 조명 때문에 화면색은 지정색과 조금 다르게 보인다.
const SCENES = {
  light: { bg: 0xffffff, ground: 0xf3f0e8, hemi: 0.9, shade: 0.28, mine: 0x3b82c4, neighbor: 0x9aa5b1, ring: null, tag: { 인접대지: 0x2c3e50, '도로·공원 등': 0x2980b9, 적용제외: 0x95a5a6 }, violation: 0xe74c3c, setback: 0x27ae60 },
  e1: { bg: 0x101a26, ground: 0x1b2a3c, hemi: 0.7, shade: 0.5, mine: 0x2f6fb0, neighbor: 0x55667a, ring: 0xdce6f2, tag: { 인접대지: 0xdce6f2, '도로·공원 등': 0x5cb0f0, 적용제외: 0x8a9aad }, violation: 0xff6b5e, setback: 0x4cc38a },
  e2: { bg: 0x4b5b6e, ground: 0x6b7e94, hemi: 0.9, shade: 0.35, mine: 0x5a8cc2, neighbor: 0x8f9eb0, ring: null, tag: { 인접대지: 0xf2f6fa, '도로·공원 등': 0x9fd0ff, 적용제외: 0xc0ccd8 }, violation: 0xff6b5e, setback: 0x7de0ab },
};

// 2D 평면 캔버스 색
const PLANS = {
  light: { tag: { 인접대지: '#2c3e50', '도로·공원 등': '#2980b9', 적용제외: '#95a5a6' }, mine: 'rgba(59,130,196,.45)', neighbor: 'rgba(150,160,170,.5)', stroke: '#34495e', label: '#222', vertex: '#c0392b', north: '#c0392b', drawing: '#e67e22' },
  dark: { tag: { 인접대지: '#dce6f2', '도로·공원 등': '#5cb0f0', 적용제외: '#8a9aad' }, mine: 'rgba(90,150,215,.5)', neighbor: 'rgba(147,163,181,.4)', stroke: '#9fb2c8', label: '#e8eef5', vertex: '#ff6b5e', north: '#ff6b5e', drawing: '#f2b84b' },
};

export const getTheme = () => name;
export const scenePalette = () => (name === 'dark' ? SCENES[sceneKey()] : SCENES.light);
export const planPalette = () => PLANS[name];
export const onTheme = (fn) => listeners.push(fn);

export function setTheme(next, persist = true) {
  name = next === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = name;
  if (persist) write(name);
  document.querySelectorAll('#theme-toggle button').forEach((b) => b.classList.toggle('on', b.dataset.theme === name));
  listeners.forEach((fn) => fn(name));
}

document.querySelectorAll('#theme-toggle button').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.theme)));
setTheme(name, false);
