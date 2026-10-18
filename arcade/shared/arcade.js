/*
 * Neon Arcade shared engine.
 * Every game uses this for its screen, game loop, controls, sound and high scores,
 * so they all look, sound and feel like the same arcade.
 * Plain script (no build step) so the games run straight from index.html.
 */
(function () {
  'use strict';

  const COLORS = {
    bg: '#07060f',
    panel: '#0e0c1d',
    text: '#f4f1ff',
    dim: '#8a85b3',
    pink: '#ff2e88',
    cyan: '#29f0ff',
    yellow: '#ffe14d',
    green: '#3dff7a',
    red: '#ff3b3b',
  };
  const FONT = '"Press Start 2P", monospace';

  const isTouch = window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : false;

  // localStorage can throw (private windows, blocked storage), so every access is guarded.
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ } },
  };

  const pad = (n, len = 6) => String(n).padStart(len, '0');

  // ---------- Screen ----------

  // Fixed logical resolution, sharp on high-DPI screens, scaled to fit by CSS.
  function createScreen(canvas, width, height) {
    const ctx = canvas.getContext('2d');
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
    }
    resize();
    window.addEventListener('resize', resize);
    return { ctx, width, height };
  }

  // ---------- Game loop ----------

  // Fixed-timestep update so game speed is identical on 60Hz and 144Hz screens.
  function startLoop({ update, render, step = 1000 / 60 }) {
    let last = performance.now();
    let acc = 0;
    function frame(now) {
      acc += Math.min(now - last, 250); // don't fast-forward after a hidden tab
      last = now;
      while (acc >= step) {
        update(step);
        acc -= step;
      }
      render();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function onBlur(fn) {
    window.addEventListener('blur', fn);
    document.addEventListener('visibilitychange', () => { if (document.hidden) fn(); });
  }

  // ---------- Sound (synthesized chiptune blips, no audio files) ----------

  const sound = (() => {
    let ac = null;
    let muted = store.get('arcade:muted') === '1';

    function unlock() {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ac = new AC();
      }
      if (ac.state === 'suspended') ac.resume();
    }

    function tone(freq, dur, { type = 'square', vol = 0.07, slide = 0, delay = 0 } = {}) {
      if (muted || !ac) return;
      const t = ac.currentTime + delay;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ac.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }

    const arpeggio = (notes, gap, opts) => notes.forEach((f, i) => tone(f, gap * 1.4, { ...opts, delay: i * gap }));

    const SFX = {
      select: () => tone(660, 0.05, { vol: 0.05 }),
      wall: () => tone(220, 0.04, { vol: 0.05 }),
      paddle: () => tone(440, 0.06, { vol: 0.08 }),
      brick: (combo = 0) => tone(523 * Math.pow(2, Math.min(combo, 12) / 12), 0.07, { vol: 0.08 }),
      steel: () => tone(1760, 0.05, { type: 'triangle', vol: 0.08 }),
      powerup: () => arpeggio([660, 880, 1320], 0.05, { type: 'triangle', vol: 0.12 }),
      lose: () => tone(330, 0.4, { type: 'sawtooth', slide: -260, vol: 0.08 }),
      hop: () => tone(392, 0.06, { slide: 260, vol: 0.05 }),
      squash: () => { tone(160, 0.25, { type: 'sawtooth', slide: -120, vol: 0.1 }); tone(90, 0.3, { delay: 0.05, vol: 0.08 }); },
      splash: () => tone(900, 0.45, { type: 'triangle', slide: -800, vol: 0.1 }),
      shoot: () => tone(1200, 0.07, { slide: -700, vol: 0.04 }),
      boom: () => { tone(220, 0.25, { type: 'sawtooth', slide: -170, vol: 0.08 }); tone(660, 0.08, { vol: 0.05 }); },
      dive: () => tone(1400, 0.45, { type: 'triangle', slide: -1000, vol: 0.05 }),
      pump: (stage = 1) => tone(260 + stage * 90, 0.08, { slide: 120, vol: 0.07 }),
      zap: () => { tone(1800, 0.3, { type: 'sawtooth', slide: -1400, vol: 0.05 }); tone(90, 0.3, { type: 'square', vol: 0.04 }); },
      step: () => tone(180, 0.03, { vol: 0.025 }),
      home: () => arpeggio([523, 659, 784, 1047, 1319], 0.06, { type: 'triangle', vol: 0.12 }),
      start: () => arpeggio([523, 659, 784, 1047], 0.08),
      eat: () => { tone(880, 0.05); tone(1320, 0.06, { delay: 0.04 }); },
      bonus: () => arpeggio([784, 988, 1175, 1568], 0.05, { type: 'triangle', vol: 0.12 }),
      levelup: () => arpeggio([523, 784, 1047, 784, 1047, 1319], 0.06),
      die: () => { tone(440, 0.7, { type: 'sawtooth', slide: -400, vol: 0.09 }); tone(110, 0.5, { delay: 0.1, vol: 0.06 }); },
      pause: () => tone(330, 0.08),
      highscore: () => arpeggio([659, 784, 988, 1319, 988, 1319, 1568], 0.07, { type: 'triangle', vol: 0.12 }),
    };

    function refreshLabels() {
      document.querySelectorAll('[data-mute-label]').forEach(el => {
        el.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
        el.setAttribute('aria-pressed', String(!muted));
      });
    }

    return {
      unlock,
      refreshLabels,
      play(name, arg) { if (SFX[name]) SFX[name](arg); },
      toggle() {
        muted = !muted;
        store.set('arcade:muted', muted ? '1' : '0');
        refreshLabels();
        if (!muted) SFX.select();
      },
      get muted() { return muted; },
    };
  })();

  // ---------- Input ----------
  // Keyboard, swipes and on-screen buttons all become the same small set of actions:
  // up, down, left, right, start, pause, tap (mute is handled here).
  // Games that need more than presses can also ask isDown(action) for held
  // keys/buttons, or pass pointerTarget to track a mouse/finger in screen coordinates.

  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Enter: 'start', Space: 'start',
    KeyP: 'pause', Escape: 'pause',
    KeyM: 'mute',
  };
  const SWIPE_PX = 24;

  const TAP_PX = 12;

  function createInput({ swipeTarget, pointerTarget, screen } = {}) {
    const handlers = [];
    const pointerHandlers = [];
    const held = new Set();
    let pointerHeld = false;
    const emit = action => {
      sound.unlock();
      if (action === 'mute') { sound.toggle(); return; }
      handlers.forEach(h => h(action));
    };

    window.addEventListener('keydown', e => {
      const action = KEYMAP[e.code];
      if (!action) return;
      e.preventDefault();
      held.add(action);
      if (e.repeat && (action === 'start' || action === 'pause' || action === 'mute')) return;
      emit(action);
    });
    window.addEventListener('keyup', e => {
      const action = KEYMAP[e.code];
      if (action) held.delete(action);
    });
    window.addEventListener('blur', () => held.clear());

    // Pointer: reports position in the game's own coordinates. Mice report on hover,
    // fingers while touching. A press that barely moves also counts as a 'tap'.
    if (pointerTarget) {
      let down = null;
      const report = e => {
        const r = pointerTarget.getBoundingClientRect();
        const p = { x: ((e.clientX - r.left) / r.width) * screen.width, y: ((e.clientY - r.top) / r.height) * screen.height };
        pointerHandlers.forEach(h => h(p));
      };
      pointerTarget.addEventListener('pointerdown', e => {
        down = { x: e.clientX, y: e.clientY, id: e.pointerId };
        pointerHeld = true;
        if (pointerTarget.setPointerCapture) pointerTarget.setPointerCapture(e.pointerId);
        report(e);
      });
      pointerTarget.addEventListener('pointermove', e => {
        if (e.pointerType === 'mouse' || (down && e.pointerId === down.id)) report(e);
      });
      pointerTarget.addEventListener('pointerup', e => {
        if (down && e.pointerId === down.id && Math.hypot(e.clientX - down.x, e.clientY - down.y) < TAP_PX) emit('tap');
        down = null;
        pointerHeld = false;
      });
      pointerTarget.addEventListener('pointercancel', () => {
        down = null;
        pointerHeld = false;
      });
    }

    // Swipe: fires as soon as the finger travels far enough, so turns feel instant.
    if (swipeTarget) {
      let start = null;
      let swiped = false;
      swipeTarget.addEventListener('pointerdown', e => {
        start = { x: e.clientX, y: e.clientY, id: e.pointerId };
        swiped = false;
        if (swipeTarget.setPointerCapture) swipeTarget.setPointerCapture(e.pointerId);
      });
      swipeTarget.addEventListener('pointermove', e => {
        if (!start || e.pointerId !== start.id) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.hypot(dx, dy) < SWIPE_PX) return;
        emit(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
        start.x = e.clientX;
        start.y = e.clientY;
        swiped = true;
      });
      const end = e => {
        if (!start || e.pointerId !== start.id) return;
        if (!swiped && e.type === 'pointerup') emit('tap');
        start = null;
      };
      swipeTarget.addEventListener('pointerup', end);
      swipeTarget.addEventListener('pointercancel', end);
    }

    // On-screen buttons: any element with data-action="up|down|...|mute".
    document.querySelectorAll('[data-action]').forEach(btn => {
      const release = () => {
        btn.classList.remove('pressed');
        held.delete(btn.dataset.action);
      };
      btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        btn.classList.add('pressed');
        held.add(btn.dataset.action);
        emit(btn.dataset.action);
      });
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointerleave', release);
      btn.addEventListener('pointercancel', release);
    });

    sound.refreshLabels();
    return {
      on(fn) { handlers.push(fn); },
      onPointer(fn) { pointerHandlers.push(fn); },
      isDown: action => held.has(action),
      isPointerDown: () => pointerHeld,
    };
  }

  // ---------- High scores (top 5 per game, shared by everyone via the site's Worker) ----------
  // A copy of the shared tables is kept in this browser so scores show instantly and the games work offline.
  // A score that couldn't be sent is kept as "pending" and sent again on the next visit.

  const scores = (() => {
    const API = 'https://tomellery-scores.tomellery1818.workers.dev/arcade';
    const SIZE = 5;
    const SEED = [['NEO', 500], ['PIX', 400], ['ARC', 300], ['BIT', 200], ['CPU', 100]];
    // Games that score bigger numbers get a proportionally harder starting table.
    const SEED_SCALE = { bricks: 20, hopper: 10, swarm: 40, driller: 30 };
    const SHARED = 'arcade:shared', PENDING = 'arcade:pending';
    const listeners = [];

    const read = (key, fallback) => {
      try { return JSON.parse(store.get(key)) || fallback; } catch (e) { return fallback; }
    };
    let shared = read(SHARED, {});
    let pending = read(PENDING, []);
    const top = entries => entries.slice().sort((a, b) => b.score - a.score).slice(0, SIZE);

    // Real scores, topped up with the made-up starting table until five real ones exist.
    function list(id) {
      const real = (shared[id] || []).concat(pending.filter(p => p.game === id));
      const seed = SEED.map(([name, score]) => ({ name, score: score * (SEED_SCALE[id] || 1) }));
      return top(real.concat(seed));
    }

    function received(tables) {
      if (!tables || typeof tables !== 'object') return;
      shared = tables;
      store.set(SHARED, JSON.stringify(shared));
      listeners.forEach(fn => fn());
    }

    function send(entry) {
      return fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      }).then(r => (r.ok ? r.json() : Promise.reject(r.status)))
        .then(tables => {
          pending = pending.filter(p => p !== entry);
          store.set(PENDING, JSON.stringify(pending));
          received(tables);
        });
    }

    // Get the latest tables, after first sending anything left over from last time.
    // One at a time: the Worker rewrites the whole table on each score, so sends at the same moment would clash.
    function sync() {
      return pending.slice().reduce((chain, entry) => chain.then(() => send(entry)), Promise.resolve())
        .catch(() => { /* still offline: try again next visit */ })
        .then(() => fetch(API, { cache: 'no-store' }))
        .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
        .then(received)
        .catch(() => { /* offline or Worker down: keep showing the saved copy */ });
    }
    sync();

    return {
      list,
      best: id => list(id)[0].score,
      qualifies(id, score) {
        const table = list(id);
        return score > 0 && (table.length < SIZE || score > table[table.length - 1].score);
      },
      // Returns the rank (0-based) the new score landed at. It shows right away and is sent in the background.
      add(id, name, score) {
        const entry = { game: id, name, score };
        pending.push(entry);
        store.set(PENDING, JSON.stringify(pending));
        const rank = list(id).indexOf(entry);
        send(entry).catch(() => { /* sent again on the next visit */ });
        return rank;
      },
      // Runs whenever fresh tables arrive from the Worker.
      onChange(fn) { listeners.push(fn); },
    };
  })();

  // ---------- Canvas drawing helpers ----------

  function text(ctx, str, x, y, { size = 16, color = COLORS.text, align = 'center', glow = 0 } = {}) {
    ctx.save();
    ctx.font = size + 'px ' + FONT;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = glow;
    }
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
    ctx.fill();
  }

  // Darken the whole screen behind a menu or message.
  function dim(ctx, width, height, alpha) {
    ctx.fillStyle = 'rgba(7, 6, 15, ' + alpha + ')';
    ctx.fillRect(0, 0, width, height);
  }

  // Particle bursts and floating "+50" text, shared so every game's juice feels the same.
  function createEffects() {
    let particles = [];
    let floaters = [];
    return {
      burst(x, y, color, count = 16, speed = 0.15) {
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const v = speed * (0.3 + Math.random() * 0.7);
          const life = 400 + Math.random() * 400;
          particles.push({ x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, life, max: life, color });
        }
      },
      float(x, y, str, color = COLORS.yellow) {
        floaters.push({ x, y, str, color, life: 900 });
      },
      clear() {
        particles = [];
        floaters = [];
      },
      update(dt) {
        particles = particles.filter(p => (p.life -= dt) > 0);
        particles.forEach(p => {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 0.0003 * dt;
        });
        floaters = floaters.filter(f => (f.life -= dt) > 0);
        floaters.forEach(f => { f.y -= 0.03 * dt; });
      },
      draw(ctx) {
        particles.forEach(p => {
          ctx.globalAlpha = p.life / p.max;
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
        });
        floaters.forEach(f => {
          ctx.globalAlpha = Math.min(1, f.life / 400);
          text(ctx, f.str, f.x, f.y, { size: 10, color: f.color, glow: 8 });
        });
        ctx.globalAlpha = 1;
      },
    };
  }

  // Pixel-art sprites: each string is a row, each character a palette key ('.' = empty).
  // Pre-rendered once at 2x with a soft glow, so drawing dozens per frame stays cheap.
  function makeSprite(map, palette, px = 3) {
    const S = 2;
    const pad = 4;
    const w = map[0].length * px + pad * 2;
    const h = map.length * px + pad * 2;
    const canvas = document.createElement('canvas');
    canvas.width = w * S;
    canvas.height = h * S;
    const g = canvas.getContext('2d');
    g.scale(S, S);
    map.forEach((line, y) => {
      [...line].forEach((ch, x) => {
        const color = palette[ch];
        if (!color) return;
        g.shadowColor = color;
        g.shadowBlur = 4;
        g.fillStyle = color;
        g.fillRect(pad + x * px, pad + y * px, px, px);
      });
    });
    return { canvas, w, h };
  }

  function drawSprite(ctx, sprite, x, y, { angle = 0, scale = 1, flip = false } = {}) {
    ctx.save();
    ctx.translate(x, y);
    if (angle) ctx.rotate(angle);
    if (flip || scale !== 1) ctx.scale(flip ? -scale : scale, scale);
    ctx.drawImage(sprite.canvas, -sprite.w / 2, -sprite.h / 2, sprite.w, sprite.h);
    ctx.restore();
  }

  function triangle(ctx, x, y, size, up, color) {
    const s = up ? -1 : 1;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y + s * size);
    ctx.lineTo(x - size, y - s * size * 0.6);
    ctx.lineTo(x + size, y - s * size * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  const RANKS = ['1ST', '2ND', '3RD', '4TH', '5TH'];

  function drawScoreTable(ctx, gameId, cx, top, { highlight = -1, t = 0 } = {}) {
    text(ctx, 'HIGH SCORES', cx, top, { size: 14, color: COLORS.cyan, glow: 10 });
    scores.list(gameId).forEach((s, i) => {
      const hot = i === highlight;
      if (hot && Math.floor(t / 250) % 2) return; // blink the score you just set
      const y = top + 36 + i * 26;
      const color = hot ? COLORS.yellow : i === 0 ? COLORS.pink : COLORS.text;
      text(ctx, RANKS[i], cx - 150, y, { size: 12, color, align: 'left' });
      text(ctx, s.name, cx - 45, y, { size: 12, color, align: 'left' });
      text(ctx, pad(s.score), cx + 150, y, { size: 12, color, align: 'right' });
    });
  }

  // Classic three-letter initials entry, driven by the same actions as gameplay.
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  class InitialsEntry {
    constructor() {
      const last = store.get('arcade:initials') || 'AAA';
      this.chars = last.split('').slice(0, 3).map(c => Math.max(0, LETTERS.indexOf(c)));
      this.pos = 0;
    }

    get value() { return this.chars.map(i => LETTERS[i]).join(''); }

    // Returns the finished initials once the last letter is confirmed, otherwise null.
    handle(action) {
      const n = LETTERS.length;
      if (action === 'up') this.chars[this.pos] = (this.chars[this.pos] + 1) % n;
      else if (action === 'down') this.chars[this.pos] = (this.chars[this.pos] + n - 1) % n;
      else if (action === 'left') this.pos = Math.max(0, this.pos - 1);
      else if (action === 'right' || action === 'start' || action === 'tap') {
        if (this.pos === 2) {
          store.set('arcade:initials', this.value);
          return this.value;
        }
        this.pos++;
      } else return null;
      sound.play('select');
      return null;
    }

    draw(ctx, cx, cy, t) {
      this.chars.forEach((c, i) => {
        const x = cx + (i - 1) * 56;
        const active = i === this.pos;
        const color = active ? COLORS.yellow : COLORS.text;
        text(ctx, LETTERS[c], x, cy, { size: 32, color, glow: active ? 14 : 0 });
        if (active) {
          triangle(ctx, x, cy - 34, 8, true, COLORS.cyan);
          triangle(ctx, x, cy + 38, 8, false, COLORS.cyan);
          if (Math.floor(t / 300) % 2 === 0) {
            ctx.fillStyle = color;
            ctx.fillRect(x - 16, cy + 22, 32, 4);
          }
        }
      });
    }
  }

  // Canvas text needs the pixel font loaded before the first frame.
  function waitForFont() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.race([
      document.fonts.load('16px "Press Start 2P"'),
      new Promise(resolve => setTimeout(resolve, 1500)),
    ]).catch(() => {});
  }

  window.Arcade = {
    COLORS, FONT, isTouch, store, pad,
    createScreen, startLoop, onBlur,
    sound, createInput, scores,
    text, roundRect, dim, triangle, makeSprite, drawSprite, drawScoreTable, InitialsEntry, createEffects,
    waitForFont,
  };
})();
