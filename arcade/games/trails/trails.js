/*
 * Neon Trails: the eleventh game in the Neon Arcade, and the first built on the shared game shell.
 * Ride a light bike that leaves a solid wall behind it. Box in the rival riders, never hit a wall,
 * and be the last one riding. Hold turbo for a burst of speed.
 * Play states: ready -> playing <-> paused, dying, clear (round won). The shell runs title, pause,
 * initials entry and game over.
 */
(function () {
  'use strict';

  const A = window.Arcade;
  const C = A.COLORS;

  const GAME_ID = 'trails';
  const W = 480;
  const H = 600;
  const HUD = 48;
  const FOOT = 40;
  const CELL = 8;
  const COLS = W / CELL;
  const ROWS = (H - HUD - FOOT) / CELL;

  const START_LIVES = 3;
  const BONUS_LIFE_AT = 10000;
  const READY_MS = 1500;
  const DYING_MS = 1800;
  const CLEAR_MS = 2200;
  const DEREZ_MS = 900;
  const DEMO_RESET_MS = 1500;
  const TURBO_MAX = 100;
  const TURBO_DRAIN = 0.06; // per ms: a full tank lasts under 2 seconds
  const TURBO_FILL = 0.012; // per ms: refills in about 8 seconds
  const TURBO_SPEED = 1.9;
  const KILL_POINTS = 500;
  const SURVIVE_PER_SEC = 25;
  const BLOCK = 9; // grid value for arena blocks; riders are 1-4

  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const LEFT_OF = { up: 'left', left: 'down', down: 'right', right: 'up' };
  const RIGHT_OF = { up: 'right', right: 'down', down: 'left', left: 'up' };

  // Everyone starts on their own lane, never head-on: you bottom left heading up, rivals from the other
  // corners. Rivals join one per round, each riding their own way.
  const STARTS = [
    { x: COLS / 4, y: ROWS - 8, dir: 'up' },
    { x: (COLS * 3) / 4, y: 7, dir: 'down' },
    { x: 5, y: ROWS / 4, dir: 'right' },
    { x: COLS - 6, y: (ROWS * 3) / 4, dir: 'left' },
  ];
  const RIVALS = [
    { name: 'SURVIVOR', color: C.yellow, style: 'survivor' }, // always heads for the most open space
    { name: 'WILDCARD', color: C.green, style: 'wild' }, // sudden turns, sometimes reckless
    { name: 'HUNTER', color: C.pink, style: 'hunter' }, // races ahead of you to cut you off
  ];

  // ---------- State ----------

  const canvas = document.getElementById('game');
  const { ctx } = A.createScreen(canvas, W, H);
  const input = A.createInput({ swipeTarget: canvas });
  const fx = A.createEffects();

  // Trails are painted onto their own canvas as they grow, so drawing a full arena stays cheap.
  const trailArt = document.createElement('canvas');
  trailArt.width = W * 2;
  trailArt.height = ROWS * CELL * 2;
  const tctx = trailArt.getContext('2d');
  tctx.scale(2, 2);

  let demo = true;
  let round = 1;
  let score = 0;
  let lives = START_LIVES;
  let bonusLife = false;
  let grid, riders, blocks, player;
  let surviveAcc = 0;
  let bonusText = null;
  let demoOver = 0;
  let shake = 0;

  const shell = A.createShell({
    ctx, width: W, height: H, id: GAME_ID,
    title: ['NEON', 'TRAILS'],
    howTo: [
      ['YOUR BIKE LEAVES A WALL', C.cyan],
      ['BOX IN THE OTHER RIDERS', C.pink],
      ['NEVER HIT A WALL - YOURS TOO', C.yellow],
      [A.isTouch ? 'HOLD TURBO FOR SPEED' : 'HOLD SPACE FOR TURBO', C.green],
      [A.isTouch ? 'SWIPE OR D-PAD TO TURN' : 'ARROWS / WASD TO TURN', C.dim],
    ],
    hudLabel: 'ROUND',
    newGame, showTitle,
  });

  const idx = (x, y) => y * COLS + x;
  const inside = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
  const free = (x, y) => inside(x, y) && grid[idx(x, y)] === 0;
  const tickMs = () => Math.max(40, 72 - (round - 1) * 4);
  const skill = () => (demo ? 0.9 : Math.min(0.97, 0.55 + round * 0.1));
  const sfx = (name, arg) => { if (!demo) A.sound.play(name, arg); };
  const blink = (ms = 500) => Math.floor(shell.clock / ms) % 2 === 0;

  // ---------- Rounds ----------

  function setupRound() {
    grid = new Int8Array(COLS * ROWS);
    blocks = [];
    // Demo: four CPU riders. Game: you plus one rival per round, up to three.
    const rivals = demo ? RIVALS : RIVALS.slice(0, Math.min(3, round));
    riders = [{ name: 'YOU', color: C.cyan, style: 'survivor', isPlayer: true }].concat(rivals).map((r, i) => ({
      ...r,
      id: i + 1,
      x: STARTS[i].x,
      y: STARTS[i].y,
      dir: STARTS[i].dir,
      turns: [],
      alive: true,
      acc: 0,
      trail: [{ x: STARTS[i].x, y: STARTS[i].y }],
      dead: null,
      gone: false,
    }));
    player = riders[0];
    player.turbo = TURBO_MAX;
    player.boosting = false;
    if (!demo && round >= 4) placeBlocks(Math.min(8, round));
    riders.forEach(r => { grid[idx(r.x, r.y)] = r.id; });
    surviveAcc = 0;
    demoOver = 0;
    paintTrails();
  }

  // Solid blocks from round 4, kept well clear of where the riders start.
  function placeBlocks(count) {
    for (let tries = 0; blocks.length < count && tries < 200; tries++) {
      const w = 2 + Math.floor(Math.random() * 3);
      const h = 2 + Math.floor(Math.random() * 3);
      const x = 3 + Math.floor(Math.random() * (COLS - w - 6));
      const y = 3 + Math.floor(Math.random() * (ROWS - h - 6));
      const near = STARTS.some(s => Math.abs(s.x - x - w / 2) < 12 && Math.abs(s.y - y - h / 2) < 12);
      if (near) continue;
      blocks.push({ x, y, w, h });
      for (let by = y; by < y + h; by++) for (let bx = x; bx < x + w; bx++) grid[idx(bx, by)] = BLOCK;
    }
  }

  function newGame() {
    if (window.track) track('play:' + GAME_ID);
    demo = false;
    round = 1;
    score = 0;
    lives = START_LIVES;
    bonusLife = false;
    fx.clear();
    setupRound();
    shell.setState('ready');
    A.sound.play('start');
  }

  function showTitle() {
    demo = true;
    round = 1;
    score = 0;
    fx.clear();
    setupRound();
    shell.setState('title');
  }

  function addScore(points) {
    if (demo) return;
    score += points;
    if (!bonusLife && score >= BONUS_LIFE_AT) {
      bonusLife = true;
      lives++;
      fx.float(W / 2, HUD + 60, '1UP!', C.green);
      A.sound.play('powerup');
    }
  }

  // ---------- Riding ----------

  function queueTurn(r, dir) {
    const last = r.turns.length ? r.turns[r.turns.length - 1] : r.dir;
    if (dir === last || dir === OPP[last] || r.turns.length >= 2) return;
    r.turns.push(dir);
  }

  function step(r) {
    if (r.isPlayer && !demo) {
      if (r.turns.length) {
        r.dir = r.turns.shift();
        sfx('turn');
      }
    } else {
      r.dir = aiChoose(r);
    }
    const d = DIRS[r.dir];
    const nx = r.x + d.x;
    const ny = r.y + d.y;
    if (!free(nx, ny)) {
      crash(r, inside(nx, ny) ? grid[idx(nx, ny)] : 0);
      return;
    }
    grid[idx(nx, ny)] = r.id;
    drawSegment(tctx, r.x, r.y, nx, ny, r.color);
    r.x = nx;
    r.y = ny;
    r.trail.push({ x: nx, y: ny });
  }

  function crash(r, hit) {
    r.alive = false;
    r.dead = { t: 0 };
    const px = r.x * CELL + CELL / 2;
    const py = HUD + r.y * CELL + CELL / 2;
    fx.burst(px, py, r.color, 30, 0.22);
    fx.burst(px, py, C.text, 10, 0.12);
    sfx('derez');
    paintTrails(); // the crashed rider's trail is now drawn fading on its own
    if (r.isPlayer) {
      if (demo) return;
      lives--;
      shake = 10;
      shell.setState('dying');
      return;
    }
    if (hit === player.id && player.alive && !demo) {
      addScore(KILL_POINTS);
      fx.float(px, py - 12, String(KILL_POINTS), C.cyan);
      sfx('bonus');
    }
  }

  // A crashed rider's wall fades away, then its cells open up again.
  function updateDerez(dt) {
    for (const r of riders) {
      if (!r.dead || r.gone) continue;
      r.dead.t += dt;
      if (r.dead.t < DEREZ_MS) continue;
      r.gone = true;
      for (let i = 0; i < grid.length; i++) if (grid[i] === r.id) grid[i] = 0;
    }
  }

  function updateRiders(dt) {
    const tick = tickMs();
    if (!demo) {
      const boosting = input.isDown('start') && player.turbo > 0 && player.alive;
      if (boosting && !player.boosting) sfx('turbo');
      player.boosting = boosting;
      player.turbo = boosting ? Math.max(0, player.turbo - TURBO_DRAIN * dt) : Math.min(TURBO_MAX, player.turbo + TURBO_FILL * dt);
    }
    for (const r of riders) {
      if (!r.alive) continue;
      r.acc += dt * (r.boosting ? TURBO_SPEED : 1);
      while (r.acc >= tick && r.alive && (shell.state === 'playing' || shell.state === 'title')) {
        r.acc -= tick;
        step(r);
      }
    }
    // Sparks off the back wheel while turbo is on.
    if (player.boosting && Math.random() < dt / 40) {
      const d = DIRS[player.dir];
      fx.burst(player.x * CELL + CELL / 2 - d.x * 8, HUD + player.y * CELL + CELL / 2 - d.y * 8, C.cyan, 2, 0.08);
    }
    updateDerez(dt);
  }

  // ---------- Rival riders ----------
  // Each step a CPU rider looks at going straight, left or right, measures how much open space each
  // would leave it (flood fill), and only considers the roomy ones. Then its style picks.

  function aiChoose(r) {
    const options = [r.dir, LEFT_OF[r.dir], RIGHT_OF[r.dir]].filter(dir => free(r.x + DIRS[dir].x, r.y + DIRS[dir].y));
    if (!options.length) return r.dir;
    // Early rounds the rivals get sloppy now and then and just keep going.
    if (options.includes(r.dir) && Math.random() > skill()) return r.dir;
    const room = {};
    for (const dir of options) {
      room[dir] = A.floodFill(COLS, ROWS, free, { c: r.x + DIRS[dir].x, r: r.y + DIRS[dir].y }, { cap: 320 }).count;
    }
    const best = Math.max(...options.map(dir => room[dir]));
    const roomy = options.filter(dir => room[dir] >= best * 0.7);
    const straightFirst = list => (list.includes(r.dir) ? r.dir : list[0]);

    if (r.style === 'wild' && Math.random() < 0.1) return roomy[Math.floor(Math.random() * roomy.length)];
    if (r.style === 'hunter') {
      const prey = player.alive && !r.isPlayer ? player : riders.find(o => o.alive && o !== r);
      if (prey) {
        const pd = DIRS[prey.dir];
        const tx = prey.x + pd.x * 6;
        const ty = prey.y + pd.y * 6;
        const dist = dir => Math.abs(r.x + DIRS[dir].x - tx) + Math.abs(r.y + DIRS[dir].y - ty);
        return roomy.reduce((a, b) => (dist(b) < dist(a) ? b : a));
      }
    }
    // Survivors (and the rest by default) take the roomiest way, preferring straight on.
    const most = Math.max(...roomy.map(dir => room[dir]));
    return straightFirst(roomy.filter(dir => room[dir] === most));
  }

  // ---------- Input ----------

  input.on(action => {
    if (shell.handle(action)) return;
    if ((shell.state === 'ready' || shell.state === 'playing') && DIRS[action]) queueTurn(player, action);
  });

  // ---------- Update ----------

  function update(dt) {
    shell.update(dt);
    fx.update(dt);
    shake = Math.max(0, shake - dt * 0.02);
    const st = shell.state;

    if (st === 'title') {
      updateRiders(dt);
      if (riders.filter(r => r.alive).length <= 1 && (demoOver += dt) > DEMO_RESET_MS) setupRound();
    } else if (st === 'ready') {
      if (shell.stateTime >= READY_MS) shell.setState('playing');
    } else if (st === 'playing') {
      updateRiders(dt);
      if (shell.state !== 'playing') return;
      surviveAcc += dt * SURVIVE_PER_SEC;
      if (surviveAcc >= 1000) {
        addScore(Math.floor(surviveAcc / 1000));
        surviveAcc %= 1000;
      }
      if (riders.every(r => r.isPlayer || !r.alive)) {
        const bonus = 1000 * round;
        addScore(bonus);
        bonusText = 'BONUS ' + bonus;
        sfx('levelup');
        shell.setState('clear');
      }
    } else if (st === 'dying') {
      updateDerez(dt);
      if (shell.stateTime >= DYING_MS) {
        if (lives > 0) {
          setupRound();
          shell.setState('ready');
        } else {
          shell.gameOver(score, 'ROUND ' + round);
        }
      }
    } else if (st === 'clear') {
      updateDerez(dt);
      if (shell.stateTime >= CLEAR_MS) {
        round++;
        setupRound();
        shell.setState('ready');
      }
    }
  }

  // ---------- Render ----------

  // A wall segment between two cells: a glowing line down the middle of the cells, narrower than a cell
  // so neighbouring walls stay visibly separate.
  function drawSegment(g, x0, y0, x1, y1, color) {
    g.save();
    g.fillStyle = color;
    g.shadowColor = color;
    g.shadowBlur = 6;
    g.fillRect(Math.min(x0, x1) * CELL + 2, Math.min(y0, y1) * CELL + 2, Math.abs(x1 - x0) * CELL + 4, Math.abs(y1 - y0) * CELL + 4);
    g.restore();
  }

  function drawTrail(g, r) {
    const t = r.trail;
    if (t.length === 1) drawSegment(g, t[0].x, t[0].y, t[0].x, t[0].y, r.color);
    for (let i = 1; i < t.length; i++) drawSegment(g, t[i - 1].x, t[i - 1].y, t[i].x, t[i].y, r.color);
  }

  // Redraw every living rider's wall (after a crash, so the crashed one can fade on its own).
  function paintTrails() {
    tctx.clearRect(0, 0, W, ROWS * CELL);
    riders.filter(r => r.alive).forEach(r => drawTrail(tctx, r));
  }

  function drawArena() {
    ctx.fillStyle = '#0a1226';
    for (let x = 0; x <= W; x += CELL * 2) ctx.fillRect(x, 0, 1, ROWS * CELL);
    for (let y = 0; y <= ROWS * CELL; y += CELL * 2) ctx.fillRect(0, y, W, 1);
    for (const b of blocks) {
      ctx.fillStyle = '#2a1f5c';
      ctx.fillRect(b.x * CELL, b.y * CELL, b.w * CELL, b.h * CELL);
      ctx.strokeStyle = C.pink;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(b.x * CELL + 0.75, b.y * CELL + 0.75, b.w * CELL - 1.5, b.h * CELL - 1.5);
    }
    ctx.drawImage(trailArt, 0, 0, W, ROWS * CELL);
    // Crashed riders' walls flicker and fade out.
    for (const r of riders) {
      if (!r.dead || r.gone) continue;
      const left = 1 - r.dead.t / DEREZ_MS;
      if (Math.floor(r.dead.t / 60) % 2 && left < 0.8) continue;
      ctx.globalAlpha = left;
      drawTrail(ctx, r);
      ctx.globalAlpha = 1;
    }
  }

  function drawBikes() {
    for (const r of riders) {
      if (!r.alive) continue;
      const d = DIRS[r.dir];
      const cx = r.x * CELL + CELL / 2;
      const cy = r.y * CELL + CELL / 2;
      const len = 7;
      ctx.save();
      ctx.fillStyle = r.color;
      ctx.shadowColor = r.color;
      ctx.shadowBlur = 14;
      if (d.x) ctx.fillRect(cx - len + d.x * 3, cy - 3, len * 2, 6);
      else ctx.fillRect(cx - 3, cy - len + d.y * 3, 6, len * 2);
      ctx.shadowBlur = 0;
      ctx.fillStyle = C.text;
      ctx.fillRect(cx + d.x * 5 - 2, cy + d.y * 5 - 2, 4, 4);
      ctx.restore();
    }
  }

  function drawFooter() {
    const y = H - FOOT;
    ctx.fillStyle = 'rgba(41, 240, 255, 0.6)';
    ctx.fillRect(0, y, W, 2);
    if (demo) return;
    const spare = Math.max(0, lives - (shell.state === 'dying' ? 0 : 1));
    for (let i = 0; i < Math.min(spare, 6); i++) {
      ctx.fillStyle = C.cyan;
      ctx.fillRect(18 + i * 22, y + 17, 14, 6);
      ctx.fillStyle = C.text;
      ctx.fillRect(28 + i * 22, y + 18, 3, 4);
    }
    const barW = 140;
    const frac = player.turbo / TURBO_MAX;
    const color = player.boosting ? C.text : frac > 0.3 ? C.green : C.yellow;
    A.text(ctx, 'TURBO', W - barW - 26, y + 21, { size: 8, color: C.dim, align: 'right' });
    ctx.fillStyle = '#1c1a33';
    ctx.fillRect(W - barW - 16, y + 15, barW, 12);
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillRect(W - barW - 16, y + 15, barW * frac, 12);
    ctx.restore();
  }

  function drawMessages() {
    const cx = W / 2;
    const cy = HUD + (ROWS * CELL) / 2;
    const st = shell.state;
    if (st === 'ready') {
      A.text(ctx, 'ROUND ' + round, cx, cy - 30, { size: 20, color: C.yellow, glow: 12 });
      const names = riders.filter(r => !r.isPlayer).map(r => r.name).join(' + ');
      A.text(ctx, 'VS ' + names, cx, cy + 4, { size: 8, color: C.text });
      if (blink(150)) A.text(ctx, 'GET READY', cx, cy + 30, { size: 10, color: C.cyan });
    } else if (st === 'clear') {
      A.text(ctx, 'ROUND CLEAR!', cx, cy - 20, { size: 20, color: C.green, glow: 14 });
      if (bonusText) A.text(ctx, bonusText, cx, cy + 14, { size: 10, color: C.yellow });
    } else if (st === 'dying' && shell.stateTime > 700) {
      const msg = lives <= 0 ? 'GAME OVER' : lives === 1 ? 'LAST LIFE!' : lives + ' LIVES LEFT';
      A.text(ctx, msg, cx, cy, { size: 14, color: lives <= 0 ? C.red : C.yellow, glow: 10 });
    }
  }

  function render() {
    ctx.save();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    shell.drawHud(score, round);
    ctx.save();
    ctx.translate(0, HUD);
    drawArena();
    drawBikes();
    ctx.restore();
    fx.draw(ctx);
    drawFooter();
    drawMessages();
    shell.drawOverlay();
    ctx.restore();
  }

  showTitle();
  A.waitForFont().then(() => A.startLoop({ update, render }));
})();
