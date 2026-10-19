/*
 * Road Hopper: the third game in the Neon Arcade.
 * Hop across five lanes of traffic, then ride logs and lily pads over the river
 * to fill all five homes at the top.
 * States: title (traffic runs behind the menu) -> playing <-> paused
 *         -> dying -> clear (all homes filled) -> entry (initials) -> gameover
 */
(function () {
  'use strict';

  const A = window.Arcade;
  const C = A.COLORS;

  const GAME_ID = 'hopper';
  const CELL = 32;
  const COLS = 15;
  const ROWS = 13;
  const HUD = 48;
  const FOOT = 32;
  const W = COLS * CELL;
  const H = HUD + ROWS * CELL + FOOT;

  const START = { col: 7, row: ROWS - 1 };
  const GOAL_ROW = 0;
  const MEDIAN_ROW = 6;
  const BAY_COLS = [1, 4, 7, 10, 13];

  const HOP_MS = 110;
  const TIME_MS = 30000;
  const DYING_MS = 1300;
  const CLEAR_MS = 2200;
  const START_LIVES = 3;
  const SINK_CYCLE = 5000;

  // Lane objects wrap around a loop wider than the screen so they slide in and out of view.
  const MARGIN = 5 * CELL;
  const PERIOD = W + 2 * MARGIN;

  // speed is px per ms; negative moves left. sinks lists which pad groups dive underwater.
  const LANES = [
    { row: 1, kind: 'log', len: 3, count: 3, speed: 0.05 },
    { row: 2, kind: 'pads', len: 2, count: 4, speed: -0.06, sinks: [0] },
    { row: 3, kind: 'log', len: 4, count: 3, speed: 0.08 },
    { row: 4, kind: 'log', len: 2, count: 4, speed: -0.045 },
    { row: 5, kind: 'pads', len: 3, count: 3, speed: 0.055, sinks: [1] },
    { row: 7, kind: 'truck', len: 2, count: 2, speed: -0.045, color: '#c9c4e8' },
    { row: 8, kind: 'racer', len: 1, count: 1, speed: 0.16, color: C.red },
    { row: 9, kind: 'car', len: 1, count: 3, speed: -0.06, color: C.pink },
    { row: 10, kind: 'car', len: 1, count: 3, speed: 0.05, color: C.yellow },
    { row: 11, kind: 'car', len: 1, count: 4, speed: -0.04, color: C.cyan },
  ];

  const DIRS = {
    up: { x: 0, y: -1, angle: 0 },
    down: { x: 0, y: 1, angle: Math.PI },
    left: { x: -1, y: 0, angle: -Math.PI / 2 },
    right: { x: 1, y: 0, angle: Math.PI / 2 },
  };

  const canvas = document.getElementById('game');
  const { ctx } = A.createScreen(canvas, W, H);
  const input = A.createInput({ swipeTarget: canvas });
  const fx = A.createEffects();

  let state = 'title';
  let stateTime = 0;
  let clock = 0;
  let hiScore = A.scores.best(GAME_ID);
  A.scores.onChange(() => { hiScore = A.scores.best(GAME_ID); });

  let lanes, player, bays, star, starTimer, furthest, timeLeft;
  let level = 1;
  let score = 0;
  let lives = START_LIVES;
  let death = null;
  let shake = 0;
  let banner = null;
  let entry = null;
  let rank = -1;

  const mod = (a, n) => ((a % n) + n) % n;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const blink = (ms = 500) => Math.floor(clock / ms) % 2 === 0;
  const rowY = row => HUD + row * CELL;
  const isRiver = row => row > GOAL_ROW && row < MEDIAN_ROW;
  const laneAt = row => lanes.find(l => l.row === row);

  function setState(next) {
    state = next;
    stateTime = 0;
  }

  // ---------- Setup ----------

  function makeLanes() {
    const scale = Math.min(2.2, 1 + (level - 1) * 0.15);
    lanes = LANES.map(def => ({
      ...def,
      speed: def.speed * scale,
      offset: 0,
      items: Array.from({ length: def.count }, (_, i) => ({
        base: (i * PERIOD) / def.count,
        sinks: (def.sinks || []).includes(i),
        phase: Math.random() * SINK_CYCLE,
      })),
    }));
  }

  function respawn() {
    player = { x: START.col * CELL, row: START.row, fromX: 0, fromRow: 0, hop: 0, face: 'up', queued: null };
    furthest = START.row;
    timeLeft = TIME_MS;
  }

  function resetGame() {
    level = 1;
    score = 0;
    lives = START_LIVES;
    bays = BAY_COLS.map(() => false);
    star = null;
    starTimer = 6000;
    banner = null;
    fx.clear();
    makeLanes();
    respawn();
  }

  function newGame() {
    if (window.track) track('play:' + GAME_ID);
    resetGame();
    setState('playing');
    banner = { text: 'LEVEL 1', t: 0 };
    A.sound.play('start');
  }

  function showTitle() {
    resetGame();
    setState('title');
  }

  function pause() {
    setState('paused');
    A.sound.play('pause');
  }

  // ---------- Lane objects ----------

  const itemX = (lane, item) => mod(item.base + lane.offset, PERIOD) - MARGIN;

  // 1 = fully afloat, 0 = fully underwater.
  function floatLevel(item) {
    if (!item.sinks) return 1;
    const t = mod(clock + item.phase, SINK_CYCLE);
    if (t < 3200) return 1;
    if (t < 3700) return 1 - (t - 3200) / 500;
    if (t < 4500) return 0;
    return (t - 4500) / 500;
  }

  function hitByTraffic(lane) {
    return lane.items.some(item => {
      const x = itemX(lane, item);
      return player.x + CELL - 7 > x + 2 && player.x + 7 < x + lane.len * CELL - 2;
    });
  }

  function platformUnder(lane) {
    const cx = player.x + CELL / 2;
    return lane.items.find(item => {
      if (floatLevel(item) < 0.35) return false;
      const x = itemX(lane, item);
      return cx >= x + 2 && cx <= x + lane.len * CELL - 2;
    });
  }

  // ---------- Player ----------

  function hop(name) {
    if (player.hop > 0) {
      player.queued = name; // buffer one hop so quick double taps aren't lost
      return;
    }
    const d = DIRS[name];
    const row = player.row + d.y;
    const x = clamp(player.x + d.x * CELL, 0, W - CELL);
    player.face = name;
    if (row < GOAL_ROW || row >= ROWS || (row === player.row && x === player.x)) return;
    player.fromX = player.x;
    player.fromRow = player.row;
    player.x = x;
    player.row = row;
    player.hop = HOP_MS;
    A.sound.play('hop');
  }

  function land() {
    if (player.row < furthest) {
      score += 10 * (furthest - player.row);
      furthest = player.row;
    }
    if (player.row !== GOAL_ROW) return;

    const cx = player.x + CELL / 2;
    const bay = BAY_COLS.findIndex(col => Math.abs(col * CELL + CELL / 2 - cx) < CELL * 0.6);
    if (bay < 0 || bays[bay]) {
      die('splat'); // hit the hedge, or a home that's already taken
      return;
    }

    bays[bay] = true;
    const bx = BAY_COLS[bay] * CELL + CELL / 2;
    const by = rowY(GOAL_ROW) + CELL / 2;
    let points = 50 + Math.ceil(timeLeft / 1000) * 10;
    if (star && star.bay === bay) {
      points += 200;
      star = null;
    }
    score += points;
    fx.burst(bx, by, C.green, 20);
    fx.float(bx, by - 10, '+' + points);
    A.sound.play('home');

    if (bays.every(Boolean)) levelClear();
    else respawn();
  }

  function die(kind) {
    death = { kind, x: player.x + CELL / 2, y: rowY(player.row) + CELL / 2 };
    lives--;
    if (kind === 'squash') {
      shake = 8;
      fx.burst(death.x, death.y, C.red, 24);
      A.sound.play('squash');
    } else if (kind === 'splash') {
      fx.burst(death.x, death.y, C.cyan, 20, 0.1);
      A.sound.play('splash');
    } else {
      fx.burst(death.x, death.y, C.yellow, 16);
      A.sound.play('lose');
    }
    setState('dying');
  }

  function levelClear() {
    score += 1000;
    fx.float(W / 2, H / 2, 'ALL HOME +1000', C.green);
    A.sound.play('levelup');
    setState('clear');
  }

  function endRound() {
    if (A.scores.qualifies(GAME_ID, score)) {
      entry = new A.InitialsEntry();
      setState('entry');
      A.sound.play('highscore');
    } else {
      rank = -1;
      setState('gameover');
    }
  }

  // ---------- Input ----------

  input.on(action => {
    switch (state) {
      case 'title':
        if (action === 'start' || action === 'tap') newGame();
        break;
      case 'playing':
        if (DIRS[action]) hop(action);
        else if (action === 'tap') hop('up');
        else if (action === 'pause') pause();
        break;
      case 'paused':
        if (action === 'pause' || action === 'start' || action === 'tap') {
          setState('playing');
          A.sound.play('pause');
        }
        break;
      case 'entry': {
        const name = entry.handle(action);
        if (name) {
          rank = A.scores.add(GAME_ID, name, score);
          hiScore = A.scores.best(GAME_ID);
          setState('gameover');
        }
        break;
      }
      case 'gameover':
        if (stateTime < 600) break;
        if (action === 'start' || action === 'tap') newGame();
        else if (action === 'pause') showTitle();
        break;
    }
  });

  A.onBlur(() => { if (state === 'playing') pause(); });

  // ---------- Update ----------

  function updatePlayer(dt) {
    timeLeft -= dt;
    if (timeLeft <= 0) {
      die('time');
      return;
    }

    if (player.hop > 0) {
      player.hop -= dt;
      if (player.hop > 0) return;
      player.hop = 0;
      land();
      if (state !== 'playing') return;
      if (player.queued) {
        const next = player.queued;
        player.queued = null;
        hop(next);
        return;
      }
    }

    const lane = laneAt(player.row);
    if (!lane) return;
    if (isRiver(player.row)) {
      if (!platformUnder(lane)) {
        die('splash');
        return;
      }
      player.x += lane.speed * dt; // ride along
      if (player.x < -CELL / 2 || player.x > W - CELL / 2) die('splash');
    } else if (hitByTraffic(lane)) {
      die('squash');
    }
  }

  function updateStar(dt) {
    if (star && (star.ttl -= dt) <= 0) star = null;
    if ((starTimer -= dt) > 0) return;
    starTimer = 8000 + Math.random() * 6000;
    const empty = bays.map((filled, i) => (filled ? -1 : i)).filter(i => i >= 0);
    if (empty.length) star = { bay: empty[Math.floor(Math.random() * empty.length)], ttl: 5000 };
  }

  function update(dt) {
    clock += dt;
    stateTime += dt;
    shake = Math.max(0, shake - dt * 0.02);
    fx.update(dt);
    if (banner && (banner.t += dt) > 1600) banner = null;

    // Traffic and the river keep moving behind menus so the screen always feels alive.
    if (state !== 'paused') lanes.forEach(l => { l.offset += l.speed * dt; });

    if (state === 'playing') {
      updateStar(dt);
      updatePlayer(dt);
    } else if (state === 'dying' && stateTime >= DYING_MS) {
      death = null;
      if (lives > 0) {
        respawn();
        setState('playing');
      } else {
        endRound();
      }
    } else if (state === 'clear' && stateTime >= CLEAR_MS) {
      level++;
      bays = BAY_COLS.map(() => false);
      star = null;
      makeLanes();
      respawn();
      banner = { text: 'LEVEL ' + level, t: 0 };
      setState('playing');
    } else if (state === 'gameover' && stateTime >= 20000) {
      showTitle();
    }
  }

  // ---------- Render ----------

  function drawHud() {
    const shown = state === 'title' ? 0 : score;
    A.text(ctx, 'SCORE', 16, 16, { size: 8, color: C.dim, align: 'left' });
    A.text(ctx, A.pad(shown), 16, 33, { size: 14, align: 'left' });
    A.text(ctx, 'LEVEL', W / 2, 16, { size: 8, color: C.dim });
    A.text(ctx, String(level), W / 2, 33, { size: 14, color: C.green });
    A.text(ctx, 'HI-SCORE', W - 16, 16, { size: 8, color: C.dim, align: 'right' });
    A.text(ctx, A.pad(Math.max(hiScore, shown)), W - 16, 33, { size: 14, color: C.pink, align: 'right' });
    ctx.fillStyle = 'rgba(41, 240, 255, 0.6)';
    ctx.fillRect(0, HUD - 2, W, 2);
  }

  function drawStar(cx, cy, r, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(clock / 400);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 ? r * 0.4 : r;
      const a = (i / 10) * Math.PI * 2;
      ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawWorld() {
    // Goal hedge with five homes
    const gy = rowY(GOAL_ROW);
    ctx.fillStyle = '#0c2a1a';
    ctx.fillRect(0, gy, W, CELL);
    ctx.fillStyle = '#12402a';
    for (let x = 0; x < W; x += 8) ctx.fillRect(x, gy + ((x / 8) % 2) * 4, 4, CELL - 4);
    BAY_COLS.forEach((col, i) => {
      const x = col * CELL;
      ctx.save();
      ctx.fillStyle = '#050c1c';
      ctx.strokeStyle = C.cyan;
      ctx.lineWidth = 2;
      ctx.shadowColor = C.cyan;
      ctx.shadowBlur = 8;
      ctx.fillRect(x + 2, gy + 3, CELL - 4, CELL - 3);
      ctx.strokeRect(x + 2, gy + 3, CELL - 4, CELL - 3);
      ctx.restore();
      if (bays[i]) drawHopper(x + CELL / 2, gy + CELL / 2 + 1, 'down', 0.8, null);
      else if (star && star.bay === i && (star.ttl > 1500 || blink(100))) drawStar(x + CELL / 2, gy + CELL / 2 + 1, 9, C.yellow);
    });

    // River with drifting wave marks
    ctx.fillStyle = '#081236';
    ctx.fillRect(0, rowY(1), W, CELL * 5);
    ctx.fillStyle = 'rgba(41, 240, 255, 0.18)';
    for (let r = 1; r < MEDIAN_ROW; r++) {
      const shift = mod(clock * 0.02 * (r % 2 ? 1 : -1), 64);
      for (let x = -64 + shift; x < W; x += 64) ctx.fillRect(x + (r * 23) % 64, rowY(r) + 15, 14, 2);
    }

    // Safe sidewalks
    for (const r of [MEDIAN_ROW, START.row]) {
      ctx.fillStyle = '#1c1240';
      ctx.fillRect(0, rowY(r), W, CELL);
      ctx.fillStyle = 'rgba(255, 46, 136, 0.25)';
      ctx.fillRect(0, rowY(r), W, 2);
      ctx.fillRect(0, rowY(r) + CELL - 2, W, 2);
      for (let x = 0; x < W; x += CELL) ctx.fillRect(x, rowY(r) + 2, 1, CELL - 4);
    }

    // Road with dashed lane lines
    ctx.fillStyle = '#0d0c14';
    ctx.fillRect(0, rowY(MEDIAN_ROW + 1), W, CELL * 5);
    ctx.fillStyle = 'rgba(255, 225, 77, 0.35)';
    for (let r = MEDIAN_ROW + 2; r < START.row; r++) {
      for (let x = 4; x < W; x += 32) ctx.fillRect(x, rowY(r) - 1, 16, 2);
    }
  }

  function drawVehicle(lane, x) {
    const y = rowY(lane.row);
    const len = lane.len * CELL;
    const right = lane.speed > 0;
    ctx.save();
    ctx.shadowColor = lane.color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = lane.color;
    if (lane.kind === 'truck') {
      const cab = 22;
      const cabX = right ? x + len - cab - 2 : x + 2;
      ctx.fillStyle = C.pink;
      A.roundRect(ctx, cabX, y + 5, cab, CELL - 10, 4);
      ctx.fillStyle = lane.color;
      A.roundRect(ctx, right ? x + 2 : x + cab + 4, y + 4, len - cab - 6, CELL - 8, 3);
    } else if (lane.kind === 'racer') {
      A.roundRect(ctx, x + 2, y + 8, len - 4, CELL - 16, 7);
    } else {
      A.roundRect(ctx, x + 3, y + 6, len - 6, CELL - 12, 6);
    }
    ctx.restore();

    // Windshield, headlights and taillights show which way it's going.
    const front = right ? x + len - 4 : x + 1;
    const back = right ? x + 1 : x + len - 4;
    ctx.fillStyle = 'rgba(7, 6, 15, 0.55)';
    if (lane.kind !== 'truck') ctx.fillRect(right ? x + len - 14 : x + 9, y + 10, 5, CELL - 20);
    ctx.fillStyle = C.yellow;
    ctx.fillRect(front, y + 8, 3, 4);
    ctx.fillRect(front, y + CELL - 12, 3, 4);
    ctx.fillStyle = C.red;
    ctx.fillRect(back, y + 9, 3, 3);
    ctx.fillRect(back, y + CELL - 12, 3, 3);
  }

  function drawLog(lane, x) {
    const y = rowY(lane.row);
    const len = lane.len * CELL;
    ctx.fillStyle = '#7a4120';
    A.roundRect(ctx, x + 1, y + 5, len - 2, CELL - 10, 10);
    ctx.fillStyle = '#b8642e';
    ctx.fillRect(x + 8, y + 10, len - 16, 2);
    ctx.fillRect(x + 14, y + 18, len - 28, 2);
    ctx.fillStyle = '#e09a5a';
    ctx.beginPath();
    ctx.arc(x + len - 9, y + CELL / 2, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPads(lane, item, x) {
    const level = floatLevel(item);
    const y = rowY(lane.row) + CELL / 2;
    for (let k = 0; k < lane.len; k++) {
      const cx = x + k * CELL + CELL / 2;
      if (level <= 0) {
        // Underwater: just a ripple so players can see it's coming back
        ctx.strokeStyle = 'rgba(41, 240, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, y, 8 + Math.sin(clock / 150) * 2, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      ctx.save();
      ctx.globalAlpha = 0.35 + level * 0.65;
      ctx.fillStyle = item.sinks && level < 1 ? '#1f9e4c' : C.green;
      ctx.shadowColor = C.green;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(cx, y, 13 * (0.6 + level * 0.4), 0.25, Math.PI * 2 - 0.25);
      ctx.lineTo(cx, y);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawLanes() {
    for (const lane of lanes) {
      for (const item of lane.items) {
        const x = itemX(lane, item);
        if (x > W || x + lane.len * CELL < 0) continue;
        if (lane.kind === 'log') drawLog(lane, x);
        else if (lane.kind === 'pads') drawPads(lane, item, x);
        else drawVehicle(lane, x);
      }
    }
  }

  // Drawn facing up, then rotated to face the hop direction.
  function drawHopper(cx, cy, face, scale, flash) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(DIRS[face].angle);
    ctx.scale(scale, scale);
    ctx.fillStyle = flash || C.green;
    ctx.shadowColor = flash || C.green;
    ctx.shadowBlur = 12;
    A.roundRect(ctx, -10, -9, 20, 20, 7);
    ctx.shadowBlur = 0;
    // feet
    ctx.fillRect(-13, 5, 5, 6);
    ctx.fillRect(8, 5, 5, 6);
    ctx.fillRect(-12, -6, 4, 4);
    ctx.fillRect(8, -6, 4, 4);
    // eyes
    ctx.fillStyle = C.text;
    ctx.fillRect(-8, -12, 6, 6);
    ctx.fillRect(2, -12, 6, 6);
    ctx.fillStyle = C.bg;
    ctx.fillRect(-6, -12, 3, 3);
    ctx.fillRect(4, -12, 3, 3);
    ctx.restore();
  }

  function drawPlayer() {
    if (state === 'dying' && death) {
      if (death.kind === 'splash') {
        const t = stateTime / DYING_MS;
        ctx.strokeStyle = 'rgba(41, 240, 255, ' + (1 - t) + ')';
        ctx.lineWidth = 2;
        for (const k of [0, 0.35]) {
          ctx.beginPath();
          ctx.arc(death.x, death.y, 4 + (t + k) * 22, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        // Flattened hopper with X eyes
        ctx.fillStyle = blink(120) ? C.red : C.green;
        A.roundRect(ctx, death.x - 14, death.y - 5, 28, 10, 4);
        A.text(ctx, 'XX', death.x, death.y, { size: 8, color: C.bg });
      }
      return;
    }
    if (state !== 'playing' && state !== 'paused') return;

    const p = player.hop / HOP_MS; // 1 at take-off, 0 on landing
    const x = player.x + (player.fromX - player.x) * p;
    const y = rowY(player.row) + (rowY(player.fromRow) - rowY(player.row)) * p;
    const lift = player.hop > 0 ? Math.sin((1 - p) * Math.PI) : 0;
    drawHopper(x + CELL / 2, y + CELL / 2, player.face, 1 + lift * 0.25, null);
  }

  function drawFooter() {
    const y = H - FOOT;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, y, W, FOOT);
    ctx.fillStyle = 'rgba(41, 240, 255, 0.6)';
    ctx.fillRect(0, y, W, 2);

    const spare = Math.max(0, lives - (state === 'playing' || state === 'paused' ? 1 : 0));
    for (let i = 0; i < spare; i++) drawHopper(20 + i * 24, y + 17, 'up', 0.55, null);

    if (state === 'title') return;
    const frac = clamp(timeLeft / TIME_MS, 0, 1);
    const barW = 200;
    const color = frac > 0.5 ? C.green : frac > 0.25 ? C.yellow : C.red;
    A.text(ctx, 'TIME', W - barW - 24, y + 17, { size: 8, color: C.dim, align: 'right' });
    ctx.fillStyle = '#1c1a33';
    ctx.fillRect(W - barW - 16, y + 11, barW, 12);
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillRect(W - 16 - barW * frac, y + 11, barW * frac, 12);
    ctx.restore();
  }

  const dim = alpha => A.dim(ctx, W, H, alpha);

  function drawOverlay() {
    const cx = W / 2;
    const cy = H / 2;
    const startPrompt = A.isTouch ? 'TAP TO START' : 'PRESS ENTER';

    if (state === 'title') {
      dim(0.6);
      A.text(ctx, 'ROAD', cx, 116, { size: 32, color: C.cyan, glow: 18 });
      A.text(ctx, 'HOPPER', cx, 164, { size: 40, color: C.pink, glow: 20 });
      if (Math.floor(clock / 5000) % 2 === 0) {
        A.text(ctx, 'HOP ACROSS THE ROAD', cx, 236, { size: 10, color: C.yellow });
        A.text(ctx, "RIDE LOGS & PADS - DON'T SWIM", cx, 266, { size: 10, color: C.cyan });
        A.text(ctx, 'SOME PADS SINK!', cx, 296, { size: 10, color: C.green });
        A.text(ctx, 'FILL ALL 5 HOMES', cx, 326, { size: 10 });
        A.text(ctx, A.isTouch ? 'SWIPE, TAP OR D-PAD' : 'ARROWS / WASD TO HOP', cx, 356, { size: 10, color: C.dim });
      } else {
        A.drawScoreTable(ctx, GAME_ID, cx, 226);
      }
      if (blink()) A.text(ctx, startPrompt, cx, 412, { size: 14, color: C.yellow, glow: 10 });
      A.text(ctx, '(C) 2026 NEON ARCADE', cx, 448, { size: 8, color: C.dim });
    } else if (state === 'paused') {
      dim(0.7);
      A.text(ctx, 'PAUSED', cx, cy - 20, { size: 28, color: C.cyan, glow: 16 });
      if (blink()) A.text(ctx, A.isTouch ? 'TAP TO RESUME' : 'PRESS P TO RESUME', cx, cy + 30, { size: 10 });
    } else if (state === 'dying' && death) {
      const msg = { squash: 'SPLAT!', splash: 'SPLASH!', splat: 'OUCH!', time: 'TIME UP!' }[death.kind];
      A.text(ctx, msg, cx, rowY(MEDIAN_ROW) + CELL / 2, { size: 16, color: C.yellow, glow: 12 });
    } else if (state === 'clear') {
      A.text(ctx, 'LEVEL CLEAR!', cx, rowY(MEDIAN_ROW) + CELL / 2, { size: 20, color: C.green, glow: 16 });
    } else if (state === 'entry') {
      dim(0.8);
      if (blink(250)) A.text(ctx, 'NEW HIGH SCORE!', cx, 120, { size: 18, color: C.yellow, glow: 14 });
      A.text(ctx, A.pad(score), cx, 170, { size: 24, color: C.pink, glow: 12 });
      A.text(ctx, 'ENTER YOUR INITIALS', cx, 240, { size: 10 });
      entry.draw(ctx, cx, 320, clock);
      A.text(ctx, A.isTouch ? 'UP/DOWN PICK - TAP NEXT' : 'UP/DOWN PICK - ENTER NEXT', cx, 410, { size: 8, color: C.dim });
    } else if (state === 'gameover') {
      dim(0.75);
      A.text(ctx, 'GAME OVER', cx, 104, { size: 32, color: C.red, glow: 18 });
      A.text(ctx, 'SCORE ' + A.pad(score) + '  LEVEL ' + level, cx, 150, { size: 12 });
      A.drawScoreTable(ctx, GAME_ID, cx, 206, { highlight: rank, t: clock });
      if (stateTime > 600 && blink()) A.text(ctx, A.isTouch ? 'TAP TO PLAY AGAIN' : 'ENTER TO PLAY AGAIN', cx, 412, { size: 12, color: C.yellow, glow: 10 });
      if (!A.isTouch) A.text(ctx, 'ESC FOR TITLE', cx, 448, { size: 8, color: C.dim });
    }

    if (banner && state === 'playing') {
      ctx.globalAlpha = 1 - banner.t / 1600;
      A.text(ctx, banner.text, cx, rowY(MEDIAN_ROW) + CELL / 2, { size: 18, color: C.green, glow: 14 });
      ctx.globalAlpha = 1;
    }
  }

  function render() {
    ctx.save();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    drawHud();
    drawWorld();
    drawLanes();
    drawPlayer();
    fx.draw(ctx);
    drawFooter();
    drawOverlay();
    ctx.restore();
  }

  showTitle();
  A.waitForFont().then(() => A.startLoop({ update, render }));
})();
