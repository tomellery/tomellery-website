/*
 * Robo Rush: a Neon Arcade twin-stick shooter. Bolt-Bot (the arcade crew's own robot) holds off waves
 * of rogue robots while rescuing the construction crew, who wander the arena in a panic.
 * Move one way, shoot another. Clankers march at you, Brutes can't be stopped (only pushed), Mindbots
 * turn the crew into Drones, Spawners release Snipers that shoot back, Spark Mines are deadly to touch.
 * Play states: ready -> playing <-> paused, dying, clear (wave done). The shell runs title, pause,
 * initials and game over.
 */
(function () {
  'use strict';

  const A = window.Arcade;
  const C = A.COLORS;
  const V = A.vector;

  const GAME_ID = 'robo';
  const W = 480;
  const H = 600;
  const HUD = 48;
  const LEFT = 10;
  const RIGHT = W - 10;
  const TOP = HUD + 10;
  const BOTTOM = H - 10;

  const START_LIVES = 3;
  const EXTRA_LIFE_EVERY = 25000;
  const READY_MS = 1400;
  const DYING_MS = 1800;
  const CLEAR_MS = 1500;
  const PLAYER_SPEED = 0.16;
  const SHOT_SPEED = 0.7;
  const FIRE_MS = 95;
  const MAX_SHOTS = 7;
  const SAFE_MS = 1500;
  const CREW_NAMES = ['The Classic', 'Hi-Vis', 'Gramps', 'Foreman Cat', 'Holly the Elf', 'Ski Patrol', 'Shredder', 'Sparky', 'The Boss', 'Night Shift'];

  const DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

  const KINDS = {
    clanker: { r: 9, points: 100, color: C.red },
    brute: { r: 13, points: 0, color: C.green },
    mindbot: { r: 10, points: 500, color: C.pink },
    drone: { r: 8, points: 100, color: C.cyan },
    spawner: { r: 11, points: 1000, color: '#b26bff' },
    sniper: { r: 7, points: 150, color: C.yellow },
    mine: { r: 7, points: 25, color: C.text },
  };
  const COUNTS_TOWARD_CLEAR = ['clanker', 'mindbot', 'drone', 'spawner', 'sniper'];

  // ---------- State ----------

  const canvas = document.getElementById('game');
  const { ctx } = A.createScreen(canvas, W, H);
  const input = A.createInput({ pointerTarget: canvas, screen: { width: W, height: H } });
  const sticks = A.createSticks({ target: canvas, screen: { width: W, height: H } });
  const fx = A.createEffects();

  let demo = true;
  let wave = 1;
  let score = 0;
  let lives = START_LIVES;
  let nextLife = EXTRA_LIFE_EVERY;
  let player, shots, bullets, robots, crew;
  let fireT = 0;
  let waveT = 0;
  let streak = 0;
  let mouse = null;
  let mouseT = -1e9;
  let HERO = null;
  const crewSprites = {};
  let shake = 0;

  const shell = A.createShell({
    ctx, width: W, height: H, id: GAME_ID,
    title: ['ROBO', 'RUSH'],
    titleColors: [C.cyan, C.red],
    howTo: [
      ['MOVE ONE WAY - SHOOT ANOTHER', C.cyan],
      ['RESCUE THE CREW: 1000 TO 5000', C.green],
      ["BRUTES CAN'T BE STOPPED", C.green],
      ['MINDBOTS TURN THE CREW INTO DRONES', C.pink],
      [A.isTouch ? 'LEFT THUMB MOVES - RIGHT THUMB SHOOTS' : 'WASD MOVE - ARROWS OR MOUSE SHOOT', C.dim],
    ],
    hudLabel: 'WAVE',
    newGame, showTitle,
  });

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const sfx = (name, arg) => { if (!demo) A.sound.play(name, arg); };
  const blink = (ms = 500) => Math.floor(shell.clock / ms) % 2 === 0;
  const clampX = x => Math.max(LEFT + 8, Math.min(RIGHT - 8, x));
  const clampY = y => Math.max(TOP + 8, Math.min(BOTTOM - 8, y));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function crewSprite(name) {
    if (!crewSprites[name]) crewSprites[name] = A.crewSprite(name, 1.6);
    return crewSprites[name];
  }

  // ---------- Waves ----------

  function spot(minFromPlayer = 120) {
    for (let tries = 0; tries < 60; tries++) {
      const p = { x: rand(LEFT + 20, RIGHT - 20), y: rand(TOP + 20, BOTTOM - 20) };
      if (!player || dist(p, player) > minFromPlayer) return p;
    }
    return { x: LEFT + 20, y: TOP + 20 };
  }

  function makeRobot(kind, where) {
    const p = where || spot();
    return { kind, x: p.x, y: p.y, vx: 0, vy: 0, r: KINDS[kind].r, t: rand(0, 1000), think: 0, shotT: rand(800, 2000), spawns: 0, walk: 0 };
  }

  function spawnWave() {
    robots = [];
    crew = [];
    const n = wave;
    const add = (kind, count) => { for (let i = 0; i < count; i++) robots.push(makeRobot(kind)); };
    add('clanker', Math.min(70, 14 + n * 5));
    add('mine', Math.min(16, 5 + n));
    if (n >= 2) add('brute', Math.min(8, n - 1));
    if (n >= 3) add('spawner', Math.min(4, Math.ceil((n - 2) / 2)));
    if (n >= 4) add('mindbot', Math.min(5, n - 3));
    const people = 3 + Math.min(4, n);
    for (let i = 0; i < people; i++) {
      const p = spot(80);
      crew.push({ name: pick(CREW_NAMES), x: p.x, y: p.y, vx: 0, vy: 0, turnT: 0, walk: 0, gone: false });
    }
    bullets = [];
    shots = [];
    waveT = 0;
  }

  function resetPlayer() {
    player = { x: W / 2, y: (TOP + BOTTOM) / 2, aimX: 0, aimY: -1, safe: SAFE_MS, alive: true, walk: 0, facing: 1 };
  }

  function newGame() {
    if (window.track) track('play:' + GAME_ID);
    demo = false;
    wave = 1;
    score = 0;
    lives = START_LIVES;
    nextLife = EXTRA_LIFE_EVERY;
    streak = 0;
    fx.clear();
    resetPlayer();
    spawnWave();
    shell.setState('ready');
    A.sound.play('start');
  }

  function showTitle() {
    demo = true;
    wave = 1 + Math.floor(Math.random() * 4);
    score = 0;
    fx.clear();
    resetPlayer();
    spawnWave();
    shell.setState('title');
  }

  function addScore(points, x, y, color = C.yellow) {
    if (demo) return;
    score += points;
    if (x !== undefined) fx.float(x, y, String(points), color);
    while (score >= nextLife) {
      nextLife += EXTRA_LIFE_EVERY;
      lives++;
      fx.float(W / 2, TOP + 40, '1UP!', C.green);
      A.sound.play('powerup');
    }
  }

  // ---------- Controls ----------

  // Returns { mx, my } (move) and { ax, ay, fire } (aim) from whichever controls are in use.
  function controls() {
    if (demo) return demoControls();
    const ctl = { mx: 0, my: 0, ax: 0, ay: 0, fire: false };
    const move = sticks.get(0);
    const aim = sticks.get(1);
    if (move.active || aim.active) {
      if (move.mag > 0.2) {
        ctl.mx = move.x;
        ctl.my = move.y;
      }
      if (aim.mag > 0.3) {
        ctl.ax = aim.x;
        ctl.ay = aim.y;
        ctl.fire = true;
      }
      return ctl;
    }
    // Keyboard: WASD moves, arrows shoot (the two sides of the keyboard), both at once.
    for (const [name, d] of Object.entries(DIRS)) {
      if (input.isDownFor(name, 2)) {
        ctl.mx += d.x;
        ctl.my += d.y;
      }
      if (input.isDownFor(name, 1)) {
        ctl.ax += d.x;
        ctl.ay += d.y;
      }
    }
    if (ctl.ax || ctl.ay) ctl.fire = true;
    // Mouse: aim where it points, hold the button to fire.
    else if (mouse && shell.clock - mouseT < 4000) {
      ctl.ax = mouse.x - player.x;
      ctl.ay = mouse.y - player.y;
      ctl.fire = input.isPointerDown();
    }
    return ctl;
  }

  // ---------- Attract-mode AI ----------
  // The CPU keeps away from whatever is closest, drifts toward crew to rescue, and shoots the nearest robot.

  function demoControls() {
    let ax = 0;
    let ay = 0;
    let mx = 0;
    let my = 0;
    let nearest = null;
    for (const r of robots) {
      const d = dist(r, player);
      if (r.kind !== 'mine' && r.kind !== 'brute' && (!nearest || d < dist(nearest, player))) nearest = r;
      if (d < 90) {
        mx -= (r.x - player.x) / d;
        my -= (r.y - player.y) / d;
      }
    }
    const friend = crew.filter(c => !c.gone).sort((a, b) => dist(a, player) - dist(b, player))[0];
    if (friend) {
      const d = dist(friend, player) || 1;
      mx += ((friend.x - player.x) / d) * 0.8;
      my += ((friend.y - player.y) / d) * 0.8;
    }
    // Keep off the walls.
    mx += (W / 2 - player.x) / 400;
    my += ((TOP + BOTTOM) / 2 - player.y) / 400;
    if (nearest) {
      ax = nearest.x - player.x;
      ay = nearest.y - player.y;
    }
    return { mx, my, ax, ay, fire: !!nearest };
  }

  // ---------- Player ----------

  function updatePlayer(dt) {
    const ctl = controls();
    const len = Math.hypot(ctl.mx, ctl.my);
    if (len > 0.01) {
      const k = Math.min(1, len) / len;
      player.x = clampX(player.x + ctl.mx * k * PLAYER_SPEED * dt);
      player.y = clampY(player.y + ctl.my * k * PLAYER_SPEED * dt);
      player.walk += dt;
      if (ctl.mx) player.facing = Math.sign(ctl.mx);
    }
    if (player.safe > 0) player.safe -= dt;
    const alen = Math.hypot(ctl.ax, ctl.ay);
    if (alen > 0.01) {
      player.aimX = ctl.ax / alen;
      player.aimY = ctl.ay / alen;
    }
    if (ctl.fire && alen > 0.01 && (fireT -= dt) <= 0 && shots.length < MAX_SHOTS) {
      fireT = FIRE_MS;
      shots.push({ x: player.x + player.aimX * 12, y: player.y - 4 + player.aimY * 12, vx: player.aimX * SHOT_SPEED, vy: player.aimY * SHOT_SPEED, r: 3 });
      sfx('laser');
    } else if (!ctl.fire) fireT = 0;
  }

  // ---------- Robots ----------

  function steer(r, target, speed, dt, jitter = 0) {
    const d = dist(r, target) || 1;
    r.x = clampX(r.x + ((target.x - r.x) / d) * speed * dt + rand(-jitter, jitter) * dt);
    r.y = clampY(r.y + ((target.y - r.y) / d) * speed * dt + rand(-jitter, jitter) * dt);
  }

  function updateRobot(r, dt) {
    r.t += dt;
    r.walk += dt;
    const level = 1 + (wave - 1) * 0.06;
    if (r.kind === 'clanker') {
      // Clankers step toward you in little jerky hops, getting faster as the wave goes on.
      if ((r.think -= dt) <= 0) {
        r.think = rand(120, 260);
        r.hop = Math.min(0.085, (0.03 + waveT / 60000) * level);
      }
      steer(r, player, r.hop || 0.03, dt, 0.01);
    } else if (r.kind === 'brute') {
      if ((r.think -= dt) <= 0) {
        r.think = rand(800, 2000);
        const target = crew.find(c => !c.gone && dist(c, r) < 150);
        const a = target ? Math.atan2(target.y - r.y, target.x - r.x) : rand(0, Math.PI * 2);
        r.vx = Math.cos(a) * 0.03;
        r.vy = Math.sin(a) * 0.03;
      }
      r.x = clampX(r.x + r.vx * dt);
      r.y = clampY(r.y + r.vy * dt);
    } else if (r.kind === 'mindbot') {
      const target = crew.filter(c => !c.gone).sort((a, b) => dist(a, r) - dist(b, r))[0];
      steer(r, target || player, 0.05 * level, dt, 0.02);
    } else if (r.kind === 'drone') {
      steer(r, player, 0.09 * level, dt, 0.05);
    } else if (r.kind === 'spawner') {
      // Spawners drift along the edges and release Snipers.
      if ((r.think -= dt) <= 0) {
        r.think = rand(1000, 2200);
        const edge = spot(0);
        r.tx = Math.random() < 0.5 ? (Math.random() < 0.5 ? LEFT + 30 : RIGHT - 30) : edge.x;
        r.ty = edge.y;
      }
      if (r.tx !== undefined) steer(r, { x: r.tx, y: r.ty }, 0.05, dt);
      if ((r.shotT -= dt) <= 0 && r.spawns < 5) {
        r.shotT = rand(2200, 3200);
        r.spawns++;
        robots.push(makeRobot('sniper', { x: r.x, y: r.y }));
        sfx('hatch');
      }
    } else if (r.kind === 'sniper') {
      if ((r.think -= dt) <= 0) {
        r.think = rand(600, 1400);
        r.off = { x: rand(-120, 120), y: rand(-120, 120) };
      }
      steer(r, { x: player.x + r.off.x, y: player.y + r.off.y }, 0.07, dt);
      if ((r.shotT -= dt) <= 0) {
        r.shotT = rand(1200, 2200) / level;
        const a = Math.atan2(player.y - r.y, player.x - r.x) + rand(-0.15, 0.15);
        bullets.push({ x: r.x, y: r.y, vx: Math.cos(a) * 0.22, vy: Math.sin(a) * 0.22, r: 3 });
      }
    }
  }

  function updateCrew(dt) {
    for (const c of crew) {
      if (c.gone) continue;
      if ((c.turnT -= dt) <= 0) {
        c.turnT = rand(600, 1800);
        const a = rand(0, Math.PI * 2);
        c.vx = Math.cos(a) * 0.03;
        c.vy = Math.sin(a) * 0.03;
      }
      c.x = clampX(c.x + c.vx * dt);
      c.y = clampY(c.y + c.vy * dt);
      c.walk += dt;
      if (c.x <= LEFT + 9 || c.x >= RIGHT - 9) c.vx = -c.vx;
      if (c.y <= TOP + 9 || c.y >= BOTTOM - 9) c.vy = -c.vy;
    }
  }

  // ---------- Hits ----------

  function blowUp(r) {
    r.dead = true;
    const spec = KINDS[r.kind];
    addScore(spec.points, r.kind === 'spawner' ? r.x : undefined, r.y - 14, spec.color);
    fx.burst(r.x, r.y, spec.color, r.kind === 'spawner' ? 26 : 12, 0.2);
    sfx(r.kind === 'spawner' ? 'kaboom' : 'pop');
  }

  function collide() {
    for (const s of shots) {
      for (const r of robots) {
        if (r.dead || s.dead || !V.hit(s, r)) continue;
        s.dead = true;
        if (r.kind === 'brute') {
          // Brutes only get knocked back.
          r.x = clampX(r.x + s.vx * 10);
          r.y = clampY(r.y + s.vy * 10);
          sfx('thud');
        } else blowUp(r);
      }
      for (const b of bullets) {
        if (!b.dead && !s.dead && V.hit(s, b)) {
          b.dead = s.dead = true;
          addScore(25);
        }
      }
    }
    // Robots against the crew: Brutes crush them, Mindbots turn them into Drones.
    for (const r of robots) {
      if (r.dead || (r.kind !== 'brute' && r.kind !== 'mindbot')) continue;
      for (const c of crew) {
        if (c.gone || dist(c, r) > r.r + 8) continue;
        c.gone = true;
        if (r.kind === 'brute') {
          fx.float(c.x, c.y - 12, 'X', C.red);
          fx.burst(c.x, c.y, C.red, 10, 0.1);
          sfx('squish');
        } else {
          robots.push(makeRobot('drone', { x: c.x, y: c.y }));
          sfx('zap');
        }
      }
    }
    // Rescues
    for (const c of crew) {
      if (c.gone || dist(c, player) > 16) continue;
      c.gone = true;
      streak++;
      const points = 1000 * Math.min(5, streak);
      addScore(points, c.x, c.y - 18, C.green);
      sfx('rescue', streak);
    }
    // And you
    if (player.safe <= 0) {
      const hitBy = robots.find(r => !r.dead && dist(r, player) < r.r + 7) || bullets.find(b => !b.dead && dist(b, player) < 8);
      if (hitBy) die();
    }
    shots = shots.filter(s => !s.dead);
    bullets = bullets.filter(b => !b.dead);
    robots = robots.filter(r => !r.dead);
    crew = crew.filter(c => !c.gone);
  }

  function die() {
    fx.burst(player.x, player.y, C.cyan, 30, 0.22);
    fx.burst(player.x, player.y, C.text, 14, 0.14);
    sfx('die');
    shake = 10;
    if (demo) {
      showTitle();
      return;
    }
    player.alive = false;
    lives--;
    streak = 0;
    shell.setState('dying');
  }

  // ---------- Input ----------

  input.onPointer(p => {
    if (A.isTouch) return; // thumbsticks handle touch
    mouse = p;
    mouseT = shell.clock;
  });
  input.on(action => { shell.handle(action); });

  // ---------- Update ----------

  function updateWorld(dt) {
    waveT += dt;
    updatePlayer(dt);
    for (const s of shots) {
      V.move(s, dt);
      if (s.x < LEFT || s.x > RIGHT || s.y < TOP || s.y > BOTTOM) s.dead = true;
    }
    for (const b of bullets) {
      V.move(b, dt);
      if (b.x < LEFT || b.x > RIGHT || b.y < TOP || b.y > BOTTOM) b.dead = true;
    }
    robots.slice().forEach(r => updateRobot(r, dt));
    updateCrew(dt);
    collide();
    if (shell.state !== 'playing' && shell.state !== 'title') return;
    if (!robots.some(r => COUNTS_TOWARD_CLEAR.includes(r.kind))) {
      if (demo) {
        wave = wave % 6 + 1;
        spawnWave();
        return;
      }
      sfx('levelup');
      shell.setState('clear');
    }
  }

  function update(dt) {
    shell.update(dt);
    fx.update(dt);
    shake = Math.max(0, shake - dt * 0.02);
    const st = shell.state;
    if (st === 'title' || st === 'playing') updateWorld(dt);
    else if (st === 'ready' && shell.stateTime >= READY_MS) shell.setState('playing');
    else if (st === 'dying' && shell.stateTime >= DYING_MS) {
      if (lives <= 0) shell.gameOver(score, 'WAVE ' + wave);
      else {
        // Back in the middle; the robots that are left scatter to fresh spots away from you.
        resetPlayer();
        for (const r of robots) Object.assign(r, spot(140));
        bullets = [];
        shots = [];
        waveT = 0;
        shell.setState('ready');
      }
    } else if (st === 'clear' && shell.stateTime >= CLEAR_MS) {
      wave++;
      resetPlayer();
      spawnWave();
      shell.setState('ready');
    }
  }

  // ---------- Render ----------

  function drawRobot(r) {
    const spec = KINDS[r.kind];
    const step = Math.floor(r.walk / 150) % 2;
    ctx.save();
    ctx.fillStyle = spec.color;
    ctx.strokeStyle = spec.color;
    if (r.kind === 'clanker') {
      ctx.fillRect(r.x - 7, r.y - 9, 14, 12);
      ctx.fillStyle = C.yellow;
      ctx.fillRect(r.x - 5, r.y - 6, 10, 3);
      ctx.fillStyle = spec.color;
      ctx.fillRect(r.x - 6 + step * 2, r.y + 3, 3, 6);
      ctx.fillRect(r.x + 3 - step * 2, r.y + 3, 3, 6);
    } else if (r.kind === 'brute') {
      ctx.fillRect(r.x - 12, r.y - 13, 24, 22);
      ctx.fillStyle = '#0e3a1e';
      ctx.fillRect(r.x - 9, r.y - 9, 18, 5);
      ctx.fillStyle = C.red;
      ctx.fillRect(r.x - 6 + Math.sin(r.t / 300) * 3, r.y - 8, 4, 3);
      ctx.fillStyle = spec.color;
      ctx.fillRect(r.x - 10, r.y + 9, 7, 5 - step * 2);
      ctx.fillRect(r.x + 3, r.y + 9, 7, 3 + step * 2);
    } else if (r.kind === 'mindbot') {
      ctx.beginPath();
      ctx.arc(r.x, r.y, 9, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(r.x - 9, r.y, 18, 5);
      ctx.fillStyle = C.text;
      ctx.fillRect(r.x - 1, r.y - 15, 2, 6);
      ctx.fillStyle = blink(200) ? C.yellow : C.text;
      ctx.fillRect(r.x - 2, r.y - 17, 4, 3);
      ctx.fillStyle = C.bg;
      ctx.fillRect(r.x - 5, r.y - 4, 3, 3);
      ctx.fillRect(r.x + 2, r.y - 4, 3, 3);
    } else if (r.kind === 'drone') {
      V.draw(ctx, [[0, -8], [8, 0], [0, 8], [-8, 0]], r.x, r.y, { angle: r.t / 150, color: spec.color, width: 2, glow: 0 });
    } else if (r.kind === 'spawner') {
      ctx.lineWidth = 3;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(r.x, r.y, 11 - k * 3, r.t / 200 + k, r.t / 200 + k + Math.PI * 1.3);
        ctx.stroke();
      }
    } else if (r.kind === 'sniper') {
      const a = Math.atan2(player.y - r.y, player.x - r.x);
      V.draw(ctx, [[8, 0], [-6, -6], [-3, 0], [-6, 6]], r.x, r.y, { angle: a, color: spec.color, width: 2, glow: 0 });
    } else if (r.kind === 'mine') {
      ctx.strokeStyle = blink(120) ? C.text : C.cyan;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 4 + r.t / 900;
        ctx.moveTo(r.x - Math.cos(a) * 7, r.y - Math.sin(a) * 7);
        ctx.lineTo(r.x + Math.cos(a) * 7, r.y + Math.sin(a) * 7);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayer() {
    if (!player.alive) return;
    if (player.safe > 0 && blink(90)) return;
    if (!HERO) HERO = A.crewSprite('Bolt-Bot', 2);
    if (HERO) {
      const frame = player.walk && Math.floor(player.walk / 110) % 2 ? HERO.walk1 : HERO.walk2;
      A.drawSprite(ctx, frame, player.x, player.y - 4, { flip: player.facing < 0 });
    } else {
      ctx.fillStyle = C.cyan;
      ctx.fillRect(player.x - 7, player.y - 10, 14, 18);
    }
    // Blaster pointing where you aim.
    ctx.save();
    ctx.strokeStyle = C.cyan;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(player.x, player.y - 4);
    ctx.lineTo(player.x + player.aimX * 13, player.y - 4 + player.aimY * 13);
    ctx.stroke();
    ctx.restore();
  }

  function drawScene() {
    ctx.save();
    ctx.strokeStyle = C.pink;
    ctx.shadowColor = C.pink;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 3;
    ctx.strokeRect(LEFT, TOP, RIGHT - LEFT, BOTTOM - TOP);
    ctx.restore();
    for (const c of crew) {
      const frames = crewSprite(c.name);
      if (frames) A.drawSprite(ctx, Math.floor(c.walk / 160) % 2 ? frames.walk1 : frames.walk2, c.x, c.y - 4, { flip: c.vx < 0 });
    }
    robots.forEach(drawRobot);
    ctx.fillStyle = C.cyan;
    for (const s of shots) {
      ctx.save();
      ctx.strokeStyle = C.text;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 14, s.y - s.vy * 14);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = C.yellow;
    for (const b of bullets) ctx.fillRect(b.x - 2, b.y - 2, 4, 4);
    drawPlayer();
  }

  function drawMessages() {
    const cx = W / 2;
    const cy = (TOP + BOTTOM) / 2;
    const st = shell.state;
    if (st === 'ready') {
      A.text(ctx, 'WAVE ' + wave, cx, cy - 40, { size: 18, color: C.cyan, glow: 12 });
      if (blink(150)) A.text(ctx, 'SAVE THE CREW!', cx, cy - 12, { size: 10, color: C.green });
    } else if (st === 'clear') {
      A.text(ctx, 'WAVE CLEAR!', cx, cy - 20, { size: 18, color: C.green, glow: 12 });
    } else if (st === 'dying' && shell.stateTime > 700) {
      const msg = lives <= 0 ? 'GAME OVER' : lives === 1 ? 'LAST LIFE!' : lives + ' LIVES LEFT';
      A.text(ctx, msg, cx, cy, { size: 14, color: lives <= 0 ? C.red : C.yellow, glow: 10 });
    }
    if (!demo && st !== 'title') {
      for (let i = 0; i < Math.min(lives - (st === 'dying' ? 0 : 1), 6); i++) {
        if (HERO) A.drawSprite(ctx, HERO.stand, W - 20 - i * 16, TOP + 16, { scale: 0.55 });
      }
      if (streak > 1) A.text(ctx, 'RESCUE X' + Math.min(5, streak), LEFT + 10, TOP + 14, { size: 8, color: C.green, align: 'left' });
    }
  }

  function render() {
    ctx.save();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    shell.drawHud(score, wave);
    drawScene();
    fx.draw(ctx);
    drawMessages();
    sticks.draw(ctx);
    shell.drawOverlay();
    ctx.restore();
  }

  showTitle();
  A.waitForFont().then(() => A.startLoop({ update, render }));
})();
