// picker.js — свой выбор цвета: кольцо оттенков, внутри квадрат
// (слева белый, снизу чёрный) и поля для кодов HEX и RGB.
// Всё рисуется прямо на странице, без системных окон.

const SIZE = 240;
const R = 118;   // внешний радиус кольца
const RI = 96;   // внутренний радиус кольца
const PAD = 5;

function hsv2rgb(h, s, v) {
  const c = v * s;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = x; }
  else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; }
  else { r = c; b = x; }
  const m = v - c;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

const hex2 = n => n.toString(16).padStart(2, '0');
const toHex = (r, g, b) => '#' + hex2(r) + hex2(g) + hex2(b);

function parseHex(str) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(str).trim());
  if (!m) return null;
  let t = m[1];
  if (t.length === 3) t = t.split('').map(c => c + c).join('');
  return [parseInt(t.slice(0, 2), 16), parseInt(t.slice(2, 4), 16), parseInt(t.slice(4, 6), 16)];
}

export function createPicker(host, onChange) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const half = (RI - PAD) / Math.SQRT2;
  const side = half * 2;
  const left = SIZE / 2 - half;
  const top = SIZE / 2 - half;

  let h = 0, s = 1, v = 1;
  let svHue = -1;
  let mode = null;

  const wrap = document.createElement('div');
  wrap.className = 'picker';

  const cv = document.createElement('canvas');
  cv.className = 'picker-cv';
  cv.width = SIZE * dpr;
  cv.height = SIZE * dpr;
  cv.style.width = SIZE + 'px';
  cv.style.height = SIZE + 'px';
  cv.setAttribute('aria-label', 'Цветовой круг');
  const ctx = cv.getContext('2d');

  // кольцо оттенков рисуем один раз
  const ringCv = document.createElement('canvas');
  ringCv.width = SIZE * dpr;
  ringCv.height = SIZE * dpr;
  (function drawRing() {
    const g = ringCv.getContext('2d');
    g.scale(dpr, dpr);
    g.lineWidth = R - RI;
    for (let deg = 0; deg < 360; deg++) {
      g.beginPath();
      g.strokeStyle = 'hsl(' + deg + ',100%,50%)';
      g.arc(SIZE / 2, SIZE / 2, (R + RI) / 2,
        ((deg - 90) * Math.PI) / 180 - 0.012,
        ((deg - 89) * Math.PI) / 180 + 0.012);
      g.stroke();
    }
  })();

  // квадрат насыщенности и яркости перерисовываем при смене оттенка
  const svCv = document.createElement('canvas');
  svCv.width = Math.round(side * dpr);
  svCv.height = Math.round(side * dpr);
  function drawSV() {
    const g = svCv.getContext('2d');
    const w = svCv.width, hh = svCv.height;
    g.fillStyle = 'hsl(' + h + ',100%,50%)';
    g.fillRect(0, 0, w, hh);
    const gx = g.createLinearGradient(0, 0, w, 0);
    gx.addColorStop(0, 'rgba(255,255,255,1)');
    gx.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gx;
    g.fillRect(0, 0, w, hh);
    const gy = g.createLinearGradient(0, 0, 0, hh);
    gy.addColorStop(0, 'rgba(0,0,0,0)');
    gy.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = gy;
    g.fillRect(0, 0, w, hh);
    svHue = h;
  }

  function marker(x, y, fill) {
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }

  function draw() {
    if (svHue !== h) drawSV();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(ringCv, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(svCv, left, top, side, side);
    const a = ((h - 90) * Math.PI) / 180;
    const rm = (R + RI) / 2;
    marker(SIZE / 2 + Math.cos(a) * rm, SIZE / 2 + Math.sin(a) * rm, 'hsl(' + h + ',100%,50%)');
    const [r, g, b] = hsv2rgb(h, s, v);
    marker(left + s * side, top + (1 - v) * side, toHex(r, g, b));
  }

  // поля с кодами
  const row = document.createElement('div');
  row.className = 'pk-row';
  const hexIn = document.createElement('input');
  hexIn.className = 'pk-hex';
  hexIn.type = 'text';
  hexIn.maxLength = 7;
  hexIn.spellcheck = false;
  hexIn.autocomplete = 'off';
  hexIn.placeholder = '#RRGGBB';
  hexIn.setAttribute('aria-label', 'Код цвета HEX');
  const nums = ['R', 'G', 'B'].map(name => {
    const n = document.createElement('input');
    n.className = 'pk-n';
    n.type = 'number';
    n.min = 0; n.max = 255; n.step = 1;
    n.inputMode = 'numeric';
    n.setAttribute('aria-label', 'Канал ' + name);
    n.placeholder = name;
    return n;
  });
  row.append(hexIn, ...nums);
  wrap.append(cv, row);
  host.appendChild(wrap);

  function writeInputs(skipHex) {
    const [r, g, b] = hsv2rgb(h, s, v);
    if (!skipHex) hexIn.value = toHex(r, g, b);
    nums[0].value = r; nums[1].value = g; nums[2].value = b;
  }

  function emit() {
    const [r, g, b] = hsv2rgb(h, s, v);
    if (onChange) onChange(toHex(r, g, b));
  }

  function setRGB(r, g, bl) {
    const [h2, s2, v2] = rgb2hsv(r, g, bl);
    if (s2 > 0 && v2 > 0) h = h2;
    s = s2;
    v = v2;
  }

  // касания
  function pos(e) {
    const rect = cv.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * SIZE) / rect.width,
      y: ((e.clientY - rect.top) * SIZE) / rect.height
    };
  }
  function apply(e) {
    const p = pos(e);
    if (mode === 'hue') {
      const dx = p.x - SIZE / 2, dy = p.y - SIZE / 2;
      h = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    } else if (mode === 'sv') {
      s = Math.max(0, Math.min(1, (p.x - left) / side));
      v = 1 - Math.max(0, Math.min(1, (p.y - top) / side));
    }
    draw();
    writeInputs(false);
    emit();
  }
  cv.addEventListener('pointerdown', e => {
    const p = pos(e);
    const d = Math.hypot(p.x - SIZE / 2, p.y - SIZE / 2);
    const tol = 6;
    if (d >= RI - 3 && d <= R + 4) mode = 'hue';
    else if (p.x >= left - tol && p.x <= left + side + tol && p.y >= top - tol && p.y <= top + side + tol) mode = 'sv';
    else return;
    cv.setPointerCapture(e.pointerId);
    e.preventDefault();
    apply(e);
  });
  cv.addEventListener('pointermove', e => { if (mode) apply(e); });
  const end = () => { mode = null; };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);

  hexIn.addEventListener('input', () => {
    const rgb = parseHex(hexIn.value);
    if (!rgb) return;
    setRGB(rgb[0], rgb[1], rgb[2]);
    draw();
    writeInputs(true);
    emit();
  });
  nums.forEach(n => n.addEventListener('input', () => {
    const vals = nums.map(x => Number(x.value));
    if (nums.some(x => x.value === '') || vals.some(x => !(x >= 0 && x <= 255))) return;
    setRGB(Math.round(vals[0]), Math.round(vals[1]), Math.round(vals[2]));
    draw();
    const [r, g, b] = hsv2rgb(h, s, v);
    hexIn.value = toHex(r, g, b);
    emit();
  }));

  draw();
  writeInputs(false);

  return {
    // задать цвет снаружи, без вызова onChange
    set(hex) {
      const rgb = parseHex(hex);
      if (!rgb) return;
      setRGB(rgb[0], rgb[1], rgb[2]);
      draw();
      writeInputs(false);
    }
  };
}
