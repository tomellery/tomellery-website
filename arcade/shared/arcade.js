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
      munch: (alt = 0) => tone(alt ? 520 : 360, 0.07, { type: 'triangle', slide: alt ? -180 : 180, vol: 0.07 }),
      gulp: () => { tone(260, 0.22, { slide: 1100, vol: 0.07 }); tone(1320, 0.08, { type: 'triangle', delay: 0.18, vol: 0.06 }); },
      bounce: () => tone(140, 0.06, { type: 'triangle', slide: -40, vol: 0.05 }),
      whistle: () => tone(1500, 1.1, { type: 'sine', slide: -1300, vol: 0.08 }),
      disc: () => arpeggio([392, 523, 659, 784, 1047, 1319], 0.09, { type: 'triangle', vol: 0.09 }),
      hatch: () => { tone(220, 0.08, { vol: 0.06 }); tone(330, 0.12, { type: 'sawtooth', delay: 0.08, vol: 0.06 }); },
      swear: () => [0, 1, 2, 3, 4].forEach(i => tone(300 + Math.random() * 500, 0.06, { type: 'sawtooth', delay: i * 0.06, vol: 0.06 })),
      turn: () => tone(520, 0.03, { vol: 0.03 }),
      turbo: () => tone(180, 0.3, { type: 'sawtooth', slide: 420, vol: 0.04 }),
      beat: (alt = 0) => tone(alt ? 49 : 58, 0.11, { vol: 0.12 }),
      thrust: () => tone(60 + Math.random() * 20, 0.12, { type: 'sawtooth', vol: 0.03 }),
      saucer: (small = 0) => tone(small ? 880 : 440, 0.12, { type: 'triangle', slide: small ? 220 : 110, vol: 0.04 }),
      warp: () => tone(200, 0.35, { type: 'sine', slide: 1400, vol: 0.07 }),
      launch: () => tone(300, 0.18, { type: 'triangle', slide: 700, vol: 0.05 }),
      alarm: () => [0, 1, 2, 3].forEach(i => tone(i % 2 ? 660 : 880, 0.14, { type: 'square', delay: i * 0.16, vol: 0.05 })),
      crumble: () => { tone(120, 0.6, { type: 'sawtooth', slide: -80, vol: 0.1 }); tone(60, 0.7, { delay: 0.08, vol: 0.08 }); },
      tick: () => tone(1200, 0.025, { vol: 0.04 }),
      move: () => tone(300, 0.02, { vol: 0.03 }),
      rotate: () => tone(620, 0.04, { type: 'triangle', vol: 0.05 }),
      lock: () => tone(110, 0.08, { vol: 0.07 }),
      clear: (rows = 1) => arpeggio([523, 659, 784, 1047].slice(0, rows + 1), 0.05, { type: 'triangle', vol: 0.09 }),
      quad: () => arpeggio([523, 659, 784, 1047, 1319, 1568, 2093], 0.06, { vol: 0.08 }),
      jump: () => tone(330, 0.12, { type: 'square', slide: 330, vol: 0.05 }),
      roll: () => tone(90, 0.05, { type: 'triangle', vol: 0.05 }),
      bonk: () => { tone(200, 0.08, { type: 'square', slide: -120, vol: 0.08 }); tone(900, 0.05, { type: 'triangle', delay: 0.03, vol: 0.05 }); },
      pop: () => tone(1400, 0.07, { type: 'triangle', slide: -600, vol: 0.07 }),
      collapse: () => { tone(160, 1.2, { type: 'sawtooth', slide: -130, vol: 0.1 }); [0, 1, 2, 3].forEach(i => tone(80 + i * 10, 0.3, { delay: 0.2 + i * 0.22, vol: 0.08 })); },
      squish: () => { tone(180, 0.18, { type: 'sawtooth', slide: -140, vol: 0.08 }); tone(90, 0.2, { delay: 0.05, vol: 0.06 }); },
      plop: () => tone(240, 0.09, { type: 'triangle', slide: -120, vol: 0.08 }),
      shake: () => [0, 1, 2].forEach(i => tone(2400 + Math.random() * 1200, 0.03, { type: 'square', delay: i * 0.04, vol: 0.025 })),
      fuse: () => tone(1800 + Math.random() * 600, 0.02, { type: 'square', vol: 0.015 }),
      kaboom: () => { tone(120, 0.5, { type: 'sawtooth', slide: -90, vol: 0.12 }); tone(60, 0.6, { delay: 0.03, vol: 0.1 }); tone(900, 0.1, { type: 'square', slide: -700, vol: 0.05 }); },
      chime: () => arpeggio([880, 1175, 1568], 0.05, { type: 'triangle', vol: 0.09 }),
      laser: () => tone(1500 + Math.random() * 300, 0.04, { type: 'square', slide: -900, vol: 0.025 }),
      thud: () => tone(80, 0.08, { type: 'square', vol: 0.06 }),
      rescue: (n = 1) => arpeggio([660, 880, 1100, 1320, 1760].slice(0, Math.min(5, n) + 1), 0.05, { type: 'triangle', vol: 0.09 }),
      derez: () => { tone(900, 0.6, { type: 'sawtooth', slide: -820, vol: 0.06 }); tone(1800, 0.2, { type: 'triangle', slide: -1200, vol: 0.04, delay: 0.05 }); },
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
  // Two players can share one keyboard: arrows + Enter are player 1, WASD + Space are player 2.
  // Games that don't care just ignore which player an action came from.
  const KEY_PLAYER = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Enter: 1, KeyW: 2, KeyS: 2, KeyA: 2, KeyD: 2, Space: 2 };

  const TAP_PX = 12;

  function createInput({ swipeTarget, pointerTarget, screen, keyRepeat = true } = {}) {
    const handlers = [];
    const pointerHandlers = [];
    const held = new Set();
    const heldBy = { 1: new Set(), 2: new Set() };
    let pointerHeld = false;
    const emit = (action, player = 1) => {
      sound.unlock();
      if (action === 'mute') { sound.toggle(); return; }
      handlers.forEach(h => h(action, player));
    };

    window.addEventListener('keydown', e => {
      const action = KEYMAP[e.code];
      if (!action) return;
      e.preventDefault();
      held.add(action);
      if (KEY_PLAYER[e.code]) heldBy[KEY_PLAYER[e.code]].add(action);
      // The keyboard's own auto-repeat is ignored for start/pause/mute, and for everything when a game
      // does its own repeating (keyRepeat: false, see createRepeater).
      if (e.repeat && (!keyRepeat || action === 'start' || action === 'pause' || action === 'mute')) return;
      emit(action, KEY_PLAYER[e.code] || 1);
    });
    window.addEventListener('keyup', e => {
      const action = KEYMAP[e.code];
      if (!action) return;
      if (KEY_PLAYER[e.code]) heldBy[KEY_PLAYER[e.code]].delete(action);
      // Still held if the other player's key for the same action is down.
      if (!heldBy[1].has(action) && !heldBy[2].has(action)) held.delete(action);
    });
    window.addEventListener('blur', () => {
      held.clear();
      heldBy[1].clear();
      heldBy[2].clear();
    });

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
        try { pointerTarget.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
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
        try { swipeTarget.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
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
        heldBy[1].delete(btn.dataset.action);
      };
      btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        btn.classList.add('pressed');
        held.add(btn.dataset.action);
        heldBy[1].add(btn.dataset.action); // on-screen buttons belong to player 1
        emit(btn.dataset.action, 1);
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
      // Held by one player's side of the keyboard (1: arrows/Enter and the on-screen buttons, 2: WASD/Space).
      isDownFor: (action, player) => heldBy[player].has(action),
      isPointerDown: () => pointerHeld,
    };
  }

  // ---------- Twin-stick touch controls ----------
  // Two virtual thumbsticks for touch screens: a thumb on the left half of the target is stick 0
  // (usually move), on the right half stick 1 (usually aim). Each appears wherever the thumb lands.
  //   const sticks = Arcade.createSticks({ target: canvas, screen: { width, height } });
  //   sticks.get(0) -> { x, y } from -1 to 1 (0, 0 when not held), plus active and mag
  //   sticks.draw(ctx) draws the rings and knobs. Mice are ignored (use pointer aiming for those).

  function createSticks({ target, screen, radius = 46 }) {
    const pads = [null, null];
    const toGame = e => {
      const r = target.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * screen.width, y: ((e.clientY - r.top) / r.height) * screen.height, half: e.clientX - r.left < r.width / 2 ? 0 : 1 };
    };
    target.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') return;
      const p = toGame(e);
      if (pads[p.half]) return;
      pads[p.half] = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
      sound.unlock();
    });
    target.addEventListener('pointermove', e => {
      const pad = pads.find(q => q && q.id === e.pointerId);
      if (!pad) return;
      const p = toGame(e);
      pad.x = p.x;
      pad.y = p.y;
    });
    const end = e => {
      const i = pads.findIndex(q => q && q.id === e.pointerId);
      if (i >= 0) pads[i] = null;
    };
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
    return {
      get(i) {
        const pad = pads[i];
        if (!pad) return { x: 0, y: 0, mag: 0, active: false };
        const dx = (pad.x - pad.ox) / radius;
        const dy = (pad.y - pad.oy) / radius;
        const mag = Math.min(1, Math.hypot(dx, dy));
        const len = Math.hypot(dx, dy) || 1;
        return { x: (dx / len) * mag, y: (dy / len) * mag, mag, active: true };
      },
      draw(ctx) {
        for (const pad of pads) {
          if (!pad) continue;
          const dx = pad.x - pad.ox;
          const dy = pad.y - pad.oy;
          const len = Math.hypot(dx, dy);
          const k = len > radius ? radius / len : 1;
          ctx.save();
          ctx.globalAlpha = 0.5;
          ctx.strokeStyle = COLORS.cyan;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(pad.ox, pad.oy, radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = COLORS.cyan;
          ctx.beginPath();
          ctx.arc(pad.ox + dx * k, pad.oy + dy * k, 16, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      },
    };
  }

  // ---------- High scores (top 5 per game, shared by everyone via the site's Worker) ----------
  // A copy of the shared tables is kept in this browser so scores show instantly and the games work offline.
  // A score that couldn't be sent is kept as "pending" and sent again on the next visit.
  // Each score goes with a ticket the Worker handed out when the page opened (or after the last score), so it can
  // check the score was possible in the time played. A score the Worker turns down is dropped, not retried.

  const scores = (() => {
    const API = 'https://tomellery-scores.tomellery1818.workers.dev/arcade';
    const SIZE = 5;
    const SEED = [['NEO', 500], ['PIX', 400], ['ARC', 300], ['BIT', 200], ['CPU', 100]];
    // Games that score bigger numbers get a proportionally harder starting table.
    const SEED_SCALE = { bricks: 20, hopper: 10, swarm: 40, driller: 30, maze: 15, cube: 30, trails: 20, rocks: 20, shield: 20, blocks: 30, grab: 40, climb: 25, stack: 25, bugs: 30, blast: 20, robo: 40 };
    const SHARED = 'arcade:shared', PENDING = 'arcade:pending';
    const listeners = [];

    let ticket = null;
    function getTicket() {
      fetch(API.replace(/\/arcade$/, '/ticket'), { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (d && d.ticket) ticket = d.ticket; })
        .catch(() => {});
    }
    getTicket();

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
      }).then(r => {
        // Turned down (no ticket, impossible score...): drop it. Busy or down: keep it for next time.
        if (!r.ok && r.status >= 400 && r.status < 500 && r.status !== 429) return null;
        return r.ok ? r.json() : Promise.reject(r.status);
      }).then(tables => {
        pending = pending.filter(p => p !== entry);
        store.set(PENDING, JSON.stringify(pending));
        if (tables) received(tables);
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
        const entry = { game: id, name, score, ticket };
        getTicket();   // a fresh one for the next run
        pending.push(entry);
        store.set(PENDING, JSON.stringify(pending));
        if (window.track && /^[A-Z0-9]{3}$/.test(name)) track('initials:' + name);   // labels this visitor's card on /stats/
        const rank = list(id).indexOf(entry);
        send(entry).catch(() => { /* sent again on the next visit */ });
        return rank;
      },
      // Runs whenever fresh tables arrive from the Worker.
      onChange(fn) { listeners.push(fn); },
    };
  })();

  // ---------- Grid pathfinding ----------
  // Breadth-first search over a cols x rows grid of cells, for chasers, demo players and
  // anything else that needs the shortest way through a maze. open(c, r) says which cells
  // can be walked; wrapX lets paths leave one side and come back in the other (tunnels).
  // stopAt(c, r), if given, ends the search at the nearest cell it returns true for.

  const NEIGHBOURS = [[0, -1], [-1, 0], [0, 1], [1, 0]];

  function gridSearch(cols, rows, open, from, { wrapX = false, stopAt = null } = {}) {
    const dist = new Int16Array(cols * rows).fill(-1);
    const prev = new Int32Array(cols * rows).fill(-1);
    const queue = [from.r * cols + from.c];
    dist[queue[0]] = 0;
    let found = null;
    for (let qi = 0; qi < queue.length; qi++) {
      const i = queue[qi];
      const c = i % cols;
      const r = (i - c) / cols;
      if (stopAt && qi > 0 && stopAt(c, r)) {
        found = { c, r };
        break;
      }
      for (const [dc, dr] of NEIGHBOURS) {
        const nc = wrapX ? (c + dc + cols) % cols : c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const n = nr * cols + nc;
        if (dist[n] !== -1 || !open(nc, nr)) continue;
        dist[n] = dist[i] + 1;
        prev[n] = i;
        queue.push(n);
      }
    }
    return {
      found,
      // Steps from the start, or -1 if the search never reached that cell.
      dist: (c, r) => (c < 0 || r < 0 || c >= cols || r >= rows ? -1 : dist[r * cols + c]),
      // The cells after the start, up to and including `to`; null if it wasn't reached.
      pathTo(to) {
        let i = to.r * cols + to.c;
        if (dist[i] === -1) return null;
        const path = [];
        while (dist[i] > 0) {
          path.push({ c: i % cols, r: Math.floor(i / cols) });
          i = prev[i];
        }
        return path.reverse();
      },
    };
  }

  // ---------- Key auto-repeat ----------
  // Held-key repeating with a proper feel: one step on the press, then (after a short pause) steady
  // steps while it stays held. Handle the press itself from input.on; each tick ask how many repeats:
  //   const slide = Arcade.createRepeater({ delay: 170, rate: 50 });
  //   for (let n = slide.tick(input.isDown('left'), dt); n > 0; n--) moveLeft();

  function createRepeater({ delay = 170, rate = 50 } = {}) {
    let t = 0;
    let held = false;
    return {
      tick(down, dt) {
        if (!down) {
          held = false;
          return 0;
        }
        if (!held) {
          held = true;
          t = -delay;
          return 0;
        }
        t += dt;
        let n = 0;
        while (t >= rate) {
          t -= rate;
          n++;
        }
        return n;
      },
    };
  }

  // ---------- Platform physics ----------
  // Levels built from girders (flat or sloped segments you stand on) and ladders (vertical spans you
  // climb), and bodies that walk, fall, jump in fixed arcs and climb, like the old climbing games.
  //   const world = Arcade.createPlatforms({ girders: [{ x1, y1, x2, y2 }], ladders: [{ x, top, bottom }],
  //     width, gravity, walk, climb, jump });
  //   world.surface(g, x)            height of girder g at x
  //   world.groundAt(x, y, reach)    the nearest girder surface at or just below (x, y): { g, y } or null
  //   world.step(body, dt, { left, right, up, down, jump })   moves a body; returns 'jump', 'land' or null
  // A body is { x, y (its feet), vx, vy, onGround, ladder, facing, fall } - fall is how far it last
  // dropped when it lands (games use it for "fell too far"). Change girders at any time (e.g. pulling
  // bolts out); call world.setGirders(list).

  const LADDER_EXIT = 10; // px from a floor where you can still step off a ladder sideways

  function createPlatforms({ girders = [], ladders = [], width = 480, gravity = 0.0018, walk = 0.075, climb = 0.055, jump = 0.29 } = {}) {
    let list = girders;
    const spans = (g, x) => x >= Math.min(g.x1, g.x2) && x <= Math.max(g.x1, g.x2);
    const surface = (g, x) => g.y1 + ((x - g.x1) * (g.y2 - g.y1)) / ((g.x2 - g.x1) || 1);
    const world = {
      ladders,
      get girders() { return list; },
      setGirders(next) { list = next; },
      surface,
      groundAt(x, y, reach = 4) {
        let best = null;
        for (const g of list) {
          if (!spans(g, x)) continue;
          const sy = surface(g, x);
          if (sy >= y - 3 && sy <= y + reach && (!best || sy < best.y)) best = { g, y: sy };
        }
        return best;
      },
      // The girder surface nearest to (x, y), above or below, within reach.
      floorNear(x, y, reach) {
        let best = null;
        for (const g of list) {
          if (!spans(g, x)) continue;
          const sy = surface(g, x);
          if (Math.abs(sy - y) <= reach && (!best || Math.abs(sy - y) < Math.abs(best.y - y))) best = { g, y: sy };
        }
        return best;
      },
      // A ladder within grabbing distance whose bottom (going up) or top (going down) is at the feet.
      ladderAt(x, y, up) {
        return ladders.find(l => !l.broken && Math.abs(l.x - x) < 7 && (up ? y <= l.bottom + 4 && y > l.top + 2 : y >= l.top - 4 && y < l.bottom - 2)) || null;
      },
      // The way to walk and climb from one spot to another across girders and ladders: returns the first
      // move to make ('left', 'right', 'up', 'down'), or null when already there or there's no way.
      // Chasers call it every so often to pick a direction.
      route(from, to) {
        const nodes = [];
        const edges = [];
        const nodeAt = (g, x) => {
          let i = nodes.findIndex(n => n.g === g && Math.abs(n.x - x) < 1);
          if (i < 0) {
            i = nodes.push({ g, x, y: surface(g, x) }) - 1;
            edges.push([]);
          }
          return i;
        };
        const link = (a, b, cost, ab, ba) => {
          edges[a].push({ to: b, cost, move: ab });
          edges[b].push({ to: a, cost, move: ba });
        };
        const onGirder = (g, l, end) => spans(g, l.x) && Math.abs(surface(g, l.x) - l[end]) < 4;
        for (const l of ladders) {
          if (l.broken) continue;
          const top = list.find(g => onGirder(g, l, 'top'));
          const bottom = list.find(g => onGirder(g, l, 'bottom'));
          if (top && bottom) link(nodeAt(top, l.x), nodeAt(bottom, l.x), l.bottom - l.top, 'down', 'up');
        }
        for (const g of list) {
          const xs = nodes.filter(n => n.g === g).map(n => n.x).sort((a, b) => a - b);
          for (let i = 1; i < xs.length; i++) link(nodeAt(g, xs[i - 1]), nodeAt(g, xs[i]), xs[i] - xs[i - 1], 'right', 'left');
        }
        // Where each end stands: on a girder (any node on it, by walking) or on a ladder (its two ends).
        const onFloor = (g, b, leaving) => nodes.map((n, i) => [n, i]).filter(([n]) => n.g === g)
          .map(([n, i]) => ({ i, cost: Math.abs(n.x - b.x), move: Math.abs(n.x - b.x) < 3 ? null : n.x < b.x ? (leaving ? 'left' : 'right') : leaving ? 'right' : 'left' }));
        const entries = (b, leaving) => {
          if (b.ladder) {
            const ends = nodes.map((n, i) => [n, i]).filter(([n]) => Math.abs(n.x - b.ladder.x) < 1 && (Math.abs(n.y - b.ladder.top) < 4 || Math.abs(n.y - b.ladder.bottom) < 4));
            const list = ends.map(([n, i]) => ({ i, cost: Math.abs(n.y - b.y), move: Math.abs(n.y - b.y) < 3 ? null : n.y < b.y ? (leaving ? 'up' : 'down') : leaving ? 'down' : 'up' }));
            // Right at a floor the ladder meets: as good as standing on that floor.
            const at = ends.find(([n]) => Math.abs(n.y - b.y) < 3);
            return at ? { g: at[0].g, list: list.concat(onFloor(at[0].g, b, leaving)) } : { g: null, list };
          }
          const ground = world.groundAt(b.x, b.y - 4, 10);
          if (!ground) return { g: null, list: [] };
          return { g: ground.g, list: onFloor(ground.g, b, leaving) };
        };
        const start = entries(from, true);
        const goal = entries(to, false);
        if (start.g && start.g === goal.g) return Math.abs(to.x - from.x) < 2 ? null : to.x < from.x ? 'left' : 'right';
        const dist = nodes.map(() => Infinity);
        const first = nodes.map(() => null);
        const done = nodes.map(() => false);
        for (const e of start.list) {
          if (e.cost < dist[e.i]) {
            dist[e.i] = e.cost;
            first[e.i] = e.move;
          }
        }
        for (;;) {
          let u = -1;
          for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
          if (u < 0) break;
          done[u] = true;
          for (const e of edges[u]) {
            const d = dist[u] + e.cost;
            if (d < dist[e.to]) {
              dist[e.to] = d;
              first[e.to] = first[u] || e.move;
            }
          }
        }
        let best = null;
        for (const e of goal.list) {
          const total = dist[e.i] + e.cost;
          if (total < Infinity && (!best || total < best.total)) best = { total, move: first[e.i] || e.move };
        }
        return best ? best.move : null;
      },
      step(b, dt, ctl = {}) {
        let event = null;
        if (b.ladder) {
          const l = b.ladder;
          const dir = (ctl.down ? 1 : 0) - (ctl.up ? 1 : 0);
          b.y = Math.max(l.top, Math.min(l.bottom, b.y + dir * climb * dt));
          b.x = l.x;
          b.climbing = dir !== 0;
          // Step off sideways onto any girder the ladder crosses, as long as you're close to it (ladders
          // that look like they span several floors are stacks of one-floor pieces), or off either end.
          if (ctl.left || ctl.right) {
            const ground = world.floorNear(b.x, b.y, LADDER_EXIT);
            if (ground) {
              b.ladder = null;
              b.onGround = true;
              b.y = ground.y;
              return null;
            }
          }
          const atEnd = b.y <= l.top + 0.5 || b.y >= l.bottom - 0.5;
          if (atEnd && ((b.y <= l.top + 0.5 && ctl.up) || (b.y >= l.bottom - 0.5 && ctl.down))) {
            const ground = world.groundAt(b.x, b.y - 2, 6);
            if (ground) {
              b.ladder = null;
              b.onGround = true;
              b.y = ground.y;
            }
          }
          return null;
        }
        if (b.onGround) {
          if (ctl.up && world.ladderAt(b.x, b.y, true)) {
            b.ladder = world.ladderAt(b.x, b.y, true);
            b.onGround = false;
            return null;
          }
          if (ctl.down && world.ladderAt(b.x, b.y, false)) {
            b.ladder = world.ladderAt(b.x, b.y, false);
            b.onGround = false;
            return null;
          }
          const dir = (ctl.right ? 1 : 0) - (ctl.left ? 1 : 0);
          if (dir) b.facing = dir;
          if (ctl.jump) {
            // Jumps are fixed arcs: you commit to the direction you were walking.
            b.vx = dir * walk;
            b.vy = -jump;
            b.onGround = false;
            b.fallFrom = b.y;
            return 'jump';
          }
          b.vx = dir * walk;
          b.x = Math.max(4, Math.min(width - 4, b.x + b.vx * dt));
          const ground = world.groundAt(b.x, b.y - 4, 10);
          if (ground) b.y = ground.y;
          else {
            b.onGround = false; // walked off the end
            b.vy = 0;
            b.fallFrom = b.y;
          }
          return null;
        }
        // In the air
        const before = b.y;
        b.vy += gravity * dt;
        b.x = Math.max(4, Math.min(width - 4, b.x + b.vx * dt));
        b.y += b.vy * dt;
        if (b.vy > 0) {
          const ground = world.groundAt(b.x, before, b.y - before + 1);
          if (ground) {
            b.y = ground.y;
            b.vy = 0;
            b.vx = 0;
            b.onGround = true;
            b.fall = b.y - (b.fallFrom !== undefined ? b.fallFrom : b.y);
            event = 'land';
          }
        }
        return event;
      },
    };
    return world;
  }

  // ---------- Grid bombs ----------
  // Bombs on a grid that burn in a cross after a fuse, stop at solid walls, burn the first breakable
  // block they reach, and set off any other bomb in their path: chain reactions.
  //   const bombs = Arcade.createBombs({ cols, rows, solid(c, r), soft(c, r), onSoft(c, r), onExplode(bomb) });
  //   bombs.place(c, r, { range, owner, fuse })  -> the bomb (or null if one's already there); fuse Infinity = remote
  //   bombs.detonate(bomb); bombs.update(dt); bombs.flameAt(c, r); bombs.at(c, r); bombs.list; bombs.flames
  //   bombs.blastCells(bomb) -> the cells it will burn (for AI that wants to stay out of the way)
  // A bomb can be kicked: bomb.slide = { dx, dy }, and bombs.update moves it a cell at a time until
  // blocked(c, r) (a function you pass) says stop.

  function createBombs({ cols, rows, solid, soft, onSoft = () => {}, onExplode = () => {}, blocked = () => false, fuseMs = 2400, flameMs = 550, slideMs = 70 }) {
    let list = [];
    let flames = [];
    const inside = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows;
    const at = (c, r) => list.find(b => b.c === c && b.r === r && !b.gone) || null;
    const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    function blastCells(b) {
      const cells = [{ c: b.c, r: b.r }];
      for (const [dc, dr] of DIRS4) {
        for (let k = 1; k <= b.range; k++) {
          const c = b.c + dc * k;
          const r = b.r + dr * k;
          if (!inside(c, r) || solid(c, r)) break;
          cells.push({ c, r, dc, dr, k, end: k === b.range });
          if (soft(c, r) || at(c, r)) break;
        }
      }
      return cells;
    }

    function detonate(b) {
      if (b.gone) return;
      b.gone = true;
      const cells = blastCells(b);
      for (const cell of cells) {
        flames.push({ ...cell, t: 0, owner: b.owner });
        if (soft(cell.c, cell.r)) onSoft(cell.c, cell.r, b);
        const other = at(cell.c, cell.r);
        if (other && other !== b) detonate(other); // chain reaction
      }
      onExplode(b, cells);
    }

    return {
      get list() { return list; },
      get flames() { return flames; },
      at,
      blastCells,
      detonate,
      place(c, r, { range = 1, owner = null, fuse = fuseMs } = {}) {
        if (at(c, r)) return null;
        const b = { c, r, range, owner, t: 0, fuse, slide: null, slideT: 0 };
        list.push(b);
        return b;
      },
      flameAt: (c, r) => flames.some(f => f.c === c && f.r === r),
      update(dt) {
        for (const f of flames) f.t += dt;
        flames = flames.filter(f => f.t < flameMs);
        for (const b of list) {
          if (b.gone) continue;
          // Standing in fire sets a bomb off too.
          if (flames.some(f => f.c === b.c && f.r === b.r)) {
            detonate(b);
            continue;
          }
          if (b.slide && (b.slideT += dt) >= slideMs) {
            b.slideT = 0;
            const c = b.c + b.slide.dx;
            const r = b.r + b.slide.dy;
            if (!inside(c, r) || solid(c, r) || soft(c, r) || at(c, r) || blocked(c, r)) b.slide = null;
            else {
              b.c = c;
              b.r = r;
            }
          }
          if ((b.t += dt) >= b.fuse) detonate(b);
        }
        list = list.filter(b => !b.gone);
      },
      clear() {
        list = [];
        flames = [];
      },
    };
  }

  // ---------- Flood fill ----------
  // Every cell reachable from a starting cell without crossing a closed one: how much room a rider has
  // left, or which part of the board an enclosed area covers. Stops counting at cap if given.
  // Returns the count and a mask (1 = reached) of cols x rows cells.

  function floodFill(cols, rows, open, from, { cap = Infinity } = {}) {
    const mask = new Uint8Array(cols * rows);
    if (from.c < 0 || from.r < 0 || from.c >= cols || from.r >= rows || !open(from.c, from.r)) return { count: 0, mask };
    const stack = [from.r * cols + from.c];
    mask[stack[0]] = 1;
    let count = 1;
    while (stack.length && count < cap) {
      const i = stack.pop();
      const c = i % cols;
      const r = (i - c) / cols;
      for (const [dc, dr] of NEIGHBOURS) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const n = nr * cols + nc;
        if (mask[n] || !open(nc, nr)) continue;
        mask[n] = 1;
        count++;
        stack.push(n);
      }
    }
    return { count, mask };
  }

  // ---------- Vector kit ----------
  // Glowing line-art and drifting-in-space physics. A shape is a list of [x, y] points around (0, 0);
  // objects are anything with x, y, vx, vy (px and px per ms) and, for hit tests, a radius r.

  const vector = {
    // Draws a shape as one glowing outline, turned by angle (radians) and scaled.
    draw(ctx, shape, x, y, { angle = 0, scale = 1, color = COLORS.text, width = 1.5, glow = 8, closed = true } = {}) {
      const cos = Math.cos(angle) * scale;
      const sin = Math.sin(angle) * scale;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (glow) {
        ctx.shadowColor = color;
        ctx.shadowBlur = glow;
      }
      ctx.beginPath();
      shape.forEach(([px, py], i) => {
        const sx = x + px * cos - py * sin;
        const sy = y + px * sin + py * cos;
        if (i) ctx.lineTo(sx, sy);
        else ctx.moveTo(sx, sy);
      });
      if (closed) ctx.closePath();
      ctx.stroke();
      ctx.restore();
    },
    // A random jagged outline about radius across: rocks, debris.
    rock(radius, points = 10, rough = 0.35) {
      const shape = [];
      for (let i = 0; i < points; i++) {
        const a = (i / points) * Math.PI * 2;
        const r = radius * (1 - rough / 2 + Math.random() * rough);
        shape.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      return shape;
    },
    // Moves an object by its velocity.
    move(o, dt) {
      o.x += o.vx * dt;
      o.y += o.vy * dt;
    },
    // Adds speed in the direction of angle (thrust, recoil, explosions).
    push(o, angle, amount) {
      o.vx += Math.cos(angle) * amount;
      o.vy += Math.sin(angle) * amount;
    },
    // Slows an object down: keeps `keep` of its speed every 1/60 s (0.99 = a slow coast).
    drag(o, keep, dt) {
      const f = Math.pow(keep, dt / (1000 / 60));
      o.vx *= f;
      o.vy *= f;
    },
    // Caps an object's speed.
    limit(o, max) {
      const v = Math.hypot(o.vx, o.vy);
      if (v > max) {
        o.vx *= max / v;
        o.vy *= max / v;
      }
    },
    // Off one edge, back in on the other (margin lets big shapes slide fully off first).
    wrap(o, w, h, margin = 0) {
      if (o.x < -margin) o.x += w + margin * 2;
      else if (o.x > w + margin) o.x -= w + margin * 2;
      if (o.y < -margin) o.y += h + margin * 2;
      else if (o.y > h + margin) o.y -= h + margin * 2;
    },
    // Do two round objects touch?
    hit: (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < (a.r || 0) + (b.r || 0),
  };

  // ---------- Blast rings ----------
  // Explosions that swell to full size, hold a moment, then shrink away. Anything inside one while it's
  // alive can be destroyed, and whatever it destroys can set off a blast of its own: chain reactions.
  //   const blasts = Arcade.createBlasts();
  //   blasts.add(x, y, { radius, color, owner }) -> the blast (owner is anything you like, e.g. 'player')
  //   blasts.update(dt); blasts.hit(x, y, pad) -> the blast covering that point, or null; blasts.draw(ctx)

  function createBlasts() {
    let list = [];
    const radiusOf = b => {
      if (b.t < b.grow) return b.max * (b.t / b.grow);
      if (b.t < b.grow + b.hold) return b.max;
      return b.max * Math.max(0, 1 - (b.t - b.grow - b.hold) / b.shrink);
    };
    return {
      get list() { return list; },
      add(x, y, { radius = 32, grow = 450, hold = 250, shrink = 500, color = COLORS.text, owner = null } = {}) {
        const b = { x, y, max: radius, grow, hold, shrink, t: 0, r: 0, color, owner };
        list.push(b);
        return b;
      },
      update(dt) {
        list.forEach(b => {
          b.t += dt;
          b.r = radiusOf(b);
        });
        list = list.filter(b => b.t < b.grow + b.hold + b.shrink);
      },
      hit(x, y, pad = 0) {
        return list.find(b => b.r > 0 && Math.hypot(x - b.x, y - b.y) < b.r + pad) || null;
      },
      clear() { list = []; },
      // Filled discs that flicker through colours like the old arcade explosions.
      draw(ctx, colors = null, clock = 0) {
        list.forEach((b, i) => {
          if (b.r <= 0) return;
          const color = colors ? colors[Math.floor(clock / 70 + i) % colors.length] : b.color;
          ctx.save();
          ctx.fillStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
      },
    };
  }

  // ---------- Isometric cubes ----------
  // A cube seen from above at an angle: its top face is a diamond centred on (x, y), w wide and w / 2
  // tall, and its two side faces drop w / 2 below that. Stacked in rows w / 2 apart sideways and
  // 3w / 4 apart downwards, cubes fit together into a pyramid with no gaps.

  function drawCube(ctx, x, y, w, { top, left, right, edge = null }) {
    const h = w / 4;
    const s = w / 2;
    const face = (color, points) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      points.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.closePath();
      ctx.fill();
    };
    face(left, [[x - s, y], [x, y + h], [x, y + h + s], [x - s, y + s]]);
    face(right, [[x, y + h], [x + s, y], [x + s, y + s], [x, y + h + s]]);
    face(top, [[x, y - h], [x + s, y], [x, y + h], [x - s, y]]);
    if (edge) {
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y - h);
      ctx.lineTo(x + s, y);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x - s, y);
      ctx.closePath();
      ctx.stroke();
    }
  }

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

  // A member of the arcade's construction crew (assets/crew.js, loaded by the page) as game sprites:
  // { stand, walk1, walk2, lift (arms up: climbing, carrying), flail (falling) }, facing right.
  // Returns null if the crew isn't loaded or there's no one by that name.
  function crewSprite(name, px = 2) {
    const crew = window.Crew && window.Crew.list.find(m => m.name === name);
    if (!crew) return null;
    const LEGS = {
      stand: ['..LL.LL...', '..LL.LL...', '.XXX.XXX..'],
      walk1: ['..LL.LL...', '.LL...LL..', '.XX...XX..'],
      walk2: ['...LLL....', '...LLL....', '...XXX....'],
    };
    const set = (rows, list) => {
      const g = rows.map(r => r.split(''));
      list.forEach(([x, y, v]) => { g[y][x] = v; });
      return g.map(r => r.join(''));
    };
    const legs = crew.legs || LEGS;
    const stand = crew.rows.concat(legs.stand);
    const arms = [[0, 7, '.'], [0, 8, '.'], [7, 7, '.'], [7, 8, '.'], [0, 6, 'A'], [0, 5, 'A'], [7, 6, 'A'], [7, 5, 'A']];
    const pal = { E: '#0a0a0a', ...crew.c, X: crew.legsK || crew.c.K };
    return {
      stand: makeSprite(stand, pal, px),
      walk1: makeSprite(crew.rows.concat(legs.walk1), pal, px),
      walk2: makeSprite(crew.rows.concat(legs.walk2), pal, px),
      lift: makeSprite(set(stand, arms), pal, px),
      flail: makeSprite(set(crew.rows.concat(legs.walk1), arms), pal, px),
    };
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

  // ---------- Game shell ----------
  // The screens every game shares, so a new game only writes its own play: the title (with the game's
  // attract mode running behind it), pause, initials entry and game over, the HUD bar, and the controls
  // that drive them. The game keeps its own play states ('ready', 'playing', 'dying', ...).
  //
  //   const shell = Arcade.createShell({ ctx, width, height, id: 'trails', title: ['NEON', 'TRAILS'],
  //     howTo: [['LINE', color], ...], hudLabel: 'ROUND', newGame, showTitle, pauseIn: ['playing'] });
  //   input.on(action => { if (!shell.handle(action)) { ...game controls... } });
  //   shell.state, shell.stateTime, shell.clock, shell.setState(name), shell.pause()
  //   shell.gameOver(score, summary)   initials entry if it's a high score, then the game over screen
  //   shell.update(dt) every tick; shell.drawHud(score, value) and shell.drawOverlay() in render
  // newGame() starts a game (and sets its first play state); showTitle() resets the attract mode and calls
  // shell.setState('title').

  function createShell({ ctx, width: W, height: H, id, title, titleColors = [COLORS.cyan, COLORS.pink], howTo = [],
    hudLabel = 'LEVEL', hudColor = COLORS.yellow, newGame, showTitle, pauseIn = ['playing'] }) {
    let hi = scores.best(id);
    scores.onChange(() => { hi = scores.best(id); });
    let entry = null;
    let rank = -1;
    let final = 0;
    let summary = '';
    let resumeTo = 'playing';
    const y = n => Math.round((n * H) / 600); // layouts are designed for a 600-tall screen
    const blink = (ms = 500) => Math.floor(shell.clock / ms) % 2 === 0;

    const shell = {
      state: 'title',
      stateTime: 0,
      clock: 0,
      get hiScore() { return hi; },
      setState(next) {
        shell.state = next;
        shell.stateTime = 0;
      },
      pause() {
        resumeTo = shell.state;
        shell.setState('paused');
        sound.play('pause');
      },
      gameOver(score, line = '') {
        final = score;
        summary = line;
        if (scores.qualifies(id, score)) {
          entry = new InitialsEntry();
          shell.setState('entry');
          sound.play('highscore');
        } else {
          rank = -1;
          shell.setState('gameover');
        }
      },
      // Handles everything outside play; returns true when the action was used here.
      handle(action) {
        switch (shell.state) {
          case 'title':
            if (action === 'start' || action === 'tap') newGame();
            return true;
          case 'paused':
            if (action === 'pause' || action === 'start' || action === 'tap') {
              shell.setState(resumeTo);
              sound.play('pause');
            }
            return true;
          case 'entry': {
            const name = entry.handle(action);
            if (name) {
              rank = scores.add(id, name, final);
              hi = scores.best(id);
              shell.setState('gameover');
            }
            return true;
          }
          case 'gameover':
            if (shell.stateTime < 600) return true; // don't skip the screen by accident
            if (action === 'start' || action === 'tap') newGame();
            else if (action === 'pause') showTitle();
            return true;
        }
        if (action === 'pause' && pauseIn.includes(shell.state)) {
          shell.pause();
          return true;
        }
        return false;
      },
      update(dt) {
        shell.clock += dt;
        shell.stateTime += dt;
        if (shell.state === 'gameover' && shell.stateTime >= 20000) showTitle(); // back to attract mode
      },
      drawHud(score, value) {
        const shown = shell.state === 'title' ? 0 : score;
        text(ctx, 'SCORE', 16, 16, { size: 8, color: COLORS.dim, align: 'left' });
        text(ctx, pad(shown), 16, 33, { size: 14, align: 'left' });
        text(ctx, hudLabel, W / 2, 16, { size: 8, color: COLORS.dim });
        text(ctx, String(value), W / 2, 33, { size: 14, color: hudColor });
        text(ctx, 'HI-SCORE', W - 16, 16, { size: 8, color: COLORS.dim, align: 'right' });
        text(ctx, pad(Math.max(hi, shown)), W - 16, 33, { size: 14, color: COLORS.pink, align: 'right' });
        ctx.fillStyle = 'rgba(41, 240, 255, 0.6)';
        ctx.fillRect(0, 46, W, 2);
      },
      drawOverlay() {
        const cx = W / 2;
        const cy = H / 2;
        if (shell.state === 'title') {
          dim(ctx, W, H, 0.6);
          text(ctx, title[0], cx, y(116), { size: 34, color: titleColors[0], glow: 18 });
          text(ctx, title[1], cx, y(164), { size: 40, color: titleColors[1], glow: 20 });
          if (Math.floor(shell.clock / 5000) % 2 === 0) {
            howTo.forEach(([line, color], i) => text(ctx, line, cx, y(236) + i * 32, { size: 10, color: color || COLORS.text }));
          } else {
            drawScoreTable(ctx, id, cx, y(236));
          }
          if (blink()) text(ctx, isTouch ? 'TAP TO START' : 'PRESS ENTER', cx, y(470), { size: 14, color: COLORS.yellow, glow: 10 });
          text(ctx, '(C) 2026 NEON ARCADE', cx, y(520), { size: 8, color: COLORS.dim });
        } else if (shell.state === 'paused') {
          dim(ctx, W, H, 0.7);
          text(ctx, 'PAUSED', cx, cy - 20, { size: 28, color: COLORS.cyan, glow: 16 });
          if (blink()) text(ctx, isTouch ? 'TAP TO RESUME' : 'PRESS P TO RESUME', cx, cy + 30, { size: 10 });
        } else if (shell.state === 'entry') {
          dim(ctx, W, H, 0.8);
          if (blink(250)) text(ctx, 'NEW HIGH SCORE!', cx, y(150), { size: 18, color: COLORS.yellow, glow: 14 });
          text(ctx, pad(final), cx, y(200), { size: 24, color: COLORS.pink, glow: 12 });
          text(ctx, 'ENTER YOUR INITIALS', cx, y(280), { size: 10 });
          entry.draw(ctx, cx, y(360), shell.clock);
          text(ctx, isTouch ? 'UP/DOWN PICK - TAP NEXT' : 'UP/DOWN PICK - ENTER NEXT', cx, y(450), { size: 8, color: COLORS.dim });
        } else if (shell.state === 'gameover') {
          dim(ctx, W, H, 0.75);
          text(ctx, 'GAME OVER', cx, y(120), { size: 32, color: COLORS.red, glow: 18 });
          text(ctx, 'SCORE ' + pad(final) + (summary ? '  ' + summary : ''), cx, y(170), { size: 12 });
          drawScoreTable(ctx, id, cx, y(240), { highlight: rank, t: shell.clock });
          if (shell.stateTime > 600 && blink()) text(ctx, isTouch ? 'TAP TO PLAY AGAIN' : 'ENTER TO PLAY AGAIN', cx, y(470), { size: 12, color: COLORS.yellow, glow: 10 });
          if (!isTouch) text(ctx, 'ESC FOR TITLE', cx, y(510), { size: 8, color: COLORS.dim });
        }
      },
    };
    onBlur(() => { if (pauseIn.includes(shell.state)) shell.pause(); });
    return shell;
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
    sound, createInput, createRepeater, createSticks, createPlatforms, createBombs, scores, gridSearch, floodFill, createShell, vector, createBlasts,
    text, roundRect, dim, triangle, drawCube, makeSprite, crewSprite, drawSprite, drawScoreTable, InitialsEntry, createEffects,
    waitForFont,
  };
})();
