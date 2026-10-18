/*
 * Deep Driller: the fifth game in the Neon Arcade.
 * Dig tunnels through four layers of dirt, pump enemies until they pop, and drop
 * rocks on them for big points. Blobs can ghost through dirt; Sparkers zap sideways.
 * States: title (enemies roam behind the menu) -> playing <-> paused, dying,
 *         clear (round done) -> entry (initials) -> gameover
 */
(function () {
  'use strict';

  const A = window.Arcade;
  const C = A.COLORS;

  const GAME_ID = 'driller';
  const CELL = 32;
  const COLS = 15;
  const ROWS = 16; // row 0 is the surface
  const HUD = 48;
  const FOOT = 40;
  const W = COLS * CELL;
  const FIELD_H = ROWS * CELL;
  const H = HUD + FIELD_H + FOOT;

  // Dirt is tracked in 8px blocks so tunnels carve smoothly as the driller moves.
  const B = 8;
  const BPC = CELL / B;
  const DC = COLS * BPC;
  const DR = ROWS * BPC;

  const START = { c: 7, r: 0 };
  const SHAFT_ROWS = 6;
  const PLAYER_SPEED = 0.1;
  const PUMP_SPEED = 0.5;
  const PUMP_MAX = 3 * CELL;
  const PUMP_CD = 300;
  const POP_AT = 4;
  const DEFLATE_MS = 600;
  const CHARGE_MS = 600;
  const ZAP_MS = 500;
  const ZAP_LEN = 3 * CELL;
  const WOBBLE_MS = 700;
  const ROCK_SPEED = 0.22;
  const FREEZE_MS = 1500;
  const DYING_MS = 1600;
  const CLEAR_MS = 2200;
  const START_LIVES = 3;
  const BONUS_LIFE_AT = 10000;

  const DEPTH_POINTS = [200, 300, 400, 500];
  const CRUSH_POINTS = [0, 1000, 2500, 4000, 6000, 8000, 10000, 12000, 15000];
  const DIRT = ['#8a4b1c', '#7a2e3a', '#4b2a6b', '#1f3a6b'];
  const SPECK = ['#c47a3a', '#b04a5a', '#7a4fb0', '#3f6fc0'];
  const TUNNEL = '#05040c';

  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const DIR_LIST = Object.values(DIRS);

  // ---------- Sprites (drawn facing right) ----------

  const PLAYER_PAL = { Y: C.yellow, W: C.text, S: '#ffcc99', B: C.bg, C: C.cyan, G: C.dim };
  const PLAYER_SPRITES = [
    ['..YYYY..', '.YYYYYYW', '..SSSS..', '..SSBS..', '.CCCCCC.', 'CCCCCCGG', 'CC.CC...', '.CC.CC..'],
    ['..YYYY..', '.YYYYYYW', '..SSSS..', '..SSBS..', '.CCCCCC.', 'CCCCCCGG', '.CCCC...', 'CC..CC..'],
  ].map(m => A.makeSprite(m, PLAYER_PAL));

  const ENEMY_MAPS = {
    blob: [
      ['..PPPP..', '.PPPPPP.', 'PPWWPWWP', 'PPWBPWBP', 'PPPPPPPP', 'PPPPPPPP', '.PP..PP.', '.P....P.'],
      ['..PPPP..', '.PPPPPP.', 'PPWWPWWP', 'PPWBPWBP', 'PPPPPPPP', 'PPPPPPPP', 'PP.PP.PP', '........'],
    ],
    sparker: [
      ['.P.P.P..', 'PPPPPPP.', 'PPPWBPPP', 'PPPPPPPO', '.PPPPPP.', 'PPPPPPP.', '.P...P..', 'PP..PP..'],
      ['..P.P.P.', 'PPPPPPP.', 'PPPWBPPP', 'PPPPPPPO', '.PPPPPP.', 'PPPPPPP.', '..P.P...', '.PP.PP..'],
    ],
  };
  const ENEMY_COLORS = { blob: C.pink, sparker: C.green };
  const SPRITES = {};
  for (const type of Object.keys(ENEMY_MAPS)) {
    SPRITES[type] = ENEMY_MAPS[type].map(m => A.makeSprite(m, { P: ENEMY_COLORS[type], W: C.text, B: C.bg, O: '#ff9f1c' }));
    SPRITES[type + 'Pale'] = ENEMY_MAPS[type].map(m => A.makeSprite(m, { P: '#ffd6ec', W: C.text, B: C.bg, O: C.text }));
  }

  // ---------- State ----------

  const canvas = document.getElementById('game');
  const { ctx } = A.createScreen(canvas, W, H);
  const input = A.createInput({ swipeTarget: canvas });
  const fx = A.createEffects();

  // Offscreen terrain: painted once per round, then tunnels are cut into it as blocks are dug.
  const terrain = document.createElement('canvas');
  terrain.width = W * 2;
  terrain.height = FIELD_H * 2;
  const tctx = terrain.getContext('2d');
  tctx.scale(2, 2);

  let state = 'title';
  let stateTime = 0;
  let clock = 0;
  let hiScore = A.scores.best(GAME_ID);
  A.scores.onChange(() => { hiScore = A.scores.best(GAME_ID); });

  let round = 1;
  let score = 0;
  let lives = START_LIVES;
  let bonusLife = false;
  let dug, enemies, rocks, crystal, player;
  let rocksDropped = 0;
  let digPoints = 0;
  let freeze = 0;
  let lastDir = null;
  let wander = { x: W / 2, y: FIELD_H / 2 };
  let death = null;
  let shake = 0;
  let banner = null;
  let entry = null;
  let rank = -1;
  let stepSound = 0;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));
  const blink = (ms = 500) => Math.floor(clock / ms) % 2 === 0;
  const center = n => n * CELL + CELL / 2;
  const toCell = px => Math.round((px - CELL / 2) / CELL);
  const layerOf = r => clamp(Math.floor((r - 1) / 4), 0, 3);
  const enemySpeed = () => Math.min(0.085, 0.045 + round * 0.004);
  const ghostDelay = () => Math.max(3000, 5000 + Math.random() * 7000 - round * 300);
  const sfx = (name, arg) => { if (state !== 'title') A.sound.play(name, arg); };

  function setState(next) {
    state = next;
    stateTime = 0;
  }

  // ---------- Terrain ----------

  const isDug = (bx, by) => bx >= 0 && by >= 0 && bx < DC && by < DR && dug[by * DC + bx] === 1;
  const isDugAt = (x, y) => isDug(Math.floor(x / B), Math.floor(y / B));

  function allDug(bx0, bx1, by0, by1) {
    for (let by = by0; by <= by1; by++) {
      for (let bx = bx0; bx <= bx1; bx++) if (!isDug(bx, by)) return false;
    }
    return true;
  }

  // Returns how many new blocks were dug.
  function digRect(x0, y0, x1, y1) {
    let count = 0;
    tctx.fillStyle = TUNNEL;
    for (let by = Math.max(BPC, Math.floor(y0 / B)); by <= Math.min(DR - 1, Math.floor((y1 - 1) / B)); by++) {
      for (let bx = Math.max(0, Math.floor(x0 / B)); bx <= Math.min(DC - 1, Math.floor((x1 - 1) / B)); bx++) {
        const i = by * DC + bx;
        if (dug[i]) continue;
        dug[i] = 1;
        tctx.fillRect(bx * B, by * B, B, B);
        count++;
      }
    }
    return count;
  }

  const digCell = (c, r) => digRect(c * CELL, r * CELL, (c + 1) * CELL, (r + 1) * CELL);

  function paintTerrain() {
    // Surface sky with a few stars
    const sky = tctx.createLinearGradient(0, 0, 0, CELL);
    sky.addColorStop(0, '#120a2e');
    sky.addColorStop(1, '#2a0f45');
    tctx.fillStyle = sky;
    tctx.fillRect(0, 0, W, CELL);
    tctx.fillStyle = 'rgba(244, 241, 255, 0.6)';
    for (let i = 0; i < 18; i++) tctx.fillRect(Math.random() * W, Math.random() * (CELL - 8), 1, 1);

    // Four layers of dirt, each a different colour, with speckles
    for (let r = 1; r < ROWS; r++) {
      const layer = layerOf(r);
      tctx.fillStyle = DIRT[layer];
      tctx.fillRect(0, r * CELL, W, CELL);
      tctx.fillStyle = SPECK[layer];
      for (let i = 0; i < 26; i++) tctx.fillRect(Math.floor(Math.random() * W), r * CELL + Math.floor(Math.random() * CELL), 2, 2);
    }
    tctx.fillStyle = 'rgba(61, 255, 122, 0.8)';
    tctx.fillRect(0, CELL - 2, W, 2);
    tctx.fillStyle = 'rgba(244, 241, 255, 0.12)';
    for (const r of [5, 9, 13]) tctx.fillRect(0, r * CELL, W, 1);
  }

  // Enemies can move between cell centres only along a fully dug corridor.
  function passage(c, r, d) {
    const nc = c + d.x;
    const nr = r + d.y;
    if (nc < 0 || nc >= COLS || nr < 1 || nr >= ROWS) return false;
    if (rockAt(nc, nr)) return false;
    if (d.x) {
      const bx0 = Math.min(c, nc) * BPC + 2;
      return allDug(bx0, bx0 + BPC - 1, r * BPC + 1, r * BPC + 2);
    }
    const by0 = Math.min(r, nr) * BPC + 2;
    return allDug(c * BPC + 1, c * BPC + 2, by0, by0 + BPC - 1);
  }

  const cellOpen = (c, r) => r >= 1 && allDug(c * BPC + 1, c * BPC + 2, r * BPC + 1, r * BPC + 2);

  // ---------- Rounds ----------

  function buildRound() {
    dug = new Uint8Array(DC * DR);
    for (let i = 0; i < DC * BPC; i++) dug[i] = 1; // the surface is open air
    paintTerrain();
    for (let r = 1; r <= SHAFT_ROWS; r++) digCell(START.c, r);

    const used = new Set();
    const key = (c, r) => c + ',' + r;
    const reserve = (c, r) => { for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) used.add(key(c + dc, r + dr)); };
    for (let r = 0; r <= SHAFT_ROWS + 1; r++) reserve(START.c, r);

    enemies = [];
    const count = Math.min(8, 3 + round);
    for (let i = 0; i < count; i++) {
      for (let tries = 0; tries < 40; tries++) {
        const c = 1 + Math.floor(Math.random() * (COLS - 2));
        const r = 3 + Math.floor(Math.random() * (ROWS - 4));
        const horizontal = Math.random() < 0.5;
        const cells = horizontal ? [[c - 1, r], [c, r], [c + 1, r]] : [[c, r - 1], [c, r], [c, r + 1]];
        if (cells.some(([cc, rr]) => used.has(key(cc, rr)) || rr < 2 || rr >= ROWS)) continue;
        cells.forEach(([cc, rr]) => { digCell(cc, rr); reserve(cc, rr); });
        const type = i % 3 === 2 ? 'sparker' : 'blob';
        enemies.push(makeEnemy(type, c, r));
        break;
      }
    }

    rocks = [];
    const rockCount = Math.min(6, 2 + Math.floor(round / 2));
    for (let i = 0; i < rockCount; i++) {
      for (let tries = 0; tries < 40; tries++) {
        const c = Math.floor(Math.random() * COLS);
        const r = 2 + Math.floor(Math.random() * (ROWS - 4));
        if (used.has(key(c, r)) || used.has(key(c, r + 1)) || c === START.c) continue;
        used.add(key(c, r));
        rocks.push({ c, x: c * CELL, y: r * CELL, state: 'still', t: 0, crushed: [] });
        break;
      }
    }

    crystal = null;
    rocksDropped = 0;
  }

  function makeEnemy(type, c, r) {
    const e = { type, home: { x: center(c), y: center(r) } };
    resetEnemy(e);
    return e;
  }

  function resetEnemy(e) {
    Object.assign(e, {
      x: e.home.x, y: e.home.y, tx: e.home.x, ty: e.home.y,
      dir: DIRS.left, face: -1, mode: 'walk', ghostT: 0, ghostTimer: ghostDelay(),
      inflate: 0, attached: false, deflateT: 0, charge: 0, zapT: 0, zapCd: 1500 + Math.random() * 2000,
    });
  }

  function resetPlayer() {
    player = { x: center(START.c), y: center(START.r), face: 'right', moving: false, walk: 0, pump: null, invuln: 0 };
    lastDir = null;
  }

  function startRound() {
    buildRound();
    resetPlayer();
    freeze = FREEZE_MS;
    banner = { text: 'ROUND ' + round, t: 0 };
  }

  function newGame() {
    round = 1;
    score = 0;
    lives = START_LIVES;
    bonusLife = false;
    digPoints = 0;
    fx.clear();
    startRound();
    setState('playing');
    A.sound.play('start');
  }

  function showTitle() {
    round = 1;
    fx.clear();
    startRound();
    banner = null;
    setState('title');
  }

  function pause() {
    setState('paused');
    A.sound.play('pause');
  }

  function addScore(points) {
    score += points;
    if (!bonusLife && score >= BONUS_LIFE_AT) {
      bonusLife = true;
      lives++;
      fx.float(player.x, player.y - 20, '1UP!', C.green);
      A.sound.play('powerup');
    }
  }

  function endRound() {
    if (A.scores.qualifies(GAME_ID, score)) {
      entry = new A.InitialsEntry();
      setState('entry');
      sfx('highscore');
    } else {
      rank = -1;
      setState('gameover');
    }
  }

  // ---------- Rocks ----------

  function rockAt(c, r) {
    return rocks.some(k => k.state !== 'crumble' && k.c === c && Math.round(k.y / CELL) === r);
  }

  function updateRocks(dt) {
    for (const rock of rocks) {
      rock.t += dt;
      const r = Math.round(rock.y / CELL);
      if (rock.state === 'still') {
        // Dirt underneath dug away: wobble, then fall.
        if (r + 1 < ROWS && isDug(rock.c * BPC + 1, (r + 1) * BPC) && isDug(rock.c * BPC + 2, (r + 1) * BPC)) {
          rock.state = 'wobble';
          rock.t = 0;
        }
      } else if (rock.state === 'wobble') {
        if (rock.t > WOBBLE_MS) rock.state = 'falling';
      } else if (rock.state === 'falling') {
        rock.y += ROCK_SPEED * dt;
        const by = Math.floor((rock.y + CELL) / B);
        crushUnder(rock);
        if (by >= DR || !isDug(rock.c * BPC + 1, by) || !isDug(rock.c * BPC + 2, by)) {
          rock.y = by * B - CELL;
          crumble(rock);
        }
      }
    }
    rocks = rocks.filter(k => !(k.state === 'crumble' && k.t > 500));
  }

  function crushUnder(rock) {
    const cx = rock.x + CELL / 2;
    const bottom = rock.y + CELL;
    for (const e of enemies) {
      if (e.dead || e.crushed || e.mode === 'ghost') continue;
      if (Math.abs(e.x - cx) < 22 && e.y > rock.y && e.y - bottom < 4) {
        e.crushed = true;
        if (e.attached) cancelPump();
        rock.crushed.push(e);
      }
    }
    rock.crushed.forEach(e => { e.x = cx; e.y = bottom + 8; });
    if (state === 'playing' && player.invuln <= 0 && Math.abs(player.x - cx) < 22 && player.y > rock.y + 16 && player.y - bottom < 6) {
      die('rock');
    }
  }

  function crumble(rock) {
    rock.state = 'crumble';
    rock.t = 0;
    rocksDropped++;
    fx.burst(rock.x + CELL / 2, HUD + rock.y + CELL, '#8a85b3', 14, 0.12);
    const n = rock.crushed.length;
    if (n) {
      const points = CRUSH_POINTS[Math.min(n, CRUSH_POINTS.length - 1)];
      rock.crushed.forEach(e => { e.dead = true; });
      if (state !== 'title') {
        addScore(points);
        fx.float(rock.x + CELL / 2, HUD + rock.y + 10, String(points), C.yellow);
      }
      sfx('squash');
    }
    // Two dropped rocks bring out a bonus crystal in the middle of the field.
    if (rocksDropped === 2 && !crystal) crystal = { x: center(START.c), y: center(8), ttl: 10000 };
  }

  // ---------- Enemies ----------

  const target = () => (state === 'title' ? wander : { x: player.x, y: player.y });

  function updateEnemy(e, dt) {
    if (e.dead || e.crushed) return;
    if (e.inflate > 0) {
      if (!e.attached && (e.deflateT += dt) > DEFLATE_MS) {
        e.deflateT = 0;
        e.inflate--;
      }
      return;
    }
    if (e.type === 'sparker' && updateSparker(e, dt)) return;

    const step = enemySpeed() * dt;
    const t = target();

    if (e.mode === 'ghost') {
      // Drift straight through the dirt, then become solid again inside a tunnel.
      e.ghostT += dt;
      const dist = Math.hypot(t.x - e.x, t.y - e.y) || 1;
      e.x += ((t.x - e.x) / dist) * step * 0.7;
      e.y += ((t.y - e.y) / dist) * step * 0.7;
      if (t.x !== e.x) e.face = Math.sign(t.x - e.x);
      const c = toCell(e.x);
      const r = toCell(e.y);
      if (e.ghostT > 1500 && Math.hypot(center(c) - e.x, center(r) - e.y) < 6 && cellOpen(c, r) && !rockAt(c, r)) {
        e.mode = 'walk';
        e.x = e.tx = center(c);
        e.y = e.ty = center(r);
        e.ghostTimer = ghostDelay();
      }
      return;
    }

    e.ghostTimer -= dt;
    if (e.x === e.tx && e.y === e.ty) {
      if (e.ghostTimer <= 0) {
        e.mode = 'ghost';
        e.ghostT = 0;
        return;
      }
      chooseNext(e, t);
    }
    e.x = approach(e.x, e.tx, step);
    e.y = approach(e.y, e.ty, step);
  }

  function chooseNext(e, t) {
    const c = toCell(e.x);
    const r = toCell(e.y);
    const open = DIR_LIST.filter(d => passage(c, r, d));
    if (!open.length) {
      e.ghostTimer = Math.min(e.ghostTimer, 1200); // boxed in: ghost out soon
      return;
    }
    let choices = open.filter(d => !(d.x === -e.dir.x && d.y === -e.dir.y));
    if (!choices.length) choices = open;
    let pick;
    if (Math.random() < 0.7) {
      const dist = d => Math.hypot(center(c + d.x) - t.x, center(r + d.y) - t.y);
      pick = choices.reduce((best, d) => (dist(d) < dist(best) ? d : best));
    } else {
      pick = choices[Math.floor(Math.random() * choices.length)];
    }
    e.dir = pick;
    if (pick.x) e.face = pick.x;
    e.tx = center(c + pick.x);
    e.ty = center(r + pick.y);
  }

  // Sparkers stop, flash, then zap a bolt sideways through the dirt. Returns true while busy.
  function updateSparker(e, dt) {
    e.zapCd -= dt;
    if (e.zapT > 0) {
      e.zapT -= dt;
      if (e.zapT <= 0) e.zapCd = 3000;
      return true;
    }
    if (e.charge > 0) {
      e.charge -= dt;
      if (e.charge <= 0) {
        e.zapT = ZAP_MS;
        sfx('zap');
      }
      return true;
    }
    const lined = state === 'playing' && Math.abs(player.y - e.y) < 8 && Math.abs(player.x - e.x) < ZAP_LEN + CELL;
    if (e.mode === 'walk' && e.x === e.tx && e.y === e.ty && e.zapCd <= 0 && lined && Math.random() < dt / 800) {
      e.face = Math.sign(player.x - e.x) || 1;
      e.charge = CHARGE_MS;
      return true;
    }
    return false;
  }

  function zapBox(e) {
    const x0 = e.face > 0 ? e.x + 10 : e.x - 10 - ZAP_LEN;
    return { x0, x1: x0 + ZAP_LEN, y0: e.y - 8, y1: e.y + 8 };
  }

  // ---------- Player & pump ----------

  function heldDir() {
    if (lastDir && input.isDown(lastDir)) return lastDir;
    return ['up', 'down', 'left', 'right'].find(d => input.isDown(d)) || null;
  }

  function blockedByRock(nx, ny) {
    const hit = (x, y, k) => Math.abs(x - (k.x + CELL / 2)) < CELL - 0.5 && Math.abs(y - (k.y + CELL / 2)) < CELL - 0.5;
    return rocks.some(k => k.state !== 'crumble' && hit(nx, ny, k) && !hit(player.x, player.y, k));
  }

  function moveBy(dx, dy) {
    const nx = clamp(player.x + dx, CELL / 2, W - CELL / 2);
    const ny = clamp(player.y + dy, CELL / 2, FIELD_H - CELL / 2);
    if (blockedByRock(nx, ny)) return;
    player.x = nx;
    player.y = ny;
  }

  // Turning only happens on the grid: finish lining up on the cross axis first.
  function updatePlayer(dt) {
    player.invuln = Math.max(0, player.invuln - dt);
    updatePump(dt);
    player.moving = false;
    if (player.pump) return;

    const want = heldDir();
    if (!want) return;
    const d = DIRS[want];
    let step = PLAYER_SPEED * dt;
    const across = d.x ? 'y' : 'x';
    const snapped = center(toCell(player[across]));
    if (player[across] !== snapped) {
      const move = Math.min(step, Math.abs(snapped - player[across]));
      const s = Math.sign(snapped - player[across]);
      player.face = across === 'y' ? (s > 0 ? 'down' : 'up') : (s > 0 ? 'right' : 'left');
      moveBy(across === 'x' ? s * move : 0, across === 'y' ? s * move : 0);
      step -= move;
    }
    if (step > 0) {
      player.face = want;
      moveBy(d.x * step, d.y * step);
    }
    player.moving = true;
    player.walk += dt;

    const fresh = digRect(player.x - CELL / 2, player.y - CELL / 2, player.x + CELL / 2, player.y + CELL / 2);
    if (fresh) {
      digPoints += fresh;
      while (digPoints >= BPC * BPC) {
        digPoints -= BPC * BPC;
        addScore(10);
      }
      if ((stepSound -= dt) <= 0) {
        stepSound = 140;
        sfx('step');
      }
    }
  }

  function fire() {
    if (player.pump) {
      if (player.pump.target && player.pump.cd <= 0) inflate(player.pump.target);
      return;
    }
    player.pump = { dir: DIRS[player.face], len: 0, target: null, cd: 0 };
    sfx('pump', 0);
  }

  function cancelPump() {
    if (player.pump && player.pump.target) player.pump.target.attached = false;
    player.pump = null;
  }

  function updatePump(dt) {
    const p = player.pump;
    if (!p) return;
    if (p.target) {
      if (p.target.dead || p.target.crushed) {
        player.pump = null;
        return;
      }
      p.cd -= dt;
      if (input.isDown('start') && p.cd <= 0) inflate(p.target); // hold to keep pumping
      p.len = Math.abs(p.dir.x ? p.target.x - player.x : p.target.y - player.y) - 12;
      return;
    }

    p.len += PUMP_SPEED * dt;
    const tipX = player.x + p.dir.x * (p.len + 12);
    const tipY = player.y + p.dir.y * (p.len + 12);
    if (!isDugAt(tipX, tipY)) {
      player.pump = null; // the hose can't go through dirt
      return;
    }
    for (const e of enemies) {
      if (e.dead || e.crushed || e.mode === 'ghost') continue;
      const along = (e.x - player.x) * p.dir.x + (e.y - player.y) * p.dir.y;
      const side = Math.abs((e.x - player.x) * p.dir.y + (e.y - player.y) * p.dir.x);
      if (side < 12 && along > 0 && along < p.len + 26) {
        p.target = e;
        e.attached = true;
        e.charge = 0;
        e.zapT = 0;
        inflate(e);
        return;
      }
    }
    if (p.len >= PUMP_MAX) player.pump = null;
  }

  function inflate(e) {
    e.inflate++;
    e.deflateT = 0;
    if (player.pump) player.pump.cd = PUMP_CD;
    sfx('pump', e.inflate);
    if (e.inflate >= POP_AT) pop(e);
  }

  function pop(e) {
    const r = toCell(e.y);
    const sideways = player.pump && player.pump.dir.x !== 0;
    // Sparkers are worth double when popped from the side (they could have zapped you).
    const points = DEPTH_POINTS[layerOf(r)] * (e.type === 'sparker' && sideways ? 2 : 1);
    e.dead = true;
    player.pump = null;
    addScore(points);
    fx.burst(e.x, HUD + e.y, ENEMY_COLORS[e.type], 22, 0.2);
    fx.float(e.x, HUD + e.y - 14, String(points), ENEMY_COLORS[e.type]);
    sfx('boom');
  }

  function die(kind) {
    if (state !== 'playing') return;
    cancelPump();
    lives--;
    death = { kind, x: player.x, y: player.y };
    shake = kind === 'rock' ? 10 : 6;
    sfx('die');
    setState('dying');
  }

  function collisions() {
    if (player.invuln > 0) return;
    for (const e of enemies) {
      if (e.dead || e.crushed || e.inflate > 0) continue;
      if (Math.abs(e.x - player.x) < 20 && Math.abs(e.y - player.y) < 20) {
        die('enemy');
        return;
      }
      if (e.zapT > 0) {
        const z = zapBox(e);
        if (player.x > z.x0 && player.x < z.x1 && player.y > z.y0 && player.y < z.y1) {
          die('zap');
          return;
        }
      }
    }
    if (crystal && Math.hypot(crystal.x - player.x, crystal.y - player.y) < 18) {
      const points = 400 + 200 * (round - 1);
      addScore(points);
      fx.burst(crystal.x, HUD + crystal.y, C.cyan, 20);
      fx.float(crystal.x, HUD + crystal.y - 14, String(points), C.cyan);
      sfx('powerup');
      crystal = null;
    }
  }

  // ---------- Input ----------

  input.on(action => {
    switch (state) {
      case 'title':
        if (action === 'start' || action === 'tap') newGame();
        break;
      case 'playing':
        if (DIRS[action]) {
          lastDir = action;
          if (player.pump) cancelPump();
        } else if (action === 'start' || action === 'tap') {
          fire();
        } else if (action === 'pause') {
          pause();
        }
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

  function update(dt) {
    clock += dt;
    stateTime += dt;
    shake = Math.max(0, shake - dt * 0.02);
    fx.update(dt);
    if (banner && (banner.t += dt) > 1800) banner = null;

    if (state === 'gameover' && stateTime >= 20000) showTitle();
    if (state !== 'title' && state !== 'playing' && state !== 'dying') {
      if (state === 'clear' && stateTime >= CLEAR_MS) {
        round++;
        startRound();
        setState('playing');
      }
      return;
    }

    if (state === 'title' && Math.floor(clock / 3000) !== Math.floor((clock - dt) / 3000)) {
      wander = { x: Math.random() * W, y: CELL + Math.random() * (FIELD_H - CELL) };
    }

    if (state === 'playing') {
      updatePlayer(dt);
      if (crystal && (crystal.ttl -= dt) <= 0) crystal = null;
    }
    if (freeze > 0) freeze -= dt;
    else enemies.forEach(e => updateEnemy(e, dt));
    updateRocks(dt);
    if (state === 'playing') collisions();
    enemies = enemies.filter(e => !e.dead);

    if (state === 'title' && !enemies.length) showTitle();
    else if (state === 'playing' && !enemies.length) {
      sfx('levelup');
      setState('clear');
    } else if (state === 'dying' && stateTime >= DYING_MS) {
      if (lives > 0) {
        resetPlayer();
        enemies.forEach(e => { if (!e.crushed) resetEnemy(e); });
        player.invuln = 1000;
        freeze = 1000;
        setState('playing');
      } else {
        endRound();
      }
    }
  }

  // ---------- Render ----------

  function drawHud() {
    const shown = state === 'title' ? 0 : score;
    A.text(ctx, 'SCORE', 16, 16, { size: 8, color: C.dim, align: 'left' });
    A.text(ctx, A.pad(shown), 16, 33, { size: 14, align: 'left' });
    A.text(ctx, 'ROUND', W / 2, 16, { size: 8, color: C.dim });
    A.text(ctx, String(round), W / 2, 33, { size: 14, color: C.yellow });
    A.text(ctx, 'HI-SCORE', W - 16, 16, { size: 8, color: C.dim, align: 'right' });
    A.text(ctx, A.pad(Math.max(hiScore, shown)), W - 16, 33, { size: 14, color: C.pink, align: 'right' });
    ctx.fillStyle = 'rgba(41, 240, 255, 0.6)';
    ctx.fillRect(0, HUD - 2, W, 2);
  }

  function drawFlowers() {
    // One flower on the surface per round, like a tally
    for (let i = 0; i < Math.min(round, 10); i++) {
      const x = W - 14 - i * 16;
      const y = CELL - 6;
      ctx.fillStyle = C.green;
      ctx.fillRect(x, y - 8, 2, 8);
      ctx.fillStyle = i % 2 ? C.yellow : C.pink;
      ctx.fillRect(x - 3, y - 13, 8, 6);
      ctx.fillStyle = C.text;
      ctx.fillRect(x, y - 11, 2, 2);
    }
  }

  function drawRocks() {
    for (const rock of rocks) {
      let x = rock.x;
      if (rock.state === 'wobble') x += Math.sin(rock.t / 25) * 2;
      if (rock.state === 'crumble') {
        ctx.globalAlpha = 1 - rock.t / 500;
        ctx.fillStyle = C.dim;
        for (let i = 0; i < 4; i++) ctx.fillRect(x + 4 + i * 7, rock.y + 18 + (i % 2) * 5, 6, 6);
        ctx.globalAlpha = 1;
        continue;
      }
      ctx.fillStyle = '#5c5878';
      A.roundRect(ctx, x + 2, rock.y + 3, CELL - 4, CELL - 5, 10);
      ctx.fillStyle = '#8a85b3';
      A.roundRect(ctx, x + 5, rock.y + 5, CELL - 12, CELL - 14, 7);
      ctx.fillStyle = '#c9c4e8';
      ctx.fillRect(x + 9, rock.y + 8, 5, 3);
    }
  }

  function drawCrystal() {
    if (!crystal || (crystal.ttl < 2500 && !blink(120))) return;
    ctx.save();
    ctx.translate(crystal.x, crystal.y);
    ctx.fillStyle = C.cyan;
    ctx.shadowColor = C.cyan;
    ctx.shadowBlur = 14;
    const s = 1 + Math.sin(clock / 150) * 0.1;
    ctx.beginPath();
    ctx.moveTo(0, -11 * s);
    ctx.lineTo(9 * s, -2 * s);
    ctx.lineTo(0, 11 * s);
    ctx.lineTo(-9 * s, -2 * s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawEnemies() {
    for (const e of enemies) {
      const frame = Math.floor(clock / 220) % 2;
      if (e.mode === 'ghost') {
        // Only the eyes show while it phases through the dirt
        ctx.strokeStyle = 'rgba(255, 46, 136, 0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(e.x - 11, e.y - 9, 22, 18);
        ctx.fillStyle = C.text;
        ctx.fillRect(e.x - 8, e.y - 4, 6, 6);
        ctx.fillRect(e.x + 2, e.y - 4, 6, 6);
        ctx.fillStyle = C.bg;
        const look = e.face > 0 ? 3 : 0;
        ctx.fillRect(e.x - 8 + look, e.y - 2, 3, 3);
        ctx.fillRect(e.x + 2 + look, e.y - 2, 3, 3);
        continue;
      }
      const charging = e.charge > 0 && blink(80);
      const pale = charging || (e.inflate >= POP_AT - 1 && blink(120));
      const sprite = SPRITES[e.type + (pale ? 'Pale' : '')][e.inflate || e.crushed ? 0 : frame];
      const scale = 1 + e.inflate * 0.22;
      if (e.crushed) {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.scale(1.2, 0.5);
        A.drawSprite(ctx, sprite, 0, 0, { flip: e.face < 0 });
        ctx.restore();
      } else {
        A.drawSprite(ctx, sprite, e.x, e.y, { scale, flip: e.face < 0 });
      }
      if (e.zapT > 0) drawZap(e);
    }
  }

  function drawZap(e) {
    const z = zapBox(e);
    ctx.save();
    ctx.strokeStyle = blink(60) ? C.yellow : C.text;
    ctx.shadowColor = C.yellow;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = z.x0; x <= z.x1; x += 8) {
      const y = e.y + (Math.random() - 0.5) * 12;
      if (x === z.x0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayer() {
    if (state === 'dying' && death) {
      const t = Math.min(1, stateTime / (DYING_MS * 0.7));
      if (death.kind === 'rock') {
        ctx.save();
        ctx.translate(death.x, death.y + 8);
        ctx.scale(1.3, 0.35);
        A.drawSprite(ctx, PLAYER_SPRITES[0], 0, 0);
        ctx.restore();
      } else if (t < 1) {
        A.drawSprite(ctx, PLAYER_SPRITES[0], death.x, death.y, { angle: t * Math.PI * 6, scale: 1 - t });
      }
      return;
    }
    if (state !== 'playing' && state !== 'paused' && state !== 'clear') return;
    if (player.invuln > 0 && blink(100)) return;

    const p = player.pump;
    if (p) {
      ctx.save();
      ctx.strokeStyle = C.text;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(player.x + p.dir.x * 12, player.y + p.dir.y * 12);
      ctx.lineTo(player.x + p.dir.x * (p.len + 12), player.y + p.dir.y * (p.len + 12));
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = C.cyan;
      ctx.fillRect(player.x + p.dir.x * (p.len + 12) - 3, player.y + p.dir.y * (p.len + 12) - 3, 6, 6);
    }

    const frame = player.moving ? Math.floor(player.walk / 120) % 2 : 0;
    const face = player.face;
    const angle = face === 'up' ? -Math.PI / 2 : face === 'down' ? Math.PI / 2 : 0;
    A.drawSprite(ctx, PLAYER_SPRITES[frame], player.x, player.y, { angle, flip: face === 'left' });
  }

  function drawFooter() {
    const y = H - FOOT;
    ctx.fillStyle = 'rgba(41, 240, 255, 0.6)';
    ctx.fillRect(0, y, W, 2);
    const spare = Math.max(0, lives - (state === 'playing' || state === 'paused' || state === 'clear' ? 1 : 0));
    for (let i = 0; i < Math.min(spare, 6); i++) A.drawSprite(ctx, PLAYER_SPRITES[0], 20 + i * 26, y + 20, { scale: 0.7 });
    if (state !== 'title') A.text(ctx, 'ENEMIES ' + enemies.length, W - 16, y + 21, { size: 8, color: C.dim, align: 'right' });
  }

  const dim = alpha => A.dim(ctx, W, H, alpha);

  function drawOverlay() {
    const cx = W / 2;
    const cy = HUD + FIELD_H / 2;
    const startPrompt = A.isTouch ? 'TAP TO START' : 'PRESS ENTER';

    if (state === 'title') {
      dim(0.6);
      A.text(ctx, 'DEEP', cx, 130, { size: 36, color: C.cyan, glow: 18 });
      A.text(ctx, 'DRILLER', cx, 180, { size: 40, color: C.pink, glow: 20 });
      if (Math.floor(clock / 5000) % 2 === 0) {
        A.text(ctx, 'DIG TUNNELS THROUGH THE DIRT', cx, 256, { size: 10, color: C.yellow });
        A.text(ctx, 'PUMP ENEMIES TILL THEY POP', cx, 288, { size: 10, color: C.pink });
        A.text(ctx, 'DROP ROCKS FOR BIG POINTS', cx, 320, { size: 10 });
        A.text(ctx, 'DEEPER = MORE POINTS', cx, 352, { size: 10, color: C.green });
        A.text(ctx, 'SPARKERS ZAP SIDEWAYS!', cx, 384, { size: 10, color: C.yellow });
        A.text(ctx, A.isTouch ? 'D-PAD DIG - PUMP BUTTON' : 'ARROWS DIG - SPACE PUMP', cx, 416, { size: 10, color: C.cyan });
      } else {
        A.drawScoreTable(ctx, GAME_ID, cx, 256);
      }
      if (blink()) A.text(ctx, startPrompt, cx, 490, { size: 14, color: C.yellow, glow: 10 });
      A.text(ctx, '(C) 2026 NEON ARCADE', cx, 540, { size: 8, color: C.dim });
    } else if (state === 'paused') {
      dim(0.7);
      A.text(ctx, 'PAUSED', cx, cy - 20, { size: 28, color: C.cyan, glow: 16 });
      if (blink()) A.text(ctx, A.isTouch ? 'TAP TO RESUME' : 'PRESS P TO RESUME', cx, cy + 30, { size: 10 });
    } else if (state === 'clear') {
      A.text(ctx, 'ROUND CLEAR!', cx, cy, { size: 22, color: C.green, glow: 16 });
    } else if (state === 'dying' && lives > 0 && stateTime > 700) {
      A.text(ctx, lives === 1 ? 'LAST LIFE!' : lives + ' LIVES LEFT', cx, cy, { size: 14, color: C.yellow, glow: 10 });
    } else if (state === 'entry') {
      dim(0.8);
      if (blink(250)) A.text(ctx, 'NEW HIGH SCORE!', cx, 150, { size: 18, color: C.yellow, glow: 14 });
      A.text(ctx, A.pad(score), cx, 200, { size: 24, color: C.pink, glow: 12 });
      A.text(ctx, 'ENTER YOUR INITIALS', cx, 280, { size: 10 });
      entry.draw(ctx, cx, 360, clock);
      A.text(ctx, A.isTouch ? 'UP/DOWN PICK - TAP NEXT' : 'UP/DOWN PICK - ENTER NEXT', cx, 450, { size: 8, color: C.dim });
    } else if (state === 'gameover') {
      dim(0.75);
      A.text(ctx, 'GAME OVER', cx, 120, { size: 32, color: C.red, glow: 18 });
      A.text(ctx, 'SCORE ' + A.pad(score) + '  ROUND ' + round, cx, 170, { size: 12 });
      A.drawScoreTable(ctx, GAME_ID, cx, 240, { highlight: rank, t: clock });
      if (stateTime > 600 && blink()) A.text(ctx, A.isTouch ? 'TAP TO PLAY AGAIN' : 'ENTER TO PLAY AGAIN', cx, 470, { size: 12, color: C.yellow, glow: 10 });
      if (!A.isTouch) A.text(ctx, 'ESC FOR TITLE', cx, 510, { size: 8, color: C.dim });
    }

    if (banner && state === 'playing') {
      ctx.globalAlpha = 1 - banner.t / 1800;
      A.text(ctx, banner.text, cx, cy, { size: 22, color: C.yellow, glow: 14 });
      ctx.globalAlpha = 1;
    }
  }

  function render() {
    ctx.save();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    drawHud();
    ctx.save();
    ctx.translate(0, HUD);
    ctx.drawImage(terrain, 0, 0, W, FIELD_H);
    drawFlowers();
    drawRocks();
    drawCrystal();
    drawEnemies();
    drawPlayer();
    ctx.restore();
    fx.draw(ctx);
    drawFooter();
    drawOverlay();
    ctx.restore();
  }

  showTitle();
  A.waitForFont().then(() => A.startLoop({ update, render }));
})();
