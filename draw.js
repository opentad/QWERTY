// draw.js — 3D-карандаш: рисует объёмные формы и ставит на них свои суставы.
// Рисуешь на плоскости перед камерой; повернул камеру — рисуешь в другой плоскости.
import * as THREE from 'three';

export function createSketch(o) {
  const { scene, camera, canvas, controls } = o;
  const root = new THREE.Group();
  scene.add(root);

  const state = { color: '#ff2e88', radius: 0.04, depth: 0 };
  const strokes = [];
  const joints = [];            // { key, label, node } — попадают в общий список суставов
  const byKey = new Map();
  const tag = Date.now().toString(36);
  let count = 0, active = false, mode = 'pen', fresh = false;

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane();
  const dir = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const ids = new Set();
  let pts = null, line = null, down = null, multi = false, saved = null;

  function setRay(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }

  // карандаш: один палец рисует, два крутят камеру
  function ctl() {
    const on = active && mode === 'pen';
    if (on && !saved) {
      saved = { one: controls.touches.ONE, two: controls.touches.TWO, l: controls.mouseButtons.LEFT, r: controls.mouseButtons.RIGHT };
      controls.touches.ONE = -1;
      controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
      controls.mouseButtons.LEFT = -1;
      controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    } else if (!on && saved) {
      controls.touches.ONE = saved.one;
      controls.touches.TWO = saved.two;
      controls.mouseButtons.LEFT = saved.l;
      controls.mouseButtons.RIGHT = saved.r;
      saved = null;
    }
  }

  function dropLine() {
    if (!line) return;
    root.remove(line);
    line.geometry.dispose();
    line = null;
  }
  function showLine() {
    dropLine();
    line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: state.color })
    );
    line.frustumCulled = false;
    root.add(line);
  }

  function finish() {
    const g = new THREE.Group();
    g.userData.isStroke = true;
    const mat = new THREE.MeshLambertMaterial({ color: state.color });
    const r = state.radius;
    const ball = p => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mat);
      m.position.copy(p);
      g.add(m);
    };
    ball(pts[0]);
    if (pts.length > 1) {
      const curve = new THREE.CatmullRomCurve3(pts);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, Math.min(200, pts.length * 3), r, 8, false), mat));
      ball(pts[pts.length - 1]);
    }
    root.add(g);
    strokes.push(g);
    pts = null;
    dropLine();
  }

  // сустав в точке нажатия на форму; форма прикрепляется к нему
  function addJoint(e) {
    setRay(e);
    const h = ray.intersectObjects(strokes, true)[0];
    if (!h) return null;
    let st = h.object;
    while (st && !st.userData.isStroke) st = st.parent;
    const par = fresh ? null : byKey.get(o.getSelectedKey());
    fresh = false;
    const parent = par ? par.node : root;
    parent.updateWorldMatrix(true, false);
    const node = new THREE.Object3D();
    node.position.copy(parent.worldToLocal(h.point.clone()));
    parent.add(node);
    node.userData.rest = new THREE.Quaternion();
    if (st) node.attach(st);
    count++;
    const j = { key: 's' + tag + count, label: 'Моя точка ' + count, node };
    joints.push(j);
    byKey.set(j.key, j);
    return j;
  }

  canvas.addEventListener('pointerdown', e => {
    ids.add(e.pointerId);
    if (ids.size > 1) { multi = true; pts = null; dropLine(); down = null; return; }
    if (!active) return;
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (mode === 'pen') {
      camera.getWorldDirection(dir);
      tmp.copy(controls.target).addScaledVector(dir, state.depth);
      plane.setFromNormalAndCoplanarPoint(dir, tmp);
      setRay(e);
      const p = ray.ray.intersectPlane(plane, new THREE.Vector3());
      if (p) { pts = [p]; showLine(); }
    }
  });

  canvas.addEventListener('pointermove', e => {
    if (!pts) return;
    setRay(e);
    const p = ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (p && p.distanceTo(pts[pts.length - 1]) > Math.max(0.01, state.radius * 0.6)) {
      pts.push(p);
      showLine();
    }
  });

  function end(e, cancel) {
    ids.delete(e.pointerId);
    const wasMulti = multi;
    if (ids.size === 0) multi = false;
    const d = down;
    down = null;
    if (pts) {
      if (cancel) { pts = null; dropLine(); } else finish();
      return;
    }
    if (cancel || wasMulti || !active || mode !== 'joint' || !d) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8 || performance.now() - d.t > 400) return;
    const r = canvas.getBoundingClientRect();
    if (o.selectAt(e.clientX - r.left, e.clientY - r.top, r)) return; // нажал на готовый сустав — выбрали его
    const j = addJoint(e);
    if (j) o.onJoint(j);
  }
  canvas.addEventListener('pointerup', e => end(e, false));
  canvas.addEventListener('pointercancel', e => end(e, true));

  function undo() {
    const g = strokes.pop();
    if (!g) return;
    g.parent.remove(g);
    g.traverse(x => { if (x.geometry) x.geometry.dispose(); });
  }

  return {
    state,
    joints,
    setActive(on) {
      active = on;
      if (!on) { pts = null; dropLine(); }
      ctl();
    },
    setMode(m) { mode = m; ctl(); },
    newChain() { fresh = true; },
    undo,
    clear() {
      while (strokes.length) undo();
      joints.forEach(j => j.node.parent && j.node.parent.remove(j.node));
      joints.length = 0;
      byKey.clear();
    }
  };
}
