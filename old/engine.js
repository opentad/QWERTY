/* =====================================================================
   MiniEngine 1.0 — универсальный 2D-движок в одном файле (engine.js)

   Что внутри:
   - Engine       цикл игры, масштаб под экран, сцены, плавные переходы
   - Input        палец (джойстик + кнопки A/B), мышь, клавиатура
   - Scene/World  сцены, объекты (Entity), столкновения, частицы
   - Camera       слежение, границы уровня, тряска
   - loadTilemap  уровни из текстовых карт
   - Levels       список уровней + прогресс
   - Save         сохранения: на устройстве + Supabase (по желанию)
   - UI           кнопки и надписи на холсте, MenuScene, LevelSelectScene
   - Sfx          простые звуки без файлов
   ===================================================================== */
(function (global) {
  'use strict';

  /* ---------------------------------------------------------------
     Мелкие помощники
     --------------------------------------------------------------- */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const EPS = 0.001;
  const FONT = 'system-ui, -apple-system, Roboto, "Segoe UI", sans-serif';

  function drawText(ctx, str, x, y, o) {
    o = o || {};
    ctx.font = (o.bold ? '700 ' : '400 ') + (o.size || 20) + 'px ' + FONT;
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.baseline || 'middle';
    ctx.fillStyle = o.color || '#ffffff';
    ctx.fillText(String(str), x, y);
  }

  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Пересечение двух объектов (учитывает круги)
  function overlap(a, b) {
    const ac = a.shape === 'circle';
    const bc = b.shape === 'circle';
    if (!ac && !bc) {
      return a.x + EPS < b.x + b.w && a.x + a.w - EPS > b.x &&
             a.y + EPS < b.y + b.h && a.y + a.h - EPS > b.y;
    }
    if (ac && bc) {
      const dx = (a.x + a.w / 2) - (b.x + b.w / 2);
      const dy = (a.y + a.h / 2) - (b.y + b.h / 2);
      const r = a.w / 2 + b.w / 2;
      return dx * dx + dy * dy < r * r;
    }
    const c = ac ? a : b;
    const r = ac ? b : a;
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    const nx = clamp(cx, r.x, r.x + r.w);
    const ny = clamp(cy, r.y, r.y + r.h);
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy < (c.w / 2) * (c.w / 2);
  }

  /* ---------------------------------------------------------------
     Звуки (без файлов)
     --------------------------------------------------------------- */
  class Sfx {
    constructor() { this.ctx = null; this.on = true; }
    unlock() {
      try {
        if (!this.ctx) {
          const AC = global.AudioContext || global.webkitAudioContext;
          if (AC) this.ctx = new AC();
        }
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) { /* звук не критичен */ }
    }
    beep(freq, dur, type, vol, slide) {
      if (!this.on || !this.ctx) return;
      try {
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = type || 'square';
        osc.frequency.setValueAtTime(freq, t);
        if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, t + dur);
        g.gain.setValueAtTime(vol || 0.05, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      } catch (e) { /* звук не критичен */ }
    }
    play(name) {
      switch (name) {
        case 'coin': this.beep(880, 0.09, 'square', 0.04, 420); break;
        case 'jump': this.beep(300, 0.13, 'square', 0.04, 260); break;
        case 'hit': this.beep(180, 0.22, 'sawtooth', 0.06, -110); break;
        case 'click': this.beep(520, 0.05, 'triangle', 0.05, 0); break;
        case 'win':
          this.beep(523, 0.12, 'square', 0.05, 0);
          setTimeout(() => this.beep(659, 0.12, 'square', 0.05, 0), 120);
          setTimeout(() => this.beep(784, 0.2, 'square', 0.05, 0), 240);
          break;
        default: this.beep(440, 0.08, 'square', 0.04, 0);
      }
    }
  }

  /* ---------------------------------------------------------------
     Картинки
     --------------------------------------------------------------- */
  class Assets {
    constructor() { this.img = {}; }
    loadImages(map) {
      return Promise.all(Object.keys(map).map(k => new Promise(res => {
        const im = new Image();
        im.onload = () => { this.img[k] = im; res(); };
        im.onerror = () => res();
        im.src = map[k];
      })));
    }
    image(k) { return this.img[k]; }
  }

  /* ---------------------------------------------------------------
     Сохранения: на устройстве + Supabase (необязательно)
     Таблица в Supabase: game_saves (id text primary key, data jsonb,
     updated_at timestamptz). SQL — в инструкции.
     --------------------------------------------------------------- */
  class Save {
    constructor(o) {
      o = o || {};
      this.ns = o.namespace || 'miniengine';
      this.url = String(o.supabaseUrl || '').replace(/\/$/, '');
      this.key = o.supabaseKey || '';
      this.table = o.table || 'game_saves';
      this.data = {};
      this.lastError = '';
      this.status = this.cloud ? 'облако…' : 'на устройстве';
      this.playerId = this._pid();
      this._timer = null;
      this._load();
    }
    get cloud() { return !!(this.url && this.key); }
    _pid() {
      try {
        let p = localStorage.getItem(this.ns + ':pid');
        if (!p) {
          p = 'p-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
          localStorage.setItem(this.ns + ':pid', p);
        }
        return p;
      } catch (e) { return 'p-temp'; }
    }
    _load() {
      try {
        const s = localStorage.getItem(this.ns + ':data');
        if (s) this.data = JSON.parse(s) || {};
      } catch (e) { this.data = {}; }
    }
    _store() {
      try { localStorage.setItem(this.ns + ':data', JSON.stringify(this.data)); } catch (e) { /* ignore */ }
    }
    get(k, def) {
      return Object.prototype.hasOwnProperty.call(this.data, k) ? this.data[k] : def;
    }
    set(k, v) {
      this.data[k] = v;
      this.data._t = Date.now();
      this._store();
      this._schedulePush();
    }
    reset() {
      this.data = { _t: Date.now() };
      this._store();
      this._schedulePush();
    }
    _schedulePush() {
      if (!this.cloud) return;
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this.push(), 800);
    }
    _headers() {
      return { apikey: this.key, Authorization: 'Bearer ' + this.key, 'Content-Type': 'application/json' };
    }
    async push() {
      if (!this.cloud) return false;
      try {
        const h = this._headers();
        h.Prefer = 'resolution=merge-duplicates,return=minimal';
        const r = await fetch(this.url + '/rest/v1/' + this.table + '?on_conflict=id', {
          method: 'POST',
          headers: h,
          body: JSON.stringify({ id: this.playerId, data: this.data, updated_at: new Date().toISOString() })
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        this.status = 'облако ✓';
        return true;
      } catch (e) {
        this.status = 'облако ✗';
        this.lastError = String((e && e.message) || e);
        return false;
      }
    }
    async pull() {
      if (!this.cloud) return false;
      try {
        const r = await fetch(this.url + '/rest/v1/' + this.table + '?id=eq.' + encodeURIComponent(this.playerId) + '&select=data', {
          headers: this._headers()
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const rows = await r.json();
        if (rows && rows.length && rows[0].data) {
          const remote = rows[0].data;
          if ((remote._t || 0) > (this.data._t || 0)) {
            this.data = remote;
            this._store();
          } else if ((remote._t || 0) < (this.data._t || 0)) {
            await this.push();
          }
        } else if (Object.keys(this.data).length) {
          await this.push();
        }
        this.status = 'облако ✓';
        return true;
      } catch (e) {
        this.status = 'облако ✗';
        this.lastError = String((e && e.message) || e);
        return false;
      }
    }
    sync() { return this.pull(); }
  }

  /* ---------------------------------------------------------------
     Ввод: палец, мышь, клавиатура
     Действия: axisX / axisY (-1..1), кнопки 'A', 'B', 'up'
     --------------------------------------------------------------- */
  class Input {
    constructor(engine) {
      this.e = engine;
      this.keys = {};
      this.pointers = new Map();
      this.taps = [];
      this.axisX = 0;
      this.axisY = 0;
      this.cur = { A: false, B: false, up: false };
      this.prev = { A: false, B: false, up: false };
      this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0, R: 56 };
      this.btn = {
        A: { id: null, x: engine.W - 72, y: engine.H - 88, r: 40 },
        B: { id: null, x: engine.W - 166, y: engine.H - 54, r: 34 }
      };
      this.coarse = !!(global.matchMedia && global.matchMedia('(pointer: coarse)').matches);
      this.touchUsed = false;

      const c = engine.canvas;
      c.addEventListener('pointerdown', ev => this._down(ev));
      c.addEventListener('pointermove', ev => this._move(ev));
      c.addEventListener('pointerup', ev => this._up(ev, false));
      c.addEventListener('pointercancel', ev => this._up(ev, true));
      c.addEventListener('contextmenu', ev => ev.preventDefault());
      global.addEventListener('keydown', ev => this._key(ev, true));
      global.addEventListener('keyup', ev => this._key(ev, false));
      global.addEventListener('blur', () => { this.keys = {}; });
    }

    _cfg() {
      const s = this.e.scene;
      if (!s || !s.controls) return null;
      return s.controls === true ? { stick: true, buttons: ['A'] } : s.controls;
    }
    get showControls() { return !!this._cfg() && (this.coarse || this.touchUsed); }

    _pos(ev) {
      const r = this.e.canvas.getBoundingClientRect();
      return {
        x: (ev.clientX - r.left) * this.e.W / r.width,
        y: (ev.clientY - r.top) * this.e.H / r.height
      };
    }

    _down(ev) {
      ev.preventDefault();
      try { this.e.canvas.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      this.e.audio.unlock();
      const q = this._pos(ev);
      const p = { id: ev.pointerId, x: q.x, y: q.y, sx: q.x, sy: q.y, role: null };
      if (ev.pointerType !== 'mouse') this.touchUsed = true;
      if (this.showControls) {
        const cfg = this._cfg();
        const names = cfg.buttons || ['A'];
        for (const k of names) {
          const b = this.btn[k];
          if (!b || b.id !== null || p.role) continue;
          const dx = q.x - b.x;
          const dy = q.y - b.y;
          if (Math.hypot(dx, dy) <= b.r * 1.3) { b.id = ev.pointerId; p.role = 'btn' + k; }
        }
        if (!p.role && cfg.stick !== false && this.stick.id === null && q.x < this.e.W * 0.5) {
          const s = this.stick;
          s.id = ev.pointerId; s.ox = q.x; s.oy = q.y; s.x = q.x; s.y = q.y;
          p.role = 'stick';
        }
      }
      this.pointers.set(ev.pointerId, p);
    }

    _move(ev) {
      const p = this.pointers.get(ev.pointerId);
      if (!p) return;
      ev.preventDefault();
      const q = this._pos(ev);
      p.x = q.x; p.y = q.y;
      if (p.role === 'stick' && this.stick.id === ev.pointerId) {
        this.stick.x = q.x; this.stick.y = q.y;
      }
    }

    _up(ev, cancel) {
      ev.preventDefault();
      const p = this.pointers.get(ev.pointerId);
      if (!p) return;
      const q = this._pos(ev);
      p.x = q.x; p.y = q.y;
      if (p.role === 'stick' && this.stick.id === ev.pointerId) {
        this.stick.id = null;
      } else if (p.role && p.role.indexOf('btn') === 0) {
        const b = this.btn[p.role.slice(3)];
        if (b && b.id === ev.pointerId) b.id = null;
      }
      if (!cancel) this.taps.push({ x: p.x, y: p.y, sx: p.sx, sy: p.sy });
      this.pointers.delete(ev.pointerId);
    }

    _key(ev, down) {
      this.keys[ev.code] = down;
      if (/^(Arrow|Space)/.test(ev.code)) ev.preventDefault();
      if (down) this.e.audio.unlock();
    }

    resetControls() {
      this.stick.id = null;
      this.btn.A.id = null;
      this.btn.B.id = null;
      this.pointers.forEach(p => { p.role = null; });
    }

    begin() {
      const k = this.keys;
      let ax = 0;
      let ay = 0;
      if (k.ArrowLeft || k.KeyA) ax -= 1;
      if (k.ArrowRight || k.KeyD) ax += 1;
      if (k.ArrowUp || k.KeyW) ay -= 1;
      if (k.ArrowDown || k.KeyS) ay += 1;
      const st = this.stick;
      if (st.id !== null) {
        const dx = st.x - st.ox;
        const dy = st.y - st.oy;
        const len = Math.hypot(dx, dy);
        if (len > 0) {
          const m = Math.min(len, st.R) / st.R;
          if (m > 0.2) { ax += dx / len * m; ay += dy / len * m; }
        }
      }
      this.axisX = clamp(ax, -1, 1);
      this.axisY = clamp(ay, -1, 1);
      this.prev.A = this.cur.A;
      this.prev.B = this.cur.B;
      this.prev.up = this.cur.up;
      this.cur.A = !!(k.Space || k.KeyZ || k.KeyJ) || this.btn.A.id !== null;
      this.cur.B = !!(k.KeyX || k.KeyK || k.ShiftLeft) || this.btn.B.id !== null;
      this.cur.up = this.axisY < -0.6;
    }

    end() { this.taps.length = 0; }

    down(n) { return !!this.cur[n]; }
    pressed(n) { return !!this.cur[n] && !this.prev[n]; }
    released(n) { return !this.cur[n] && !!this.prev[n]; }

    drawControls(ctx) {
      const cfg = this._cfg();
      if (!cfg || !(this.coarse || this.touchUsed)) return;
      ctx.save();
      if (cfg.stick !== false) {
        const st = this.stick;
        const active = st.id !== null;
        const ox = active ? st.ox : 110;
        const oy = active ? st.oy : this.e.H - 110;
        let kx = ox;
        let ky = oy;
        if (active) {
          const dx = st.x - st.ox;
          const dy = st.y - st.oy;
          const len = Math.hypot(dx, dy) || 1;
          const m = Math.min(len, st.R);
          kx = ox + dx / len * m;
          ky = oy + dy / len * m;
        }
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ox, oy, st.R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = active ? 0.5 : 0.25;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(kx, ky, 24, 0, Math.PI * 2);
        ctx.fill();
      }
      const names = cfg.buttons || ['A'];
      for (const n of names) {
        const b = this.btn[n];
        if (!b) continue;
        ctx.globalAlpha = b.id !== null ? 0.55 : 0.28;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.9;
        drawText(ctx, n, b.x, b.y, { size: 24, bold: true, align: 'center', color: '#10131f' });
      }
      ctx.restore();
    }
  }

  /* ---------------------------------------------------------------
     Entity — любой объект в игре
     x, y, w, h — рамка. shape: 'rect' | 'circle'
     solid     — преграда для других
     static    — не двигается
     collides  — упирается в solid-объекты
     gravity   — падение (px/сек²)
     tags      — метки для поиска и логики
     Можно задать свои update(dt, world), onTouch(other, world), draw(ctx)
     --------------------------------------------------------------- */
  class Entity {
    constructor(o) {
      this.x = 0; this.y = 0; this.w = 32; this.h = 32;
      this.vx = 0; this.vy = 0;
      this.shape = 'rect';
      this.color = '#ffffff';
      this.radius = 0;
      this.solid = false;
      this.static = false;
      this.collides = false;
      this.gravity = 0;
      this.maxFall = 0;
      this.bounceX = 0;
      this.bounceY = 0;
      this.tags = [];
      this.z = 0;
      this.visible = true;
      this.active = true;
      this.dead = false;
      this.sprite = null;
      this.blocked = { l: false, r: false, u: false, d: false };
      Object.assign(this, o || {});
    }
    get cx() { return this.x + this.w / 2; }
    get cy() { return this.y + this.h / 2; }
    get grounded() { return this.blocked.d; }
    hasTag(t) { return this.tags.indexOf(t) >= 0; }
    kill() { this.dead = true; }
    draw(ctx) {
      if (this.sprite) { ctx.drawImage(this.sprite, this.x, this.y, this.w, this.h); return; }
      ctx.fillStyle = this.color;
      if (this.shape === 'circle') {
        ctx.beginPath();
        ctx.ellipse(this.cx, this.cy, this.w / 2, this.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (this.radius) {
        rrect(ctx, this.x, this.y, this.w, this.h, this.radius);
        ctx.fill();
      } else {
        ctx.fillRect(this.x, this.y, this.w, this.h);
      }
    }
  }

  /* ---------------------------------------------------------------
     World — все объекты сцены, физика, частицы
     --------------------------------------------------------------- */
  class World {
    constructor(scene) {
      this.scene = scene;
      this.entities = [];
      this.particles = [];
      this.time = 0;
      this._sort = false;
    }
    add(e) {
      if (!(e instanceof Entity)) e = new Entity(e);
      this.entities.push(e);
      if (e.z) this._sort = true;
      return e;
    }
    clear() { this.entities = []; this.particles = []; }
    withTag(t) { return this.entities.filter(e => !e.dead && e.tags.indexOf(t) >= 0); }
    first(t) {
      for (const e of this.entities) if (!e.dead && e.tags.indexOf(t) >= 0) return e;
      return null;
    }
    solidAt(px, py) {
      for (const s of this.entities) {
        if (s.solid && !s.dead && s.active && px >= s.x && px <= s.x + s.w && py >= s.y && py <= s.y + s.h) return s;
      }
      return null;
    }
    burst(x, y, color, n, speed) {
      n = n || 10;
      speed = speed || 180;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = speed * (0.4 + Math.random() * 0.6);
        const life = 0.5 + Math.random() * 0.3;
        this.particles.push({
          x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60,
          life: life, max: life, color: color || '#ffffff', size: 2 + Math.random() * 3
        });
      }
    }

    update(dt) {
      this.time += dt;
      const list = this.entities;

      // 1. логика объектов
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead || !e.active) continue;
        if (e.update) e.update(dt, this);
      }

      // 2. движение и столкновения со стенами
      const solids = list.filter(s => s.solid && !s.dead && s.active);
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead || !e.active || e.static) continue;
        const b = e.blocked;
        b.l = b.r = b.u = b.d = false;
        if (e.gravity) {
          e.vy += e.gravity * dt;
          if (e.maxFall && e.vy > e.maxFall) e.vy = e.maxFall;
        }
        e.x += e.vx * dt;
        if (e.collides) {
          for (let j = 0; j < solids.length; j++) {
            const s = solids[j];
            if (s === e || !overlap({ x: e.x, y: e.y, w: e.w, h: e.h }, s)) continue;
            if (e.vx > 0) { e.x = s.x - e.w; b.r = true; e.vx = e.bounceX ? -e.vx * e.bounceX : 0; }
            else if (e.vx < 0) { e.x = s.x + s.w; b.l = true; e.vx = e.bounceX ? -e.vx * e.bounceX : 0; }
          }
        }
        e.y += e.vy * dt;
        if (e.collides) {
          for (let j = 0; j < solids.length; j++) {
            const s = solids[j];
            if (s === e || !overlap({ x: e.x, y: e.y, w: e.w, h: e.h }, s)) continue;
            if (e.vy > 0) { e.y = s.y - e.h; b.d = true; e.vy = e.bounceY ? -e.vy * e.bounceY : 0; }
            else if (e.vy < 0) { e.y = s.y + s.h; b.u = true; e.vy = e.bounceY ? -e.vy * e.bounceY : 0; }
          }
        }
      }

      // 3. касания (вызывается onTouch у того, кто его имеет)
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (a.dead || !a.active || !a.onTouch) continue;
        for (let j = 0; j < list.length; j++) {
          const o = list[j];
          if (o === a || o.dead || !o.active) continue;
          if (overlap(a, o)) {
            a.onTouch(o, this);
            if (a.dead || !a.active) break;
          }
        }
      }

      // 4. частицы
      const ps = this.particles;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life -= dt;
        if (p.life <= 0) { ps.splice(i, 1); continue; }
        p.vy += 500 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      // 5. уборка
      let anyDead = false;
      for (let i = 0; i < list.length; i++) if (list[i].dead) { anyDead = true; break; }
      if (anyDead) this.entities = list.filter(e => !e.dead);
    }

    draw(ctx, cam) {
      if (this._sort) {
        this.entities.sort((a, b) => (a.z || 0) - (b.z || 0));
        this._sort = false;
      }
      const vx = cam.x - 40;
      const vy = cam.y - 40;
      const vw = cam.e.W + 80;
      const vh = cam.e.H + 80;
      for (const e of this.entities) {
        if (e.dead || !e.visible) continue;
        if (e.x > vx + vw || e.x + e.w < vx || e.y > vy + vh || e.y + e.h < vy) continue;
        e.draw(ctx);
      }
      for (const p of this.particles) {
        ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ---------------------------------------------------------------
     Camera
     --------------------------------------------------------------- */
  class Camera {
    constructor(engine) {
      this.e = engine;
      this.x = 0; this.y = 0;
      this.target = null;
      this.smooth = 8;
      this.bounds = null; // { x, y, w, h }
      this.sx = 0; this.sy = 0;
      this.shakeT = 0; this.shakeDur = 0; this.shakeA = 0;
    }
    follow(target, smooth) {
      this.target = target;
      if (smooth !== undefined) this.smooth = smooth;
      this.snap();
    }
    _desired() {
      const t = this.target;
      let tx = t.x + t.w / 2 - this.e.W / 2;
      let ty = t.y + t.h / 2 - this.e.H / 2;
      const b = this.bounds;
      if (b) {
        tx = b.w > this.e.W ? clamp(tx, b.x, b.x + b.w - this.e.W) : b.x + (b.w - this.e.W) / 2;
        ty = b.h > this.e.H ? clamp(ty, b.y, b.y + b.h - this.e.H) : b.y + (b.h - this.e.H) / 2;
      }
      return { x: tx, y: ty };
    }
    snap() {
      if (!this.target) return;
      const d = this._desired();
      this.x = d.x; this.y = d.y;
    }
    shake(amount, time) {
      this.shakeA = amount || 6;
      this.shakeDur = time || 0.25;
      this.shakeT = this.shakeDur;
    }
    update(dt) {
      if (this.target) {
        const d = this._desired();
        const k = 1 - Math.exp(-this.smooth * dt);
        this.x += (d.x - this.x) * k;
        this.y += (d.y - this.y) * k;
      }
      if (this.shakeT > 0) {
        this.shakeT -= dt;
        const f = Math.max(0, this.shakeT / this.shakeDur) * this.shakeA;
        this.sx = (Math.random() * 2 - 1) * f;
        this.sy = (Math.random() * 2 - 1) * f;
      } else { this.sx = 0; this.sy = 0; }
    }
    apply(ctx) {
      ctx.translate(-Math.round(this.x + this.sx), -Math.round(this.y + this.sy));
    }
  }

  /* ---------------------------------------------------------------
     Scene — одна «страница» игры: меню, уровень, экран победы...
     Переопредели enter(params), update(dt), draw(ctx), drawBack(ctx), exit()
     --------------------------------------------------------------- */
  class Scene {
    constructor() {
      this.engine = null;
      this.name = '';
      this.world = null;
      this.camera = null;
      this.ui = [];
      this.timers = [];
      this.controls = false; // true | { stick:true, buttons:['A','B'] }
      this.bg = null;
    }
    _attach(engine) { this.engine = engine; this._reset(); }
    _reset() {
      this.world = new World(this);
      this.camera = new Camera(this.engine);
      this.ui = [];
      this.timers = [];
      this.controls = false;
    }
    add(e) { return this.world.add(e); }
    addUI(u) { this.ui.push(u); return u; }
    after(sec, fn) { this.timers.push({ t: sec, fn: fn }); }
    enter(params) {}
    exit() {}
    update(dt) {}
    drawBack(ctx) {}
    draw(ctx) {}
  }

  /* ---------------------------------------------------------------
     UI на холсте
     --------------------------------------------------------------- */
  class UIButton {
    constructor(o) {
      Object.assign(this, {
        x: 0, y: 0, w: 220, h: 56, text: '', size: 22,
        color: '#4b5bd8', textColor: '#ffffff',
        onTap: null, disabled: false, visible: true, hover: false
      }, o || {});
    }
    get label() { return typeof this.text === 'function' ? this.text() : this.text; }
    contains(px, py) { return px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h; }
    update(input) {
      this.hover = false;
      if (!this.visible || this.disabled) return;
      input.pointers.forEach(p => {
        if (this.contains(p.x, p.y) && this.contains(p.sx, p.sy)) this.hover = true;
      });
      for (const t of input.taps) {
        if (this.contains(t.sx, t.sy) && this.contains(t.x, t.y)) {
          input.e.audio.play('click');
          if (this.onTap) this.onTap(input.e, this);
          break;
        }
      }
    }
    draw(ctx) {
      if (!this.visible) return;
      const dy = this.hover ? 2 : 0;
      ctx.save();
      if (this.disabled) ctx.globalAlpha = 0.4;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      rrect(ctx, this.x, this.y + 3, this.w, this.h, 12);
      ctx.fill();
      ctx.fillStyle = this.color;
      rrect(ctx, this.x, this.y + dy, this.w, this.h, 12);
      ctx.fill();
      if (this.hover) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fill();
      }
      drawText(ctx, this.label, this.x + this.w / 2, this.y + this.h / 2 + dy, {
        size: this.size, align: 'center', color: this.textColor, bold: true
      });
      ctx.restore();
    }
  }

  class UILabel {
    constructor(o) {
      Object.assign(this, {
        x: 0, y: 0, text: '', size: 20, color: '#ffffff', align: 'center', bold: false, visible: true
      }, o || {});
    }
    update() {}
    draw(ctx) {
      if (!this.visible) return;
      const t = typeof this.text === 'function' ? this.text() : this.text;
      drawText(ctx, t, this.x, this.y, { size: this.size, color: this.color, align: this.align, bold: this.bold });
    }
  }

  class LevelCell extends UIButton {
    draw(ctx) {
      const L = this.levels;
      const i = this.index;
      const open = L.isUnlocked(i);
      const best = L.best(i);
      this.color = !open ? '#2a2d45' : (best ? '#2f8f5b' : '#4b5bd8');
      super.draw(ctx);
      const cx = this.x + this.w / 2;
      ctx.save();
      if (!open) ctx.globalAlpha = 0.5;
      drawText(ctx, String(i + 1), cx, this.y + 32, { size: 32, bold: true, align: 'center' });
      let sub = '🔒';
      if (open) sub = best ? '★ ' + best.score + '/' + (this.level.total || '?') : 'играть';
      drawText(ctx, sub, cx, this.y + 66, { size: 16, align: 'center', color: '#e6e9ff' });
      ctx.restore();
    }
  }

  /* ---------------------------------------------------------------
     Готовые сцены: меню и выбор уровня
     --------------------------------------------------------------- */
  class MenuScene extends Scene {
    constructor(o) {
      super();
      this.o = Object.assign({ title: 'Игра', subtitle: '', hint: '', buttons: [] }, o || {});
    }
    enter() {
      const W = this.engine.W;
      const H = this.engine.H;
      const o = this.o;
      this.addUI(new UILabel({ x: W / 2, y: H * 0.17, text: o.title, size: 46, bold: true }));
      if (o.subtitle) this.addUI(new UILabel({ x: W / 2, y: H * 0.17 + 44, text: o.subtitle, size: 20, color: '#aab0d0' }));
      const bw = 300;
      const bh = 54;
      const gap = 14;
      let y = H * 0.40;
      for (const b of o.buttons) {
        this.addUI(new UIButton(Object.assign({ x: (W - bw) / 2, y: y, w: bw, h: bh }, b)));
        y += bh + gap;
      }
      if (o.hint) this.addUI(new UILabel({ x: W / 2, y: H - 22, text: o.hint, size: 15, color: '#8a90b0' }));
    }
  }

  class LevelSelectScene extends Scene {
    constructor(o) {
      super();
      this.o = Object.assign({ title: 'Выбор уровня', back: 'menu', perRow: 5 }, o || {});
    }
    enter() {
      const E = this.engine;
      const W = E.W;
      const o = this.o;
      const L = E.levels;
      this.addUI(new UILabel({ x: W / 2, y: 44, text: o.title, size: 30, bold: true }));
      this.addUI(new UIButton({
        x: 14, y: 14, w: 110, h: 40, size: 17, text: '← Меню', color: '#3a3f6b',
        onTap: e => e.go(o.back)
      }));
      const cw = 120;
      const ch = 88;
      const gap = 16;
      const per = o.perRow;
      const x0 = (W - (per * cw + (per - 1) * gap)) / 2;
      const y0 = 100;
      L.list.forEach((lv, i) => {
        const r = Math.floor(i / per);
        const c = i % per;
        this.addUI(new LevelCell({
          x: x0 + c * (cw + gap), y: y0 + r * (ch + gap), w: cw, h: ch,
          index: i, level: lv, levels: L, disabled: !L.isUnlocked(i),
          onTap: () => { if (L.isUnlocked(i)) L.start(i); }
        }));
      });
    }
  }

  /* ---------------------------------------------------------------
     Уровни из текстовых карт
     rows   — массив строк. '.' или пробел — пусто.
     legend — { символ: (x, y, w, h, world, col, row) => объект }
     Одинаковые символы из opts.merge (по умолчанию '#') в одной строке
     склеиваются в один широкий блок. Строки выравниваются по длине.
     opts.border — стены слева, справа и сверху (по умолчанию да).
     --------------------------------------------------------------- */
  function loadTilemap(world, rows, ts, legend, opts) {
    opts = opts || {};
    const merge = opts.merge || '#';
    let cols = 0;
    for (const r of rows) cols = Math.max(cols, r.length);
    const R = rows.length;
    for (let r = 0; r < R; r++) {
      const line = rows[r] + '.'.repeat(cols - rows[r].length);
      let c = 0;
      while (c < cols) {
        const ch = line[c];
        if (ch === '.' || ch === ' ') { c++; continue; }
        let run = 1;
        if (merge.indexOf(ch) >= 0) while (c + run < cols && line[c + run] === ch) run++;
        const f = legend[ch];
        if (f) f(c * ts, r * ts, run * ts, ts, world, c, r);
        c += run;
      }
    }
    const info = { cols: cols, rows: R, width: cols * ts, height: R * ts, ts: ts };
    const wall = legend[merge[0]];
    if (opts.border !== false && wall) {
      wall(-ts, -ts, ts, info.height + ts, world);
      wall(info.width, -ts, ts, info.height + ts, world);
      wall(-ts, -ts, info.width + ts * 2, ts, world);
    }
    return info;
  }

  /* ---------------------------------------------------------------
     Levels — список уровней и прогресс (хранится через Save)
     --------------------------------------------------------------- */
  class Levels {
    constructor(engine, o) {
      o = o || {};
      this.e = engine;
      this.list = [];
      this.sceneName = o.scene || 'game';
      this.key = o.key || 'levels';
    }
    define(arr) { this.list = arr; return this; }
    get count() { return this.list.length; }
    _st() {
      const s = this.e.save.get(this.key, null);
      return s && typeof s === 'object' ? s : { unlocked: 1, best: {} };
    }
    unlocked() { return Math.min(this._st().unlocked || 1, this.list.length); }
    isUnlocked(i) { return i < this.unlocked(); }
    best(i) { return (this._st().best || {})[i] || null; }
    start(i) { this.e.go(this.sceneName, { level: i }); }
    // Записать прохождение. Возвращает номер следующего уровня или -1.
    complete(i, result) {
      result = result || {};
      const st = JSON.parse(JSON.stringify(this._st()));
      st.best = st.best || {};
      st.unlocked = Math.max(st.unlocked || 1, i + 2);
      const b = st.best[i] || {};
      st.best[i] = {
        score: Math.max(b.score || 0, result.score || 0),
        time: b.time ? Math.min(b.time, result.time || b.time) : (result.time || 0)
      };
      this.e.save.set(this.key, st);
      return i + 1 < this.list.length ? i + 1 : -1;
    }
  }

  /* ---------------------------------------------------------------
     Engine
     --------------------------------------------------------------- */
  class Engine {
    constructor(o) {
      o = o || {};
      this.W = o.width || 800;
      this.H = o.height || 450;
      this.bg = o.background || '#171826';
      this.debug = !!o.debug;
      this.canvas = o.canvas || document.createElement('canvas');
      if (!o.canvas) document.body.appendChild(this.canvas);
      this.canvas.style.position = 'absolute';
      this.canvas.style.touchAction = 'none';
      this.ctx = this.canvas.getContext('2d');
      this.scenes = {};
      this.scene = null;
      this.time = 0;
      this.fade = 0;
      this.fps = 60;
      this.running = false;
      this.crashed = false;
      this._next = null;
      this._scale = 1;
      this.audio = new Sfx();
      this.assets = new Assets();
      this.save = new Save(o.save || {});
      this.levels = new Levels(this, o.levels || {});
      this.input = new Input(this);
      this._resize = this._resize.bind(this);
      global.addEventListener('resize', this._resize);
      global.addEventListener('orientationchange', this._resize);
      this._resize();
    }

    text(ctx, str, x, y, o) { drawText(ctx, str, x, y, o); }

    _resize() {
      const vw = global.innerWidth;
      const vh = global.innerHeight;
      const scale = Math.min(vw / this.W, vh / this.H);
      const cw = Math.floor(this.W * scale);
      const ch = Math.floor(this.H * scale);
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      const c = this.canvas;
      c.style.width = cw + 'px';
      c.style.height = ch + 'px';
      c.style.left = Math.floor((vw - cw) / 2) + 'px';
      c.style.top = Math.floor((vh - ch) / 2) + 'px';
      c.width = Math.max(1, Math.round(cw * dpr));
      c.height = Math.max(1, Math.round(ch * dpr));
      this._scale = c.width / this.W;
    }

    addScene(name, scene) {
      scene.name = name;
      scene._attach(this);
      this.scenes[name] = scene;
      return scene;
    }

    // Перейти на сцену (переключение произойдёт в начале следующего кадра)
    go(name, params) {
      if (!this.scenes[name]) throw new Error('Нет сцены: ' + name);
      this._next = { name: name, params: params || {} };
    }

    start(name, params) {
      this.go(name, params);
      if (this.running) return;
      this.running = true;
      this._last = performance.now();
      requestAnimationFrame(t => this._frame(t));
    }

    _frame(now) {
      if (!this.running) return;
      const dt = Math.min(0.033, (now - this._last) / 1000 || 0.016);
      this._last = now;
      this.fps = lerp(this.fps, 1 / Math.max(dt, 0.001), 0.05);
      try {
        this._step(dt);
      } catch (err) {
        this.crashed = true;
        this.running = false;
        const msg = 'Ошибка в игре: ' + (err && err.message ? err.message : err);
        if (global.__showErr) global.__showErr(msg); else console.error(err);
        return;
      }
      requestAnimationFrame(t => this._frame(t));
    }

    _step(dt) {
      if (this._next) {
        const n = this._next;
        this._next = null;
        if (this.scene) this.scene.exit();
        this.scene = this.scenes[n.name];
        this.scene._reset();
        this.input.resetControls();
        this.fade = 1;
        this.scene.enter(n.params);
      }
      const s = this.scene;
      if (!s) return;
      this.time += dt;
      if (this.fade > 0) this.fade = Math.max(0, this.fade - dt * 4);

      this.input.begin();
      s.update(dt);
      s.world.update(dt);
      s.camera.update(dt);

      const ts = s.timers.slice();
      for (const t of ts) t.t -= dt;
      const fire = s.timers.filter(t => t.t <= 0);
      s.timers = s.timers.filter(t => t.t > 0);
      for (const t of fire) t.fn();

      const ui = s.ui.slice();
      for (const u of ui) if (u.update) u.update(this.input, dt);
      this.input.end();

      this._draw(s);
    }

    _draw(s) {
      const ctx = this.ctx;
      ctx.setTransform(this._scale, 0, 0, this._scale, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = s.bg || this.bg;
      ctx.fillRect(0, 0, this.W, this.H);
      s.drawBack(ctx);
      ctx.save();
      s.camera.apply(ctx);
      s.world.draw(ctx, s.camera);
      ctx.restore();
      s.draw(ctx);
      for (const u of s.ui) if (u.draw) u.draw(ctx);
      this.input.drawControls(ctx);
      if (this.debug) drawText(ctx, Math.round(this.fps) + ' fps', this.W - 8, this.H - 10, { size: 12, align: 'right', color: '#9f9' });
      if (this.fade > 0) {
        ctx.fillStyle = 'rgba(0,0,0,' + this.fade.toFixed(3) + ')';
        ctx.fillRect(0, 0, this.W, this.H);
      }
    }
  }

  global.MiniEngine = {
    Engine: Engine, Scene: Scene, Entity: Entity, World: World, Camera: Camera,
    Input: Input, Save: Save, Levels: Levels, Sfx: Sfx, Assets: Assets,
    UIButton: UIButton, UILabel: UILabel,
    MenuScene: MenuScene, LevelSelectScene: LevelSelectScene,
    loadTilemap: loadTilemap,
    util: { clamp: clamp, lerp: lerp, rand: rand, overlap: overlap, drawText: drawText, rrect: rrect }
  };
})(window);
