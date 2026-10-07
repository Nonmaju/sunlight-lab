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
