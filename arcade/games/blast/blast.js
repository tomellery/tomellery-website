/*
 * Blast Zone: a Neon Arcade bomb game, starring the arcade's construction crew in a demolition derby.
 * Drop bombs that burn in a cross, smash crates, find power-ups, and set off chain reactions.
 * Adventure (1 player): clear each stage's enemies and find the exit hidden under a crate.
 * Battle (1 or 2 players + CPU bombers): last bomber standing wins the round; first to 3 wins the match.
 * Play states: ready -> playing <-> paused, dying, clear (stage), roundEnd, match. The shell runs title,
 * pause, initials and game over (Adventure scores only).
 */
(function () {
  'use strict';

  const A = window.Arcade;
  const C = A.COLORS;

  const GAME_ID = 'blast';
  const W = 480;
  const H = 600;
  const HUD = 48;
  const CELL = 32;
  const COLS = 15;
  const ROWS = 13;
  const AY = HUD + 16; // top of the arena
  const SOLID = 1;
  const CRATE = 2;

  const START_LIVES = 3;
  const EXTRA_LIFE_AT = 20000;
  const READY_MS = 1600;
  const DYING_MS = 1800;
  const CLEAR_MS = 2600;
  const ROUND_END_MS = 2400;
  const MATCH_MS = 4500;
  const STAGE_TIME = 200000;
  const WINS_NEEDED = 3;
  const BASE_SPEED = 0.085;
  const SPEED_STEP = 0.015;
  const MAX_SPEED = 0.145;

  const CORNERS = [[1, 1], [COLS - 2, ROWS - 2], [COLS - 2, 1], [1, ROWS - 2]];
  const DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  const DIR_LIST = Object.values(DIRS);
  const ITEM_TYPES = ['bomb', 'fire', 'speed', 'kick', 'remote'];
  const STAGE_ITEMS = ['bomb', 'fire', 'speed', 'bomb', 'fire', 'kick', 'remote', 'fire', 'speed', 'bomb'];
  const CPU_CREW = ['Gramps', 'Bones', 'Foreman Cat', 'The Boss', 'Bolt-Bot', 'Night Ninja', 'Zorp', 'The Welder', 'Frosty', 'Holly the Elf', 'Space Tech', 'Off-Duty'];
  const ENEMY = {
    blob: { speed: 0.05, points: 100, color: C.pink },
    drifter: { speed: 0.04, points: 200, color: C.cyan, ghost: true },
    chomper: { speed: 0.075, points: 400, color: C.yellow },
  };

  // ---------- State ----------

  const canvas = document.getElementById('game');
  const { ctx } = A.createScreen(canvas, W, H);
  const input = A.createInput({ swipeTarget: canvas });
  const fx = A.createEffects();

  let demo = true;
  let mode = 'adventure'; // or 'battle'
  let humans = 1; // battle: 1 or 2 people at the keyboard
  let stage = 1;
  let round = 1;
  let score = 0;
  let lives = START_LIVES;
  let bonusLife = false;
  let grid, hidden, items, door, crumbles, bombers, enemies, bombs;
  let timeLeft = STAGE_TIME;
  let doorHits = 0;
  let roundWinner = null;
  let shake = 0;
  const sprites = {};
  const fresh = new Set(); // power-ups uncovered by the blast going off right now

  const shell = A.createShell({
    ctx, width: W, height: H, id: GAME_ID,
    title: ['BLAST', 'ZONE'],
    titleColors: [C.yellow, C.pink],
    howTo: [
      ['DROP BOMBS - THEY BURN IN A CROSS', C.yellow],
      ['BLASTS SET OFF OTHER BOMBS', '#ff9f1c'],
      ['CRATES HIDE POWER-UPS', C.green],
      [A.isTouch ? 'D-PAD MOVES - BOMB BUTTON' : 'P1 ARROWS + ENTER  P2 WASD + SPACE', C.cyan],
    ],
    hudLabel: 'STAGE',
    newGame, showTitle,
  });

  const idx = (c, r) => r * COLS + c;
  const inside = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS;
  const cx = c => c * CELL + CELL / 2;
  const cy = r => AY + r * CELL + CELL / 2;
  const colOf = x => Math.floor(x / CELL);
  const rowOf = y => Math.floor((y - AY) / CELL);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const sfx = (name, arg) => { if (!demo) A.sound.play(name, arg); };
  const blink = (ms = 500) => Math.floor(shell.clock / ms) % 2 === 0;
  const battle = () => mode === 'battle';

  function crew(name) {
    if (!sprites[name]) sprites[name] = A.crewSprite(name, 2) || A.crewSprite('The Classic', 2);
    return sprites[name];
  }

  // ---------- Arenas ----------

  function buildArena(crateChance) {
    grid = new Uint8Array(COLS * ROWS);
    hidden = new Map();
    items = new Map();
    crumbles = [];
    door = null;
    doorHits = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1 || (r % 2 === 0 && c % 2 === 0)) grid[idx(c, r)] = SOLID;
      }
    }
    // Crates everywhere except right around the starting corners.
    const nearStart = (c, r) => (battle() ? CORNERS : [CORNERS[0]]).some(([sc, sr]) => Math.abs(sc - c) + Math.abs(sr - r) <= 2);
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (!grid[idx(c, r)] && !nearStart(c, r) && Math.random() < crateChance) grid[idx(c, r)] = CRATE;
      }
    }
    bombs = A.createBombs({
      cols: COLS, rows: ROWS,
      solid: (c, r) => grid[idx(c, r)] === SOLID,
      soft: (c, r) => grid[idx(c, r)] === CRATE,
      onSoft: smashCrate,
      onExplode: exploded,
      blocked: (c, r) => bombers.some(b => b.alive && colOf(b.x) === c && rowOf(b.y) === r) || (enemies || []).some(e => colOf(e.x) === c && rowOf(e.y) === r),
    });
  }

  const crateCells = () => {
    const list = [];
    for (let i = 0; i < grid.length; i++) if (grid[i] === CRATE) list.push(i);
    return list;
  };

  function makeBomber(name, corner, human) {
    const [c, r] = CORNERS[corner];
    return { name, corner, human, x: cx(c), y: cy(r), dir: null, facing: 1, speed: BASE_SPEED, bombs: 1, range: 2, kick: false, remote: false, alive: true, standing: null, walk: 0, wins: 0, plan: null, think: 0, deadT: 0 };
  }

  function setupStage() {
    buildArena(Math.min(0.7, 0.5 + stage * 0.02));
    const crates = crateCells();
    const shuffled = crates.sort(() => Math.random() - 0.5);
    door = { i: shuffled[0], open: false };
    hidden.set(shuffled[0], 'door');
    hidden.set(shuffled[1], STAGE_ITEMS[(stage - 1) % STAGE_ITEMS.length]);
    const keep = bombers && bombers[0] ? bombers[0] : null;
    bombers = [makeBomber('Hi-Vis', 0, 1)];
    // Power-ups you've collected stay with you from stage to stage (until you lose a life).
    if (keep) Object.assign(bombers[0], { speed: keep.speed, bombs: keep.bombs, range: keep.range, kick: keep.kick, remote: keep.remote });
    enemies = [];
    const count = Math.min(10, 3 + stage);
    for (let n = 0; n < count; n++) {
      const kind = stage >= 5 && n % 3 === 0 ? 'chomper' : stage >= 3 && n % 2 === 0 ? 'drifter' : 'blob';
      spawnEnemy(kind, 6);
    }
    timeLeft = STAGE_TIME;
  }

  function spawnEnemy(kind, minDist, near) {
    for (let tries = 0; tries < 200; tries++) {
      const c = near ? near.c + Math.floor(rand(-1, 2)) : Math.floor(rand(1, COLS - 1));
      const r = near ? near.r + Math.floor(rand(-1, 2)) : Math.floor(rand(1, ROWS - 1));
      if (!inside(c, r) || grid[idx(c, r)]) continue;
      if (!near && Math.abs(c - 1) + Math.abs(r - 1) < minDist) continue;
      enemies.push({ kind, x: cx(c), y: cy(r), tc: c, tr: r, dir: pick(DIR_LIST), walk: 0, ...ENEMY[kind] });
      return;
    }
  }

  function setupRound() {
    buildArena(0.72);
    for (const i of crateCells()) {
      if (Math.random() < 0.3) {
        let roll = Math.random() * 100;
        hidden.set(i, roll < 30 ? 'bomb' : (roll -= 30) < 30 ? 'fire' : (roll -= 30) < 20 ? 'speed' : (roll -= 20) < 13 ? 'kick' : 'remote');
      }
    }
    const old = bombers || [];
    const cpuNames = CPU_CREW.slice().sort(() => Math.random() - 0.5);
    bombers = [0, 1, 2, 3].map(i => {
      const human = demo ? 0 : i === 0 ? 1 : i === 1 && humans === 2 ? 2 : 0;
      const name = i === 0 && !demo ? 'Hi-Vis' : i === 1 && !demo ? 'Punk' : (old[i] && old[i].name) || cpuNames[i];
      const b = makeBomber(name, i, human);
      b.wins = old[i] && round > 1 ? old[i].wins : 0;
      return b;
    });
    enemies = [];
    roundWinner = null;
  }

  function newGame() {
    if (window.track) track('play:' + GAME_ID);
    demo = false;
    score = 0;
    lives = START_LIVES;
    bonusLife = false;
    fx.clear();
    bombers = null;
    if (battle()) {
      round = 1;
      setupRound();
    } else {
      stage = 1;
      setupStage();
    }
    shell.setState('ready');
    A.sound.play('start');
  }

  function showTitle() {
    demo = true;
    const was = mode;
    mode = 'battle';
    round = 1;
    bombers = null;
    fx.clear();
    setupRound();
    mode = was;
    shell.setState('title');
  }

  function addScore(points, x, y, color = C.yellow) {
    if (demo || battle()) return;
    score += points;
    if (x !== undefined) fx.float(x, y, String(points), color);
    if (!bonusLife && score >= EXTRA_LIFE_AT) {
      bonusLife = true;
      lives++;
      fx.float(W / 2, AY + 40, '1UP!', C.green);
      A.sound.play('powerup');
    }
  }

  // ---------- Bombs and crates ----------

  function smashCrate(c, r) {
    grid[idx(c, r)] = 0;
    crumbles.push({ c, r, t: 0 });
    addScore(10);
    const secret = hidden.get(idx(c, r));
    if (secret === 'door') door.open = true;
    else if (secret) {
      items.set(idx(c, r), secret);
      fresh.add(idx(c, r));
    }
    hidden.delete(idx(c, r));
  }

  function exploded(bomb, cells) {
    sfx('kaboom');
    shake = Math.min(12, shake + 5);
    for (const cell of cells) {
      // Fire burns up power-ups lying in the open; a blast over the exit lets more enemies out.
      if (items.has(idx(cell.c, cell.r)) && !fresh.has(idx(cell.c, cell.r))) items.delete(idx(cell.c, cell.r));
      if (door && door.open && door.i === idx(cell.c, cell.r) && doorHits < 2 && !battle()) {
        doorHits++;
        for (let n = 0; n < 3; n++) spawnEnemy('blob', 0, { c: cell.c, r: cell.r });
        sfx('alarm');
      }
    }
    fresh.clear();
  }

  function placeBomb(b) {
    const c = colOf(b.x);
    const r = rowOf(b.y);
    const mine = bombs.list.filter(o => o.owner === b);
    if (b.remote && mine.length >= b.bombs) {
      bombs.detonate(mine[0]); // remote: set off your oldest one
      return;
    }
    if (mine.length >= b.bombs || bombs.at(c, r)) return;
    const bomb = bombs.place(c, r, { range: b.range, owner: b, fuse: b.remote ? Infinity : 2400 });
    if (bomb) {
      b.standing = bomb;
      sfx('plop');
    }
  }

  // ---------- Moving on the grid ----------
  // Bodies run down the lanes; pressing toward a gap when slightly off-line slides them into it.

  function passable(c, r, b) {
    if (!inside(c, r)) return false;
    const cell = grid[idx(c, r)];
    if (cell === SOLID || (cell === CRATE && !(b && b.ghost))) return false;
    const bomb = bombs.at(c, r);
    return !bomb || (b && bomb === b.standing);
  }

  function moveBody(b, d, dist) {
    const c = colOf(b.x);
    const r = rowOf(b.y);
    if (d.x) {
      const yc = cy(r);
      if (Math.abs(b.y - yc) > 0.5) {
        if (passable(c + d.x, r, b)) b.y += Math.sign(yc - b.y) * Math.min(dist, Math.abs(yc - b.y));
        return;
      }
      b.y = yc;
      const nx = b.x + d.x * dist;
      const lead = colOf(nx + d.x * 15);
      if (lead !== c && !passable(lead, r, b)) {
        const bomb = bombs.at(lead, r);
        if (bomb && b.kick && !bomb.slide) bomb.slide = { dx: d.x, dy: 0 };
        b.x = d.x > 0 ? Math.min(nx, cx(c)) : Math.max(nx, cx(c));
      } else b.x = nx;
    } else {
      const xc = cx(c);
      if (Math.abs(b.x - xc) > 0.5) {
        if (passable(c, r + d.y, b)) b.x += Math.sign(xc - b.x) * Math.min(dist, Math.abs(xc - b.x));
        return;
      }
      b.x = xc;
      const ny = b.y + d.y * dist;
      const lead = rowOf(ny + d.y * 15);
      if (lead !== r && !passable(c, lead, b)) {
        const bomb = bombs.at(c, lead);
        if (bomb && b.kick && !bomb.slide) bomb.slide = { dx: 0, dy: d.y };
        b.y = d.y > 0 ? Math.min(ny, cy(r)) : Math.max(ny, cy(r));
      } else b.y = ny;
    }
    if (d.x) b.facing = d.x;
    // Once you've stepped off the bomb you dropped, it blocks you like any other.
    if (b.standing && (colOf(b.x) !== b.standing.c || rowOf(b.y) !== b.standing.r)) b.standing = null;
  }

  // ---------- Controls ----------

  function humanDir(b) {
    const down = a => (battle() && humans === 2 ? input.isDownFor(a, b.human) : input.isDown(a));
    for (const name of ['up', 'down', 'left', 'right']) if (down(name)) return DIRS[name];
    return null;
  }

  // ---------- CPU bombers ----------
  // Stay out of every blast that's coming; drop a bomb next to crates or rivals only when there's a way
  // out; otherwise go for power-ups, crates and rivals.

  function dangerCells() {
    const danger = new Set();
    for (const f of bombs.flames) danger.add(f.c + ',' + f.r);
    for (const bomb of bombs.list) for (const cell of bombs.blastCells(bomb)) danger.add(cell.c + ',' + cell.r);
    return danger;
  }

  function pathStep(b, open, goal) {
    const here = { c: colOf(b.x), r: rowOf(b.y) };
    const search = A.gridSearch(COLS, ROWS, open, here, { stopAt: goal });
    if (!search.found) return null;
    const path = search.pathTo(search.found);
    return { cell: path[0], length: path.length };
  }

  function cpuThink(b) {
    const here = { c: colOf(b.x), r: rowOf(b.y) };
    const danger = dangerCells();
    const free = (c, r) => passable(c, r, b);
    const safe = (c, r) => !danger.has(c + ',' + r);
    if (!safe(here.c, here.r)) {
      const step = pathStep(b, free, safe);
      return step ? step.cell : null;
    }
    const rivals = bombers.filter(o => o !== b && o.alive);
    const inLine = rivals.some(o => {
      const oc = colOf(o.x);
      const or = rowOf(o.y);
      if (oc !== here.c && or !== here.r) return false;
      const d = Math.abs(oc - here.c) + Math.abs(or - here.r);
      if (d > b.range) return false;
      for (let k = 1; k < d; k++) {
        const c = here.c + Math.sign(oc - here.c) * k;
        const r = here.r + Math.sign(or - here.r) * k;
        if (grid[idx(c, r)]) return false;
      }
      return true;
    });
    const nextToCrate = DIR_LIST.some(d => grid[idx(here.c + d.x, here.r + d.y)] === CRATE);
    const mine = bombs.list.filter(o => o.owner === b).length;
    if ((inLine || nextToCrate) && mine < b.bombs && !bombs.at(here.c, here.r) && Math.random() < 0.8) {
      // Would there be a way out? Imagine the bomb is already there.
      const ghost = { c: here.c, r: here.r, range: b.range };
      const after = new Set(danger);
      for (const cell of bombs.blastCells(ghost)) after.add(cell.c + ',' + cell.r);
      const escape = pathStep(b, free, (c, r) => !after.has(c + ',' + r));
      if (escape && escape.length <= 5) {
        placeBomb(b);
        if (b.remote) b.remoteT = 1400;
        return escape.cell;
      }
    }
    // Head for a power-up, a crate to blast, or a rival, staying out of danger.
    const target = (c, r) => items.has(idx(c, r)) || DIR_LIST.some(d => grid[idx(c + d.x, r + d.y)] === CRATE) || rivals.some(o => colOf(o.x) === c && rowOf(o.y) === r);
    const step = pathStep(b, (c, r) => free(c, r) && safe(c, r), (c, r) => (c !== here.c || r !== here.r) && target(c, r));
    if (step) return step.cell;
    const options = DIR_LIST.map(d => ({ c: here.c + d.x, r: here.r + d.y })).filter(n => free(n.c, n.r) && safe(n.c, n.r));
    return options.length ? pick(options) : null;
  }

  function updateCpu(b, dt) {
    if (b.remote && b.remoteT !== undefined && (b.remoteT -= dt) <= 0) {
      const mine = bombs.list.filter(o => o.owner === b);
      if (mine.length) bombs.detonate(mine[0]);
      b.remoteT = undefined;
    }
    // Decide at each cell centre (or if the plan stalls), then walk to the chosen cell.
    const atCentre = Math.abs(b.x - cx(colOf(b.x))) < 1 && Math.abs(b.y - cy(rowOf(b.y))) < 1;
    if (!b.plan || (atCentre && colOf(b.x) === b.plan.c && rowOf(b.y) === b.plan.r) || (b.think -= dt) <= 0) {
      b.think = 600;
      b.plan = cpuThink(b);
    }
    if (!b.plan) return;
    const dx = cx(b.plan.c) - b.x;
    const dy = cy(b.plan.r) - b.y;
    const d = Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
    if (dx || dy) {
      moveBody(b, d, Math.min(b.speed * dt, Math.max(Math.abs(dx), Math.abs(dy))));
      b.walk += dt;
    }
  }

  // ---------- Adventure enemies ----------
  // They walk cell to cell: Blobs turn at random, Drifters float through crates, Chompers hunt you.

  function updateEnemy(e, dt) {
    const tx = cx(e.tc);
    const ty = cy(e.tr);
    const dist = e.speed * (1 + (stage - 1) * 0.04) * dt;
    if (Math.abs(e.x - tx) > dist || Math.abs(e.y - ty) > dist) {
      e.x += Math.sign(tx - e.x) * Math.min(dist, Math.abs(tx - e.x));
      e.y += Math.sign(ty - e.y) * Math.min(dist, Math.abs(ty - e.y));
      e.walk += dt;
      return;
    }
    e.x = tx;
    e.y = ty;
    const open = (c, r) => passable(c, r, e);
    let next = null;
    if (e.kind === 'chomper' && bombers[0].alive) {
      const p = bombers[0];
      const search = A.gridSearch(COLS, ROWS, open, { c: e.tc, r: e.tr }, { stopAt: (c, r) => c === colOf(p.x) && r === rowOf(p.y) });
      if (search.found) next = search.pathTo(search.found)[0];
    }
    if (!next) {
      const straight = { c: e.tc + e.dir.x, r: e.tr + e.dir.y };
      const options = DIR_LIST.filter(d => open(e.tc + d.x, e.tr + d.y));
      if (open(straight.c, straight.r) && Math.random() < 0.75) next = straight;
      else if (options.length) {
        e.dir = pick(options);
        next = { c: e.tc + e.dir.x, r: e.tr + e.dir.y };
      }
    }
    if (next) {
      e.dir = { x: Math.sign(next.c - e.tc), y: Math.sign(next.r - e.tr) };
      e.tc = next.c;
      e.tr = next.r;
    }
  }

  // ---------- Fire, pickups and deaths ----------

  function burnCheck() {
    for (const b of bombers) {
      if (!b.alive) continue;
      if (bombs.flameAt(colOf(b.x), rowOf(b.y))) killBomber(b);
    }
    for (const e of enemies) {
      if (!e.dead && bombs.flameAt(colOf(e.x), rowOf(e.y))) {
        e.dead = true;
        const points = e.points * stage;
        addScore(points, e.x, e.y - 18, e.color);
        fx.burst(e.x, e.y, e.color, 18, 0.18);
        sfx('squish');
      }
    }
    enemies = enemies.filter(e => !e.dead);
  }

  function killBomber(b) {
    b.alive = false;
    b.deadT = 0;
    fx.burst(b.x, b.y, C.text, 24, 0.2);
    fx.burst(b.x, b.y, '#ff9f1c', 14, 0.14);
    sfx('die');
    if (!battle() && !demo) {
      lives--;
      shell.setState('dying');
    }
  }

  function pickups() {
    for (const b of bombers) {
      if (!b.alive) continue;
      const i = idx(colOf(b.x), rowOf(b.y));
      const type = items.get(i);
      if (type) {
        items.delete(i);
        if (type === 'bomb') b.bombs = Math.min(8, b.bombs + 1);
        else if (type === 'fire') b.range = Math.min(8, b.range + 1);
        else if (type === 'speed') b.speed = Math.min(MAX_SPEED, b.speed + SPEED_STEP);
        else if (type === 'kick') b.kick = true;
        else if (type === 'remote') b.remote = true;
        addScore(500, b.x, b.y - 20, C.green);
        fx.float(b.x, b.y - 34, type.toUpperCase() + '!', C.green);
        sfx('chime');
      }
    }
    if (!battle() && bombers[0].alive) {
      const p = bombers[0];
      if (enemies.some(e => Math.abs(e.x - p.x) < 20 && Math.abs(e.y - p.y) < 20)) killBomber(p);
      if (bombers[0].alive && door && door.open && !enemies.length && idx(colOf(p.x), rowOf(p.y)) === door.i && shell.state === 'playing') {
        addScore(Math.floor(timeLeft / 1000) * 10 * stage, p.x, p.y - 24, C.green);
        sfx('home');
        shell.setState('clear');
      }
    }
  }

  // ---------- Input ----------

  input.on((action, player) => {
    if (shell.state === 'title') {
      // Pick the mode on the title screen before starting.
      if (action === 'up' || action === 'down') {
        mode = battle() ? 'adventure' : 'battle';
        A.sound.play('select');
        return;
      }
      if ((action === 'left' || action === 'right') && battle() && !A.isTouch) {
        humans = humans === 1 ? 2 : 1;
        A.sound.play('select');
        return;
      }
    }
    if (shell.handle(action)) return;
    if (shell.state !== 'playing' || action !== 'start') return;
    const who = battle() && humans === 2 ? bombers.find(b => b.human === player) : bombers.find(b => b.human);
    if (who && who.alive) placeBomb(who);
  });

  // ---------- Update ----------

  function updatePlay(dt) {
    for (const b of bombers) {
      if (!b.alive) {
        b.deadT += dt;
        continue;
      }
      if (b.human) {
        const d = humanDir(b);
        if (d) {
          moveBody(b, d, b.speed * dt);
          b.walk += dt;
        }
      } else updateCpu(b, dt);
    }
    enemies.forEach(e => updateEnemy(e, dt));
    bombs.update(dt);
    if (bombs.list.length && Math.random() < dt / 120) sfx('fuse');
    crumbles.forEach(cr => { cr.t += dt; });
    crumbles = crumbles.filter(cr => cr.t < 400);
    burnCheck();
    pickups();
    if (!battle() && !demo && shell.state === 'playing') {
      if ((timeLeft -= dt) <= 0) {
        timeLeft = 0;
        killBomber(bombers[0]);
      }
    }
    if ((battle() || demo) && (shell.state === 'playing' || shell.state === 'title')) {
      const alive = bombers.filter(b => b.alive);
      if (alive.length <= 1) {
        roundWinner = roundWinner || { who: alive[0] || null, t: 0 };
        if ((roundWinner.t += dt) > 1000) {
          if (demo) {
            showTitle();
            return;
          }
          if (roundWinner.who) roundWinner.who.wins++;
          sfx('levelup');
          shell.setState('roundEnd');
        }
      }
    }
  }

  function update(dt) {
    shell.update(dt);
    fx.update(dt);
    shake = Math.max(0, shake - dt * 0.02);
    const st = shell.state;
    if (st === 'title' || st === 'playing') updatePlay(dt);
    else if (st === 'ready' && shell.stateTime >= READY_MS) shell.setState('playing');
    else if (st === 'dying') {
      bombs.update(dt);
      if (shell.stateTime >= DYING_MS) {
        if (lives <= 0) shell.gameOver(score, 'STAGE ' + stage);
        else {
          bombers = null; // a lost life loses your power-ups
          setupStage();
          shell.setState('ready');
        }
      }
    } else if (st === 'clear' && shell.stateTime >= CLEAR_MS) {
      stage++;
      setupStage();
      shell.setState('ready');
    } else if (st === 'roundEnd' && shell.stateTime >= ROUND_END_MS) {
      const champ = bombers.find(b => b.wins >= WINS_NEEDED);
      if (champ) shell.setState('match');
      else {
        round++;
        setupRound();
        shell.setState('ready');
      }
    } else if (st === 'match' && shell.stateTime >= MATCH_MS) {
      showTitle();
    }
  }

  // ---------- Render ----------

  function drawArena() {
    ctx.fillStyle = '#0b0a1c';
    ctx.fillRect(0, AY, W, ROWS * CELL);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * CELL;
        const y = AY + r * CELL;
        const cell = grid[idx(c, r)];
        if (cell === SOLID) {
          ctx.fillStyle = '#1c2350';
          ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
          ctx.strokeStyle = C.cyan;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 3, y + 3, CELL - 6, CELL - 6);
        } else if (cell === CRATE) {
          ctx.fillStyle = '#5a3418';
          ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
          ctx.strokeStyle = '#ff9f1c';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 4, y + 4, CELL - 8, CELL - 8);
          ctx.beginPath();
          ctx.moveTo(x + 6, y + 6);
          ctx.lineTo(x + CELL - 6, y + CELL - 6);
          ctx.moveTo(x + CELL - 6, y + 6);
          ctx.lineTo(x + 6, y + CELL - 6);
          ctx.stroke();
        }
      }
    }
    for (const cr of crumbles) {
      ctx.globalAlpha = 1 - cr.t / 400;
      ctx.fillStyle = '#ff9f1c';
      for (let k = 0; k < 4; k++) ctx.fillRect(cr.c * CELL + 6 + k * 6, AY + cr.r * CELL + 8 + (k % 2) * 10 + cr.t * 0.02, 5, 5);
      ctx.globalAlpha = 1;
    }
  }

  function drawItems() {
    if (door && door.open) {
      const x = (door.i % COLS) * CELL;
      const y = AY + Math.floor(door.i / COLS) * CELL;
      ctx.save();
      ctx.strokeStyle = enemies.length ? C.dim : C.green;
      ctx.shadowColor = C.green;
      ctx.shadowBlur = enemies.length ? 0 : 12;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 6, y + 4, CELL - 12, CELL - 6);
      ctx.fillStyle = enemies.length ? '#14122a' : 'rgba(61, 255, 122, 0.3)';
      ctx.fillRect(x + 8, y + 6, CELL - 16, CELL - 10);
      ctx.restore();
    }
    items.forEach((type, i) => {
      const x = (i % COLS) * CELL + CELL / 2;
      const y = AY + Math.floor(i / COLS) * CELL + CELL / 2;
      ctx.save();
      ctx.fillStyle = '#14122a';
      ctx.strokeStyle = C.green;
      ctx.lineWidth = 1.5;
      ctx.fillRect(x - 12, y - 12, 24, 24);
      ctx.strokeRect(x - 12, y - 12, 24, 24);
      if (type === 'bomb') {
        ctx.fillStyle = '#b26bff';
        ctx.beginPath();
        ctx.arc(x, y + 2, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.yellow;
        ctx.fillRect(x + 3, y - 8, 2, 4);
      } else if (type === 'fire') {
        ctx.fillStyle = '#ff9f1c';
        ctx.beginPath();
        ctx.moveTo(x, y - 9);
        ctx.quadraticCurveTo(x + 9, y + 2, x, y + 8);
        ctx.quadraticCurveTo(x - 9, y + 2, x, y - 9);
        ctx.fill();
        ctx.fillStyle = C.yellow;
        ctx.fillRect(x - 2, y, 4, 5);
      } else if (type === 'speed') {
        ctx.fillStyle = C.cyan;
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.moveTo(x - 8 + k * 5, y - 6);
          ctx.lineTo(x - 3 + k * 5, y);
          ctx.lineTo(x - 8 + k * 5, y + 6);
          ctx.closePath();
          ctx.fill();
        }
      } else if (type === 'kick') {
        ctx.fillStyle = C.pink;
        ctx.fillRect(x - 6, y - 8, 6, 10);
        ctx.fillRect(x - 6, y + 2, 12, 5);
      } else {
        ctx.fillStyle = C.red;
        ctx.fillRect(x - 5, y - 2, 10, 9);
        ctx.strokeStyle = C.text;
        ctx.beginPath();
        ctx.moveTo(x, y - 2);
        ctx.lineTo(x + 4, y - 9);
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  function drawBombs() {
    for (const b of bombs.list) {
      const x = cx(b.c);
      const y = cy(b.r);
      const pulse = 1 + Math.sin(shell.clock / (b.fuse === Infinity ? 200 : Math.max(40, 160 - b.t / 20))) * 0.08;
      ctx.save();
      ctx.fillStyle = '#2a1f5c';
      ctx.strokeStyle = b.fuse === Infinity ? C.red : '#b26bff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y + 2, 11 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = C.text;
      ctx.fillRect(x - 5, y - 4, 3, 3);
      ctx.fillStyle = blink(90) ? C.yellow : '#ff9f1c';
      ctx.shadowColor = C.yellow;
      ctx.shadowBlur = 8;
      ctx.fillRect(x + 5, y - 11, 4, 4);
      ctx.restore();
    }
    // Flames: a glowing cross, brightest at the centre and the tips.
    ctx.save();
    for (const f of bombs.flames) {
      const x = f.c * CELL;
      const y = AY + f.r * CELL;
      const fade = 1 - f.t / 550;
      const inset = 6 - fade * 4;
      ctx.globalAlpha = 0.5 + fade * 0.5;
      ctx.fillStyle = '#ff9f1c';
      ctx.shadowColor = C.yellow;
      ctx.shadowBlur = 14;
      if (f.dc === undefined) ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
      else if (f.dc) ctx.fillRect(x, y + inset, CELL, CELL - inset * 2);
      else ctx.fillRect(x + inset, y, CELL - inset * 2, CELL);
      ctx.fillStyle = C.yellow;
      if (f.dc === undefined) ctx.fillRect(x + 7, y + 7, CELL - 14, CELL - 14);
      else if (f.dc) ctx.fillRect(x, y + inset + 4, CELL, CELL - inset * 2 - 8);
      else ctx.fillRect(x + inset + 4, y, CELL - inset * 2 - 8, CELL);
    }
    ctx.restore();
  }

  function drawEnemies() {
    for (const e of enemies) {
      const bob = Math.sin(e.walk / 120) * 2;
      ctx.save();
      ctx.globalAlpha = e.ghost ? 0.6 + Math.sin(shell.clock / 200) * 0.2 : 1;
      ctx.fillStyle = e.color;
      ctx.shadowColor = e.color;
      ctx.shadowBlur = 10;
      if (e.kind === 'chomper') {
        const open = Math.abs(Math.sin(e.walk / 100)) * 0.6;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 11, open, Math.PI * 2 - open);
        ctx.lineTo(e.x, e.y);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(e.x, e.y - 2 + bob, 11, Math.PI, 0);
        ctx.lineTo(e.x + 11, e.y + 9);
        for (let k = 0; k < 4; k++) ctx.lineTo(e.x + 11 - (k + 0.5) * 5.5, e.y + (k % 2 ? 9 : 5));
        ctx.lineTo(e.x - 11, e.y + 9);
        ctx.closePath();
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = C.bg;
      ctx.fillRect(e.x - 5, e.y - 4 + bob, 3, 4);
      ctx.fillRect(e.x + 2, e.y - 4 + bob, 3, 4);
      ctx.restore();
    }
  }

  function drawBombers() {
    for (const b of bombers) {
      const frames = crew(b.name);
      if (!b.alive) {
        if (b.deadT < 900) A.drawSprite(ctx, frames.flail, b.x, b.y - 4 - b.deadT * 0.02, { angle: b.deadT / 90, scale: 1 - b.deadT / 1200 });
        continue;
      }
      const moving = b.walk && Math.floor(b.walk / 110) % 2;
      A.drawSprite(ctx, moving ? frames.walk1 : frames.walk2, b.x, b.y - 4, { flip: b.facing < 0 });
      if (battle() && !demo && b.human) {
        A.text(ctx, 'P' + b.human, b.x, b.y - 24, { size: 7, color: b.human === 1 ? C.yellow : C.pink });
      }
    }
  }

  function drawFooter() {
    if (shell.state === 'title') return; // the title screen has its own text down there
    const y = AY + ROWS * CELL + 22;
    if (battle() || demo) {
      bombers.forEach((b, i) => {
        const x = 60 + i * 120;
        A.drawSprite(ctx, crew(b.name).stand, x - 30, y + 4, { scale: 0.8 });
        A.text(ctx, b.name.toUpperCase().slice(0, 8), x + 8, y - 4, { size: 7, color: b.alive ? C.text : C.dim });
        for (let k = 0; k < WINS_NEEDED; k++) {
          ctx.fillStyle = k < b.wins ? C.yellow : '#2a2650';
          ctx.fillRect(x - 10 + k * 12, y + 8, 9, 9);
        }
      });
      return;
    }
    const p = bombers[0];
    for (let i = 0; i < Math.min(lives - (shell.state === 'dying' ? 0 : 1), 5); i++) A.drawSprite(ctx, crew('Hi-Vis').stand, 18 + i * 18, y + 4, { scale: 0.6 });
    const secs = Math.ceil(timeLeft / 1000);
    A.text(ctx, 'TIME ' + Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0'), W / 2, y, { size: 10, color: secs < 30 && blink(250) ? C.red : C.text });
    A.text(ctx, 'BOMB ' + p.bombs + '  FIRE ' + p.range + (p.kick ? '  KICK' : '') + (p.remote ? '  REMOTE' : ''), W / 2, y + 22, { size: 7, color: C.dim });
    A.text(ctx, 'ENEMIES ' + enemies.length, W - 12, y, { size: 8, color: C.dim, align: 'right' });
  }

  function drawMessages() {
    const cx0 = W / 2;
    const cy0 = AY + (ROWS * CELL) / 2;
    const st = shell.state;
    const panel = (lines) => {
      ctx.fillStyle = 'rgba(7, 6, 15, 0.82)';
      ctx.fillRect(40, cy0 - 50, W - 80, 100);
      lines.forEach(([t, size, color], i) => A.text(ctx, t, cx0, cy0 - 22 + i * 26, { size, color, glow: 10 }));
    };
    if (st === 'title') {
      // Mode picker, under the shell's title screen.
      const adv = !battle();
      A.text(ctx, (adv ? '> ' : '  ') + 'ADVENTURE' + (adv ? ' <' : '  '), cx0, 404, { size: 10, color: adv ? C.yellow : C.dim });
      const who = A.isTouch ? 'VS CPU' : humans === 2 ? '2 PLAYERS' : '1 PLAYER';
      A.text(ctx, (adv ? '  ' : '> ') + 'BATTLE  ' + who + (adv ? '  ' : ' <'), cx0, 426, { size: 10, color: adv ? C.dim : C.yellow });
      A.text(ctx, A.isTouch ? 'UP/DOWN TO PICK' : 'UP/DOWN PICK' + (battle() ? ' - LEFT/RIGHT PLAYERS' : ''), cx0, 446, { size: 7, color: C.dim });
    } else if (st === 'ready') {
      panel(battle() ? [['ROUND ' + round, 18, C.yellow], ['LAST BOMBER STANDING', 9, C.text], [blink(150) ? 'GET READY' : '', 9, C.cyan]] : [['STAGE ' + stage, 18, C.yellow], ['BLAST THEM ALL - FIND THE EXIT', 8, C.text], [blink(150) ? 'GET READY' : '', 9, C.cyan]]);
    } else if (st === 'clear') {
      panel([['STAGE CLEAR!', 18, C.green], ['ON TO STAGE ' + (stage + 1), 9, C.text]]);
    } else if (st === 'roundEnd') {
      const w = roundWinner && roundWinner.who;
      panel([[w ? w.name.toUpperCase() + ' WINS!' : 'DRAW!', 16, C.yellow], ['ROUND ' + round, 9, C.text]]);
    } else if (st === 'match') {
      const champ = bombers.find(b => b.wins >= WINS_NEEDED);
      panel([['CHAMPION!', 18, C.yellow], [champ ? champ.name.toUpperCase() : '', 12, C.pink], [champ && champ.human ? 'PLAYER ' + champ.human : 'THE CPU WINS', 8, C.text]]);
      if (champ) A.drawSprite(ctx, crew(champ.name).lift, cx0, cy0 - 70, { scale: 1.5 });
    } else if (st === 'dying' && shell.stateTime > 700) {
      const msg = lives <= 0 ? 'GAME OVER' : lives === 1 ? 'LAST LIFE!' : lives + ' LIVES LEFT';
      A.text(ctx, msg, cx0, cy0, { size: 14, color: lives <= 0 ? C.red : C.yellow, glow: 10 });
    }
  }

  function render() {
    ctx.save();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    shell.drawHud(score, battle() || demo ? 'R' + round : stage);
    drawArena();
    drawItems();
    drawBombs();
    drawEnemies();
    drawBombers();
    fx.draw(ctx);
    drawFooter();
    shell.drawOverlay();
    drawMessages();
    ctx.restore();
  }

  showTitle();
  A.waitForFont().then(() => A.startLoop({ update, render }));
})();
