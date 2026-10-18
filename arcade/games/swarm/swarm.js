/*
 * Swarm Strike: the fourth game in the Neon Arcade.
 * Each wave flies in along curved paths, settles into a swaying formation, then
 * peels off in diving attacks. Commanders take two hits and dive with escorts.
 * States: title (CPU demo) -> playing <-> paused, dying, clear (wave done)
 *         -> entry (initials) -> gameover (with hit-miss stats)
 */
(function () {
  'use strict';

  const A = window.Arcade;
  const C = A.COLORS;

  const GAME_ID = 'swarm';
  const W = 480;
  const H = 600;
  const HUD = 48;

  const SHIP_Y = H - 56;
  const SHIP_SPEED = 0.36;
  const SHOT_SPEED = 0.65;
  const MAX_SHOTS = 3;
  const FIRE_MS = 200;
  const START_LIVES = 3;
  const BONUS_LIFE_AT = 20000;

  const SLOT_W = 36;
  const SLOT_H = 30;
  const FORM_TOP = 96;
  const ENTRY_MS = 2000;
  const GROUP_GAP = 1100;
  const LOOP_MS = 650;

  const DYING_MS = 1800;
  const CLEAR_MS = 2200;
  const INVULN_MS = 2000;

  // ---------- Sprites (pixel maps, drawn facing the player) ----------

  const PX = 3;
  const SPRITE_MAPS = {
    drone: [
      ['.X.....X.', '..X...X..', '..XXXXX..', '.XXoXoXX.', 'XXXXXXXXX', 'X.XXXXX.X', 'X.X...X.X'],
      ['.X.....X.', '..X...X..', 'X.XXXXX.X', 'XXXoXoXXX', '.XXXXXXX.', '..XXXXX..', '.X.....X.'],
    ],
    wasp: [
      ['XX.....XX', 'XXX.o.XXX', '.XXXoXXX.', '..XXXXX..', '.XXXoXXX.', 'XXX.X.XXX', 'XX.....XX'],
      ['.........', 'XXX.o.XXX', 'XXXXoXXXX', '..XXXXX..', 'XXXXoXXXX', 'XXX.X.XXX', '.........'],
    ],
    commander: [
      ['...XXXXX...', '..XoXXXoX..', '.XXXXXXXXX.', 'XX.XXXXX.XX', 'X..XX.XX..X', 'X.XX...XX.X', '..X.....X..'],
      ['...XXXXX...', '..XoXXXoX..', 'XXXXXXXXXXX', 'X..XXXXX..X', '...XX.XX...', '..XX...XX..', '..X.....X..'],
    ],
    ship: [
      ['.....X.....', '.....X.....', '....XXX....', '....XcX....', '.p..XXX..p.', '.X.XXXXX.X.', '.XXXXcXXXX.', 'XXXXXXXXXXX', 'XXX.XXX.XXX', 'XX..p.p..XX', 'X.........X'],
    ],
  };

  const TYPES = {
    drone: { hp: 1, points: 50, dive: 100, r: 12, palette: { X: C.cyan, o: C.pink }, name: 'DRONE' },
    wasp: { hp: 1, points: 80, dive: 160, r: 12, palette: { X: C.pink, o: C.yellow }, name: 'WASP' },
    commander: { hp: 2, points: 150, dive: 400, r: 15, palette: { X: C.yellow, o: C.cyan }, name: 'COMMANDER' },
  };

  const makeSprite = (map, palette) => A.makeSprite(map, palette, PX);

  const SPRITES = {};
  for (const type of Object.keys(TYPES)) {
    SPRITES[type] = SPRITE_MAPS[type].map(m => makeSprite(m, TYPES[type].palette));
  }
  SPRITES.hurt = SPRITE_MAPS.commander.map(m => makeSprite(m, { X: '#b04dff', o: C.cyan }));
  SPRITES.flash = SPRITE_MAPS.commander.map(m => makeSprite(m, { X: C.text, o: C.text }));
  const SHIP_SPRITE = makeSprite(SPRITE_MAPS.ship[0], { X: C.text, c: C.cyan, p: C.pink });

  // ---------- State ----------

  const canvas = document.getElementById('game');
  const { ctx } = A.createScreen(canvas, W, H);
  const input = A.createInput({ pointerTarget: canvas, screen: { width: W, height: H } });
  const fx = A.createEffects();

  const stars = Array.from({ length: 70 }, () => ({
    x: Math.random() * W,
    y: HUD + Math.random() * (H - HUD),
    v: 0.02 + Math.random() * 0.08,
    color: [C.text, C.cyan, C.pink, C.yellow][Math.floor(Math.random() * 4)],
    twinkle: Math.random() * 1000,
  }));

  let state = 'title';
  let stateTime = 0;
  let clock = 0;
  let demo = true;
  let hiScore = A.scores.best(GAME_ID);
  A.scores.onChange(() => { hiScore = A.scores.best(GAME_ID); });

  let wave = 1;
  let score = 0;
  let lives = START_LIVES;
  let fired = 0;
  let hits = 0;
  let bonusLife = false;
  let enemies = [];
  let shots = [];
  let bullets = [];
  let diveTimer = 0;
  let ship = { x: W / 2, cooldown: 0, invuln: 0 };
  let pointerX = null;
  let shake = 0;
  let banner = null;
  let entry = null;
  let rank = -1;

  const mod = (a, n) => ((a % n) + n) % n;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));
  const sfx = name => { if (!demo) A.sound.play(name); };
  const blink = (ms = 500) => Math.floor(clock / ms) % 2 === 0;
  const smooth = t => t * t * (3 - 2 * t);

  // Difficulty ramps with each wave, and the last few enemies get aggressive.
  const diveInterval = () => Math.max(600, 2200 - wave * 180) * (enemies.length <= 6 ? 0.5 : 1);
  const maxDivers = () => Math.min(7, 1 + wave);
  const diveSpeed = () => Math.min(0.32, 0.17 + wave * 0.015);
  const bulletSpeed = () => Math.min(0.4, 0.24 + wave * 0.015);
  const shotsPerDive = () => Math.min(3, 1 + Math.floor(wave / 2));

  const slotX = e => W / 2 + (e.col - 4.5) * SLOT_W + Math.sin(clock / 1100) * 30;
  const slotY = e => FORM_TOP + e.row * SLOT_H;

  function setState(next) {
    state = next;
    stateTime = 0;
  }

  // ---------- Waves ----------

  function bezier(p, t) {
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    return { x: a * p[0].x + b * p[1].x + c * p[2].x + d * p[3].x, y: a * p[0].y + b * p[1].y + c * p[2].y + d * p[3].y };
  }

  function spawnWave() {
    const layout = [
      { type: 'commander', cols: [3, 4, 5, 6] },
      { type: 'wasp', cols: [1, 2, 3, 4, 5, 6, 7, 8] },
      { type: 'wasp', cols: [1, 2, 3, 4, 5, 6, 7, 8] },
      { type: 'drone', cols: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
      { type: 'drone', cols: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
    ];
    enemies = [];
    layout.forEach((r, row) => {
      r.cols.forEach(col => {
        enemies.push({ type: r.type, row, col, hp: TYPES[r.type].hp, mode: 'waiting', x: -100, y: -100, angle: 0, flash: 0 });
      });
    });

    // Fly in 8 at a time, drones first and commanders last, alternating top and side entries.
    const order = enemies.slice().sort((a, b) => b.row - a.row || a.col - b.col);
    order.forEach((e, i) => {
      const group = Math.floor(i / 8);
      const side = group % 2 ? 1 : -1;
      const fromTop = Math.floor(group / 2) % 2 === 0;
      e.delay = group * GROUP_GAP + (i % 8) * 120;
      e.path = fromTop
        ? [{ x: W / 2 + side * 30, y: -20 }, { x: W / 2 + side * 230, y: 240 }, { x: W / 2 - side * 140, y: 380 }]
        : [{ x: side < 0 ? -20 : W + 20, y: 470 }, { x: W / 2 - side * 40, y: 400 }, { x: W / 2 + side * 210, y: 150 }];
    });
  }

  function startWave() {
    spawnWave();
    shots = [];
    bullets = [];
    diveTimer = 1500;
    banner = { text: 'WAVE ' + wave, t: 0 };
  }

  function resetGame() {
    wave = 1;
    score = 0;
    lives = START_LIVES;
    fired = 0;
    hits = 0;
    bonusLife = false;
    ship = { x: W / 2, cooldown: 0, invuln: 0 };
    pointerX = null;
    fx.clear();
    startWave();
  }

  function newGame() {
    demo = false;
    resetGame();
    setState('playing');
    A.sound.play('start');
  }

  function showTitle() {
    demo = true;
    resetGame();
    banner = null;
    setState('title');
  }

  function pause() {
    setState('paused');
    A.sound.play('pause');
  }

  function waveClear() {
    if (demo) {
      showTitle();
      return;
    }
    bullets = [];
    sfx('levelup');
    setState('clear');
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

  // ---------- Enemies ----------

  function turnToward(angle, target, step) {
    const diff = mod(target - angle + Math.PI, Math.PI * 2) - Math.PI;
    return angle + clamp(diff, -step, step);
  }

  function updateEnemy(e, dt) {
    const px = e.x;
    const py = e.y;
    e.flash = Math.max(0, e.flash - dt);

    if (e.mode === 'waiting') {
      e.delay -= dt;
      if (e.delay <= 0) {
        e.mode = 'entering';
        e.t = 0;
      }
      return;
    }
    if (e.mode === 'entering') {
      e.t = Math.min(1, e.t + dt / ENTRY_MS);
      const p = bezier(e.path.concat({ x: slotX(e), y: slotY(e) }), smooth(e.t));
      e.x = p.x;
      e.y = p.y;
      if (e.t >= 1) e.mode = 'formation';
    } else if (e.mode === 'formation') {
      e.x = slotX(e);
      e.y = slotY(e);
    } else if (e.mode === 'diving') {
      updateDive(e, dt);
    } else if (e.mode === 'returning') {
      const tx = slotX(e);
      const ty = slotY(e);
      const dist = Math.hypot(tx - e.x, ty - e.y);
      const step = 0.22 * dt;
      if (dist <= step) {
        e.mode = 'formation';
        e.x = tx;
        e.y = ty;
      } else {
        e.x += ((tx - e.x) / dist) * step;
        e.y += ((ty - e.y) / dist) * step;
      }
    }

    // Face the way it's flying; settle facing down once back in formation.
    const dx = e.x - px;
    const dy = e.y - py;
    let target = e.angle;
    if (e.mode === 'formation') target = 0;
    else if (Math.hypot(dx, dy) > 0.01) target = Math.atan2(dy, dx) - Math.PI / 2;
    e.angle = turnToward(e.angle, target, dt * 0.012);
  }

  function startDive(e, dir) {
    e.mode = 'diving';
    e.t = 0;
    e.sx = e.x;
    e.sy = e.y;
    e.dir = dir || (e.x < W / 2 ? -1 : 1);
    e.vx = null;
    e.shots = 0;
  }

  function updateDive(e, dt) {
    e.t += dt;
    // First swing up and over in a loop, then swoop down toward the player.
    if (e.t < LOOP_MS) {
      const R = 26;
      const a = (e.t / LOOP_MS) * Math.PI * 1.25;
      e.x = e.sx + e.dir * R * (1 - Math.cos(a));
      e.y = e.sy - R * Math.sin(a);
      return;
    }
    if (e.vx === null) e.vx = -e.dir * 0.08;
    const want = clamp((ship.x - e.x) * 0.0015, -0.16, 0.16);
    e.vx = approach(e.vx, want, dt * 0.0004);
    e.x += e.vx * dt;
    e.y += diveSpeed() * dt;

    if (e.shots < shotsPerDive() && e.y > 180 + e.shots * 90 && e.y < SHIP_Y - 120) fireAt(e);

    // Off the bottom: wrap to the top and fly back to its slot.
    if (e.y > H + 30) {
      e.mode = 'returning';
      e.y = -30;
      e.x = slotX(e);
    }
  }

  function fireAt(e) {
    e.shots++;
    const vy = bulletSpeed();
    const time = (SHIP_Y - e.y) / vy;
    bullets.push({ x: e.x, y: e.y + 10, vx: clamp((ship.x - e.x) / time, -0.1, 0.1), vy });
  }

  function scheduleDives(dt) {
    if (enemies.some(e => e.mode === 'waiting' || e.mode === 'entering')) return;
    if ((diveTimer -= dt) > 0) return;
    diveTimer = diveInterval();

    const active = enemies.filter(e => e.mode === 'diving' || e.mode === 'returning').length;
    if (active >= maxDivers()) return;
    const ready = enemies.filter(e => e.mode === 'formation');
    if (!ready.length) return;

    const leader = ready[Math.floor(Math.random() * ready.length)];
    startDive(leader);
    sfx('dive');
    // Commanders bring up to two wasp escorts from the row below.
    if (leader.type === 'commander') {
      ready
        .filter(e => e.type === 'wasp' && e.row === 1 && Math.abs(e.col - leader.col) <= 1)
        .slice(0, 2)
        .forEach(e => startDive(e, leader.dir));
    }
  }

  function hitEnemy(e) {
    e.hp--;
    if (e.hp > 0) {
      e.flash = 120;
      sfx('steel');
      return;
    }
    killEnemy(e);
  }

  function killEnemy(e) {
    const type = TYPES[e.type];
    const points = e.mode === 'formation' ? type.points : type.dive;
    e.dead = true;
    fx.burst(e.x, e.y, type.palette.X, 18, 0.2);
    fx.burst(e.x, e.y, C.text, 6, 0.1);
    sfx('boom');
    if (demo) return;
    score += points;
    hits++;
    if (points >= 160) fx.float(e.x, e.y - 12, String(points), type.palette.X);
    if (!bonusLife && score >= BONUS_LIFE_AT) {
      bonusLife = true;
      lives++;
      fx.float(ship.x, SHIP_Y - 30, '1UP!', C.green);
      A.sound.play('powerup');
    }
  }

  // ---------- Player ----------

  function demoTarget() {
    const diver = enemies.filter(e => e.mode === 'diving').sort((a, b) => b.y - a.y)[0];
    if (diver) return diver.x;
    const visible = enemies.filter(e => e.mode !== 'waiting');
    if (!visible.length) return W / 2;
    const nearest = visible.reduce((best, e) => (Math.abs(e.x - ship.x) < Math.abs(best.x - ship.x) ? e : best));
    return nearest.x + Math.sin(clock / 700) * 20;
  }

  function updateShip(dt) {
    ship.cooldown -= dt;
    ship.invuln = Math.max(0, ship.invuln - dt);

    if (demo) {
      ship.x = approach(ship.x, demoTarget(), SHIP_SPEED * dt);
    } else {
      const keys = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
      if (keys) {
        ship.x += keys * SHIP_SPEED * dt;
        pointerX = null;
      } else if (pointerX !== null) {
        ship.x = approach(ship.x, pointerX, 1.2 * dt);
      }
    }
    ship.x = clamp(ship.x, 20, W - 20);

    const firing = demo || input.isDown('start') || input.isDown('up') || input.isPointerDown();
    if (firing && ship.cooldown <= 0 && shots.length < MAX_SHOTS) {
      shots.push({ x: ship.x, y: SHIP_Y - 16 });
      ship.cooldown = FIRE_MS;
      if (!demo) fired++;
      sfx('shoot');
    }
  }

  function playerHit() {
    lives--;
    fx.burst(ship.x, SHIP_Y, C.red, 30, 0.25);
    fx.burst(ship.x, SHIP_Y, C.yellow, 20, 0.15);
    fx.burst(ship.x, SHIP_Y, C.cyan, 16, 0.3);
    shake = 12;
    bullets = [];
    sfx('die');
    setState('dying');
  }

  function collisions() {
    for (const s of shots) {
      for (const e of enemies) {
        if (e.dead || e.mode === 'waiting') continue;
        const r = TYPES[e.type].r;
        if (Math.abs(s.x - e.x) < r && Math.abs(s.y - e.y) < r) {
          s.dead = true;
          hitEnemy(e);
          break;
        }
      }
    }
    shots = shots.filter(s => !s.dead);

    if (state !== 'playing' || ship.invuln > 0) return;
    for (const b of bullets) {
      if (Math.abs(b.x - ship.x) < 8 && Math.abs(b.y - SHIP_Y) < 12) {
        playerHit();
        return;
      }
    }
    for (const e of enemies) {
      if (e.dead || e.mode === 'formation' || e.mode === 'waiting') continue;
      if (Math.hypot(e.x - ship.x, e.y - SHIP_Y) < 18) {
        killEnemy(e);
        playerHit();
        return;
      }
    }
  }

  // ---------- Input ----------

  input.on(action => {
    switch (state) {
      case 'title':
        if (action === 'start' || action === 'tap') newGame();
        break;
      case 'playing':
        if (action === 'pause') pause();
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

  input.onPointer(p => { if (!demo) pointerX = p.x; });

  A.onBlur(() => { if (state === 'playing') pause(); });

  // ---------- Update ----------

  function update(dt) {
    clock += dt;
    stateTime += dt;
    shake = Math.max(0, shake - dt * 0.02);
    fx.update(dt);
    if (banner && (banner.t += dt) > 1800) banner = null;

    if (state !== 'paused') {
      const warp = state === 'clear' ? 4 : 1;
      stars.forEach(s => {
        s.y += s.v * dt * warp;
        if (s.y > H) {
          s.y = HUD;
          s.x = Math.random() * W;
        }
      });
    }

    if (state === 'gameover' && stateTime >= 20000) showTitle();
    if (state !== 'title' && state !== 'playing' && state !== 'dying' && state !== 'clear') return;

    if (state === 'title' || state === 'playing') updateShip(dt);
    enemies.forEach(e => updateEnemy(e, dt));
    if (state !== 'clear') scheduleDives(dt);

    shots.forEach(s => { s.y -= SHOT_SPEED * dt; });
    shots = shots.filter(s => s.y > HUD);
    bullets.forEach(b => {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    });
    bullets = bullets.filter(b => b.y < H + 10);

    collisions();
    enemies = enemies.filter(e => !e.dead);

    if ((state === 'playing' || state === 'title') && !enemies.length) {
      waveClear();
    } else if (state === 'dying' && stateTime >= DYING_MS) {
      if (lives > 0) {
        ship.x = W / 2;
        ship.invuln = INVULN_MS;
        setState('playing');
      } else {
        endRound();
      }
    } else if (state === 'clear' && stateTime >= CLEAR_MS) {
      wave++;
      startWave();
      setState('playing');
    }
  }

  // ---------- Render ----------

  const drawSprite = (sprite, x, y, angle = 0) => A.drawSprite(ctx, sprite, x, y, { angle });

  function drawStars() {
    for (const s of stars) {
      ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin((clock + s.twinkle) / 300));
      ctx.fillStyle = s.color;
      const size = s.v > 0.07 ? 2 : 1;
      ctx.fillRect(s.x, s.y, size, size * (state === 'clear' ? 4 : 1));
    }
    ctx.globalAlpha = 1;
  }

  function drawEnemies() {
    for (const e of enemies) {
      if (e.mode === 'waiting') continue;
      const frame = Math.floor(clock / 300 + e.col) % 2;
      let sprite = SPRITES[e.type][frame];
      if (e.flash > 0) sprite = SPRITES.flash[frame];
      else if (e.type === 'commander' && e.hp < TYPES.commander.hp) sprite = SPRITES.hurt[frame];
      drawSprite(sprite, e.x, e.y, e.angle);
    }
  }

  function drawProjectiles() {
    ctx.save();
    ctx.fillStyle = C.cyan;
    ctx.shadowColor = C.cyan;
    ctx.shadowBlur = 8;
    shots.forEach(s => ctx.fillRect(s.x - 1.5, s.y - 6, 3, 12));
    ctx.fillStyle = C.yellow;
    ctx.shadowColor = C.pink;
    bullets.forEach(b => {
      ctx.beginPath();
      ctx.moveTo(b.x, b.y - 5);
      ctx.lineTo(b.x + 3, b.y);
      ctx.lineTo(b.x, b.y + 5);
      ctx.lineTo(b.x - 3, b.y);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawShip() {
    const alive = state === 'title' || state === 'playing' || state === 'paused' || state === 'clear';
    if (!alive || (ship.invuln > 0 && blink(100))) return;
    drawSprite(SHIP_SPRITE, ship.x, SHIP_Y);
  }

  function drawHud() {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, HUD);
    const shown = demo ? 0 : score;
    A.text(ctx, 'SCORE', 16, 16, { size: 8, color: C.dim, align: 'left' });
    A.text(ctx, A.pad(shown), 16, 33, { size: 14, align: 'left' });
    A.text(ctx, 'WAVE', W / 2, 16, { size: 8, color: C.dim });
    A.text(ctx, String(wave), W / 2, 33, { size: 14, color: C.yellow });
    A.text(ctx, 'HI-SCORE', W - 16, 16, { size: 8, color: C.dim, align: 'right' });
    A.text(ctx, A.pad(Math.max(hiScore, shown)), W - 16, 33, { size: 14, color: C.pink, align: 'right' });
    ctx.fillStyle = 'rgba(41, 240, 255, 0.6)';
    ctx.fillRect(0, HUD - 2, W, 2);

    const flying = state === 'playing' || state === 'paused' || state === 'title' || state === 'clear';
    const spare = Math.max(0, lives - (flying ? 1 : 0));
    for (let i = 0; i < Math.min(spare, 6); i++) {
      ctx.drawImage(SHIP_SPRITE.canvas, 8 + i * 22, H - 24, SHIP_SPRITE.w * 0.5, SHIP_SPRITE.h * 0.5);
    }
  }

  const dim = alpha => A.dim(ctx, W, H, alpha);

  function drawScoreAdvance(top) {
    A.text(ctx, '- SCORE ADVANCE TABLE -', W / 2, top, { size: 10, color: C.cyan });
    ['drone', 'wasp', 'commander'].forEach((type, i) => {
      const y = top + 44 + i * 40;
      const t = TYPES[type];
      drawSprite(SPRITES[type][Math.floor(clock / 300) % 2], 120, y);
      A.text(ctx, t.name, 156, y, { size: 10, color: t.palette.X, align: 'left' });
      A.text(ctx, t.points + ' / ' + t.dive, 380, y, { size: 10, align: 'right' });
    });
    A.text(ctx, 'IN FORMATION / DIVING', W / 2, top + 168, { size: 8, color: C.dim });
  }

  function drawOverlay() {
    const cx = W / 2;
    const cy = H / 2;
    const startPrompt = A.isTouch ? 'TAP TO START' : 'PRESS ENTER';

    if (state === 'title') {
      dim(0.55);
      A.text(ctx, 'SWARM', cx, 130, { size: 36, color: C.cyan, glow: 18 });
      A.text(ctx, 'STRIKE', cx, 180, { size: 40, color: C.pink, glow: 20 });
      const page = Math.floor(clock / 5000) % 3;
      if (page === 0) {
        drawScoreAdvance(250);
      } else if (page === 1) {
        A.text(ctx, 'BLAST THE SWARM', cx, 262, { size: 10, color: C.yellow });
        A.text(ctx, 'DIVERS ARE WORTH DOUBLE', cx, 294, { size: 10, color: C.pink });
        A.text(ctx, 'COMMANDERS TAKE 2 HITS', cx, 326, { size: 10, color: C.yellow });
        A.text(ctx, 'EXTRA SHIP AT ' + BONUS_LIFE_AT, cx, 358, { size: 10, color: C.green });
        A.text(ctx, A.isTouch ? 'DRAG TO MOVE - HOLD TO FIRE' : 'ARROWS + SPACE OR MOUSE', cx, 390, { size: 10, color: C.cyan });
      } else {
        A.drawScoreTable(ctx, GAME_ID, cx, 252);
      }
      if (blink()) A.text(ctx, startPrompt, cx, 480, { size: 14, color: C.yellow, glow: 10 });
      A.text(ctx, '(C) 2026 NEON ARCADE', cx, 540, { size: 8, color: C.dim });
    } else if (state === 'paused') {
      dim(0.7);
      A.text(ctx, 'PAUSED', cx, cy - 20, { size: 28, color: C.cyan, glow: 16 });
      if (blink()) A.text(ctx, A.isTouch ? 'TAP TO RESUME' : 'PRESS P TO RESUME', cx, cy + 30, { size: 10 });
    } else if (state === 'clear') {
      A.text(ctx, 'WAVE ' + wave + ' CLEAR!', cx, cy, { size: 20, color: C.green, glow: 16 });
    } else if (state === 'dying' && lives > 0 && stateTime > 600) {
      A.text(ctx, lives === 1 ? 'LAST SHIP!' : lives + ' SHIPS LEFT', cx, cy + 60, { size: 14, color: C.yellow, glow: 10 });
    } else if (state === 'entry') {
      dim(0.8);
      if (blink(250)) A.text(ctx, 'NEW HIGH SCORE!', cx, 150, { size: 18, color: C.yellow, glow: 14 });
      A.text(ctx, A.pad(score), cx, 200, { size: 24, color: C.pink, glow: 12 });
      A.text(ctx, 'ENTER YOUR INITIALS', cx, 280, { size: 10 });
      entry.draw(ctx, cx, 360, clock);
      A.text(ctx, A.isTouch ? 'UP/DOWN PICK - TAP NEXT' : 'UP/DOWN PICK - ENTER NEXT', cx, 450, { size: 8, color: C.dim });
    } else if (state === 'gameover') {
      dim(0.75);
      A.text(ctx, 'GAME OVER', cx, 100, { size: 32, color: C.red, glow: 18 });
      A.text(ctx, 'SCORE ' + A.pad(score) + '  WAVE ' + wave, cx, 146, { size: 12 });
      const ratio = fired ? ((hits / fired) * 100).toFixed(1) : '0.0';
      A.text(ctx, 'SHOTS FIRED', 90, 186, { size: 10, color: C.cyan, align: 'left' });
      A.text(ctx, String(fired), 390, 186, { size: 10, align: 'right' });
      A.text(ctx, 'NUMBER OF HITS', 90, 210, { size: 10, color: C.cyan, align: 'left' });
      A.text(ctx, String(hits), 390, 210, { size: 10, align: 'right' });
      A.text(ctx, 'HIT-MISS RATIO', 90, 234, { size: 10, color: C.yellow, align: 'left' });
      A.text(ctx, ratio + '%', 390, 234, { size: 10, color: C.yellow, align: 'right' });
      A.drawScoreTable(ctx, GAME_ID, cx, 290, { highlight: rank, t: clock });
      if (stateTime > 600 && blink()) A.text(ctx, A.isTouch ? 'TAP TO PLAY AGAIN' : 'ENTER TO PLAY AGAIN', cx, 490, { size: 12, color: C.yellow, glow: 10 });
      if (!A.isTouch) A.text(ctx, 'ESC FOR TITLE', cx, 530, { size: 8, color: C.dim });
    }

    if (banner && state === 'playing') {
      ctx.globalAlpha = 1 - banner.t / 1800;
      A.text(ctx, banner.text, cx, cy + 20, { size: 22, color: C.yellow, glow: 14 });
      ctx.globalAlpha = 1;
    }
  }

  function render() {
    ctx.save();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    drawStars();
    drawEnemies();
    drawProjectiles();
    drawShip();
    fx.draw(ctx);
    drawHud();
    drawOverlay();
    ctx.restore();
  }

  showTitle();
  A.waitForFont().then(() => A.startLoop({ update, render }));
})();
