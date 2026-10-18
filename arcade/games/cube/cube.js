/*
 * Cube Hopper: the seventh game in the Neon Arcade.
 * Hop around a pyramid of cubes, changing the colour of every top you land on. Turn them all
 * to the target colour to clear the round, without hopping off the edge or getting caught.
 * States: title (a CPU hopper plays behind the menu) -> ready -> playing <-> paused,
 *         riding (on a lift disc), caught, falling, clear (round done) -> entry (initials) -> gameover
 */
(function () {
  'use strict';

  const A = window.Arcade;
  const C = A.COLORS;

  const GAME_ID = 'cube';
  const W = 480;
  const HUD = 48;
  const FOOT = 40;
  const H = 600;
  const ROWS = 7;
  const CW = 60; // cube width
  const DY = (CW * 3) / 4; // row spacing
  const CX = W / 2;
  const TOP = HUD + 92; // centre of the top cube's top face

  const HOP_MS = 280;
  const READY_MS = 1600;
  const CAUGHT_MS = 1600;
  const FALL_MS = 1500;
  const CLEAR_MS = 2200;
  const RIDE_MS = 1800;
  const SAFE_MS = 1200;
  const START_LIVES = 3;
  const BONUS_LIFE_AT = 10000;
  const ROUNDS_PER_LEVEL = 4;
  const FREEZE_MS = 3000;
  const MAX_ENEMIES = 4;
  const HIT_DIST = 20;

  // Diagonal moves. Arrow keys are the tilted arcade stick: up = up-right, right = down-right, and so on.
  const MOVES = {
    ul: { dr: -1, dc: -1 },
    ur: { dr: -1, dc: 0 },
    dl: { dr: 1, dc: 0 },
    dr: { dr: 1, dc: 1 },
    // Skews crawl sideways across the cube faces.
    l: { dr: 0, dc: -1 },
    r: { dr: 0, dc: 1 },
  };
  const ACTION_MOVE = { up: 'ur', right: 'dr', down: 'dl', left: 'ul' };
  const KEY_MOVE = { KeyQ: 'ul', KeyE: 'ur', KeyZ: 'dl', KeyC: 'dr' };

  // How landing changes a cube, by level (repeats from the last one, only faster).
  const RULES = [
    { steps: 1, flip: false, tip: 'ONE HOP PAINTS A CUBE' },
    { steps: 2, flip: false, tip: 'TWO HOPS PER CUBE' },
    { steps: 1, flip: true, tip: 'HOP AGAIN AND IT FLIPS BACK' },
    { steps: 2, flip: true, tip: 'TWO HOPS - THEN IT FLIPS BACK' },
  ];
  // Cube colours per round: tops go start -> (middle) -> target.
  const PALETTES = [
    { tops: ['#3a3fd9', '#ff2e88', '#ffe14d'], left: '#5a4ab0', right: '#2f2766' },
    { tops: ['#ff9f1c', '#b26bff', '#29f0ff'], left: '#2f6f7a', right: '#173c44' },
    { tops: ['#8a85b3', '#3dff7a', '#ff2e88'], left: '#7a3a5e', right: '#43203a' },
    { tops: ['#29f0ff', '#ffe14d', '#3dff7a'], left: '#3d5a80', right: '#1f3048' },
  ];

  // ---------- Sprites ----------

  // The hopper, drawn facing down-left (front) and up-left (back); flipped for the right-hand moves.
  const HOPPER_PAL = { O: '#ff9f1c', D: '#c76a0a', W: C.text, B: C.bg, F: '#7a3a0a' };
  const HOPPER_FRONT = A.makeSprite([
    '....OOOO....',
    '..OOOOOOOO..',
    '.OOOOOOOOOO.',
    '.OOWWOOWWOO.',
    'OOOWBOOWBOOO',
    'OOOOOOOOOOOO',
    'DDDOOOOOOOOO',
    'DDDDOOOOOOO.',
    '.DDD.OOOOO..',
    '....OO..OO..',
    '...FFF.FFF..',
  ], HOPPER_PAL, 2.4);
  const HOPPER_BACK = A.makeSprite([
    'DD..OOOO....',
    'DDDOOOOOOO..',
    '.DDDOOOOOOO.',
    '..OOOOOOOOO.',
    '.OOOOOOOOOOO',
    'OOOOOOOOOOOO',
    'OOOOOOOOOOOO',
    '.OOOOOOOOOO.',
    '..OOOOOOOO..',
    '...OO..OO...',
    '..FFF..FFF..',
  ], HOPPER_PAL, 2.4);

  const SCRUBBER = A.makeSprite(['..GGGG..', '.GGGGGG.', 'GBBGGBBG', 'GBBGGBBG', '.GGGGGG.', '..GGGG..', '.GGGGGG.', 'G.GGGG.G', '.GG..GG.'], { G: C.green, B: C.bg }, 2);
  const SKEW = [
    A.makeSprite(['.P.....P.', '..PPPPP..', '.PWBPWBP.', 'PPPPPPPPP', '.PPPPPPP.', 'P.P.P.P.P'], { P: C.pink, W: C.text, B: C.bg }, 2),
    A.makeSprite(['.P.....P.', '..PPPPP..', '.PWBPWBP.', 'PPPPPPPPP', '.PPPPPPP.', '.P.P.P.P.'], { P: C.pink, W: C.text, B: C.bg }, 2),
  ];
  const BALL_COLORS = { ember: C.red, orb: C.green, egg: '#b26bff' };
  const COIL_COLOR = '#b26bff';

  // ---------- State ----------

  const canvas = document.getElementById('game');
  const { ctx } = A.createScreen(canvas, W, H);
  const input = A.createInput({ screen: { width: W, height: H } });
  const fx = A.createEffects();

  let state = 'title';
  let stateTime = 0;
  let clock = 0;
  let demo = true;
  let hiScore = A.scores.best(GAME_ID);
  A.scores.onChange(() => { hiScore = A.scores.best(GAME_ID); });

  let level = 1;
  let round = 1;
  let roundsDone = 0;
  let score = 0;
  let lives = START_LIVES;
  let bonusLife = false;
  let cubes, discs, player, enemies, ride, bonusText, lure;
  let freezeT = 0;
  let spawnT = 0;
  let queued = null;
  let shake = 0;
  let entry = null;
  let rank = -1;
  const heldKeys = new Set();

  const rule = () => RULES[Math.min(level - 1, RULES.length - 1)];
  const palette = () => PALETTES[(roundsDone) % PALETTES.length];
  const target = () => rule().steps;
  const onBoard = (r, c) => r >= 0 && r < ROWS && c >= 0 && c <= r;
  const pos = (r, c) => ({ x: CX + (c - r / 2) * CW, y: TOP + r * DY });
  const blink = (ms = 500) => Math.floor(clock / ms) % 2 === 0;
  const sfx = (name, arg) => { if (!demo) A.sound.play(name, arg); };
  const lerp = (a, b, t) => a + (b - a) * t;

  function setState(next) {
    state = next;
    stateTime = 0;
  }

  // ---------- Rounds ----------

  function buildRound() {
    cubes = [];
    for (let r = 0; r < ROWS; r++) {
      cubes.push([]);
      for (let c = 0; c <= r; c++) cubes[r].push(0);
    }
    // One lift disc on each side, on a random row the hopper can reach by hopping up off an edge.
    const left = 1 + Math.floor(Math.random() * 5);
    let right = 1 + Math.floor(Math.random() * 5);
    if (right === left) right = right === 5 ? 1 : right + 1;
    discs = [{ r: left, c: -1, used: false }, { r: right, c: right + 1, used: false }];
    enemies = [];
    ride = null;
    lure = null;
    bonusText = null;
    spawnT = 2500;
    freezeT = 0;
    placePlayer(0, 0);
  }

  function placePlayer(r, c) {
    const p = pos(r, c);
    player = { r, c, x: p.x, y: p.y, hop: null, face: 'dl', safe: SAFE_MS, fall: null };
    queued = null;
  }

  function newGame() {
    demo = false;
    level = 1;
    round = 1;
    roundsDone = 0;
    score = 0;
    lives = START_LIVES;
    bonusLife = false;
    fx.clear();
    buildRound();
    setState('ready');
    A.sound.play('start');
  }

  function showTitle() {
    demo = true;
    level = 1;
    round = 1;
    roundsDone = 0;
    score = 0;
    fx.clear();
    buildRound();
    setState('title');
  }

  function nextRound() {
    roundsDone++;
    round++;
    if (round > ROUNDS_PER_LEVEL) {
      round = 1;
      level++;
    }
    buildRound();
    setState('ready');
  }

  function pause() {
    setState('paused');
    A.sound.play('pause');
  }

  function addScore(points) {
    if (demo) return;
    score += points;
    if (!bonusLife && score >= BONUS_LIFE_AT) {
      bonusLife = true;
      lives++;
      fx.float(player.x, player.y - 40, '1UP!', C.green);
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

  // Landing on a cube moves its colour one step toward the target, or flips it back on flip levels.
  function paint(r, c) {
    const now = cubes[r][c];
    const goal = target();
    if (now < goal) {
      cubes[r][c] = now + 1;
      addScore(goal === 2 ? 15 : 25);
    } else if (rule().flip) {
      cubes[r][c] = goal - 1;
    }
  }

  function roundDone() {
    const goal = target();
    return cubes.every(row => row.every(v => v === goal));
  }

  // ---------- Hopping ----------

  // Any hopper (player or enemy) jumps one cube along a move; off the pyramid it keeps going and falls.
  function startHop(e, move, ms) {
    const m = MOVES[move];
    const from = pos(e.r, e.c);
    e.hop = { move, t: 0, ms, from, tr: e.r + m.dr, tc: e.c + m.dc };
    e.face = move;
  }

  function hopPos(e) {
    const h = e.hop;
    const to = pos(h.tr, h.tc);
    const t = Math.min(1, h.t);
    // Up-hops rise higher before landing; every hop follows a little arc.
    const lift = Math.sin(t * Math.PI) * (h.tr < e.r ? 26 : 16);
    return { x: lerp(h.from.x, to.x, t), y: lerp(h.from.y, to.y, t) - lift };
  }

  // Advances a hop; returns true on the frame it lands (on or off the pyramid).
  function updateHop(e, dt) {
    if (!e.hop) return false;
    e.hop.t += dt / e.hop.ms;
    const p = hopPos(e);
    e.x = p.x;
    e.y = p.y;
    if (e.hop.t < 1) return false;
    e.r = e.hop.tr;
    e.c = e.hop.tc;
    e.hop = null;
    return true;
  }

  function wantedMove() {
    if (demo) return demoMove();
    if (queued) {
      const m = queued;
      queued = null;
      return m;
    }
    for (const [action, move] of Object.entries(ACTION_MOVE)) if (input.isDown(action)) return move;
    for (const [code, move] of Object.entries(KEY_MOVE)) if (heldKeys.has(code)) return move;
    return null;
  }

  function updatePlayer(dt) {
    const p = player;
    if (p.safe > 0) p.safe -= dt;
    if (!p.hop) {
      const move = wantedMove();
      if (move) {
        startHop(p, move, HOP_MS);
        sfx('hop');
      }
      return;
    }
    if (!updateHop(p, dt)) return;
    if (onBoard(p.r, p.c)) {
      sfx('bounce');
      paint(p.r, p.c);
      if (roundDone()) clearRound();
      return;
    }
    const disc = discs.find(d => !d.used && d.r === p.r && d.c === p.c);
    if (disc) startRide(disc);
    else startFall();
  }

  function startRide(disc) {
    disc.used = true;
    // Coil chases you to the cube you jumped from, then follows you off the edge.
    const m = MOVES[player.face];
    lure = { r: disc.r - m.dr, c: disc.c - m.dc, move: player.face };
    ride = { disc, t: 0, from: pos(disc.r, disc.c) };
    sfx('disc');
    setState('riding');
  }

  function updateRide(dt) {
    ride.t += dt;
    const t = Math.min(1, ride.t / RIDE_MS);
    const top = pos(0, 0);
    const ease = t * t * (3 - 2 * t);
    player.x = lerp(ride.from.x, top.x, ease);
    player.y = lerp(ride.from.y, top.y - 70, ease) - Math.sin(t * Math.PI) * 40;
    if (t >= 1) {
      // Drop from above onto the top cube.
      player.r = 0;
      player.c = 0;
      player.hop = { move: 'dl', t: 0.5, ms: HOP_MS * 1.6, from: { x: top.x, y: top.y - 70 }, tr: 0, tc: 0 };
      ride = null;
      setState('playing');
    }
  }

  function startFall() {
    // Off an upper edge the hopper drops behind the pyramid; off the bottom it drops in front.
    player.fall = { vy: -0.15, behind: player.face === 'ul' || player.face === 'ur' };
    sfx('whistle');
    if (demo) {
      showTitle();
      return;
    }
    setState('falling');
  }

  function clearRound() {
    const unused = discs.filter(d => !d.used).length;
    const bonus = Math.min(5000, 1000 + roundsDone * 250) + unused * 50;
    if (demo) {
      showTitle();
      return;
    }
    addScore(bonus);
    bonusText = 'BONUS ' + bonus;
    enemies = [];
    sfx('levelup');
    setState('clear');
  }

  function loseLife(atTop) {
    lives--;
    enemies = [];
    lure = null;
    if (lives <= 0) {
      endRound();
      return;
    }
    if (atTop) placePlayer(0, 0);
    else {
      player.safe = SAFE_MS;
      queued = null;
    }
    setState('ready');
  }

  // ---------- Enemies ----------
  // Embers bounce down and away. Coil's egg bounces to the bottom, hatches and chases you.
  // Scrubbers undo your colours (catch them for points). Skews crawl sideways across the cube faces.
  // The chill orb freezes everything for a few seconds.

  const speedUp = () => (level - 1) * 4 + (round - 1);
  const enemyHopMs = () => Math.max(240, 520 - speedUp() * 14);
  const enemyRestMs = () => Math.max(120, 460 - speedUp() * 18);
  const spawnGap = () => Math.max(1100, 3400 - speedUp() * 120);

  function spawnEnemy() {
    const has = kind => enemies.some(e => e.kind === kind);
    const pool = [['ember', 50]];
    if (!has('egg') && !has('coil')) pool.push(['egg', 22]);
    if (level > 1 || round > 1) pool.push(['scrub', 12]);
    if (level > 1) pool.push(['skew', 12]);
    if (!has('orb')) pool.push(['orb', 7]);
    let roll = Math.random() * pool.reduce((sum, [, w]) => sum + w, 0);
    const kind = pool.find(([, w]) => (roll -= w) < 0)[0];
    if (kind === 'skew') {
      // From the bottom corner, crawling up across the left or right faces.
      const left = Math.random() < 0.5;
      const e = { kind, side: left ? 'left' : 'right', r: ROWS - 1, c: left ? 0 : ROWS - 1, hop: null, wait: 500, face: 'dl' };
      Object.assign(e, pos(e.r, e.c));
      enemies.push(e);
      return;
    }
    const e = { kind, r: 1, c: Math.round(Math.random()), hop: null, wait: 0, face: 'dl', drop: 0 };
    Object.assign(e, pos(e.r, e.c));
    enemies.push(e);
  }

  function enemyMove(e) {
    if (e.kind === 'skew') return e.side === 'left' ? (Math.random() < 0.5 ? 'r' : 'ur') : Math.random() < 0.5 ? 'l' : 'ul';
    if (e.kind !== 'coil') return Math.random() < 0.5 ? 'dl' : 'dr';
    // Coil takes the shortest way to you, or to the cube you jumped off from onto a disc.
    if (lure && e.r === lure.r && e.c === lure.c) return lure.move;
    const goal = lure || player;
    const here = toUV(e.r, e.c);
    const there = toUV(goal.r, goal.c);
    const search = A.gridSearch(ROWS, ROWS, (u, v) => u + v < ROWS, here, {
      stopAt: (u, v) => u === there.c && v === there.r,
    });
    if (!search.found) return Math.random() < 0.5 ? 'dl' : 'dr';
    const next = search.pathTo(search.found)[0];
    return UV_MOVE(next.c - here.c, next.r - here.r);
  }

  function updateEnemy(e, dt) {
    if (e.fall) {
      e.fall.vy += 0.0012 * dt;
      e.y += e.fall.vy * dt;
      if (e.y > H + 40) e.dead = true;
      return;
    }
    if (e.drop !== undefined && e.drop < 1) {
      // Dropping in from above onto the second row.
      e.drop = Math.min(1, e.drop + dt / 450);
      e.y = pos(e.r, e.c).y - (1 - e.drop * e.drop) * 240;
      if (e.drop >= 1) e.wait = enemyRestMs();
      return;
    }
    if (freezeT > 0) return;
    if (!e.hop) {
      if ((e.wait -= dt) > 0) return;
      startHop(e, enemyMove(e), e.kind === 'coil' ? enemyHopMs() * 0.9 : enemyHopMs());
      return;
    }
    if (!updateHop(e, dt)) return;
    e.wait = e.kind === 'coil' ? enemyRestMs() * 0.8 : enemyRestMs();
    if (!onBoard(e.r, e.c)) {
      e.fall = { vy: -0.1 };
      if (e.kind === 'coil' && lure) {
        addScore(500);
        fx.float(e.x, e.y - 30, '500', C.yellow);
        sfx('bonus');
        lure = null;
      }
      return;
    }
    if (e.kind !== 'skew') sfx('bounce');
    if (e.kind === 'scrub') cubes[e.r][e.c] = 0;
    if (e.kind === 'egg' && e.r === ROWS - 1) {
      e.kind = 'coil';
      e.wait = 700;
      sfx('hatch');
    }
  }

  // Where each enemy's body is drawn; skews ride on a cube's side face rather than its top.
  function enemyCenter(e) {
    if (e.kind === 'skew') return { x: e.x + (e.side === 'left' ? -CW / 4 : CW / 4), y: e.y + CW / 2 };
    if (e.kind === 'scrub') return { x: e.x, y: e.y - 10 };
    if (e.kind === 'coil') return { x: e.x, y: e.y - 18 };
    return { x: e.x, y: e.y - 9 };
  }

  function collide() {
    if (player.safe > 0 || player.hop && !onBoard(player.hop.tr, player.hop.tc)) return;
    const px = player.x;
    const py = player.y - 14;
    for (const e of enemies) {
      if (e.fall || e.dead || (e.drop !== undefined && e.drop < 1)) continue;
      const b = enemyCenter(e);
      if (Math.hypot(b.x - px, b.y - py) >= HIT_DIST) continue;
      if (e.kind === 'scrub') {
        e.dead = true;
        addScore(300);
        fx.float(b.x, b.y - 16, '300', C.green);
        fx.burst(b.x, b.y, C.green, 14);
        sfx('eat');
      } else if (e.kind === 'orb') {
        e.dead = true;
        freezeT = FREEZE_MS;
        addScore(100);
        fx.burst(b.x, b.y, C.green, 18);
        sfx('powerup');
      } else if (freezeT <= 0) {
        if (demo) {
          showTitle();
          return;
        }
        shake = 8;
        sfx('swear');
        setState('caught');
        return;
      }
    }
  }

  function updateEnemies(dt) {
    if (freezeT > 0) freezeT -= dt;
    else if ((spawnT -= dt) <= 0) {
      spawnT = spawnGap();
      if (enemies.length < MAX_ENEMIES) spawnEnemy();
    }
    enemies.forEach(e => updateEnemy(e, dt));
    enemies = enemies.filter(e => !e.dead);
    if (state === 'playing' || state === 'title') collide();
  }

  // ---------- Attract-mode AI ----------
  // The CPU hopper heads for the nearest unfinished cube. The pyramid is searched as a square grid
  // in skewed coordinates (u = column, v = row - column), where all four diagonal moves are neighbours.

  const toUV = (r, c) => ({ c, r: r - c });
  const UV_MOVE = (du, dv) => (du < 0 ? 'ul' : du > 0 ? 'dr' : dv < 0 ? 'ur' : 'dl');

  function demoMove() {
    const here = toUV(player.r, player.c);
    const goal = target();
    const danger = new Set();
    for (const e of enemies) {
      if (e.kind === 'scrub' || e.kind === 'orb' || e.fall) continue;
      const t = toUV(e.hop ? e.hop.tr : e.r, e.hop ? e.hop.tc : e.c);
      for (const [du, dv] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) danger.add((t.c + du) + ',' + (t.r + dv));
    }
    const unfinished = (u, v) => cubes[u + v][u] < goal;
    let search = A.gridSearch(ROWS, ROWS, (u, v) => u + v < ROWS && !danger.has(u + ',' + v), here, { stopAt: unfinished });
    if (!search.found) search = A.gridSearch(ROWS, ROWS, (u, v) => u + v < ROWS, here, { stopAt: unfinished });
    if (!search.found) return null;
    const next = search.pathTo(search.found)[0];
    return UV_MOVE(next.c - here.c, next.r - here.r);
  }

  // ---------- Input ----------

  function act(action) {
    switch (state) {
      case 'title':
        if (action === 'start' || action === 'tap') newGame();
        break;
      case 'ready':
      case 'playing':
        if (ACTION_MOVE[action]) queued = ACTION_MOVE[action];
        else if (action === 'pause' && state === 'playing') pause();
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
  }
  input.on(act);

  // Q/E/Z/C hop diagonally too, for anyone who'd rather not use the tilted arrows.
  window.addEventListener('keydown', e => {
    if (!KEY_MOVE[e.code]) return;
    heldKeys.add(e.code);
    A.sound.unlock();
    if (e.repeat) return;
    if (state === 'ready' || state === 'playing') queued = KEY_MOVE[e.code];
    else if (state === 'entry') act({ KeyQ: 'left', KeyE: 'up', KeyZ: 'down', KeyC: 'right' }[e.code]);
  });
  window.addEventListener('keyup', e => heldKeys.delete(e.code));
  window.addEventListener('blur', () => heldKeys.clear());

  // Swipes go in the diagonal direction the finger moves; a tap starts or resumes.
  let swipe = null;
  canvas.addEventListener('pointerdown', e => {
    swipe = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    A.sound.unlock();
  });
  canvas.addEventListener('pointermove', e => {
    if (!swipe || e.pointerId !== swipe.id || swipe.moved) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    if (Math.hypot(dx, dy) < 24) return;
    swipe.moved = true;
    const move = dy < 0 ? (dx < 0 ? 'ul' : 'ur') : dx < 0 ? 'dl' : 'dr';
    if (state === 'ready' || state === 'playing') queued = move;
    else if (state === 'entry') act({ ul: 'left', ur: 'up', dl: 'down', dr: 'right' }[move]);
  });
  canvas.addEventListener('pointerup', e => {
    if (swipe && e.pointerId === swipe.id && !swipe.moved) act('tap');
    swipe = null;
  });
  canvas.addEventListener('pointercancel', () => { swipe = null; });

  A.onBlur(() => { if (state === 'playing' || state === 'riding') pause(); });

  // ---------- Update ----------

  function update(dt) {
    clock += dt;
    stateTime += dt;
    shake = Math.max(0, shake - dt * 0.02);
    fx.update(dt);

    if (state === 'title' || state === 'playing') {
      updatePlayer(dt);
      if (state === 'title' || state === 'playing') updateEnemies(dt);
    } else if (state === 'riding') {
      updateRide(dt);
      updateEnemies(dt);
    } else if (state === 'ready' && stateTime >= READY_MS) {
      setState('playing');
    } else if (state === 'caught' && stateTime >= CAUGHT_MS) {
      loseLife(false);
    } else if (state === 'falling') {
      player.fall.vy += 0.0012 * dt;
      player.y += player.fall.vy * dt;
      if (stateTime >= FALL_MS) loseLife(true);
    } else if (state === 'clear' && stateTime >= CLEAR_MS) {
      nextRound();
    } else if (state === 'gameover' && stateTime >= 20000) {
      showTitle();
    }
  }

  // ---------- Render ----------

  function drawHud() {
    const shown = demo ? 0 : score;
    A.text(ctx, 'SCORE', 16, 16, { size: 8, color: C.dim, align: 'left' });
    A.text(ctx, A.pad(shown), 16, 33, { size: 14, align: 'left' });
    A.text(ctx, 'LEVEL', W / 2, 16, { size: 8, color: C.dim });
    A.text(ctx, level + '-' + round, W / 2, 33, { size: 14, color: C.yellow });
    A.text(ctx, 'HI-SCORE', W - 16, 16, { size: 8, color: C.dim, align: 'right' });
    A.text(ctx, A.pad(Math.max(hiScore, shown)), W - 16, 33, { size: 14, color: C.pink, align: 'right' });
    ctx.fillStyle = 'rgba(41, 240, 255, 0.6)';
    ctx.fillRect(0, HUD - 2, W, 2);
  }

  function drawPyramid() {
    const pal = palette();
    const goal = target();
    const flashing = state === 'clear' && stateTime < CLEAR_MS - 400;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c <= r; c++) {
        const p = pos(r, c);
        let top = pal.tops[goal === 1 ? (cubes[r][c] ? 2 : 0) : cubes[r][c]];
        if (flashing) top = pal.tops[Math.floor(clock / 90 + r + c) % 3];
        A.drawCube(ctx, p.x, p.y, CW, { top, left: pal.left, right: pal.right, edge: 'rgba(255, 255, 255, 0.25)' });
      }
    }
  }

  function drawDiscs() {
    for (const d of discs) {
      if (d.used && !(ride && ride.disc === d)) continue;
      const p = ride && ride.disc === d ? { x: player.x, y: player.y } : pos(d.r, d.c);
      const hue = (clock / 4) % 360;
      ctx.save();
      ctx.translate(p.x, p.y + 4);
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = 'hsl(' + ((hue + i * 90) % 360) + ', 100%, 60%)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 18 - i * 4, 6 - i * 1.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawHopper(x, y, face, alpha = 1) {
    const back = face === 'ul' || face === 'ur';
    const flip = face === 'ur' || face === 'dr';
    ctx.save();
    ctx.globalAlpha = alpha;
    A.drawSprite(ctx, back ? HOPPER_BACK : HOPPER_FRONT, x, y - 14, { flip });
    ctx.restore();
  }

  function drawFreeze() {
    if (freezeT <= 0 || state !== 'playing') return;
    A.text(ctx, 'FREEZE!', W / 2, HUD + 26, { size: 12, color: C.cyan, glow: 10 });
  }

  function drawPlayer(front) {
    if (state === 'entry' || state === 'gameover' || state === 'clear' && stateTime > CLEAR_MS - 300) return;
    if (state === 'falling' && player.fall.behind === front) return;
    if (state !== 'falling' && !front) return;
    if (player.safe > 0 && state === 'playing' && blink(90)) return;
    drawHopper(player.x, player.y, player.face);
    if (state === 'caught') drawBubble(player.x, player.y - 44);
  }

  function drawBubble(x, y) {
    ctx.fillStyle = C.text;
    A.roundRect(ctx, x - 26, y - 14, 52, 26, 8);
    ctx.beginPath();
    ctx.moveTo(x - 6, y + 11);
    ctx.lineTo(x + 2, y + 22);
    ctx.lineTo(x + 6, y + 11);
    ctx.fill();
    A.text(ctx, '#@!', x, y, { size: 12, color: C.red });
  }

  function drawBall(x, y, color, r = 8) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillRect(x - r * 0.5, y - r * 0.55, 3, 3);
    ctx.restore();
  }

  // Coil: a springy purple snake, coils stacked under a head that looks your way.
  function drawCoil(e, x, y) {
    const stretch = e.hop ? 1 + Math.sin(Math.min(1, e.hop.t) * Math.PI) * 0.35 : 1;
    ctx.save();
    ctx.fillStyle = COIL_COLOR;
    ctx.shadowColor = COIL_COLOR;
    ctx.shadowBlur = 8;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(x, y - 3 - i * 6 * stretch, 9 - i, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const hx = x + (e.face === 'ul' || e.face === 'dl' ? -3 : 3);
    const hy = y - 3 - 20 * stretch;
    ctx.beginPath();
    ctx.arc(hx, hy, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = C.text;
    ctx.fillRect(hx - 5, hy - 3, 4, 4);
    ctx.fillRect(hx + 1, hy - 3, 4, 4);
    ctx.fillStyle = C.bg;
    const look = player.x < x ? -1 : 1;
    ctx.fillRect(hx - 4 + look, hy - 2, 2, 2);
    ctx.fillRect(hx + 2 + look, hy - 2, 2, 2);
    ctx.fillStyle = C.red;
    ctx.fillRect(hx - 1, hy + 4, 2, 4);
    ctx.restore();
  }

  function drawEnemies(front) {
    const frozen = freezeT > 0;
    for (const e of enemies) {
      if ((e.y >= player.y) !== front) continue;
      if (frozen && freezeT < 800 && blink(100)) continue;
      const b = enemyCenter(e);
      ctx.save();
      if (frozen) ctx.globalAlpha = 0.65;
      if (e.kind === 'skew') A.drawSprite(ctx, SKEW[Math.floor(clock / 200) % 2], b.x, b.y, { flip: e.side === 'right' });
      else if (e.kind === 'scrub') A.drawSprite(ctx, SCRUBBER, b.x, b.y);
      else if (e.kind === 'coil') drawCoil(e, e.x, e.y);
      else drawBall(b.x, b.y, BALL_COLORS[e.kind]);
      ctx.restore();
    }
  }

  function drawFooter() {
    const y = H - FOOT;
    ctx.fillStyle = 'rgba(41, 240, 255, 0.6)';
    ctx.fillRect(0, y, W, 2);
    if (demo) return;
    const spare = Math.max(0, lives - 1);
    for (let i = 0; i < Math.min(spare, 6); i++) A.drawSprite(ctx, HOPPER_FRONT, 22 + i * 26, y + 21, { scale: 0.65 });
    A.text(ctx, 'CHANGE TO', W - 64, y + 21, { size: 8, color: C.dim, align: 'right' });
    const pal = palette();
    A.drawCube(ctx, W - 34, y + 15, 26, { top: pal.tops[2], left: pal.left, right: pal.right });
  }

  const dim = alpha => A.dim(ctx, W, H, alpha);

  function drawOverlay() {
    const cx = W / 2;
    const cy = HUD + (H - HUD - FOOT) / 2;
    const startPrompt = A.isTouch ? 'TAP TO START' : 'PRESS ENTER';

    if (state === 'title') {
      dim(0.6);
      A.text(ctx, 'CUBE', cx, 116, { size: 34, color: C.cyan, glow: 18 });
      A.text(ctx, 'HOPPER', cx, 164, { size: 40, color: C.pink, glow: 20 });
      if (Math.floor(clock / 5000) % 2 === 0) {
        A.text(ctx, 'HOP ON EVERY CUBE', cx, 236, { size: 10, color: C.yellow });
        A.text(ctx, 'TURN THEM ALL TO THE TARGET', cx, 266, { size: 10, color: C.yellow });
        A.text(ctx, "DON'T HOP OFF THE EDGE!", cx, 300, { size: 10, color: C.red });
        A.text(ctx, 'RIDE A DISC - COIL MAY FOLLOW!', cx, 334, { size: 10, color: C.cyan });
        A.text(ctx, A.isTouch ? 'SWIPE OR PAD TO HOP' : 'ARROWS HOP DIAGONALLY', cx, 368, { size: 10, color: C.green });
        if (!A.isTouch) A.text(ctx, '(OR Q E Z C)', cx, 390, { size: 8, color: C.dim });
      } else {
        A.drawScoreTable(ctx, GAME_ID, cx, 236);
      }
      if (blink()) A.text(ctx, startPrompt, cx, 470, { size: 14, color: C.yellow, glow: 10 });
      A.text(ctx, '(C) 2026 NEON ARCADE', cx, 520, { size: 8, color: C.dim });
    } else if (state === 'ready') {
      A.text(ctx, 'LEVEL ' + level + '  ROUND ' + round, cx, H - FOOT - 70, { size: 12, color: C.yellow, glow: 10 });
      if (round === 1) A.text(ctx, rule().tip, cx, H - FOOT - 46, { size: 8, color: C.cyan });
    } else if (state === 'paused') {
      dim(0.7);
      A.text(ctx, 'PAUSED', cx, cy - 20, { size: 28, color: C.cyan, glow: 16 });
      if (blink()) A.text(ctx, A.isTouch ? 'TAP TO RESUME' : 'PRESS P TO RESUME', cx, cy + 30, { size: 10 });
    } else if (state === 'clear') {
      A.text(ctx, 'ROUND CLEAR!', cx, H - FOOT - 70, { size: 16, color: C.green, glow: 14 });
      if (bonusText) A.text(ctx, bonusText, cx, H - FOOT - 44, { size: 10, color: C.yellow });
    } else if ((state === 'caught' || state === 'falling') && stateTime > 600) {
      const left = lives - 1;
      const msg = left <= 0 ? 'GAME OVER' : left === 1 ? 'LAST LIFE!' : left + ' LIVES LEFT';
      A.text(ctx, msg, cx, H - FOOT - 60, { size: 12, color: left <= 0 ? C.red : C.yellow, glow: 10 });
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
      A.text(ctx, 'SCORE ' + A.pad(score) + '  LEVEL ' + level + '-' + round, cx, 170, { size: 12 });
      A.drawScoreTable(ctx, GAME_ID, cx, 240, { highlight: rank, t: clock });
      if (stateTime > 600 && blink()) A.text(ctx, A.isTouch ? 'TAP TO PLAY AGAIN' : 'ENTER TO PLAY AGAIN', cx, 470, { size: 12, color: C.yellow, glow: 10 });
      if (!A.isTouch) A.text(ctx, 'ESC FOR TITLE', cx, 510, { size: 8, color: C.dim });
    }
  }

  function render() {
    ctx.save();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    drawHud();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HUD, W, H - HUD - FOOT);
    ctx.clip();
    drawPlayer(false);
    drawPyramid();
    drawDiscs();
    drawEnemies(false);
    drawPlayer(true);
    drawEnemies(true);
    drawFreeze();
    fx.draw(ctx);
    ctx.restore();
    drawFooter();
    drawOverlay();
    ctx.restore();
  }

  showTitle();
  A.waitForFont().then(() => A.startLoop({ update, render }));
})();
