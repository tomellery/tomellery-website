/*
 * Maze Munch: the sixth game in the Neon Arcade.
 * Munch every dot in the maze while four chasers hunt you, each in its own way.
 * Power orbs turn them blue for a moment, and then you can eat them.
 * States: title (a CPU muncher plays behind the menu) -> ready -> playing <-> paused,
 *         dying, clear (maze done) -> entry (initials) -> gameover
 */
(function () {
  'use strict';

  const A = window.Arcade;
  const C = A.COLORS;

  const GAME_ID = 'maze';
  const CELL = 16;
  const COLS = 28;
  const ROWS = 31;
  const HUD = 48;
  const FOOT = 32;
  const W = COLS * CELL;
  const FIELD_H = ROWS * CELL;
  const H = HUD + FIELD_H + FOOT;

  // '#' wall, '.' dot, 'o' power orb, ' ' empty path, '-' house door, '_' inside the house.
  // Each maze is mirrored left/right, has no dead ends, and wraps through its tunnel row.
  const MAZES = [
    {
      color: C.cyan,
      tunnel: 14,
      rows: [
        '############################',
        '#............##............#',
        '#.####.#####.##.#####.####.#',
        '#o####.#####.##.#####.####o#',
        '#.####.#####.##.#####.####.#',
        '#..........................#',
        '#.####.##.##.##.##.##.####.#',
        '#.####.##.##.##.##.##.####.#',
        '#......##....##....##......#',
        '######.##.########.##.######',
        '######.##.########.##.######',
        '######.##          ##.######',
        '######.## ###--### ##.######',
        '######.## #______# ##.######',
        '      .   #______#   .      ',
        '######.## #______# ##.######',
        '######.## ######## ##.######',
        '######.##          ##.######',
        '######.##.########.##.######',
        '######.##.########.##.######',
        '#............##............#',
        '#.####.#####.##.#####.####.#',
        '#.####.#####.##.#####.####.#',
        '#o..##.......  .......##..o#',
        '###.##.##.########.##.##.###',
        '###.##.##.########.##.##.###',
        '#......##....##....##......#',
        '#.##########.##.##########.#',
        '#.##########.##.##########.#',
        '#..........................#',
        '############################',
      ],
    },
    {
      color: '#b26bff',
      tunnel: 14,
      rows: [
        '############################',
        '#.....##............##.....#',
        '#o###.##.##########.##.###o#',
        '#.###.##.##########.##.###.#',
        '#..........................#',
        '#.####.#####.##.#####.####.#',
        '#.####.#####.##.#####.####.#',
        '#.........##....##.........#',
        '######.##.########.##.######',
        '######.##.########.##.######',
        '######.##.########.##.######',
        '######.##          ##.######',
        '######.## ###--### ##.######',
        '######.## #______# ##.######',
        '      .   #______#   .      ',
        '######.## #______# ##.######',
        '######.## ######## ##.######',
        '######.##          ##.######',
        '######.##.########.##.######',
        '######.##.########.##.######',
        '#..........................#',
        '#.####.#####.##.#####.####.#',
        '#.####.#####.##.#####.####.#',
        '#...##....##.  .##....##...#',
        '#.#.##.##.##.##.##.##.##.#.#',
        '#.#.##.##.##.##.##.##.##.#.#',
        '#.#..........##..........#.#',
        '#o##########.##.##########o#',
        '#.##########.##.##########.#',
        '#..........................#',
        '############################',
      ],
    },
  ];

  const DOOR_X = 14 * CELL; // the house door is between columns 13 and 14
  const DOOR_TILE = { c: 13, r: 11 }; // the cell just outside the door
  const START = { x: 14 * CELL, y: 23 * CELL + CELL / 2 };
  const BONUS_POS = { x: 14 * CELL, y: 17 * CELL + CELL / 2 };

  const FULL = 0.15; // "100%" speed in px/ms, about 9 cells a second
  const START_LIVES = 3;
  const BONUS_LIFE_AT = 10000;
  const READY_MS = 2000;
  const DYING_MS = 2400;
  const CLEAR_MS = 2400;
  const EAT_FREEZE_MS = 600;
  const FLASH_MS = 2000;
  const BONUS_MS = 9500;
  const BONUS_AT = [70, 170];
  const ELROY_DOTS = 20;
  const ORANGE = '#ff9f1c';
  const DOT_POINTS = 10;
  const ORB_POINTS = 50;

  // Blue time shrinks each level, but never below 1.5 s so later levels stay playable.
  const FRIGHT_MS = [6000, 5000, 4000, 3000, 2500, 5000, 2500, 2000, 1500];
  // Chasers take turns scattering to their corners and chasing you; the last chase lasts forever.
  const SCHEDULES = [
    [7000, 20000, 7000, 20000, 5000, 20000, 5000, Infinity],
    [7000, 20000, 5000, 20000, 5000, Infinity],
    [5000, 20000, 5000, 20000, 1000, Infinity],
  ];

  const DIRS = {
    up: { x: 0, y: -1 },
    left: { x: -1, y: 0 },
    down: { x: 0, y: 1 },
    right: { x: 1, y: 0 },
  };
  const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const DIR_NAMES = Object.keys(DIRS); // also the tie-break order when chasers pick a turn

  // ---------- Sprites ----------

  const JELLY_TOP = [
    '.....GGGG.....',
    '...GGGGGGGG...',
    '..GGGGGGGGGG..',
    '.GGGGGGGGGGGG.',
    '.GGGGGGGGGGGG.',
    'GGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGG',
  ];
  const JELLY_LEGS = [
    ['GG.GGG..GGG.GG', 'G..GG....GG..G', 'G...G....G...G', '.G...G..G...G.'],
    ['GGG.GG..GG.GGG', '.G..G....G..G.', '.G...G..G...G.', 'G....G..G....G'],
  ];
  const jelly = color => JELLY_LEGS.map(legs => A.makeSprite(JELLY_TOP.concat(legs), { G: color }, 1));
  const BLUE = '#3a5cff';
  const SCARED = jelly(BLUE);
  const SCARED_FLASH = jelly(C.text);

  const CHASERS = [
    { name: 'ZIP', tag: 'THE HUNTER', color: C.pink, corner: { c: 25, r: -3 }, home: { x: DOOR_X, y: 11 * CELL + CELL / 2 }, outside: true, releaseDots: 0, releaseMs: 0 },
    { name: 'ZAP', tag: 'THE TRAPPER', color: C.green, corner: { c: 2, r: -3 }, home: { x: DOOR_X, y: 14 * CELL + CELL / 2 }, releaseDots: 0, releaseMs: 1000 },
    { name: 'FLUX', tag: 'THE WILDCARD', color: C.cyan, corner: { c: 27, r: 31 }, home: { x: 12 * CELL, y: 14 * CELL + CELL / 2 }, releaseDots: 30, releaseMs: 5000 },
    { name: 'DOZE', tag: 'THE DREAMER', color: ORANGE, corner: { c: 0, r: 31 }, home: { x: 16 * CELL, y: 14 * CELL + CELL / 2 }, releaseDots: 60, releaseMs: 9000 },
  ];
  CHASERS.forEach(def => { def.sprites = jelly(def.color); });

  const BONUS_PAL = { R: C.red, G: C.green, W: C.text, C: C.cyan, Y: C.yellow, P: C.pink };
  const BONUSES = [
    { points: 100, map: ['......GG..', '.....G.G..', '....G...G.', '...G....G.', '.RRR...RRR', 'RRWRR.RRWR', 'RRRRR.RRRR', 'RRRRR.RRRR', '.RRR...RR.'] },
    { points: 300, map: ['..CCCCCC..', '.CWCCCCCC.', 'CCWCCCCCCC', 'CCCCCCCCCC', '.CCCCCCCC.', '..CCCCCC..', '...CCCC...', '....CC....'] },
    { points: 500, map: ['....YY....', '....YY....', '...YYYY...', 'YYYYYYYYYY', '.YYYYYYYY.', '..YYYYYY..', '..YYYYYY..', '.YYY..YYY.', '.YY....YY.', 'YY......YY'] },
    { points: 1000, map: ['.....YYYY.', '....YYYY..', '...YYYY...', '..YYYY....', '.YYYYYYYY.', '....YYYY..', '...YYYY...', '..YYY.....', '.YY.......', 'Y.........'] },
    { points: 2000, map: ['Y...YY...Y', 'YY.YYYY.YY', 'YYYYYYYYYY', 'YPYYCCYYPY', 'YYYYYYYYYY', 'YYYYYYYYYY'] },
    { points: 5000, map: ['...CCCC...', '..CWCCCC..', '.PPPPPPPP.', 'PPYPPYPPYP', '.PPPPPPPP.', '..G....G..'] },
  ];
  BONUSES.forEach(b => { b.sprite = A.makeSprite(b.map, BONUS_PAL, 1.5); });
  const bonusFor = lvl => BONUSES[lvl <= 2 ? lvl - 1 : Math.min(BONUSES.length - 1, Math.floor((lvl - 3) / 2) + 2)];

  // ---------- State ----------

  const canvas = document.getElementById('game');
  const { ctx } = A.createScreen(canvas, W, H);
  const input = A.createInput({ swipeTarget: canvas });
  const fx = A.createEffects();

  let state = 'title';
  let stateTime = 0;
  let clock = 0;
  let demo = true;
  let hiScore = A.scores.best(GAME_ID);
  A.scores.onChange(() => { hiScore = A.scores.best(GAME_ID); });

  let level = 1;
  let score = 0;
  let lives = START_LIVES;
  let bonusLife = false;
  let maze, grid, mazeArt, mazeFlash, homeSearch, dots, dotsLeft, dotsEaten;
  let player, ghosts, bonus;
  let tune;
  let modeIdx = 0;
  let modeT = 0;
  let frightT = 0;
  let eatenInRow = 0;
  let freezeT = 0;
  let lifeT = 0;
  let dotsThisLife = 0;
  let munchAlt = 0;
  let shake = 0;
  let entry = null;
  let rank = -1;
  let bonusesSeen = [];

  const center = n => n * CELL + CELL / 2;
  const wrapC = c => ((c % COLS) + COLS) % COLS;
  const tileOf = e => ({ c: wrapC(Math.floor(e.x / CELL)), r: Math.floor(e.y / CELL) });
  const cellAt = (c, r) => (r < 0 || r >= ROWS ? '#' : grid[r][wrapC(c)]);
  const walkable = (c, r) => { const ch = cellAt(c, r); return ch !== '#' && ch !== '-' && ch !== '_'; };
  const canGo = (e, dir) => { const t = tileOf(e); const d = DIRS[dir]; return walkable(t.c + d.x, t.r + d.y); };
  const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));
  const blink = (ms = 500) => Math.floor(clock / ms) % 2 === 0;
  const sfx = (name, arg) => { if (!demo) A.sound.play(name, arg); };
  const scatterNow = () => modeIdx % 2 === 0;

  function setState(next) {
    state = next;
    stateTime = 0;
  }

  // ---------- Level setup ----------

  function tuningFor(lvl) {
    const t = lvl === 1 ? 0 : lvl <= 4 ? 1 : 2;
    return {
      player: [0.8, 0.9, 1][t] * FULL,
      playerFright: [0.9, 0.95, 1][t] * FULL,
      ghost: [0.75, 0.85, 0.95][t] * FULL,
      ghostFright: [0.5, 0.55, 0.6][t] * FULL,
      tunnel: [0.4, 0.45, 0.5][t] * FULL,
      fright: FRIGHT_MS[Math.min(lvl - 1, FRIGHT_MS.length - 1)],
      schedule: SCHEDULES[t],
      release: lvl >= 3 ? 0.5 : 1,
    };
  }

  function buildLevel() {
    maze = MAZES[Math.floor((level - 1) / 2) % MAZES.length];
    grid = maze.rows;
    tune = tuningFor(level);
    dots = new Uint8Array(COLS * ROWS);
    dotsLeft = 0;
    dotsEaten = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = grid[r][c];
        if (ch === '.' || ch === 'o') {
          dots[r * COLS + c] = ch === 'o' ? 2 : 1;
          dotsLeft++;
        }
      }
    }
    mazeArt = paintMaze(maze.color);
    mazeFlash = paintMaze(C.text);
    // Eaten chasers' eyes follow this back to the door.
    homeSearch = A.gridSearch(COLS, ROWS, walkable, DOOR_TILE, { wrapX: true });
    bonus = null;
  }

  function resetActors() {
    player = { x: START.x, y: START.y, dir: 'left', want: null, face: 'left', chomp: 0 };
    ghosts = CHASERS.map((def, id) => ({
      id, def,
      x: def.home.x, y: def.home.y,
      dir: def.outside ? 'left' : id === 1 ? 'down' : 'up',
      mode: def.outside ? 'active' : 'house',
      fright: false,
      points: 0,
    }));
    modeIdx = 0;
    modeT = 0;
    frightT = 0;
    freezeT = 0;
    lifeT = 0;
    dotsThisLife = 0;
    bonus = null;
  }

  function newGame() {
    if (window.track) track('play:' + GAME_ID);
    demo = false;
    level = 1;
    score = 0;
    lives = START_LIVES;
    bonusLife = false;
    bonusesSeen = [bonusFor(1)];
    fx.clear();
    buildLevel();
    resetActors();
    setState('ready');
    A.sound.play('start');
  }

  function nextLevel() {
    level++;
    if (bonusesSeen[bonusesSeen.length - 1] !== bonusFor(level)) bonusesSeen.push(bonusFor(level));
    buildLevel();
    resetActors();
    setState('ready');
  }

  function showTitle() {
    demo = true;
    level = 1;
    score = 0;
    fx.clear();
    buildLevel();
    resetActors();
    setState('title');
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
      fx.float(player.x, player.y - 16, '1UP!', C.green);
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

  // ---------- Movement ----------
  // Actors glide between cell centers. Turns can only happen on a center, so each time one
  // is reached, atCenter() decides the next direction (or sets dir to null to stop).

  function advance(e, dist, atCenter) {
    for (let guard = 0; dist > 1e-6 && e.dir && guard < 8; guard++) {
      const d = DIRS[e.dir];
      const horiz = d.x !== 0;
      const off = ((((horiz ? e.x : e.y) - CELL / 2) % CELL) + CELL) % CELL; // distance past the last center
      let ahead = d.x + d.y > 0 ? (off === 0 ? 0 : CELL - off) : off;
      if (ahead === 0) {
        atCenter(e);
        if (!e.dir) return;
        ahead = CELL;
      }
      const nd = DIRS[e.dir];
      const step = Math.min(dist, ahead);
      e.x += nd.x * step;
      e.y += nd.y * step;
      dist -= step;
      if (step === ahead) {
        // Land exactly on the center so the next step sees it.
        if (nd.x) e.x = Math.round((e.x - CELL / 2) / CELL) * CELL + CELL / 2;
        else e.y = Math.round((e.y - CELL / 2) / CELL) * CELL + CELL / 2;
      }
      if (e.x < -CELL / 2) e.x += W;
      else if (e.x >= W + CELL / 2) e.x -= W;
    }
  }

  function playerAtCenter(p) {
    if (demo) p.want = demoChoice();
    if (p.want && canGo(p, p.want)) p.dir = p.want;
    if (!canGo(p, p.dir)) p.dir = null;
  }

  function updatePlayer(dt) {
    const p = player;
    // Reversing works anywhere, not just on a center.
    if (p.dir && p.want === OPP[p.dir]) p.dir = p.want;
    if (!p.dir) {
      if (demo) p.want = demoChoice();
      if (p.want && canGo(p, p.want)) p.dir = p.want;
    }
    if (!p.dir) return;
    p.face = p.dir;
    const dist = (frightT > 0 ? tune.playerFright : tune.player) * dt;
    const before = { x: p.x, y: p.y };
    advance(p, dist, playerAtCenter);
    p.chomp += Math.abs(p.x - before.x) % W + Math.abs(p.y - before.y);
    if (p.dir) p.face = p.dir;
    eatAt(tileOf(p));
  }

  function eatAt(t) {
    const i = t.r * COLS + t.c;
    const kind = dots[i];
    if (kind) {
      dots[i] = 0;
      dotsLeft--;
      dotsEaten++;
      dotsThisLife++;
      if (kind === 2) {
        addScore(ORB_POINTS);
        startFright();
      } else {
        addScore(DOT_POINTS);
        sfx('munch', (munchAlt ^= 1));
      }
      if (BONUS_AT.includes(dotsEaten)) bonus = { kind: bonusFor(level), ttl: BONUS_MS };
    }
    if (bonus && Math.abs(player.x - BONUS_POS.x) < 10 && Math.abs(player.y - BONUS_POS.y) < 8) {
      addScore(bonus.kind.points);
      fx.float(BONUS_POS.x, BONUS_POS.y - 4, String(bonus.kind.points), C.pink);
      sfx('bonus');
      bonus = null;
    }
  }

  function startFright() {
    frightT = tune.fright;
    eatenInRow = 0;
    sfx('powerup');
    fx.burst(player.x, player.y, C.pink, 18, 0.18);
    for (const g of ghosts) {
      if (g.mode === 'eyes' || g.mode === 'entering') continue;
      if (g.mode === 'active' && !g.fright) g.dir = OPP[g.dir] || g.dir;
      g.fright = true;
    }
  }

  // ---------- Chasers ----------

  function targetFor(g) {
    const p = tileOf(player);
    const pd = DIRS[player.face];
    const elroy = g.id === 0 && dotsLeft <= ELROY_DOTS;
    if (scatterNow() && !elroy) return g.def.corner;
    switch (g.id) {
      case 0: return p; // straight at you
      case 1: return { c: p.c + pd.x * 4, r: p.r + pd.y * 4 }; // where you're about to be
      case 2: { // the point opposite ZIP across a spot just ahead of you, so it flanks
        const z = tileOf(ghosts[0]);
        const ahead = { c: p.c + pd.x * 2, r: p.r + pd.y * 2 };
        return { c: ahead.c * 2 - z.c, r: ahead.r * 2 - z.r };
      }
      default: { // chases from afar, drifts back to its corner up close
        const t = tileOf(g);
        return (t.c - p.c) ** 2 + (t.r - p.r) ** 2 > 64 ? p : g.def.corner;
      }
    }
  }

  function ghostAtCenter(g) {
    const t = tileOf(g);
    if (g.mode === 'eyes' && t.r === DOOR_TILE.r && (t.c === 13 || t.c === 14)) {
      g.mode = 'entering';
      g.dir = null;
      return;
    }
    const options = DIR_NAMES.filter(d => d !== OPP[g.dir] && walkable(t.c + DIRS[d].x, t.r + DIRS[d].y));
    if (!options.length) {
      g.dir = OPP[g.dir];
      return;
    }
    if (g.mode === 'eyes') {
      const dist = d => homeSearch.dist(wrapC(t.c + DIRS[d].x), t.r + DIRS[d].y);
      g.dir = options.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    } else if (g.fright) {
      g.dir = options[Math.floor(Math.random() * options.length)];
    } else {
      const goal = targetFor(g);
      const score2 = d => (t.c + DIRS[d].x - goal.c) ** 2 + (t.r + DIRS[d].y - goal.r) ** 2;
      g.dir = options.reduce((a, b) => (score2(b) < score2(a) ? b : a));
    }
  }

  function ghostSpeed(g) {
    if (g.mode === 'eyes') return FULL * 2;
    if (g.mode === 'entering') return FULL;
    if (g.mode === 'house' || g.mode === 'leaving') return FULL * 0.45;
    const t = tileOf(g);
    if (t.r === maze.tunnel && (t.c <= 5 || t.c >= COLS - 6)) return tune.tunnel;
    if (g.fright) return tune.ghostFright;
    if (g.id === 0 && dotsLeft <= ELROY_DOTS) return tune.ghost + FULL * 0.05;
    return tune.ghost;
  }

  function released(g) {
    return lifeT >= g.def.releaseMs * tune.release || dotsThisLife >= g.def.releaseDots;
  }

  function updateGhost(g, dt) {
    const dist = ghostSpeed(g) * dt;
    const exitY = center(DOOR_TILE.r);
    const houseY = center(14);
    if (g.mode === 'house') {
      // Bob up and down until it's this one's turn to come out.
      g.y += (g.dir === 'up' ? -1 : 1) * dist;
      if (g.y < houseY - 4) g.dir = 'down';
      if (g.y > houseY + 4) g.dir = 'up';
      if (released(g)) g.mode = 'leaving';
    } else if (g.mode === 'leaving') {
      if (g.x !== DOOR_X) g.x = approach(g.x, DOOR_X, dist);
      else if (g.y !== houseY && g.y > houseY) g.y = approach(g.y, houseY, dist);
      else g.y = approach(g.y, exitY, dist);
      if (g.x === DOOR_X && g.y === exitY) {
        g.mode = 'active';
        g.dir = 'left';
      }
    } else if (g.mode === 'entering') {
      if (g.x !== DOOR_X) g.x = approach(g.x, DOOR_X, dist);
      else g.y = approach(g.y, houseY, dist);
      if (g.x === DOOR_X && g.y === houseY) {
        g.mode = 'leaving';
        g.fright = false;
      }
    } else {
      advance(g, dist, ghostAtCenter);
    }
  }

  function updateModes(dt) {
    if (frightT > 0) {
      if ((frightT -= dt) <= 0) {
        frightT = 0;
        ghosts.forEach(g => { g.fright = false; });
      }
      return; // the scatter/chase clock waits while they're blue
    }
    if ((modeT += dt) >= tune.schedule[modeIdx]) {
      modeT = 0;
      modeIdx++;
      ghosts.forEach(g => { if (g.mode === 'active') g.dir = OPP[g.dir] || g.dir; });
    }
  }

  function collisions() {
    for (const g of ghosts) {
      if (g.mode !== 'active' && g.mode !== 'leaving') continue;
      let dx = Math.abs(g.x - player.x);
      dx = Math.min(dx, W - dx);
      if (dx >= 10 || Math.abs(g.y - player.y) >= 10) continue;
      if (g.fright) {
        g.points = 200 * 2 ** Math.min(eatenInRow++, 3);
        g.fright = false;
        g.mode = g.mode === 'leaving' ? 'entering' : 'eyes'; // caught in the doorway: straight back in
        addScore(g.points);
        fx.burst(g.x, g.y, g.def.color, 20, 0.2);
        sfx('gulp');
        freezeT = EAT_FREEZE_MS;
        g.shown = EAT_FREEZE_MS;
        return;
      }
      die();
      return;
    }
  }

  function die() {
    if (demo) {
      showTitle();
      return;
    }
    lives--;
    shake = 6;
    setState('dying');
  }

  // ---------- Attract-mode AI ----------
  // Heads for the nearest dot (or a blue chaser), steering around cells near dangerous ones.

  function demoChoice() {
    const here = tileOf(player);
    const danger = new Set();
    for (const g of ghosts) {
      if ((g.mode !== 'active' && g.mode !== 'leaving') || g.fright) continue;
      const t = tileOf(g);
      for (let dc = -2; dc <= 2; dc++) {
        for (let dr = -2; dr <= 2; dr++) {
          if (Math.abs(dc) + Math.abs(dr) <= 2) danger.add(wrapC(t.c + dc) + ',' + (t.r + dr));
        }
      }
    }
    const goal = (c, r) => dots[r * COLS + c] > 0 || ghosts.some(g => g.fright && g.mode === 'active' && tileOf(g).c === c && tileOf(g).r === r);
    let search = A.gridSearch(COLS, ROWS, (c, r) => walkable(c, r) && !danger.has(c + ',' + r), here, { wrapX: true, stopAt: goal });
    if (!search.found) search = A.gridSearch(COLS, ROWS, walkable, here, { wrapX: true, stopAt: goal });
    if (!search.found) return player.dir;
    const next = search.pathTo(search.found)[0];
    let dc = next.c - here.c;
    if (dc > 1) dc = -1;
    else if (dc < -1) dc = 1;
    return dc > 0 ? 'right' : dc < 0 ? 'left' : next.r > here.r ? 'down' : 'up';
  }

  // ---------- Input ----------

  input.on(action => {
    switch (state) {
      case 'title':
        if (action === 'start' || action === 'tap') newGame();
        break;
      case 'ready':
      case 'playing':
        if (DIRS[action]) player.want = action;
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
  });

  A.onBlur(() => { if (state === 'playing') pause(); });

  // ---------- Update ----------

  function updateWorld(dt) {
    ghosts.forEach(g => { if (g.shown > 0) g.shown -= dt; });
    if (freezeT > 0) {
      freezeT -= dt;
      return;
    }
    lifeT += dt;
    updateModes(dt);
    updatePlayer(dt);
    collisions();
    if (state !== 'playing' && state !== 'title') return;
    if (freezeT > 0) return;
    ghosts.forEach(g => updateGhost(g, dt));
    collisions();
    if (bonus && (bonus.ttl -= dt) <= 0) bonus = null;
    if (dotsLeft === 0) {
      if (demo) showTitle();
      else {
        sfx('levelup');
        setState('clear');
      }
    }
  }

  function update(dt) {
    clock += dt;
    stateTime += dt;
    shake = Math.max(0, shake - dt * 0.02);
    fx.update(dt);

    if (state === 'title' || state === 'playing') updateWorld(dt);
    else if (state === 'ready' && stateTime >= READY_MS) setState('playing');
    else if (state === 'dying') {
      if (stateTime - dt < 800 && stateTime >= 800) A.sound.play('die');
      if (stateTime >= DYING_MS) {
        if (lives > 0) {
          resetActors();
          setState('ready');
        } else {
          endRound();
        }
      }
    } else if (state === 'clear' && stateTime >= CLEAR_MS) nextLevel();
    else if (state === 'gameover' && stateTime >= 20000) showTitle();
  }

  // ---------- Render ----------

  // The maze is painted once per level: every wall cell is drawn as a 3x3 patchwork that joins
  // its wall neighbours, first in neon and then again slightly smaller in black, which leaves
  // a glowing outline around each wall block.
  function paintMaze(color) {
    const art = document.createElement('canvas');
    art.width = W * 2;
    art.height = FIELD_H * 2;
    const g = art.getContext('2d');
    g.scale(2, 2);
    const isWall = (c, r) => c < 0 || r < 0 || c >= COLS || r >= ROWS || grid[r][c] === '#';
    const layer = (m, fill) => {
      g.fillStyle = fill;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (!isWall(c, r)) continue;
          const x = c * CELL;
          const y = r * CELL;
          const L = isWall(c - 1, r), R = isWall(c + 1, r), U = isWall(c, r - 1), D = isWall(c, r + 1);
          g.fillRect(x + m, y + m, CELL - 2 * m, CELL - 2 * m);
          if (L) g.fillRect(x, y + m, m, CELL - 2 * m);
          if (R) g.fillRect(x + CELL - m, y + m, m, CELL - 2 * m);
          if (U) g.fillRect(x + m, y, CELL - 2 * m, m);
          if (D) g.fillRect(x + m, y + CELL - m, CELL - 2 * m, m);
          if (L && U && isWall(c - 1, r - 1)) g.fillRect(x, y, m, m);
          if (R && U && isWall(c + 1, r - 1)) g.fillRect(x + CELL - m, y, m, m);
          if (L && D && isWall(c - 1, r + 1)) g.fillRect(x, y + CELL - m, m, m);
          if (R && D && isWall(c + 1, r + 1)) g.fillRect(x + CELL - m, y + CELL - m, m, m);
        }
      }
    };
    g.shadowColor = color;
    g.shadowBlur = 6;
    layer(3, color);
    g.shadowBlur = 0;
    layer(5, '#0b0a1c');
    g.fillStyle = C.pink;
    g.fillRect(13 * CELL, 12 * CELL + 6, 2 * CELL, 3);
    return art;
  }

  function drawHud() {
    const shown = demo ? 0 : score;
    A.text(ctx, 'SCORE', 16, 16, { size: 8, color: C.dim, align: 'left' });
    A.text(ctx, A.pad(shown), 16, 33, { size: 14, align: 'left' });
    A.text(ctx, 'LEVEL', W / 2, 16, { size: 8, color: C.dim });
    A.text(ctx, String(level), W / 2, 33, { size: 14, color: C.yellow });
    A.text(ctx, 'HI-SCORE', W - 16, 16, { size: 8, color: C.dim, align: 'right' });
    A.text(ctx, A.pad(Math.max(hiScore, shown)), W - 16, 33, { size: 14, color: C.pink, align: 'right' });
    ctx.fillStyle = 'rgba(41, 240, 255, 0.6)';
    ctx.fillRect(0, HUD - 2, W, 2);
  }

  function drawDots() {
    ctx.fillStyle = '#ffc2e0';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (dots[r * COLS + c] === 1) ctx.fillRect(c * CELL + 6.5, r * CELL + 6.5, 3, 3);
      }
    }
    if (!blink(250) && state === 'playing') return;
    ctx.save();
    ctx.fillStyle = C.pink;
    ctx.shadowColor = C.pink;
    ctx.shadowBlur = 10;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (dots[r * COLS + c] !== 2) continue;
        ctx.beginPath();
        ctx.arc(center(c), center(r), 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawBonus() {
    if (!bonus || (bonus.ttl < 2000 && !blink(120))) return;
    A.drawSprite(ctx, bonus.kind.sprite, BONUS_POS.x, BONUS_POS.y + Math.sin(clock / 200) * 1.5);
  }

  function drawEyes(g, x, y) {
    const d = DIRS[g.dir] || DIRS.left;
    for (const side of [-1, 1]) {
      const ex = x + side * 3 - 2;
      ctx.fillStyle = C.text;
      ctx.fillRect(ex, y - 3, 4, 5);
      ctx.fillStyle = '#1a1aff';
      ctx.fillRect(ex + 1 + d.x * 1.5, y - 1.5 + d.y * 1.5, 2, 2);
    }
  }

  function drawGhosts() {
    if (state === 'clear' || (state === 'dying' && stateTime > 800)) return;
    const frame = Math.floor(clock / 160) % 2;
    for (const g of ghosts) {
      if (g.shown > 0) {
        A.text(ctx, String(g.points), g.x, g.y, { size: 8, color: C.cyan, glow: 8 });
        continue;
      }
      if (g.mode === 'eyes' || g.mode === 'entering') {
        drawEyes(g, g.x, g.y - 1);
        continue;
      }
      if (g.fright) {
        const flash = frightT < FLASH_MS && blink(200);
        A.drawSprite(ctx, (flash ? SCARED_FLASH : SCARED)[frame], g.x, g.y);
        ctx.fillStyle = flash ? C.red : '#ffd6ec';
        ctx.fillRect(g.x - 4, g.y - 3, 2, 2);
        ctx.fillRect(g.x + 2, g.y - 3, 2, 2);
        for (let i = 0; i < 4; i++) ctx.fillRect(g.x - 5 + i * 3, g.y + 1 + (i % 2), 2, 1.5);
        continue;
      }
      A.drawSprite(ctx, g.def.sprites[frame], g.x, g.y);
      drawEyes(g, g.x, g.y - 1);
    }
  }

  function drawMuncher(x, y, face, mouth, r = 7, alpha = 1) {
    const angle = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[face] || 0;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = C.yellow;
    ctx.shadowColor = C.yellow;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, angle + mouth, angle + Math.PI * 2 - mouth);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer() {
    if (state === 'clear' || state === 'entry' || state === 'gameover') {
      if (state === 'clear') drawMuncher(player.x, player.y, player.face, 0.1);
      return;
    }
    if (state === 'dying') {
      if (stateTime < 800) drawMuncher(player.x, player.y, player.face, 0.3);
      else {
        const t = Math.min(1, (stateTime - 800) / 1200);
        if (t < 1) drawMuncher(player.x, player.y, 'up', 0.2 + t * (Math.PI - 0.2), 7, 1 - t * 0.3);
      }
      return;
    }
    const mouth = player.dir ? 0.08 + Math.abs(Math.sin(player.chomp / 5)) * 0.75 : 0.5;
    drawMuncher(player.x, player.y, player.face, state === 'ready' ? 0.5 : mouth);
  }

  function drawFooter() {
    const y = H - FOOT;
    ctx.fillStyle = 'rgba(41, 240, 255, 0.6)';
    ctx.fillRect(0, y, W, 2);
    if (demo) return;
    const spare = Math.max(0, lives - (state === 'dying' ? 0 : 1));
    for (let i = 0; i < Math.min(spare, 6); i++) drawMuncher(22 + i * 22, y + 17, 'right', 0.6, 7);
    bonusesSeen.slice(-7).forEach((b, i, list) => A.drawSprite(ctx, b.sprite, W - 20 - (list.length - 1 - i) * 22, y + 17));
  }

  const dim = alpha => A.dim(ctx, W, H, alpha);

  function drawOverlay() {
    const cx = W / 2;
    const cy = HUD + FIELD_H / 2;
    const msgY = HUD + center(17);
    const startPrompt = A.isTouch ? 'TAP TO START' : 'PRESS ENTER';

    if (state === 'title') {
      dim(0.65);
      A.text(ctx, 'MAZE', cx, 112, { size: 30, color: C.cyan, glow: 16 });
      A.text(ctx, 'MUNCH', cx, 160, { size: 40, color: C.yellow, glow: 20 });
      const panel = Math.floor(clock / 5000) % 3;
      if (panel === 0) {
        A.text(ctx, 'MUNCH EVERY DOT TO CLEAR', cx, 236, { size: 10, color: C.text });
        A.text(ctx, 'THE MAZE', cx, 256, { size: 10, color: C.text });
        A.text(ctx, 'POWER ORBS TURN THEM BLUE', cx, 296, { size: 10, color: C.pink });
        A.text(ctx, 'EAT BLUE ONES: 200 400 800 1600', cx, 324, { size: 8, color: C.cyan });
        A.text(ctx, 'SIDE TUNNELS WRAP AROUND', cx, 360, { size: 10, color: C.green });
        A.text(ctx, A.isTouch ? 'SWIPE OR D-PAD TO STEER' : 'ARROWS / WASD TO STEER', cx, 396, { size: 10, color: C.yellow });
      } else if (panel === 1) {
        A.text(ctx, 'MEET THE CHASERS', cx, 226, { size: 12, color: C.cyan, glow: 10 });
        CHASERS.forEach((def, i) => {
          const y = 270 + i * 36;
          A.drawSprite(ctx, def.sprites[Math.floor(clock / 160) % 2], 96, y, { scale: 1.4 });
          drawEyes({ dir: 'right' }, 96, y - 1);
          A.text(ctx, def.name, 126, y, { size: 12, color: def.color, align: 'left' });
          A.text(ctx, def.tag, W - 64, y, { size: 8, color: C.dim, align: 'right' });
        });
      } else {
        A.drawScoreTable(ctx, GAME_ID, cx, 236);
      }
      if (blink()) A.text(ctx, startPrompt, cx, 470, { size: 14, color: C.yellow, glow: 10 });
      A.text(ctx, '(C) 2026 NEON ARCADE', cx, 520, { size: 8, color: C.dim });
    } else if (state === 'ready') {
      A.text(ctx, 'READY!', cx, msgY, { size: 12, color: C.yellow, glow: 10 });
      if (level > 1 && stateTime < READY_MS) A.text(ctx, 'LEVEL ' + level, cx, msgY + 32, { size: 10, color: C.cyan, glow: 8 });
    } else if (state === 'paused') {
      dim(0.7);
      A.text(ctx, 'PAUSED', cx, cy - 20, { size: 28, color: C.cyan, glow: 16 });
      if (blink()) A.text(ctx, A.isTouch ? 'TAP TO RESUME' : 'PRESS P TO RESUME', cx, cy + 30, { size: 10 });
    } else if (state === 'clear') {
      A.text(ctx, 'MAZE CLEAR!', cx, msgY, { size: 12, color: C.green, glow: 12 });
    } else if (state === 'dying' && stateTime > 1400) {
      if (lives > 0) A.text(ctx, lives === 1 ? 'LAST LIFE!' : lives + ' LIVES LEFT', cx, msgY, { size: 10, color: C.yellow, glow: 10 });
      else A.text(ctx, 'GAME OVER', cx, msgY, { size: 12, color: C.red, glow: 10 });
    } else if (state === 'entry') {
      dim(0.8);
      if (blink(250)) A.text(ctx, 'NEW HIGH SCORE!', cx, 140, { size: 18, color: C.yellow, glow: 14 });
      A.text(ctx, A.pad(score), cx, 190, { size: 24, color: C.pink, glow: 12 });
      A.text(ctx, 'ENTER YOUR INITIALS', cx, 270, { size: 10 });
      entry.draw(ctx, cx, 350, clock);
      A.text(ctx, A.isTouch ? 'UP/DOWN PICK - TAP NEXT' : 'UP/DOWN PICK - ENTER NEXT', cx, 440, { size: 8, color: C.dim });
    } else if (state === 'gameover') {
      dim(0.75);
      A.text(ctx, 'GAME OVER', cx, 116, { size: 32, color: C.red, glow: 18 });
      A.text(ctx, 'SCORE ' + A.pad(score) + '  LEVEL ' + level, cx, 166, { size: 12 });
      A.drawScoreTable(ctx, GAME_ID, cx, 230, { highlight: rank, t: clock });
      if (stateTime > 600 && blink()) A.text(ctx, A.isTouch ? 'TAP TO PLAY AGAIN' : 'ENTER TO PLAY AGAIN', cx, 456, { size: 12, color: C.yellow, glow: 10 });
      if (!A.isTouch) A.text(ctx, 'ESC FOR TITLE', cx, 496, { size: 8, color: C.dim });
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
    ctx.beginPath();
    ctx.rect(0, 0, W, FIELD_H);
    ctx.clip();
    const flashing = state === 'clear' && stateTime > 600 && blink(200);
    ctx.drawImage(flashing ? mazeFlash : mazeArt, 0, 0, W, FIELD_H);
    drawDots();
    drawBonus();
    drawPlayer();
    drawGhosts();
    fx.draw(ctx);
    ctx.restore();
    drawFooter();
    drawOverlay();
    ctx.restore();
  }

  showTitle();
  A.waitForFont().then(() => A.startLoop({ update, render }));
})();
