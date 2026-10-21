/*
 * Sky Knights: a Neon Arcade flying joust. Ride a runner bird over a lava cavern, flap to climb, and
 * bump into enemy riders from above to knock them off; they leave eggs that hatch if you don't grab
 * them. Holly the Elf (player 1) and Night Ninja (player 2, on the same keyboard) are from the arcade's
 * crew. Raiders, Hunters and Shadows get smarter; the Lava Hand grabs low fliers; the Skywyrm shows up
 * when a wave drags on.
 * Play states: ready -> playing <-> paused, dying, clear. The shell runs title, pause, initials, game over.
 */
(function () {
  'use strict';

  const A = window.Arcade;
  const C = A.COLORS;

  const GAME_ID = 'knights';
  const W = 480;
  const H = 600;
  const HUD = 48;
  const LAVA_Y = 580;
  const CEILING = HUD + 14;

  const START_LIVES = 3;
  const EXTRA_LIFE_EVERY = 20000;
  const READY_MS = 1600;
  const DYING_MS = 1600;
  const CLEAR_MS = 2200;
  const RESPAWN_MS = 1400;
  const SAFE_MS = 2000;
  const GRAVITY = 0.0009;
  const FLAP = 0.26;
  const MAX_RISE = 0.38;
  const MAX_FALL = 0.45;
  const AIR_ACCEL = 0.0005;
  const AIR_MAX = 0.16;
  const RUN_MAX = 0.12;
  const HOLD_FLAP_MS = 220;
  const HATCH_MS = 6500;
  const WYRM_AFTER_MS = 60000;
  const EGG_POINTS = [250, 500, 750, 1000];

  // Floating ledges (girders for the platform physics) over the lava.
  const LEDGES = [
    { x1: 40, y1: 540, x2: 440, y2: 540 },
    { x1: 0, y1: 420, x2: 110, y2: 420 },
    { x1: 370, y1: 420, x2: 480, y2: 420 },
    { x1: 190, y1: 384, x2: 290, y2: 384 },
    { x1: 40, y1: 272, x2: 160, y2: 272 },
    { x1: 320, y1: 272, x2: 440, y2: 272 },
    { x1: 170, y1: 162, x2: 310, y2: 162 },
  ];
  const SPAWNS = [[90, 1], [420, 2], [240, 6], [100, 4], [380, 5]];

  const ENEMY = {
    raider: { color: C.pink, points: 500, speed: 0.1, smarts: 0 },
    hunter: { color: '#cfd8e8', points: 750, speed: 0.13, smarts: 1 },
    shadow: { color: '#4d8bff', points: 1500, speed: 0.16, smarts: 2 },
  };
  const UPGRADE = { raider: 'hunter', hunter: 'shadow', shadow: 'shadow' };

  // ---------- Sprites ----------

  const KNIGHT = kind => A.makeSprite(
    ['..KKK..', '.KKKKK.', '.KVVVK.', '..KKK..', '.KKKKK.', 'KKKKKKK', '.KK.KK.'],
    { K: ENEMY[kind].color, V: C.bg }, 2);
  const KNIGHTS = { raider: KNIGHT('raider'), hunter: KNIGHT('hunter'), shadow: KNIGHT('shadow') };
  const heroSprites = {};
  const hero = name => {
    if (!heroSprites[name]) heroSprites[name] = A.crewSprite(name, 1.6);
    return heroSprites[name];
  };

  // ---------- State ----------

  const canvas = document.getElementById('game');
  const { ctx } = A.createScreen(canvas, W, H);
  const input = A.createInput({ swipeTarget: canvas });
  const world = A.createPlatforms({ girders: LEDGES.map(g => ({ ...g })), width: W });
  const fx = A.createEffects();

  let demo = true;
  let players = 1;
  let wave = 1;
  let score = 0;
  let nextLife = EXTRA_LIFE_EVERY;
  let knights, enemies, eggs, wyrm, hand;
  let waveT = 0;
  let spawnQueue = [];
  let spawnT = 0;
  let teamWave = false;
  let shake = 0;

  const shell = A.createShell({
    ctx, width: W, height: H, id: GAME_ID,
    title: ['SKY', 'KNIGHTS'],
    titleColors: [C.cyan, C.yellow],
    howTo: [
      ['FLAP TO FLY - HIGHER RIDER WINS', C.cyan],
      ['GRAB THE EGGS BEFORE THEY HATCH', C.text],
      ['BEWARE THE LAVA HAND', '#ff9f1c'],
      [A.isTouch ? 'ARROWS STEER - FLAP BUTTON' : 'P1 ARROWS (UP FLAPS)  P2 A D (W FLAPS)', C.dim],
    ],
    hudLabel: 'WAVE',
    newGame, showTitle,
  });

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const sfx = (name, arg) => { if (!demo) A.sound.play(name, arg); };
  const blink = (ms = 500) => Math.floor(shell.clock / ms) % 2 === 0;
  const wrapX = x => (x < 0 ? x + W : x >= W ? x - W : x);
  const dxWrap = (a, b) => {
    let d = b - a;
    if (d > W / 2) d -= W;
    if (d < -W / 2) d += W;
    return d;
  };

  // ---------- Riders ----------

  function makeRider(x, y, extra) {
    return { x, y, vx: 0, vy: 0, onGround: false, facing: 1, flapT: 0, wing: 0, run: 0, holdT: 0, think: 0, targetY: 300, wantDir: 1, ...extra };
  }

  function makeKnight(slot) {
    const name = slot === 1 ? 'Holly the Elf' : 'Night Ninja';
    const x = slot === 1 ? 200 : 280;
    return makeRider(x, LEDGES[0].y1, { slot, name, bird: slot === 1 ? C.yellow : C.cyan, lives: START_LIVES, alive: true, safe: SAFE_MS, respawnT: 0, eggStreak: 0, cpu: demo });
  }

  function makeEnemy(kind, x, ledge) {
    return makeRider(x, LEDGES[ledge].y1, { kind, onGround: true, think: 0, targetY: 300, wantDir: Math.random() < 0.5 ? -1 : 1, appear: 800 });
  }

  // Wave by wave: more riders and smarter ones; every 5th wave is an egg wave.
  function startWave() {
    enemies = [];
    eggs = [];
    wyrm = null;
    hand = null;
    waveT = 0;
    spawnQueue = [];
    teamWave = players === 2 && !demo && wave % 5 === 3;
    if (wave % 5 === 0) {
      for (let i = 0; i < 8; i++) {
        const g = LEDGES[1 + (i % (LEDGES.length - 1))];
        eggs.push({ x: rand(g.x1 + 10, g.x2 - 10), y: g.y1, vx: 0, vy: 0, onGround: true, kind: 'hunter', t: 0 });
      }
    } else {
      const count = Math.min(8, 2 + wave);
      for (let i = 0; i < count; i++) {
        const kind = wave >= 4 && i % 3 === 0 ? 'shadow' : wave >= 2 && i % 2 === 0 ? 'hunter' : 'raider';
        spawnQueue.push(kind);
      }
    }
    spawnT = 600;
  }

  function newGame() {
    if (window.track) track('play:' + GAME_ID);
    demo = false;
    wave = 1;
    score = 0;
    nextLife = EXTRA_LIFE_EVERY;
    if (A.isTouch) players = 1;
    fx.clear();
    knights = [makeKnight(1)];
    if (players === 2) knights.push(makeKnight(2));
    startWave();
    shell.setState('ready');
    A.sound.play('start');
  }

  function showTitle() {
    demo = true;
    wave = 1 + Math.floor(Math.random() * 3);
    score = 0;
    fx.clear();
    knights = [makeKnight(1), makeKnight(2)];
    startWave();
    shell.setState('title');
  }

  function addScore(points, x, y, color = C.yellow) {
    if (demo) return;
    score += points;
    if (x !== undefined) fx.float(x, y, String(points), color);
    while (score >= nextLife) {
      nextLife += EXTRA_LIFE_EVERY;
      knights.forEach(k => { k.lives++; });
      fx.float(W / 2, HUD + 40, '1UP!', C.green);
      A.sound.play('powerup');
    }
  }

  // ---------- Flying ----------
  // Gravity pulls you down, each flap lifts you, and you steer with momentum. Ledges catch you from
  // above and bump you from below; the sides of the screen wrap around.

  function flap(r) {
    if (r.onGround) {
      r.onGround = false;
      r.y -= 2;
    }
    r.vy = Math.max(-MAX_RISE, r.vy - FLAP);
    r.wing = 160;
    if (r.slot) sfx('flap');
  }

  function fly(r, dir, dt) {
    if (r.onGround) {
      // Running along a ledge.
      const target = dir * RUN_MAX;
      r.vx += Math.sign(target - r.vx) * Math.min(Math.abs(target - r.vx), 0.0008 * dt);
      if (dir) r.run += dt;
      r.x = wrapX(r.x + r.vx * dt);
      const ground = world.groundAt(r.x, r.y - 4, 8);
      if (ground) r.y = ground.y;
      else r.onGround = false;
    } else {
      if (dir) r.vx = Math.max(-AIR_MAX, Math.min(AIR_MAX, r.vx + dir * AIR_ACCEL * dt));
      r.vy = Math.min(MAX_FALL, r.vy + GRAVITY * dt);
      const before = r.y;
      r.x = wrapX(r.x + r.vx * dt);
      r.y += r.vy * dt;
      if (r.y < CEILING) {
        r.y = CEILING;
        r.vy = Math.abs(r.vy) * 0.3;
      }
      if (r.vy > 0) {
        const ground = world.groundAt(r.x, before, r.y - before + 1);
        if (ground) {
          r.y = ground.y;
          r.vy = 0;
          r.onGround = true;
        }
      } else {
        // Head-butting the underside of a ledge bounces you back down.
        for (const g of LEDGES) {
          if (r.x >= g.x1 && r.x <= g.x2 && before - 26 >= g.y1 + 6 && r.y - 26 < g.y1 + 6) {
            r.y = g.y1 + 32;
            r.vy = Math.abs(r.vy) * 0.4;
          }
        }
      }
    }
    if (r.vx > 0.01) r.facing = 1;
    else if (r.vx < -0.01) r.facing = -1;
    if (r.wing > 0) r.wing -= dt;
  }

  // ---------- Controls ----------

  function knightControls(k, dt) {
    if (k.cpu) return cpuControls(k, dt);
    const split = players === 2;
    const down = a => (split ? input.isDownFor(a, k.slot) : input.isDown(a));
    const dir = (down('right') ? 1 : 0) - (down('left') ? 1 : 0);
    // Holding flap keeps flapping, a bit slower than tapping.
    let flapNow = false;
    if (down('up') || (!split && input.isDown('start'))) {
      if ((k.holdT -= dt) <= 0) {
        k.holdT = HOLD_FLAP_MS;
        flapNow = true;
      }
    } else k.holdT = 0;
    return { dir, flap: flapNow };
  }

  // CPU riders (enemies, and the knights in the demo): pick a height to be at, flap to get there,
  // head toward the target. Smarter ones aim above you.
  function cpuControls(r, dt) {
    if ((r.think -= dt) <= 0) {
      r.think = rand(300, 900);
      const foe = r.slot ? enemies[0] || null : nearestKnight(r);
      const smarts = r.slot ? 2 : ENEMY[r.kind].smarts;
      if (foe && (smarts > 0 || Math.random() < 0.4)) {
        r.targetY = foe.y - (smarts === 2 ? 34 : smarts === 1 ? rand(0, 24) : 0);
        r.wantDir = Math.sign(dxWrap(r.x, foe.x)) || 1;
      } else {
        r.targetY = rand(CEILING + 40, LAVA_Y - 80);
        if (Math.random() < 0.3) r.wantDir = -r.wantDir;
      }
      // Keep well clear of the lava.
      r.targetY = Math.min(r.targetY, LAVA_Y - 70);
    }
    const flapNow = r.y > r.targetY && r.vy > -0.1 && (r.flapT -= dt) <= 0;
    if (flapNow) r.flapT = r.slot ? 140 : 200 - (r.kind ? ENEMY[r.kind].smarts * 30 : 0);
    return { dir: r.wantDir, flap: flapNow || (r.onGround && Math.random() < dt / 600) };
  }

  function nearestKnight(r) {
    let best = null;
    for (const k of knights) {
      if (!k.alive || k.respawnT > 0) continue;
      if (!best || Math.abs(dxWrap(r.x, k.x)) + Math.abs(r.y - k.y) < Math.abs(dxWrap(r.x, best.x)) + Math.abs(r.y - best.y)) best = k;
    }
    return best;
  }

  // ---------- Jousts ----------

  const touching = (a, b) => Math.abs(dxWrap(a.x, b.x)) < 22 && Math.abs(a.y - b.y) < 22;

  function bounceApart(a, b) {
    const d = Math.sign(dxWrap(a.x, b.x)) || 1;
    a.vx = -d * 0.14;
    b.vx = d * 0.14;
    a.x = wrapX(a.x - d * 4);
    b.x = wrapX(b.x + d * 4);
    sfx('steel');
  }

  function joust() {
    for (const k of knights) {
      if (!k.alive || k.respawnT > 0) continue;
      for (const e of enemies) {
        if (e.dead || e.appear > 0 || !touching(k, e)) continue;
        const dy = k.y - e.y;
        if (Math.abs(dy) < 4 || k.safe > 0) {
          bounceApart(k, e);
          continue;
        }
        if (dy < 0) unseat(e, k);
        else knockOff(k);
      }
    }
    // Two players can joust each other too.
    if (knights.length === 2) {
      const [a, b] = knights;
      if (a.alive && b.alive && !a.respawnT && !b.respawnT && !a.safe && !b.safe && touching(a, b)) {
        const dy = a.y - b.y;
        if (Math.abs(dy) < 4 || demo) bounceApart(a, b);
        else knockOff(dy < 0 ? b : a);
      }
    }
    for (const e of enemies) {
      for (const o of enemies) {
        if (o === e || e.dead || o.dead || e.appear > 0 || o.appear > 0 || !touching(e, o)) continue;
        bounceApart(e, o);
      }
    }
    enemies = enemies.filter(e => !e.dead);
  }

  function unseat(e, k) {
    e.dead = true;
    const spec = ENEMY[e.kind];
    addScore(spec.points, e.x, e.y - 30, spec.color);
    fx.burst(e.x, e.y - 14, spec.color, 18, 0.18);
    sfx('steel');
    sfx('pop');
    eggs.push({ x: e.x, y: e.y - 10, vx: e.vx * 0.6, vy: -0.1, onGround: false, kind: UPGRADE[e.kind], t: 0 });
  }

  function knockOff(k, lava = false) {
    if (k.safe > 0 && !lava) return;
    fx.burst(k.x, k.y - 14, k.bird, 22, 0.2);
    sfx('die');
    shake = 8;
    k.lives--;
    k.eggStreak = 0;
    k.respawnT = RESPAWN_MS;
    if (teamWave) teamWave = false;
    if (demo) {
      k.lives = 3;
      return;
    }
    if (knights.every(o => o.lives <= 0)) shell.setState('dying');
    if (k.lives <= 0) k.alive = false;
  }

  // ---------- Eggs ----------

  function updateEggs(dt) {
    for (const egg of eggs) {
      if (egg.hatched) {
        // A hatchling waits a moment, then a bird swoops down and it rides off as a tougher enemy.
        if ((egg.hatchT -= dt) <= 0) {
          egg.gone = true;
          enemies.push({ ...makeEnemy(egg.kind, egg.x, 0), y: egg.y, onGround: true, appear: 0 });
          sfx('hatch');
        }
        continue;
      }
      if (!egg.onGround) {
        egg.vy = Math.min(MAX_FALL, egg.vy + GRAVITY * dt);
        const before = egg.y;
        egg.x = wrapX(egg.x + egg.vx * dt);
        egg.y += egg.vy * dt;
        const ground = world.groundAt(egg.x, before, egg.y - before + 1);
        if (ground && egg.vy > 0) {
          egg.y = ground.y;
          egg.onGround = true;
          egg.vy = 0;
        }
      } else {
        egg.vx *= Math.pow(0.97, dt / 16);
        egg.x = wrapX(egg.x + egg.vx * dt);
        if (!world.groundAt(egg.x, egg.y - 4, 8)) egg.onGround = false;
        if ((egg.t += dt) >= HATCH_MS) {
          egg.hatched = true;
          egg.hatchT = 1800;
        }
      }
      if (egg.y > LAVA_Y) egg.gone = true;
      for (const k of knights) {
        if (!k.alive || k.respawnT > 0 || egg.gone || egg.hatched) continue;
        if (Math.abs(dxWrap(k.x, egg.x)) < 16 && Math.abs(k.y - egg.y) < 22) {
          egg.gone = true;
          const points = EGG_POINTS[Math.min(EGG_POINTS.length - 1, k.eggStreak)] + (egg.onGround ? 0 : 500);
          k.eggStreak++;
          addScore(points, egg.x, egg.y - 20, C.text);
          sfx('chime');
        }
      }
    }
    eggs = eggs.filter(e => !e.gone);
  }

  // ---------- The Lava Hand and the Skywyrm ----------

  function updateHazards(dt) {
    // The hand reaches for anyone flying low over the lava at the sides, from wave 2.
    if (wave >= 2) {
      if (!hand) {
        const victim = knights.concat(enemies).find(r => (r.alive !== false && !r.respawnT) && !r.onGround && r.y > LAVA_Y - 34 && (r.x < 60 || r.x > 420));
        if (victim && Math.random() < dt / 400) hand = { x: victim.x, y: LAVA_Y + 30, victim, t: 0 };
      } else {
        hand.t += dt;
        hand.y = LAVA_Y + 30 - Math.min(1, hand.t / 300) * 50;
        const v = hand.victim;
        if (Math.abs(dxWrap(hand.x, v.x)) < 18 && Math.abs(v.y - hand.y) < 26 && hand.t > 250) {
          hand.grab = true;
          v.vy = 0.2;
          v.vx = 0;
        }
        if (hand.grab) {
          v.y += 0.12 * dt;
          v.x = hand.x;
        }
        if (hand.t > 1400) hand = null;
      }
    }
    // The Skywyrm shows up if a wave is taking too long.
    if (!wyrm && waveT > WYRM_AFTER_MS && enemies.length) {
      const left = Math.random() < 0.5;
      wyrm = { x: left ? -40 : W + 40, y: rand(CEILING + 60, LAVA_Y - 120), vx: left ? 0.2 : -0.2, t: 0 };
      sfx('alarm');
    }
    if (wyrm) {
      wyrm.t += dt;
      wyrm.x += wyrm.vx * dt;
      wyrm.y += Math.sin(wyrm.t / 300) * 0.05 * dt;
      if (wyrm.x < -60 || wyrm.x > W + 60) {
        wyrm.x = wyrm.vx > 0 ? -40 : W + 40;
        wyrm.y = rand(CEILING + 60, LAVA_Y - 120);
      }
      for (const k of knights) {
        if (!k.alive || k.respawnT > 0 || k.safe > 0) continue;
        if (Math.abs(k.x - wyrm.x) < 24 && Math.abs(k.y - 12 - wyrm.y) < 16) {
          // Only a head-on hit right in its open mouth beats it.
          const headOn = Math.sign(k.facing) === -Math.sign(wyrm.vx) && Math.abs(k.y - 12 - wyrm.y) < 6;
          if (headOn) {
            addScore(1000, wyrm.x, wyrm.y - 20, C.green);
            fx.burst(wyrm.x, wyrm.y, C.green, 30, 0.22);
            sfx('kaboom');
            wyrm = null;
            waveT = 0;
            break;
          }
          knockOff(k);
        }
      }
    }
  }

  // ---------- Input ----------

  input.on((action, player) => {
    if (shell.state === 'title' && (action === 'down' || action === 'left' || action === 'right') && !A.isTouch) {
      players = players === 1 ? 2 : 1;
      A.sound.play('select');
      return;
    }
    if (shell.state === 'title' && action === 'up' && !A.isTouch) {
      players = players === 1 ? 2 : 1;
      A.sound.play('select');
      return;
    }
    if (shell.handle(action)) return;
    if (shell.state !== 'playing') return;
    // A tap of flap flaps right away.
    if (action === 'up' || action === 'start' || action === 'tap') {
      const k = players === 2 ? knights.find(o => o.slot === player) : knights[0];
      if (k && k.alive && !k.respawnT) {
        flap(k);
        k.holdT = HOLD_FLAP_MS;
      }
    }
  });

  // ---------- Update ----------

  function updateWorld(dt) {
    waveT += dt;
    for (const k of knights) {
      if (!k.alive) continue;
      if (k.respawnT > 0) {
        if ((k.respawnT -= dt) <= 0) {
          Object.assign(k, { x: k.slot === 1 ? 200 : 280, y: LEDGES[0].y1, vx: 0, vy: 0, onGround: true, safe: SAFE_MS });
        }
        continue;
      }
      if (k.safe > 0) k.safe -= dt;
      const ctl = knightControls(k, dt);
      if (ctl.flap) flap(k);
      fly(k, ctl.dir, dt);
      if (k.y > LAVA_Y) knockOff(k, true);
    }
    if (spawnQueue.length && (spawnT -= dt) <= 0) {
      spawnT = 900;
      const [x, ledge] = pick(SPAWNS);
      enemies.push(makeEnemy(spawnQueue.shift(), x, ledge));
    }
    for (const e of enemies) {
      if (e.appear > 0) {
        e.appear -= dt;
        continue;
      }
      const ctl = cpuControls(e, dt);
      if (ctl.flap) flap(e);
      const speedUp = 1 + (wave - 1) * 0.04;
      fly(e, ctl.dir * speedUp, dt);
      if (e.y > LAVA_Y) e.dead = true;
    }
    enemies = enemies.filter(e => !e.dead);
    updateEggs(dt);
    updateHazards(dt);
    joust();
    if (shell.state !== 'playing' && shell.state !== 'title') return;
    if (!enemies.length && !eggs.length && !spawnQueue.length) {
      if (demo) {
        wave = wave % 4 + 1;
        startWave();
        return;
      }
      if (teamWave) {
        addScore(3000, W / 2, HUD + 70, C.green);
        fx.float(W / 2, HUD + 90, 'TEAM BONUS!', C.green);
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
    else if (st === 'dying' && shell.stateTime >= DYING_MS) shell.gameOver(score, 'WAVE ' + wave);
    else if (st === 'clear' && shell.stateTime >= CLEAR_MS) {
      wave++;
      startWave();
      shell.setState('ready');
    }
  }

  // ---------- Render ----------

  function drawScene() {
    // Lava with a rolling glow
    ctx.save();
    ctx.fillStyle = '#ff5a1f';
    ctx.shadowColor = '#ff9f1c';
    ctx.shadowBlur = 16;
    ctx.fillRect(0, LAVA_Y, W, H - LAVA_Y);
    ctx.shadowBlur = 0;
    ctx.fillStyle = C.yellow;
    for (let x = 0; x < W; x += 24) {
      const y = LAVA_Y + 4 + Math.sin(shell.clock / 300 + x / 30) * 3;
      ctx.fillRect(x + ((shell.clock / 40) % 24), y, 10, 2);
    }
    ctx.restore();
    for (const g of LEDGES) {
      ctx.fillStyle = '#2a1f5c';
      ctx.fillRect(g.x1, g.y1, g.x2 - g.x1, 12);
      ctx.fillStyle = '#5a4ab0';
      ctx.fillRect(g.x1 + 4, g.y1 + 12, g.x2 - g.x1 - 8, 4);
      ctx.save();
      ctx.fillStyle = C.cyan;
      ctx.shadowColor = C.cyan;
      ctx.shadowBlur = 8;
      ctx.fillRect(g.x1, g.y1 - 1, g.x2 - g.x1, 2);
      ctx.restore();
    }
  }

  // A runner bird: round body, long neck, beak, wings that beat on each flap, legs that run on ledges.
  function drawBird(r, color) {
    const f = r.facing;
    const x = r.x;
    const y = r.y;
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    // legs
    if (r.onGround) {
      const s = Math.sin(r.run / 60) * 4;
      ctx.beginPath();
      ctx.moveTo(x - 2, y - 10);
      ctx.lineTo(x - 2 + s, y);
      ctx.moveTo(x + 2, y - 10);
      ctx.lineTo(x + 2 - s, y);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x, y - 10);
      ctx.lineTo(x - f * 6, y - 4);
      ctx.stroke();
    }
    // body
    ctx.beginPath();
    ctx.ellipse(x, y - 14, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // neck and head
    ctx.beginPath();
    ctx.moveTo(x + f * 6, y - 17);
    ctx.lineTo(x + f * 11, y - 26);
    ctx.stroke();
    ctx.fillRect(x + f * 11 - 3, y - 30, 6, 5);
    ctx.fillStyle = '#ff9f1c';
    ctx.fillRect(x + f * 14 - (f < 0 ? 4 : 0), y - 28, 4, 2);
    // wing
    const up = r.wing > 0 || (!r.onGround && Math.floor(shell.clock / 120) % 2 === 0 && r.vy < 0);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - f * 2, y - 16);
    ctx.lineTo(x - f * 14, up ? y - 30 : y - 8);
    ctx.lineTo(x - f * 8, y - 14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawLance(r, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(r.x - r.facing * 2, r.y - 28);
    ctx.lineTo(r.x + r.facing * 16, r.y - 32);
    ctx.stroke();
    ctx.restore();
  }

  function drawRiders() {
    for (const k of knights) {
      if (!k.alive || k.respawnT > 0) continue;
      if (k.safe > 0 && blink(100)) continue;
      drawBird(k, k.bird);
      const frames = hero(k.name);
      if (frames) A.drawSprite(ctx, frames.stand, k.x - k.facing, k.y - 30, { flip: k.facing < 0, scale: 0.9 });
      drawLance(k, C.text);
      if (players === 2 && !demo) A.text(ctx, 'P' + k.slot, k.x, k.y - 50, { size: 7, color: k.bird });
    }
    for (const e of enemies) {
      if (e.appear > 0) {
        // Materialising: a flickering outline
        if (blink(80)) {
          ctx.strokeStyle = ENEMY[e.kind].color;
          ctx.strokeRect(e.x - 10, e.y - 34, 20, 34);
        }
        continue;
      }
      drawBird(e, '#7a3a8f');
      A.drawSprite(ctx, KNIGHTS[e.kind], e.x, e.y - 30, { flip: e.facing < 0 });
      drawLance(e, ENEMY[e.kind].color);
    }
    for (const egg of eggs) {
      ctx.save();
      if (egg.hatched) {
        // A little hatchling waving for its ride.
        ctx.fillStyle = ENEMY[egg.kind].color;
        ctx.fillRect(egg.x - 3, egg.y - 12 - (blink(150) ? 2 : 0), 6, 10);
      } else {
        ctx.fillStyle = egg.t > HATCH_MS - 1500 && blink(100) ? ENEMY[egg.kind].color : C.text;
        ctx.shadowColor = C.text;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.ellipse(egg.x, egg.y - 6, 5, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawHazards() {
    if (hand) {
      ctx.save();
      ctx.fillStyle = '#ff5a1f';
      ctx.shadowColor = '#ff9f1c';
      ctx.shadowBlur = 10;
      ctx.fillRect(hand.x - 6, hand.y, 12, LAVA_Y + 30 - hand.y);
      for (let k = 0; k < 4; k++) ctx.fillRect(hand.x - 8 + k * 5, hand.y - 8, 3, 9);
      ctx.restore();
    }
    if (wyrm) {
      const f = Math.sign(wyrm.vx);
      ctx.save();
      ctx.fillStyle = C.green;
      ctx.shadowColor = C.green;
      ctx.shadowBlur = 10;
      for (let k = 5; k >= 0; k--) {
        const sx = wyrm.x - f * k * 10;
        const sy = wyrm.y + Math.sin(wyrm.t / 120 - k) * 4;
        ctx.beginPath();
        ctx.arc(sx, sy, 7 - k * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      // head with an opening and closing mouth
      const open = Math.abs(Math.sin(wyrm.t / 150)) * 6;
      ctx.fillRect(wyrm.x + f * 2, wyrm.y - 6 - open / 2, f * 14, 5);
      ctx.fillRect(wyrm.x + f * 2, wyrm.y + 1 + open / 2, f * 14, 5);
      ctx.shadowBlur = 0;
      ctx.fillStyle = C.red;
      ctx.fillRect(wyrm.x + f * 6, wyrm.y - 5 - open / 2, 3, 3);
      ctx.restore();
    }
  }

  function drawMessages() {
    const cx = W / 2;
    const cy = H / 2 - 40;
    const st = shell.state;
    if (st === 'title') {
      if (!A.isTouch) {
        const one = players === 1;
        A.text(ctx, (one ? '> ' : '  ') + '1 PLAYER' + (one ? ' <' : '  ') + '    ' + (one ? '  ' : '> ') + '2 PLAYERS' + (one ? '  ' : ' <'), cx, 414, { size: 9, color: C.yellow });
        A.text(ctx, 'ARROWS TO PICK', cx, 434, { size: 7, color: C.dim });
      }
    } else if (st === 'ready') {
      A.text(ctx, 'WAVE ' + wave, cx, cy, { size: 18, color: C.cyan, glow: 12 });
      const sub = wave % 5 === 0 ? 'EGG WAVE!' : teamWave ? 'TEAM WAVE - NOBODY FALL!' : 'PREPARE TO JOUST';
      if (blink(150)) A.text(ctx, sub, cx, cy + 28, { size: 9, color: C.yellow });
    } else if (st === 'clear') {
      A.text(ctx, 'WAVE CLEAR!', cx, cy, { size: 18, color: C.green, glow: 12 });
    } else if (st === 'dying') {
      A.text(ctx, 'GAME OVER', cx, cy, { size: 18, color: C.red, glow: 12 });
    }
    if (!demo && st !== 'title') {
      knights.forEach((k, i) => {
        const x = i === 0 ? 16 : W - 16;
        const align = i === 0 ? 'left' : 'right';
        A.text(ctx, (players === 2 ? 'P' + k.slot + ' ' : '') + 'LIVES ' + Math.max(0, k.lives), x, HUD + 14, { size: 7, color: k.bird, align });
      });
    }
  }

  function render() {
    ctx.save();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    shell.drawHud(score, wave);
    drawScene();
    drawHazards();
    drawRiders();
    fx.draw(ctx);
    shell.drawOverlay();
    drawMessages();
    ctx.restore();
  }

  showTitle();
  A.waitForFont().then(() => A.startLoop({ update, render }));
})();
