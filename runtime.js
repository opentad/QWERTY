/* =====================================================================
   MiniRuntime 1.0 — запускает игры, созданные в редакторе.
   Игра — это просто данные (JSON): уровни-карты + настройки.
   Никакого чужого кода не выполняется, поэтому это безопасно.

   Нужен engine.js (подключается раньше).

   Символы на карте:
   #  стена      @  старт героя   E  выход      o  монета
   ^  шипы       m  враг          S  пружина    K  ключ
   D  дверь      C  флажок (точка возрождения)  .  пусто
   ===================================================================== */
(function (global) {
  'use strict';

  const M = global.MiniEngine;
  const TS = 32;
  const CHARS = '.#@o^mESKDC';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------------- Темы, цвета, список объектов ---------------- */
  const THEMES = {
    night: { name: 'Ночь', top: '#1d2040', bot: '#3a2e5c', wall: '#3a3f6b', hi: 'rgba(255,255,255,0.10)', circle: 'rgba(255,255,255,0.06)', hud: '#ffffff' },
    day: { name: 'День', top: '#6fc3ff', bot: '#dff3ff', wall: '#5a8f3c', hi: 'rgba(255,255,255,0.28)', circle: 'rgba(255,255,255,0.40)', hud: '#10264a' },
    cave: { name: 'Пещера', top: '#17110d', bot: '#2f2218', wall: '#6a5039', hi: 'rgba(255,255,255,0.10)', circle: 'rgba(255,255,255,0.04)', hud: '#ffffff' },
    candy: { name: 'Закат', top: '#ff8f9c', bot: '#ffd9a8', wall: '#b64a86', hi: 'rgba(255,255,255,0.28)', circle: 'rgba(255,255,255,0.28)', hud: '#3b1230' }
  };

  const COLORS = ['#7ad7ff', '#ffd23f', '#ff7aa8', '#8df0b5', '#c79bff', '#ffffff'];

  const OBJECTS = [
    { ch: '#', name: 'Стена', tip: 'Твёрдый блок, через него не пройти.' },
    { ch: '@', name: 'Старт', tip: 'Здесь появляется герой. Он может быть только один.' },
    { ch: 'E', name: 'Выход', tip: 'Дошёл до двери — уровень пройден.' },
    { ch: 'o', name: 'Монета', tip: 'Игрок собирает монеты.' },
    { ch: '^', name: 'Шипы', tip: 'Коснулся — герой возвращается на старт или флажок.' },
    { ch: 'm', name: 'Враг', tip: 'Ходит туда-сюда. Прыгни сверху — враг исчезнет.' },
    { ch: 'S', name: 'Пружина', tip: 'Подбрасывает героя очень высоко.' },
    { ch: 'K', name: 'Ключ', tip: 'Открывает все двери на уровне.' },
    { ch: 'D', name: 'Дверь', tip: 'Закрыта, пока герой не возьмёт ключ.' },
    { ch: 'C', name: 'Флажок', tip: 'Точка возрождения: герой вернётся сюда.' }
  ];

  /* ---------------- Данные игры ---------------- */
  function str(v, def, max) {
    v = typeof v === 'string' ? v.trim() : '';
    return (v || def).slice(0, max);
  }
  function num(v, a, b, d) {
    v = Number(v);
    return isFinite(v) ? clamp(v, a, b) : d;
  }

  function newLevel(name, cols, rows) {
    cols = clamp(Math.floor(cols) || 40, 10, 150);
    rows = clamp(Math.floor(rows) || 14, 6, 30);
    const map = [];
    for (let r = 0; r < rows; r++) map.push('.'.repeat(cols));
    map[rows - 1] = '#'.repeat(cols);
    const sr = rows - 2;
    let row = '.'.repeat(cols).split('');
    row[2] = '@';
    row[8] = 'o'; row[10] = 'o'; row[12] = 'o';
    row[cols - 3] = 'E';
    map[sr] = row.join('');
    return { name: name || 'Уровень 1', cols: cols, rows: rows, map: map };
  }

  function defaultGame() {
    return {
      v: 1,
      title: 'Моя игра',
      author: '',
      settings: { speed: 230, jump: 640, gravity: 1500, theme: 'night', playerColor: '#7ad7ff' },
      levels: [newLevel('Уровень 1', 40, 14)]
    };
  }

  function sanitizeLevel(l, i) {
    l = l && typeof l === 'object' ? l : {};
    const src = Array.isArray(l.map) ? l.map.slice(0, 30) : [];
    let cols = 0;
    for (const r of src) if (typeof r === 'string') cols = Math.max(cols, r.length);
    cols = clamp(cols || 40, 10, 150);
    const rows = clamp(src.length || 14, 6, 30);
    const map = [];
    for (let r = 0; r < rows; r++) {
      let s = typeof src[r] === 'string' ? src[r] : '';
      s = s.slice(0, cols).split('').map(ch => (CHARS.indexOf(ch) >= 0 ? ch : '.')).join('');
      map.push(s + '.'.repeat(cols - s.length));
    }
    return { name: str(l.name, 'Уровень ' + (i + 1), 30), cols: cols, rows: rows, map: map };
  }

  function sanitize(g) {
    g = g && typeof g === 'object' ? g : {};
    const s = g.settings && typeof g.settings === 'object' ? g.settings : {};
    const out = {
      v: 1,
      title: str(g.title, 'Моя игра', 40),
      author: str(g.author, '', 30),
      settings: {
        speed: num(s.speed, 120, 400, 230),
        jump: num(s.jump, 400, 900, 640),
        gravity: num(s.gravity, 800, 2500, 1500),
        theme: THEMES[s.theme] ? s.theme : 'night',
        playerColor: /^#[0-9a-fA-F]{6}$/.test(s.playerColor || '') ? s.playerColor : '#7ad7ff'
      },
      levels: []
    };
    const lv = Array.isArray(g.levels) ? g.levels.slice(0, 20) : [];
    lv.forEach((l, i) => out.levels.push(sanitizeLevel(l, i)));
    if (!out.levels.length) out.levels.push(newLevel('Уровень 1', 40, 14));
    return out;
  }

  // Насколько клеток вверх прыгает герой при таких настройках
  function jumpTiles(s) {
    return (s.jump * s.jump) / (2 * s.gravity) / TS;
  }

  function countCoins(map) { return map.join('').split('o').length - 1; }

  /* ---------------- Рисование значков (для редактора и игры) ---------------- */
  function drawIcon(ctx, ch, x, y, size, S, o) {
    S = S || {};
    o = o || {};
    const T = THEMES[S.theme] || THEMES.night;
    const k = size / TS;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    switch (ch) {
      case '#':
        ctx.fillStyle = T.wall; ctx.fillRect(0, 0, 32, 32);
        ctx.fillStyle = T.hi; ctx.fillRect(0, 0, 32, 4);
        break;
      case '@':
        ctx.fillStyle = S.playerColor || '#7ad7ff';
        M.util.rrect(ctx, 4, 2, 24, 30, 7); ctx.fill();
        ctx.fillStyle = '#10131f';
        ctx.fillRect(o.face < 0 ? 9 : 18, 10, 5, 7);
        break;
      case 'o':
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath(); ctx.arc(16, 16, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(12, 11, 3, 5);
        break;
      case '^':
        ctx.fillStyle = '#d9dbe8';
        ctx.beginPath();
        ctx.moveTo(1, 32); ctx.lineTo(9, 14); ctx.lineTo(16, 32);
        ctx.lineTo(23, 14); ctx.lineTo(31, 32);
        ctx.closePath(); ctx.fill();
        break;
      case 'm': {
        const d = o.face < 0 ? -1 : 1;
        ctx.fillStyle = '#e5484d';
        M.util.rrect(ctx, 2, 4, 28, 28, 8); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(8, 12, 6, 7); ctx.fillRect(18, 12, 6, 7);
        ctx.fillStyle = '#10131f';
        ctx.fillRect(10 + d, 14, 3, 4); ctx.fillRect(20 + d, 14, 3, 4);
        break;
      }
      case 'E':
        ctx.fillStyle = '#2f8f5b';
        M.util.rrect(ctx, 3, 1, 26, 31, 5); ctx.fill();
        ctx.fillStyle = '#8df0b5';
        ctx.fillRect(8, 6, 16, 26);
        ctx.fillStyle = '#ffe27a';
        ctx.fillRect(20, 19, 3, 3);
        break;
      case 'S': {
        const p = o.press || 0;
        ctx.fillStyle = '#555b85'; ctx.fillRect(4, 26, 24, 6);
        ctx.strokeStyle = '#d9dbe8'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(8, 26); ctx.lineTo(24, 23 + p * 0.3); ctx.lineTo(8, 20 + p * 0.6); ctx.lineTo(24, 18 + p);
        ctx.stroke();
        ctx.fillStyle = '#ffd23f'; ctx.fillRect(3, 14 + p, 26, 5);
        break;
      }
      case 'K':
        ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(10, 13, 6, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(15, 12, 13, 3); ctx.fillRect(21, 15, 3, 5); ctx.fillRect(26, 15, 3, 4);
        break;
      case 'D':
        ctx.fillStyle = '#7a5230'; ctx.fillRect(0, 0, 32, 32);
        ctx.strokeStyle = '#4a2f18'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, 30, 30);
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath(); ctx.arc(16, 13, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(15, 15, 2, 8);
        break;
      case 'C':
        ctx.fillStyle = '#cfd3ea'; ctx.fillRect(8, 3, 3, 29);
        ctx.fillStyle = o.on ? '#8df0b5' : '#ff9a8b';
        ctx.beginPath(); ctx.moveTo(11, 4); ctx.lineTo(27, 10); ctx.lineTo(11, 16); ctx.closePath(); ctx.fill();
        break;
      default: break;
    }
    ctx.restore();
  }

  /* ---------------- Сцены ---------------- */
  class TitleScene extends M.Scene {
    enter() {
      const E = this.engine;
      const W = E.W;
      const H = E.H;
      const G = E.mk.game;
      const o = E.mk.opts;
      const size = clamp(Math.floor(760 / Math.max(8, G.title.length * 0.58)), 24, 48);
      this.addUI(new M.UILabel({ x: W / 2, y: H * 0.2, text: G.title, size: size, bold: true }));
      if (G.author) {
        this.addUI(new M.UILabel({ x: W / 2, y: H * 0.2 + Math.round(size * 0.9), text: 'автор: ' + G.author, size: 18, color: '#aab0d0' }));
      }
      let y = H * 0.46;
      this.addUI(new M.UIButton({
        x: (W - 300) / 2, y: y, w: 300, h: 56, text: 'Играть', color: '#2f8f5b',
        onTap: e => { if (e.levels.count > 1) e.go('levels'); else e.levels.start(0); }
      }));
      y += 70;
      if (o.onExit) {
        this.addUI(new M.UIButton({
          x: (W - 300) / 2, y: y, w: 300, h: 50, text: o.exitLabel || '← Выйти', color: '#3a3f6b',
          onTap: () => o.onExit()
        }));
      }
      this.addUI(new M.UILabel({
        x: W / 2, y: H - 22, size: 15, color: '#8a90b0',
        text: () => (E.input.coarse ? 'Слева — джойстик, справа кнопка A — прыжок' : 'Стрелки или WASD — движение, пробел — прыжок')
      }));
    }
  }

  class GameScene extends M.Scene {
    enter(p) {
      const E = this.engine;
      const scene = this;
      const G = E.mk.game;
      const o = E.mk.opts;
      const S = G.settings;
      const T = THEMES[S.theme];
      const W = this.world;
      this.S = S;
      this.T = T;
      this.idx = p.level || 0;
      this.lv = E.levels.list[this.idx];
      this.controls = { stick: true, buttons: ['A'] };
      this.coins = 0;
      this.total = 0;
      this.t = 0;
      this.state = 'play';
      this.hasKey = false;
      this.spawn = { x: TS * 2 + 4, y: TS * 2 };

      const legend = {
        '#': function (x, y, w, h) {
          W.add({
            x: x, y: y, w: w, h: h, solid: true, static: true, tags: ['wall'],
            draw: function (ctx) {
              ctx.fillStyle = T.wall; ctx.fillRect(this.x, this.y, this.w, this.h);
              ctx.fillStyle = T.hi; ctx.fillRect(this.x, this.y, this.w, 4);
            }
          });
        },
        '@': function (x, y) { scene.spawn = { x: x + 4, y: y + 2 }; },
        'o': function (x, y) {
          scene.total++;
          W.add({ x: x + 8, y: y + 8, w: 16, h: 16, shape: 'circle', static: true, tags: ['coin'], z: 1,
            draw: function (ctx) { drawIcon(ctx, 'o', x, y, TS, S); } });
        },
        '^': function (x, y) {
          W.add({ x: x + 3, y: y + 14, w: 26, h: 18, static: true, tags: ['hazard'], z: 1,
            draw: function (ctx) { drawIcon(ctx, '^', x, y, TS, S); } });
        },
        'E': function (x, y) {
          W.add({ x: x + 4, y: y, w: 24, h: 32, static: true, tags: ['exit'], z: 1,
            draw: function (ctx) { drawIcon(ctx, 'E', x, y, TS, S); } });
        },
        'S': function (x, y) {
          W.add({ x: x + 2, y: y + 20, w: 28, h: 12, static: true, tags: ['spring'], z: 1, press: 0,
            update: function (dt) { this.press = Math.max(0, this.press - dt * 40); },
            draw: function (ctx) { drawIcon(ctx, 'S', x, y, TS, S, { press: this.press }); } });
        },
        'K': function (x, y) {
          W.add({ x: x + 6, y: y + 6, w: 20, h: 20, static: true, tags: ['key'], z: 1,
            draw: function (ctx) { drawIcon(ctx, 'K', x, y + Math.sin(scene.t * 4 + x) * 2, TS, S); } });
        },
        'D': function (x, y) {
          W.add({ x: x, y: y, w: TS, h: TS, solid: true, static: true, tags: ['door'], z: 1,
            draw: function (ctx) { drawIcon(ctx, 'D', x, y, TS, S); } });
        },
        'C': function (x, y) {
          W.add({ x: x + 6, y: y, w: 20, h: 32, static: true, tags: ['checkpoint'], z: 1, on: false,
            draw: function (ctx) { drawIcon(ctx, 'C', x, y, TS, S, { on: this.on }); } });
        },
        'm': function (x, y) {
          W.add({
            x: x + 2, y: y + 4, w: 28, h: 28, vx: -60, gravity: S.gravity, maxFall: 800,
            collides: true, bounceX: 1, tags: ['enemy'], z: 2,
            update: function (dt, world) {
              if (this.blocked.d) {
                const fx = this.vx > 0 ? this.x + this.w + 2 : this.x - 2;
                if (!world.solidAt(fx, this.y + this.h + 4)) this.vx = -this.vx;
              }
              if (this.y > scene.mapH + 200) this.dead = true;
            },
            draw: function (ctx) { drawIcon(ctx, 'm', this.x - 2, this.y - 4, TS, S, { face: this.vx < 0 ? -1 : 1 }); }
          });
        }
      };

      const info = M.loadTilemap(W, this.lv.map, TS, legend);
      this.mapW = info.width;
      this.mapH = info.height;
      this.cp = { x: this.spawn.x, y: this.spawn.y };

      this.player = W.add({
        x: this.spawn.x, y: this.spawn.y, w: 24, h: 30,
        gravity: S.gravity, maxFall: 800, collides: true, tags: ['player'], z: 5,
        coyote: 0, jumpBuf: 0, face: 1,
        update: function (dt) {
          const inp = E.input;
          this.vx = inp.axisX * S.speed;
          if (this.vx > 5) this.face = 1; else if (this.vx < -5) this.face = -1;
          this.coyote = this.blocked.d ? 0.1 : this.coyote - dt;
          if (inp.pressed('A') || inp.pressed('up')) this.jumpBuf = 0.12;
          this.jumpBuf -= dt;
          if (this.jumpBuf > 0 && this.coyote > 0) {
            this.vy = -S.jump;
            this.coyote = 0;
            this.jumpBuf = 0;
            E.audio.play('jump');
          }
          if (this.y > scene.mapH + 120) scene.die();
        },
        onTouch: function (t) {
          if (t.hasTag('coin')) {
            t.dead = true; scene.coins++;
            E.audio.play('coin');
            W.burst(t.cx, t.cy, '#ffd23f', 8, 140);
          } else if (t.hasTag('key')) {
            t.dead = true; scene.hasKey = true;
            E.audio.play('win');
            W.withTag('door').forEach(function (d) { d.dead = true; W.burst(d.cx, d.cy, '#c9965a', 8, 160); });
          } else if (t.hasTag('hazard')) {
            scene.die();
          } else if (t.hasTag('enemy')) {
            if (this.vy > 0 && this.y + this.h - t.y < 18) {
              t.dead = true; this.vy = -420;
              E.audio.play('hit');
              W.burst(t.cx, t.cy, '#e5484d', 12, 200);
            } else scene.die();
          } else if (t.hasTag('spring')) {
            if (this.vy > 0) {
              this.vy = -S.jump * 1.45; t.press = 6;
              E.audio.play('jump');
            }
          } else if (t.hasTag('checkpoint')) {
            if (!t.on) {
              t.on = true;
              scene.cp = { x: t.x + (t.w - this.w) / 2, y: t.y + t.h - this.h };
              E.audio.play('coin');
              W.burst(t.cx, t.y + 8, '#8df0b5', 10, 140);
            }
          } else if (t.hasTag('exit')) {
            scene.win();
          }
        },
        draw: function (ctx) { drawIcon(ctx, '@', this.x - 4, this.y - 2, TS, S, { face: this.face }); }
      });

      this.camera.bounds = { x: 0, y: 0, w: this.mapW, h: this.mapH };
      this.camera.follow(this.player, 6);

      const multi = E.levels.count > 1;
      if (o.onExit) {
        this.addUI(new M.UIButton({
          x: E.W - 252, y: 6, w: 120, h: 34, size: 15, text: o.exitLabel || '← Выйти', color: '#6b3a4a',
          onTap: () => o.onExit()
        }));
      }
      this.addUI(new M.UIButton({
        x: E.W - 126, y: 6, w: 120, h: 34, size: 15, text: multi ? '☰ Уровни' : '☰ Меню', color: '#3a3f6b',
        onTap: e => e.go(multi ? 'levels' : 'title')
      }));
    }

    die() {
      if (this.state !== 'play') return;
      this.state = 'dead';
      const p = this.player;
      this.engine.audio.play('hit');
      this.world.burst(p.cx, p.cy, p.color || this.S.playerColor, 18, 240);
      this.camera.shake(8, 0.3);
      p.visible = false;
      p.active = false;
      this.after(0.8, () => {
        if (this.state !== 'dead') return;
        p.x = this.cp.x; p.y = this.cp.y; p.vx = 0; p.vy = 0;
        p.visible = true; p.active = true;
        this.state = 'play';
        this.camera.snap();
      });
    }

    win() {
      if (this.state !== 'play') return;
      this.state = 'win';
      const E = this.engine;
      const self = this;
      const cx = E.W / 2;
      const H = E.H;
      this.controls = false;
      this.player.active = false;
      const t = Math.round(this.t * 10) / 10;
      const next = E.levels.complete(this.idx, { score: this.coins, time: t });
      E.audio.play('win');
      this.world.burst(this.player.cx, this.player.cy, '#ffe27a', 24, 260);

      const last = next < 0;
      this.addUI(new M.UILabel({ x: cx, y: H * 0.24, text: last && E.levels.count > 1 ? 'Игра пройдена!' : 'Уровень пройден!', size: 38, bold: true, color: '#ffe27a' }));
      this.addUI(new M.UILabel({ x: cx, y: H * 0.24 + 46, size: 20, text: (this.total ? 'Монеты: ' + this.coins + '/' + this.total + '   ' : '') + 'Время: ' + t + ' с' }));
      let y = H * 0.48;
      if (!last) {
        this.addUI(new M.UIButton({ x: cx - 140, y: y, w: 280, h: 54, text: 'Дальше', color: '#2f8f5b', onTap: e => e.levels.start(next) }));
        y += 68;
      }
      this.addUI(new M.UIButton({ x: cx - 140, y: y, w: 280, h: 54, text: 'Заново', onTap: e => e.go('game', { level: self.idx }) }));
      y += 68;
      const multi = E.levels.count > 1;
      this.addUI(new M.UIButton({ x: cx - 140, y: y, w: 280, h: 54, text: multi ? 'К уровням' : 'В меню', color: '#3a3f6b', onTap: e => e.go(multi ? 'levels' : 'title') }));
    }

    update(dt) {
      if (this.state === 'play') this.t += dt;
    }

    drawBack(ctx) {
      const W = this.engine.W;
      const H = this.engine.H;
      const T = this.T;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, T.top);
      g.addColorStop(1, T.bot);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = T.circle;
      const span = W + 200;
      for (let i = 0; i < 8; i++) {
        const x = (((i * 230 - this.camera.x * 0.3) % span) + span) % span - 100;
        ctx.beginPath();
        ctx.arc(x, 330 + (i % 3) * 20, 90 + (i % 4) * 20, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    draw(ctx) {
      const E = this.engine;
      const c = this.T.hud;
      if (this.total) E.text(ctx, 'Монеты ' + this.coins + '/' + this.total, 14, 22, { size: 20, bold: true, color: c });
      E.text(ctx, this.t.toFixed(1) + ' с', 14, 46, { size: 15, color: c });
      if (this.hasKey) drawIcon(ctx, 'K', 80, 32, 28, this.S);
      E.text(ctx, this.lv.name, E.W / 2 - 40, 22, { size: 16, align: 'center', color: c });
      if (this.state === 'win') {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, E.W, E.H);
      }
    }
  }

  /* ---------------- Запуск ----------------
     start(game, {
       id,            — для сохранения прогресса игрока
       startLevel,    — сразу начать с этого уровня (тест из редактора)
       unlockAll,     — открыть все уровни
       onExit,        — функция для кнопки выхода (если нужна)
       exitLabel      — текст кнопки выхода
     }) */
  function start(game, opts) {
    opts = opts || {};
    game = sanitize(game);
    const E = new M.Engine({
      width: 800, height: 450, background: '#12131c',
      save: { namespace: 'mk-' + (opts.id || 'local') }
    });
    E.mk = { game: game, opts: opts };
    E.levels.define(game.levels.map(l => ({ name: l.name, map: l.map, total: countCoins(l.map) })));
    if (opts.unlockAll) E.levels.unlocked = function () { return this.list.length; };
    E.addScene('title', new TitleScene());
    E.addScene('levels', new M.LevelSelectScene({ title: 'Уровни', back: 'title' }));
    E.addScene('game', new GameScene());
    if (typeof opts.startLevel === 'number') {
      E.start('game', { level: clamp(opts.startLevel, 0, game.levels.length - 1) });
    } else {
      E.start('title');
    }
    return E;
  }

  global.MiniRuntime = {
    start: start, sanitize: sanitize, defaultGame: defaultGame, newLevel: newLevel,
    drawIcon: drawIcon, jumpTiles: jumpTiles, countCoins: countCoins,
    THEMES: THEMES, COLORS: COLORS, OBJECTS: OBJECTS, CHARS: CHARS, TS: TS
  };
})(window);
