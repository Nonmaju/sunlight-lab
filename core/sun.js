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
  if (basis !== 'KST' && basis !== '진태양시') throw new Error(`알 수 없는 시각 기준: ${basis}`);
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
