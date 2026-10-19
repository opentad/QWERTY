// walk.js — походка по реальным пропорциям человека.
// Это кинематика (углы суставов по формулам), а не симуляция мышц:
// длина шага, частота шагов, качание рук, наклон корпуса и «проседание» таза
// считаются от скорости и роста персонажа, поэтому ноги почти не скользят по земле.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const wrapAngle = a => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};
// гладкий «горб» на цикле шага (фаза 0..1, с заворачиванием)
function bump(ph, c, w) {
  let d = ph - c;
  d -= Math.round(d);
  return Math.exp(-0.5 * (d / w) * (d / w));
}

// скорости в метрах в секунду: обычная ходьба и бег трусцой
export const SPEEDS = { walk: 1.4, run: 3.5 };

// углы одной ноги. фаза 0 = пятка касается земли
function legAngles(ph, A, rb) {
  const hip = A * Math.cos(TAU * ph); // сгибание бедра, плюс = нога вперёд
  const kneeW = 0.30 * bump(ph, 0.12, 0.07) + 1.05 * bump(ph, 0.72, 0.11);
  const kneeR = 0.70 * bump(ph, 0.10, 0.08) + 1.75 * bump(ph, 0.72, 0.12);
  const knee = lerp(kneeW, kneeR, rb);
  const extraW = -0.12 * bump(ph, 0.0, 0.05) + 0.35 * bump(ph, 0.58, 0.07) - 0.10 * bump(ph, 0.85, 0.08);
  const extraR = 0.10 * bump(ph, 0.0, 0.06) + 0.50 * bump(ph, 0.55, 0.08) - 0.20 * bump(ph, 0.85, 0.10);
  const extra = lerp(extraW, extraR, rb);
  // знаки подобраны под нормализованный скелет VRM (персонаж смотрит в +z):
  // бедро вперёд = минус по x, колено сгибается плюсом по x,
  // стопа держится ровно относительно земли плюс перекат с пятки на носок
  return { ul: -hip, ll: knee, ft: hip - knee + extra };
}

export function createWalker() {
  const s = {
    x: 0, z: 0, yaw: 0,
    v: 0, phase: 0,
    run: 0, runT: 0,
    weight: 0,
    target: null,
    mode: 'walk',
    height: 1.6,
    moving: false
  };

  function setHeight(h) { if (h > 0.3 && h < 4) s.height = h; }
  function setMode(m) { if (SPEEDS[m]) s.mode = m; }
  function setTarget(x, z) { s.target = { x, z }; }
  function clearTarget() { s.target = null; }
  function reset() {
    s.x = 0; s.z = 0; s.yaw = 0; s.v = 0; s.phase = 0;
    s.weight = 0; s.target = null;
  }

  function update(dt) {
    dt = Math.min(dt, 0.05);
    const L = 0.53 * s.height; // длина ноги от бедра до земли

    // ---- куда идти ----
    let desired = 0;
    if (s.target) {
      const dx = s.target.x - s.x;
      const dz = s.target.z - s.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.1) {
        s.target = null;
      } else {
        const want = Math.atan2(dx, dz);
        const diff = wrapAngle(want - s.yaw);
        const turn = (s.v > 0.3 ? 3.0 : 5.0) * dt;
        s.yaw = wrapAngle(s.yaw + clamp(diff, -turn, turn));
        const facing = Math.abs(wrapAngle(want - s.yaw));
        const vMode = SPEEDS[s.mode];
        if (facing < 0.7) {
          desired = Math.max(0.35, vMode * clamp(dist / (0.7 * vMode), 0, 1));
        }
      }
    }

    // ---- разгон и торможение ----
    const acc = desired > s.v ? 3.5 : 4.5;
    s.v += clamp(desired - s.v, -acc * dt, acc * dt);
    if (desired === 0 && s.v < 0.02) s.v = 0;
    const step = s.v * dt;
    s.x += Math.sin(s.yaw) * step;
    s.z += Math.cos(s.yaw) * step;
    const v = s.v;

    // ---- ходьба или бег (переход около 2 м/с, с гистерезисом) ----
    if (v > 2.3) s.runT = 1;
    else if (v < 1.9) s.runT = 0;
    s.run += (s.runT - s.run) * Math.min(1, dt * 3);
    const rb = s.run;

    // ---- частота шагов и фаза ----
    const fWalk = Math.max(1.0, 0.9 + 0.65 * v);
    const fRun = 2.4 + 0.15 * v;
    const fStep = lerp(fWalk, fRun, rb); // шагов в секунду
    s.phase = (s.phase + fStep * 0.5 * dt) % 1; // полный цикл = два шага

    // вес походки: плавно включается, когда персонаж движется
    const wTarget = v > 0.1 ? 1 : 0;
    s.weight += (wTarget - s.weight) * Math.min(1, dt * 8);
    s.moving = v > 0.05 || !!s.target;

    // ---- амплитуда качания бедра из длины шага ----
    const stepLen = v / fStep;
    const A = clamp(Math.asin(clamp(stepLen / (2 * L), 0, 0.9)), 0, 0.7);

    const ph = s.phase;
    const cL = Math.cos(TAU * ph);
    const left = legAngles(ph, A, rb);
    const right = legAngles(ph + 0.5, A, rb);

    // руки качаются навстречу ногам, локти согнуты сильнее при беге
    const S = clamp(lerp(0.5, 0.75, rb) * A, 0, 0.7);
    const eBase = lerp(0.25, 1.35, rb);
    const eGain = 0.25 * (1 + rb);
    const eL = eBase + eGain * Math.max(0, -cL);
    const eR = eBase + eGain * Math.max(0, cL);

    // таз поворачивается, грудная клетка закручивается в обратную сторону
    const P = 0.25 * A;
    // наклон корпуса вперёд растёт со скоростью бега
    const lean = lerp(0.03 * Math.min(1, v / 1.4), clamp(0.08 + 0.03 * (v - 2), 0.08, 0.25), rb);

    const pose = {
      hips: [0, -P * cL, 0],
      spine: [0.5 * lean, 0.7 * P * cL, 0],
      chest: [0.5 * lean, 0.8 * P * cL, 0],
      head: [-0.6 * lean, 0, 0],
      leftUpperArm: [S * cL, 0, -1.15],
      rightUpperArm: [-S * cL, 0, 1.15],
      leftLowerArm: [0, -eL, 0],
      rightLowerArm: [0, eR, 0],
      leftUpperLeg: [left.ul, 0, 0],
      leftLowerLeg: [left.ll, 0, 0],
      leftFoot: [left.ft, 0, 0],
      rightUpperLeg: [right.ul, 0, 0],
      rightLowerLeg: [right.ll, 0, 0],
      rightFoot: [right.ft, 0, 0]
    };

    // таз опускается, когда ноги разведены, и поднимается над опорной ногой
    const y = -L * (1 - Math.cos(Math.min(1.2, A * Math.abs(cL))));

    return { x: s.x, z: s.z, yaw: s.yaw, y, weight: s.weight, speed: s.v, moving: s.moving, pose };
  }

  return { state: s, setHeight, setMode, setTarget, clearTarget, reset, update };
}
