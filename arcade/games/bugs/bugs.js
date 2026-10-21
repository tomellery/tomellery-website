/*
 * Bug Burst: a Neon Arcade shooter. The Glowworm snakes down through a field of glowing mushrooms;
 * Sparky (from the arcade's crew) zaps it from the bottom of the screen. Every hit splits it in two
 * and leaves a mushroom behind. Jumpers bounce through your zone, Droppers fall and plant mushrooms,
 * Stingers poison them so the Glowworm dives straight at you.
 * Play states: ready -> playing <-> paused, dying. The shell runs title, pause, initials, game over.
 */
(function () {
  'use strict';

  const A = window.Arcade;
  const C = A.COLORS;

  const GAME_ID = 'bugs';
  const W = 480;
  const H = 600;
  const HUD = 48;
  const CELL = 16;
  const COLS = W / CELL; // 30
  const ROWS = 33;
  const FY = HUD; // top of the field
  const ZONE_TOP = ROWS - 6; // your zone is the bottom six rows

  const START_LIVES = 3;
  const EXTRA_LIFE_EVERY = 12000;
  const READY_MS = 1500;
  const DYING_MS = 1800;
  const REPAIR_STEP_MS = 70;
  const WORM_LENGTH = 12;
  const SHOT_SPEED = 1.1;
  const KEY_SPEED = 0.24;
  const POINTER_SPEED = 0.55;

  const PALETTES = [
    { mush: C.pink, stalk: '#ffc2e0', worm: C.green, head: C.yellow },
    { mush: C.cyan, stalk: '#b6f9ff', worm: '#ff9f1c', head: C.pink },
    { mush: '#b26bff', stalk: '#e0c8ff', worm: C.cyan, head: C.green },
    { mush: C.green, stalk: '#c8ffd8', worm: C.pink, head: C.cyan },
  ];
  const POISON = '#ff3b3b';

  // ---------- State ----------

  const canvas = document.getElementById('game');
  const { ctx } = A.createScreen(canvas, W, H);
  const input = A.createInput({ pointerTarget: canvas, screen: { width: W, height: H } });
  const fx = A.createEffects();

  // Mushrooms are painted onto their own layer whenever the field changes.
  const mushArt = document.createElement('canvas');
  mushArt.width = W * 2;
  mushArt.height = ROWS * CELL * 2;
  const mctx = mushArt.getContext('2d');
  mctx.scale(2, 2);

  let demo = true;
  let wave = 1;
  let score = 0;
  let lives = START_LIVES;
  let nextLife = EXTRA_LIFE_EVERY;
  let mush, poison, chains, player, shot, jumper, dropper, stinger;
  let tickT = 0;
  let reinforceT = 0;
  let jumperT = 0;
  let stingerT = 0;
  let repair = null;
  let mushDirty = true;
  let pointer = null;
  let pointerT = 0;
  let SPARKY = null;
  let shake = 0;

  const shell = A.createShell({
    ctx, width: W, height: H, id: GAME_ID,
    title: ['BUG', 'BURST'],
    titleColors: [C.green, C.pink],
    howTo: [
      ['ZAP THE GLOWWORM - IT SPLITS!', C.green],
      ['HEADS 100 - BODIES 10', C.yellow],
      ['JUMPERS BOUNCE - DROPPERS FALL', C.cyan],
      ['STINGERS POISON MUSHROOMS', '#ff3b3b'],
      [A.isTouch ? 'DRAG TO MOVE - FIRES WHILE TOUCHING' : 'MOUSE OR ARROWS - HOLD TO FIRE', C.dim],
    ],
    hudLabel: 'WAVE',
    newGame, showTitle,
  });

  const idx = (c, r) => r * COLS + c;
  const inside = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pal = () => PALETTES[(wave - 1) % PALETTES.length];
  const sfx = (name, arg) => { if (!demo) A.sound.play(name, arg); };
  const blink = (ms = 500) => Math.floor(shell.clock / ms) % 2 === 0;
  const tickMs = () => Math.max(34, 62 - (wave - 1) * 3);
  const cellX = c => c * CELL + CELL / 2;
  const cellY = r => FY + r * CELL + CELL / 2;

  // ---------- Setup ----------

  function plantField() {
    mush = new Uint8Array(COLS * ROWS);
    poison = new Uint8Array(COLS * ROWS);
    for (let n = 0; n < 46; n++) {
      const c = Math.floor(rand(0, COLS));
      const r = Math.floor(rand(1, ZONE_TOP));
      mush[idx(c, r)] = 4;
    }
    for (let n = 0; n < 6; n++) mush[idx(Math.floor(rand(0, COLS)), Math.floor(rand(ZONE_TOP, ROWS - 1)))] = 4;
    mushDirty = true;
  }

  // A wave starts with one long Glowworm (shorter each wave) plus single heads that make up the difference.
  function spawnWave(total = WORM_LENGTH) {
    chains = [];
    const singles = Math.min(total - 1, wave - 1);
    const length = total - singles;
    const segs = [];
    for (let i = 0; i < length; i++) segs.push(makeSeg(Math.floor(COLS / 2) + i, 0, -1));
    chains.push(segs);
    for (let i = 0; i < singles; i++) chains.push([makeSeg(Math.floor(rand(2, COLS - 2)), 0, Math.random() < 0.5 ? 1 : -1)]);
    tickT = 0;
    reinforceT = 0;
  }

  function makeSeg(c, r, dir) {
    return { c, r, pc: c, pr: r, dir, vdir: 1, diving: false };
  }

  function resetPlayer() {
    player = { x: W / 2, y: cellY(ROWS - 2), alive: true };
    shot = null;
    jumper = null;
    dropper = null;
    stinger = null;
    jumperT = rand(4000, 7000);
    stingerT = rand(9000, 14000);
  }

  function newGame() {
    if (window.track) track('play:' + GAME_ID);
    demo = false;
    wave = 1;
    score = 0;
    lives = START_LIVES;
    nextLife = EXTRA_LIFE_EVERY;
    fx.clear();
    plantField();
    spawnWave();
    resetPlayer();
    shell.setState('ready');
    A.sound.play('start');
  }

  function showTitle() {
    demo = true;
    wave = 1;
    score = 0;
    fx.clear();
    plantField();
    spawnWave();
    resetPlayer();
    shell.setState('title');
  }

  function addScore(points, x, y, color = C.yellow) {
    if (demo) return;
    score += points;
    if (x !== undefined) fx.float(x, y, String(points), color);
    while (score >= nextLife) {
      nextLife += EXTRA_LIFE_EVERY;
      lives++;
      fx.float(W / 2, FY + 60, '1UP!', C.green);
      A.sound.play('powerup');
    }
  }

  // ---------- The Glowworm ----------
  // Each tick the head steps sideways; blocked by the edge or a mushroom it drops a row and turns.
  // Body segments follow in the head's footsteps. A poisoned mushroom sends the head diving straight down.

  const blocked = (c, r) => !inside(c, r) || mush[idx(c, r)] > 0;

  function stepHead(h) {
    h.pc = h.c;
    h.pr = h.r;
    if (h.diving) {
      if (h.r >= ROWS - 1) h.diving = false;
      else {
        h.r++;
        return;
      }
    }
    const nc = h.c + h.dir;
    if (blocked(nc, h.r)) {
      if (inside(nc, h.r) && poison[idx(nc, h.r)]) h.diving = true;
      // Bounce between the bottom and the top of your zone once it gets down there.
      if (h.r >= ROWS - 1) h.vdir = -1;
      else if (h.vdir < 0 && h.r <= ZONE_TOP) h.vdir = 1;
      h.r = Math.max(0, Math.min(ROWS - 1, h.r + h.vdir));
      h.dir = -h.dir;
    } else {
      h.c = nc;
    }
  }

  function stepChains() {
    for (const chain of chains) {
      // Body segments take the place of the one in front of them.
      for (let i = chain.length - 1; i > 0; i--) {
        const s = chain[i];
        const f = chain[i - 1];
        s.pc = s.c;
        s.pr = s.r;
        s.c = f.c;
        s.r = f.r;
        s.dir = f.dir;
        s.vdir = f.vdir;
        s.diving = f.diving;
      }
      stepHead(chain[0]);
    }
  }

  // Shooting a segment turns it into a mushroom and splits the chain behind it into a new Glowworm.
  function hitSegment(ci, si) {
    const chain = chains[ci];
    const s = chain[si];
    const head = si === 0;
    addScore(head ? 100 : 10, cellX(s.c), cellY(s.r) - 12, head ? C.yellow : C.text);
    fx.burst(cellX(s.c), cellY(s.r), head ? pal().head : pal().worm, head ? 16 : 10, 0.16);
    sfx(head ? 'pop' : 'brick', si % 12);
    if (s.r > 0 && inside(s.c, s.r)) {
      mush[idx(s.c, s.r)] = 4;
      mushDirty = true;
    }
    const front = chain.slice(0, si);
    const back = chain.slice(si + 1);
    chains.splice(ci, 1, ...[front, back].filter(c => c.length));
  }

  // ---------- Shooting ----------

  function wantsFire() {
    if (demo) return true;
    return input.isDown('start') || input.isPointerDown();
  }

  function updateShot(dt) {
    if (!shot) {
      if (wantsFire() && player.alive) {
        shot = { x: player.x, y: player.y - 12 };
        sfx('shoot');
      }
      return;
    }
    // Move in small steps so the fast zap can't skip over anything.
    let dist = SHOT_SPEED * dt;
    while (dist > 0 && shot) {
      const step = Math.min(4, dist);
      dist -= step;
      shot.y -= step;
      if (shot.y < FY) {
        shot = null;
        break;
      }
      const c = Math.floor(shot.x / CELL);
      const r = Math.floor((shot.y - FY) / CELL);
      if (shotHits(c, r)) shot = null;
    }
  }

  function shotHits(c, r) {
    for (let ci = 0; ci < chains.length; ci++) {
      const si = chains[ci].findIndex(s => s.c === c && s.r === r);
      if (si >= 0) {
        hitSegment(ci, si);
        return true;
      }
    }
    if (jumper && Math.hypot(jumper.x - shot.x, jumper.y - shot.y) < 12) {
      const d = Math.hypot(jumper.x - player.x, jumper.y - player.y);
      const points = d < 48 ? 900 : d < 96 ? 600 : 300;
      addScore(points, jumper.x, jumper.y - 14, C.cyan);
      fx.burst(jumper.x, jumper.y, C.cyan, 20, 0.2);
      sfx('boom');
      jumper = null;
      jumperT = rand(3000, 6000);
      return true;
    }
    if (dropper && Math.abs(dropper.x - shot.x) < 9 && Math.abs(dropper.y - shot.y) < 10) {
      // Droppers take two hits; the first one makes them fall faster.
      if (--dropper.hp <= 0) {
        addScore(200, dropper.x, dropper.y - 12, C.yellow);
        fx.burst(dropper.x, dropper.y, C.yellow, 14, 0.16);
        sfx('boom');
        dropper = null;
      } else {
        dropper.speed *= 2;
        sfx('bonk');
      }
      return true;
    }
    if (stinger && Math.abs(stinger.x - shot.x) < 14 && Math.abs(stinger.y - shot.y) < 9) {
      addScore(1000, stinger.x, stinger.y - 12, POISON);
      fx.burst(stinger.x, stinger.y, POISON, 20, 0.2);
      sfx('boom');
      stinger = null;
      stingerT = rand(10000, 16000);
      return true;
    }
    if (inside(c, r) && mush[idx(c, r)] > 0) {
      if (--mush[idx(c, r)] === 0) {
        poison[idx(c, r)] = 0;
        addScore(1);
      }
      mushDirty = true;
      sfx('wall');
      return true;
    }
    return false;
  }

  // ---------- Moving Sparky ----------

  function canStand(x, y) {
    if (x < 8 || x > W - 8 || y < cellY(ZONE_TOP) - 6 || y > FY + ROWS * CELL - 8) return false;
    for (const [dx, dy] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
      const c = Math.floor((x + dx) / CELL);
      const r = Math.floor((y + dy - FY) / CELL);
      if (inside(c, r) && mush[idx(c, r)] > 0) return false;
    }
    return true;
  }

  function moveBy(dx, dy) {
    if (canStand(player.x + dx, player.y)) player.x += dx;
    if (canStand(player.x, player.y + dy)) player.y += dy;
  }

  function updatePlayer(dt) {
    if (demo) {
      demoMove(dt);
      return;
    }
    const kx = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
    const ky = (input.isDown('down') ? 1 : 0) - (input.isDown('up') ? 1 : 0);
    if (kx || ky) {
      pointer = null;
      moveBy(kx * KEY_SPEED * dt, ky * KEY_SPEED * dt);
      return;
    }
    // Mouse or finger: glide toward it (fast, but not instant).
    if (pointer) {
      const dx = pointer.x - player.x;
      const dy = pointer.y - 20 * (A.isTouch ? 1 : 0) - player.y;
      const d = Math.hypot(dx, dy);
      const step = Math.min(d, POINTER_SPEED * dt);
      if (d > 0.5) moveBy((dx / d) * step, (dy / d) * step);
    }
  }

  // ---------- The bug crowd ----------

  function updateJumper(dt) {
    if (!jumper) {
      if ((jumperT -= dt) <= 0) {
        const left = Math.random() < 0.5;
        jumper = { x: left ? -10 : W + 10, y: cellY(ZONE_TOP + 1), vx: (left ? 1 : -1) * rand(0.06, 0.1), vy: 0.12, turnT: 400 };
      }
      return;
    }
    // Zig-zags up and down through your zone while drifting across, eating mushrooms on the way.
    jumper.x += jumper.vx * dt;
    jumper.y += jumper.vy * dt;
    if ((jumper.turnT -= dt) <= 0 || jumper.y > FY + ROWS * CELL - 10 || jumper.y < cellY(ZONE_TOP - 2)) {
      jumper.turnT = rand(300, 900);
      jumper.vy = jumper.y > cellY(ZONE_TOP + 2) ? -rand(0.08, 0.16) : rand(0.08, 0.16);
      if (Math.random() < 0.3) jumper.vx = 0;
      else if (!jumper.vx) jumper.vx = (Math.random() < 0.5 ? -1 : 1) * rand(0.06, 0.1);
    }
    const c = Math.floor(jumper.x / CELL);
    const r = Math.floor((jumper.y - FY) / CELL);
    if (inside(c, r) && mush[idx(c, r)] > 0 && Math.random() < 0.02 * dt) {
      mush[idx(c, r)] = 0;
      mushDirty = true;
    }
    if (jumper.x < -20 || jumper.x > W + 20) {
      jumper = null;
      jumperT = rand(3000, 7000);
    }
  }

  function updateDropper(dt) {
    if (!dropper) {
      // Falls when your zone is thin on mushrooms, from wave 2.
      let count = 0;
      for (let r = ZONE_TOP; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (mush[idx(c, r)]) count++;
      if (wave >= 2 && count < 5 && Math.random() < dt / 3000) dropper = { x: cellX(Math.floor(rand(0, COLS))), y: FY - 8, speed: 0.22, hp: 2, lastRow: -1 };
      return;
    }
    dropper.y += dropper.speed * dt;
    const r = Math.floor((dropper.y - FY) / CELL);
    if (r !== dropper.lastRow && r > 0 && r < ROWS - 1) {
      dropper.lastRow = r;
      const c = Math.floor(dropper.x / CELL);
      if (Math.random() < 0.28 && !mush[idx(c, r)]) {
        mush[idx(c, r)] = 4;
        mushDirty = true;
      }
    }
    if (dropper.y > FY + ROWS * CELL + 10) dropper = null;
  }

  function updateStinger(dt) {
    if (!stinger) {
      if (wave >= 3 && (stingerT -= dt) <= 0) {
        const left = Math.random() < 0.5;
        stinger = { x: left ? -16 : W + 16, y: cellY(Math.floor(rand(3, ZONE_TOP - 6))), vx: (left ? 1 : -1) * 0.07 };
      }
      return;
    }
    stinger.x += stinger.vx * dt;
    const c = Math.floor(stinger.x / CELL);
    const r = Math.floor((stinger.y - FY) / CELL);
    if (inside(c, r) && mush[idx(c, r)] && !poison[idx(c, r)]) {
      poison[idx(c, r)] = 1;
      mushDirty = true;
    }
    if (stinger.x < -30 || stinger.x > W + 30) {
      stinger = null;
      stingerT = rand(10000, 16000);
    }
  }

  // Once a head reaches your zone, fresh single heads keep dropping in from the sides.
  function updateReinforcements(dt) {
    const inZone = chains.some(ch => ch[0].r >= ZONE_TOP);
    if (!inZone) return;
    if ((reinforceT += dt) > Math.max(2500, 5000 - wave * 300)) {
      reinforceT = 0;
      const left = Math.random() < 0.5;
      chains.push([makeSeg(left ? 0 : COLS - 1, ZONE_TOP, left ? 1 : -1)]);
    }
  }

  // ---------- Getting caught ----------

  function checkCaught() {
    const near = (x, y, r) => Math.abs(x - player.x) < r && Math.abs(y - player.y) < r;
    let caught = chains.some(ch => ch.some(s => near(cellX(s.c), cellY(s.r), 12)));
    if (jumper && near(jumper.x, jumper.y, 13)) caught = true;
    if (dropper && near(dropper.x, dropper.y, 11)) caught = true;
    if (!caught) return;
    fx.burst(player.x, player.y, C.yellow, 30, 0.22);
    fx.burst(player.x, player.y, C.cyan, 14, 0.14);
    sfx('die');
    shake = 10;
    if (demo) {
      showTitle();
      return;
    }
    lives--;
    player.alive = false;
    shell.setState('dying');
  }

  // After a lost life: damaged and poisoned mushrooms are fixed up one by one, 5 points each.
  function startRepair() {
    const list = [];
    for (let i = 0; i < mush.length; i++) if ((mush[i] && mush[i] < 4) || poison[i]) list.push(i);
    repair = { list, t: 0 };
  }

  function updateRepair(dt) {
    if ((repair.t += dt) < REPAIR_STEP_MS) return false;
    repair.t = 0;
    const i = repair.list.shift();
    if (i === undefined) return true;
    mush[i] = 4;
    poison[i] = 0;
    mushDirty = true;
    addScore(5);
    sfx('tick');
    return false;
  }

  // ---------- Attract-mode AI ----------
  // The CPU slides under the lowest bug segment and keeps zapping, backing off from Jumpers.

  function demoMove(dt) {
    let tx = player.x;
    let lowest = null;
    for (const ch of chains) for (const s of ch) if (!lowest || s.r > lowest.r) lowest = s;
    if (lowest) tx = cellX(lowest.c);
    let ty = cellY(ROWS - 2);
    if (jumper && Math.hypot(jumper.x - player.x, jumper.y - player.y) < 70) {
      tx = player.x + (player.x > jumper.x ? 60 : -60);
      ty = jumper.y > player.y ? cellY(ZONE_TOP) : cellY(ROWS - 1);
    }
    const dx = tx - player.x;
    const dy = ty - player.y;
    const d = Math.hypot(dx, dy);
    if (d > 1) moveBy((dx / d) * Math.min(d, KEY_SPEED * dt), (dy / d) * Math.min(d, KEY_SPEED * dt));
  }

  // ---------- Input ----------

  input.onPointer(p => {
    pointer = p;
    pointerT = shell.clock;
  });
  input.on(action => { shell.handle(action); });

  // ---------- Update ----------

  function update(dt) {
    shell.update(dt);
    fx.update(dt);
    shake = Math.max(0, shake - dt * 0.02);
    const st = shell.state;
    if (st === 'title' || st === 'playing') {
      updatePlayer(dt);
      updateShot(dt);
      tickT += dt;
      while (tickT >= tickMs()) {
        tickT -= tickMs();
        stepChains();
      }
      updateReinforcements(dt);
      updateJumper(dt);
      updateDropper(dt);
      updateStinger(dt);
      checkCaught();
      if (shell.state === st && !chains.length) {
        wave++;
        if (demo && wave > 4) wave = 1;
        sfx('levelup');
        spawnWave();
      }
    } else if (st === 'ready') {
      if (shell.stateTime >= READY_MS) shell.setState('playing');
    } else if (st === 'dying') {
      if (shell.stateTime < DYING_MS) return;
      if (!repair) startRepair();
      if (updateRepair(dt)) {
        repair = null;
        if (lives <= 0) {
          shell.gameOver(score, 'WAVE ' + wave);
          return;
        }
        // The Glowworm starts again from the top with as many segments as were left.
        const left = chains.reduce((n, ch) => n + ch.length, 0);
        spawnWave(Math.max(1, left));
        resetPlayer();
        shell.setState('ready');
      }
    }
  }

  // ---------- Render ----------

  function paintMushrooms() {
    mushDirty = false;
    mctx.clearRect(0, 0, W, ROWS * CELL);
    const p = pal();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const hp = mush[idx(c, r)];
        if (!hp) continue;
        const x = c * CELL;
        const y = r * CELL;
        const cap = poison[idx(c, r)] ? POISON : p.mush;
        const h = 3 + hp * 2.5; // shrinks as it's shot
        mctx.save();
        mctx.fillStyle = cap;
        mctx.shadowColor = cap;
        mctx.shadowBlur = 5;
        mctx.beginPath();
        mctx.moveTo(x + 2, y + CELL - 6);
        mctx.quadraticCurveTo(x + CELL / 2, y + CELL - 6 - h * 1.3, x + CELL - 2, y + CELL - 6);
        mctx.closePath();
        mctx.fill();
        mctx.shadowBlur = 0;
        mctx.fillStyle = p.stalk;
        mctx.fillRect(x + 6, y + CELL - 6, 4, 5);
        mctx.restore();
      }
    }
  }

  function drawWorm() {
    const t = Math.min(1, tickT / tickMs());
    const p = pal();
    for (const ch of chains) {
      for (let i = ch.length - 1; i >= 0; i--) {
        const s = ch[i];
        const x = cellX(s.pc + (s.c - s.pc) * t);
        const y = cellY(s.pr + (s.r - s.pr) * t);
        const head = i === 0;
        ctx.save();
        ctx.fillStyle = head ? p.head : p.worm;
        ctx.shadowColor = head ? p.head : p.worm;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(x, y, head ? 7 : 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = C.bg;
        if (head) {
          ctx.fillRect(x + s.dir * 2 - 1, y - 3, 2, 2);
          ctx.fillRect(x + s.dir * 2 + 2 * s.dir, y - 3, 2, 2);
          ctx.strokeStyle = p.head;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x - 2, y - 6);
          ctx.lineTo(x - 4 + s.dir * 2, y - 11);
          ctx.moveTo(x + 2, y - 6);
          ctx.lineTo(x + 4 + s.dir * 2, y - 11);
          ctx.stroke();
        } else {
          ctx.fillRect(x - 3, y - 1, 6, 2);
        }
        ctx.restore();
      }
    }
  }

  function drawCrowd() {
    if (jumper) {
      ctx.save();
      ctx.strokeStyle = C.cyan;
      ctx.lineWidth = 1.5;
      const wiggle = Math.sin(shell.clock / 60) * 3;
      for (const side of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.moveTo(jumper.x + side * 4, jumper.y + k * 2 - 2);
          ctx.lineTo(jumper.x + side * 11, jumper.y - 5 + k * 5 + wiggle * side);
          ctx.lineTo(jumper.x + side * 13, jumper.y + 2 + k * 4);
          ctx.stroke();
        }
      }
      ctx.fillStyle = C.cyan;
      ctx.shadowColor = C.cyan;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.ellipse(jumper.x, jumper.y, 7, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = C.red;
      ctx.fillRect(jumper.x - 3, jumper.y - 2, 2, 2);
      ctx.fillRect(jumper.x + 1, jumper.y - 2, 2, 2);
      ctx.restore();
    }
    if (dropper) {
      ctx.save();
      ctx.fillStyle = dropper.hp < 2 ? C.text : C.yellow;
      ctx.shadowColor = C.yellow;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.ellipse(dropper.x, dropper.y, 5, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = C.bg;
      ctx.fillRect(dropper.x - 3, dropper.y + 2, 2, 2);
      ctx.fillRect(dropper.x + 1, dropper.y + 2, 2, 2);
      ctx.restore();
    }
    if (stinger) {
      const f = stinger.vx > 0 ? 1 : -1;
      ctx.save();
      ctx.fillStyle = POISON;
      ctx.shadowColor = POISON;
      ctx.shadowBlur = 8;
      ctx.fillRect(stinger.x - 9, stinger.y - 3, 18, 7);
      ctx.fillRect(stinger.x + f * 9, stinger.y - 2, f * 5, 4);
      ctx.strokeStyle = POISON;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(stinger.x - f * 8, stinger.y);
      ctx.quadraticCurveTo(stinger.x - f * 16, stinger.y - 12, stinger.x - f * 6, stinger.y - 12);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawPlayer() {
    if (!SPARKY) {
      SPARKY = A.crewSprite('Sparky', 2);
      if (!SPARKY) {
        const s = A.makeSprite(['..YYYY..', '.YYYYYY.', '..SSSS..', '..SESE..', '.BBBBBB.', 'ABBBBBBA', '..JJJJ..', '..J..J..'], { Y: C.yellow, S: '#c68642', E: C.bg, B: '#3d7bd9', A: '#3d7bd9', J: '#33507a' }, 2);
        SPARKY = { stand: s };
      }
    }
    if (!player.alive) return;
    A.drawSprite(ctx, SPARKY.stand, player.x, player.y - 4);
    // The bug zapper, crackling when it fires.
    ctx.save();
    ctx.fillStyle = '#8a85b3';
    ctx.fillRect(player.x + 6, player.y - 14, 3, 10);
    ctx.fillStyle = shot ? C.text : C.cyan;
    ctx.shadowColor = C.cyan;
    ctx.shadowBlur = 8;
    ctx.fillRect(player.x + 5, player.y - 17, 5, 4);
    ctx.restore();
  }

  function drawShot() {
    if (!shot) return;
    ctx.save();
    ctx.strokeStyle = blink(40) ? C.text : C.cyan;
    ctx.shadowColor = C.cyan;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(shot.x, shot.y + 10);
    ctx.lineTo(shot.x + 3, shot.y + 6);
    ctx.lineTo(shot.x - 2, shot.y + 3);
    ctx.lineTo(shot.x + 1, shot.y - 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawZone() {
    ctx.fillStyle = 'rgba(41, 240, 255, 0.05)';
    ctx.fillRect(0, FY + ZONE_TOP * CELL, W, (ROWS - ZONE_TOP) * CELL);
    ctx.fillStyle = 'rgba(41, 240, 255, 0.25)';
    ctx.fillRect(0, FY + ZONE_TOP * CELL, W, 1);
  }

  function drawFooter() {
    if (demo) return;
    const y = H - 12;
    for (let i = 0; i < Math.min(lives - (shell.state === 'dying' ? 0 : 1), 6); i++) {
      if (SPARKY && SPARKY.stand) A.drawSprite(ctx, SPARKY.stand, W - 16 - i * 16, y - 4, { scale: 0.5 });
    }
  }

  function drawMessages() {
    const cx = W / 2;
    const cy = H / 2;
    if (shell.state === 'ready' && blink(150)) A.text(ctx, 'WAVE ' + wave, cx, cy, { size: 18, color: C.yellow, glow: 12 });
    if (shell.state === 'dying' && shell.stateTime > 700) {
      const msg = lives <= 0 ? 'GAME OVER' : lives === 1 ? 'LAST LIFE!' : lives + ' LIVES LEFT';
      A.text(ctx, msg, cx, cy, { size: 14, color: lives <= 0 ? C.red : C.yellow, glow: 10 });
    }
  }

  function render() {
    ctx.save();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    shell.drawHud(score, wave);
    drawZone();
    if (mushDirty) paintMushrooms();
    ctx.drawImage(mushArt, 0, FY, W, ROWS * CELL);
    drawWorm();
    drawCrowd();
    drawShot();
    drawPlayer();
    fx.draw(ctx);
    drawFooter();
    drawMessages();
    shell.drawOverlay();
    ctx.restore();
  }

  showTitle();
  A.waitForFont().then(() => A.startLoop({ update, render }));
})();
