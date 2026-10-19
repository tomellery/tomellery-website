/*
 * Rock Blaster: the twelfth game in the Neon Arcade, in glowing vector lines.
 * Rotate, thrust and drift through space, blasting rocks that split into smaller, faster rocks.
 * Saucers drop in to shoot at you; hyperspace is the panic button.
 * Play states: ready -> playing <-> paused, dying. The shell runs title, pause, initials and game over.
 */
(function () {
  'use strict';

  const A = window.Arcade;
  const C = A.COLORS;
  const V = A.vector;

  const GAME_ID = 'rocks';
  const W = 480;
  const H = 600;
  const HUD = 48;
  const FOOT = 40;
  const FW = W; // the playfield, below the HUD and above the footer
  const FH = H - HUD - FOOT;

  const START_LIVES = 3;
  const EXTRA_LIFE_EVERY = 10000;
  const READY_MS = 1500;
  const DYING_MS = 2200;
  const SAFE_MS = 2200;
  const WAVE_GAP_MS = 2000;

  const TURN = 0.0048; // radians per ms
  const THRUST = 0.00032; // px per ms per ms
  const MAX_SPEED = 0.36;
  const COAST = 0.993;
  const SHOT_SPEED = 0.55;
  const SHOT_MS = 900;
  const MAX_SHOTS = 4;
  const AUTOFIRE_MS = 240;
  const HYPER_MS = 450;

  const ROCK = {
    3: { r: 34, points: 20, speed: [0.025, 0.055] },
    2: { r: 19, points: 50, speed: [0.045, 0.085] },
    1: { r: 10, points: 100, speed: [0.075, 0.125] },
  };
  const SAUCER = {
    big: { r: 14, points: 200, speed: 0.085, aim: 0, color: C.pink },
    small: { r: 8, points: 1000, speed: 0.12, aim: 1, color: C.yellow },
  };
  const SAUCER_SHOT_SPEED = 0.3;
  const SAUCER_SHOT_MS = 1300;

  const SHIP = [[11, 0], [-8, -7], [-4, 0], [-8, 7]];
  const FLAME = [[-5, -3], [-12, 0], [-5, 3]];
  const SAUCER_SHAPE = [[-14, 0], [-6, -5], [6, -5], [14, 0], [6, 5], [-6, 5], [-14, 0], [14, 0], [6, -5], [3, -10], [-3, -10], [-6, -5]];

  // ---------- State ----------

  const canvas = document.getElementById('game');
  const { ctx } = A.createScreen(canvas, W, H);
  const input = A.createInput({ swipeTarget: canvas });
  const fx = A.createEffects();

  let demo = true;
  let wave = 1;
  let score = 0;
  let lives = START_LIVES;
  let nextLife = EXTRA_LIFE_EVERY;
  let ship, rocks, shots, saucer, saucerShots, debris;
  let saucerT = 0;
  let waveT = 0;
  let demoT = 0;
  let beatT = 0;
  let beatAlt = 0;
  let fireT = 0;
  let thrustSoundT = 0;
  let warbleT = 0;
  let banner = null;
  let shake = 0;

  const shell = A.createShell({
    ctx, width: W, height: H, id: GAME_ID,
    title: ['ROCK', 'BLASTER'],
    howTo: [
      ['BLAST ROCKS - THEY SPLIT!', C.text],
      ['SMALL ROCKS SCORE MOST', C.cyan],
      ['SAUCERS SHOOT BACK', C.pink],
      [A.isTouch ? 'SWIPE DOWN: HYPERSPACE' : 'DOWN ARROW: HYPERSPACE', C.yellow],
      [A.isTouch ? 'BUTTONS TURN, THRUST, FIRE' : 'ARROWS FLY - SPACE FIRES', C.dim],
    ],
    hudLabel: 'WAVE',
    newGame, showTitle,
  });

  const rand = (a, b) => a + Math.random() * (b - a);
  const sfx = (name, arg) => { if (!demo) A.sound.play(name, arg); };
  const blink = (ms = 500) => Math.floor(shell.clock / ms) % 2 === 0;
  const wrapDist = (a, b) => {
    const dx = Math.min(Math.abs(a.x - b.x), FW - Math.abs(a.x - b.x));
    const dy = Math.min(Math.abs(a.y - b.y), FH - Math.abs(a.y - b.y));
    return Math.hypot(dx, dy);
  };

  // ---------- Setup ----------

  function makeShip() {
    return { x: FW / 2, y: FH / 2, vx: 0, vy: 0, r: 8, angle: -Math.PI / 2, thrusting: false, safe: SAFE_MS, hyper: 0 };
  }

  function makeRock(size, x, y) {
    const spec = ROCK[size];
    const rock = { size, x, y, vx: 0, vy: 0, r: spec.r, spin: rand(-0.0015, 0.0015), angle: 0, shape: V.rock(spec.r, size === 1 ? 8 : 11) };
    V.push(rock, rand(0, Math.PI * 2), rand(...spec.speed) * (1 + (wave - 1) * 0.04));
    return rock;
  }

  // A wave's big rocks start at the edges, never on top of the ship.
  function spawnWave() {
    const count = Math.min(11, 4 + (wave - 1) * 2);
    for (let i = 0; i < count; i++) {
      let x;
      let y;
      do {
        if (Math.random() < 0.5) {
          x = rand(0, FW);
          y = Math.random() < 0.5 ? 0 : FH;
        } else {
          x = Math.random() < 0.5 ? 0 : FW;
          y = rand(0, FH);
        }
      } while (ship && Math.hypot(x - ship.x, y - ship.y) < 140);
      rocks.push(makeRock(3, x, y));
    }
    banner = { text: 'WAVE ' + wave, t: 0 };
  }

  function resetField() {
    ship = makeShip();
    rocks = [];
    shots = [];
    saucer = null;
    saucerShots = [];
    debris = [];
    saucerT = rand(9000, 15000);
    waveT = 0;
    spawnWave();
  }

  function newGame() {
    if (window.track) track('play:' + GAME_ID);
    demo = false;
    wave = 1;
    score = 0;
    lives = START_LIVES;
    nextLife = EXTRA_LIFE_EVERY;
    fx.clear();
    resetField();
    shell.setState('ready');
    A.sound.play('start');
  }

  function showTitle() {
    demo = true;
    wave = 1;
    score = 0;
    fx.clear();
    resetField();
    shell.setState('title');
  }

  function addScore(points) {
    if (demo) return;
    score += points;
    if (score >= nextLife) {
      nextLife += EXTRA_LIFE_EVERY;
      lives++;
      fx.float(W / 2, HUD + 40, '1UP!', C.green);
      A.sound.play('powerup');
    }
  }

  // ---------- Ship ----------

  function fire() {
    if (!ship || ship.hyper > 0 || shots.length >= MAX_SHOTS) return;
    const shot = { x: ship.x + Math.cos(ship.angle) * 11, y: ship.y + Math.sin(ship.angle) * 11, vx: ship.vx, vy: ship.vy, r: 2, life: SHOT_MS };
    V.push(shot, ship.angle, SHOT_SPEED);
    shots.push(shot);
    sfx('shoot');
  }

  function hyperspace() {
    if (!ship || ship.hyper > 0) return;
    ship.hyper = HYPER_MS;
    fx.burst(ship.x, HUD + ship.y, C.cyan, 12, 0.15);
    sfx('warp');
  }

  function updateShip(dt) {
    if (ship.hyper > 0) {
      // Gone for a moment, then back somewhere random (maybe somewhere worse).
      if ((ship.hyper -= dt) <= 0) {
        ship.x = rand(20, FW - 20);
        ship.y = rand(20, FH - 20);
        ship.vx = 0;
        ship.vy = 0;
        fx.burst(ship.x, HUD + ship.y, C.cyan, 12, 0.15);
      }
      return;
    }
    if (ship.safe > 0) ship.safe -= dt;
    const ctl = demo ? demoControls() : { left: input.isDown('left'), right: input.isDown('right'), thrust: input.isDown('up'), fire: input.isDown('start') };
    if (ctl.left) ship.angle -= TURN * dt;
    if (ctl.right) ship.angle += TURN * dt;
    ship.thrusting = ctl.thrust;
    if (ctl.thrust) {
      V.push(ship, ship.angle, THRUST * dt);
      V.limit(ship, MAX_SPEED);
      if ((thrustSoundT -= dt) <= 0) {
        thrustSoundT = 110;
        sfx('thrust');
      }
    }
    V.drag(ship, COAST, dt);
    V.move(ship, dt);
    V.wrap(ship, FW, FH);
    // Holding fire keeps shooting, a little slower than tapping.
    if (ctl.fire) {
      if ((fireT -= dt) <= 0) {
        fire();
        fireT = AUTOFIRE_MS;
      }
    } else {
      fireT = 0;
    }
    if (ctl.hyper) hyperspace();
  }

  function killShip() {
    if (!ship) return;
    shatter(ship.x, ship.y, SHIP, ship.angle, C.cyan, 1.4);
    fx.burst(ship.x, HUD + ship.y, C.cyan, 26, 0.2);
    sfx('boom');
    sfx('die');
    shake = 10;
    ship = null;
    if (demo) return;
    lives--;
    shell.setState('dying');
  }

  // ---------- Rocks and saucers ----------

  // A destroyed shape flies apart as loose glowing line segments.
  function shatter(x, y, shape, angle, color, scale = 1) {
    for (let i = 0; i < shape.length; i++) {
      const a = shape[i];
      const b = shape[(i + 1) % shape.length];
      const piece = { x, y, vx: 0, vy: 0, angle, spin: rand(-0.006, 0.006), life: 900, max: 900, color,
        line: [[a[0] * scale, a[1] * scale], [b[0] * scale, b[1] * scale]] };
      V.push(piece, Math.atan2(a[1] + b[1], a[0] + b[0]) + angle, rand(0.03, 0.09));
      debris.push(piece);
    }
  }

  function breakRock(rock, byPlayer) {
    rock.dead = true;
    if (byPlayer) {
      addScore(ROCK[rock.size].points);
    }
    shatter(rock.x, rock.y, rock.shape, rock.angle, C.text, 0.5);
    fx.burst(rock.x, HUD + rock.y, C.text, 6 + rock.size * 4, 0.1);
    sfx('boom');
    if (rock.size > 1) for (let i = 0; i < 2; i++) rocks.push(makeRock(rock.size - 1, rock.x, rock.y));
  }

  // Small saucers show up more as the score climbs, and aim better.
  function spawnSaucer() {
    const small = score > 40000 || Math.random() < Math.min(0.8, 0.15 + score / 30000);
    const kind = small ? 'small' : 'big';
    const fromLeft = Math.random() < 0.5;
    saucer = { kind, x: fromLeft ? -16 : FW + 16, y: rand(40, FH - 40), vx: (fromLeft ? 1 : -1) * SAUCER[kind].speed, vy: 0, r: SAUCER[kind].r, shotT: 900, turnT: 1200 };
  }

  function updateSaucer(dt) {
    if (!saucer) {
      if (rocks.length && (saucerT -= dt) <= 0) spawnSaucer();
      return;
    }
    const spec = SAUCER[saucer.kind];
    if ((saucer.turnT -= dt) <= 0) {
      saucer.turnT = rand(800, 1600);
      saucer.vy = [-1, 0, 1][Math.floor(Math.random() * 3)] * spec.speed * 0.7;
    }
    V.move(saucer, dt);
    if (saucer.y < 0) saucer.y += FH;
    else if (saucer.y > FH) saucer.y -= FH;
    if ((warbleT -= dt) <= 0) {
      warbleT = 260;
      sfx('saucer', saucer.kind === 'small' ? 1 : 0);
    }
    if ((saucer.shotT -= dt) <= 0) {
      saucer.shotT = saucer.kind === 'small' ? 900 : 1200;
      // Big saucers spray at random; small ones aim at you, closer the higher your score.
      let angle = rand(0, Math.PI * 2);
      if (ship && spec.aim) {
        const spread = Math.max(0.08, 0.6 - score / 50000);
        angle = Math.atan2(ship.y - saucer.y, ship.x - saucer.x) + rand(-spread, spread);
      }
      const shot = { x: saucer.x, y: saucer.y, vx: 0, vy: 0, r: 2, life: SAUCER_SHOT_MS };
      V.push(shot, angle, SAUCER_SHOT_SPEED);
      saucerShots.push(shot);
      sfx('shoot');
    }
    if (saucer.x < -30 || saucer.x > FW + 30) endSaucer();
  }

  function endSaucer(destroyed, byPlayer) {
    if (destroyed) {
      const spec = SAUCER[saucer.kind];
      if (byPlayer) {
        addScore(spec.points);
        fx.float(saucer.x, HUD + saucer.y - 14, String(spec.points), spec.color);
      }
      shatter(saucer.x, saucer.y, SAUCER_SHAPE, 0, spec.color, saucer.kind === 'small' ? 0.6 : 1);
      fx.burst(saucer.x, HUD + saucer.y, spec.color, 22, 0.18);
      sfx('boom');
    }
    saucer = null;
    saucerT = rand(10000, 18000) * Math.max(0.5, 1 - wave * 0.05);
  }

  // ---------- Collisions ----------

  function collide() {
    for (const shot of shots) {
      for (const rock of rocks) {
        if (!rock.dead && !shot.dead && V.hit(shot, rock)) {
          shot.dead = true;
          breakRock(rock, true);
        }
      }
      if (saucer && !shot.dead && V.hit(shot, saucer)) {
        shot.dead = true;
        endSaucer(true, true);
      }
    }
    for (const shot of saucerShots) {
      for (const rock of rocks) {
        if (!rock.dead && !shot.dead && V.hit(shot, rock)) {
          shot.dead = true;
          breakRock(rock, false);
        }
      }
    }
    if (saucer) {
      for (const rock of rocks) {
        if (!rock.dead && saucer && V.hit(saucer, rock)) {
          breakRock(rock, false);
          endSaucer(true, false);
        }
      }
    }
    if (ship && ship.safe <= 0 && ship.hyper <= 0) {
      for (const rock of rocks) {
        if (!rock.dead && V.hit(ship, rock)) {
          breakRock(rock, true);
          killShip();
          break;
        }
      }
      if (ship && saucer && V.hit(ship, saucer)) {
        endSaucer(true, true);
        killShip();
      }
      if (ship) {
        for (const shot of saucerShots) {
          if (!shot.dead && V.hit(ship, shot)) {
            shot.dead = true;
            killShip();
            break;
          }
        }
      }
    }
    rocks = rocks.filter(r => !r.dead);
    shots = shots.filter(s => !s.dead);
    saucerShots = saucerShots.filter(s => !s.dead);
  }

  // ---------- Attract-mode AI ----------
  // The CPU ship turns toward the nearest rock (leading it a little), fires when lined up,
  // and thrusts away when something gets too close.

  function demoControls() {
    const ctl = { left: false, right: false, thrust: false, fire: false, hyper: false };
    let target = saucer;
    let best = Infinity;
    for (const rock of rocks) {
      const d = Math.hypot(rock.x - ship.x, rock.y - ship.y);
      if (d < best) {
        best = d;
        if (!saucer || d < 120) target = rock;
      }
    }
    if (!target) return ctl;
    const lead = Math.hypot(target.x - ship.x, target.y - ship.y) / SHOT_SPEED;
    const tx = target.x + target.vx * lead;
    const ty = target.y + target.vy * lead;
    let diff = Math.atan2(ty - ship.y, tx - ship.x) - ship.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if (diff < -0.05) ctl.left = true;
    else if (diff > 0.05) ctl.right = true;
    ctl.fire = Math.abs(diff) < 0.18;
    const danger = rocks.some(r => Math.hypot(r.x - ship.x, r.y - ship.y) < r.r + 45);
    if (danger && Math.abs(diff) > 2) ctl.thrust = true;
    return ctl;
  }

  // ---------- Input ----------

  input.on(action => {
    if (shell.handle(action)) return;
    if (shell.state !== 'playing') return;
    if (action === 'down') hyperspace();
    else if (action === 'start' || action === 'tap') {
      fire();
      fireT = AUTOFIRE_MS;
    }
  });

  // ---------- Update ----------

  function updateWorld(dt) {
    if (ship) updateShip(dt);
    for (const rock of rocks) {
      V.move(rock, dt);
      V.wrap(rock, FW, FH, rock.r);
      rock.angle += rock.spin * dt;
    }
    for (const list of [shots, saucerShots]) {
      for (const s of list) {
        V.move(s, dt);
        V.wrap(s, FW, FH);
        if ((s.life -= dt) <= 0) s.dead = true;
      }
    }
    updateSaucer(dt);
    collide();

    // Wave cleared: a short breather, then the next, bigger wave.
    if (!rocks.length && !saucer) {
      if ((waveT += dt) >= WAVE_GAP_MS) {
        waveT = 0;
        wave++;
        if (demo && wave > 3) wave = 1;
        spawnWave();
        sfx('levelup');
      }
    }

    // The heartbeat quickens as the rocks thin out.
    if (shell.state === 'playing' && rocks.length) {
      const big = rocks.reduce((sum, r) => sum + r.size, 0);
      const gap = Math.max(240, Math.min(1000, 200 + big * 45));
      if ((beatT -= dt) <= 0) {
        beatT = gap;
        sfx('beat', (beatAlt ^= 1));
      }
    }
  }

  function updateDebris(dt) {
    for (const d of debris) {
      V.move(d, dt);
      d.angle += d.spin * dt;
      d.life -= dt;
    }
    debris = debris.filter(d => d.life > 0);
    if (banner && (banner.t += dt) > 1800) banner = null;
  }

  function update(dt) {
    shell.update(dt);
    fx.update(dt);
    updateDebris(dt);
    shake = Math.max(0, shake - dt * 0.02);
    const st = shell.state;

    if (st === 'title') {
      updateWorld(dt);
      if (ship) demoT = 0;
      else if ((demoT += dt) > 2000) showTitle();
    } else if (st === 'ready') {
      if (shell.stateTime >= READY_MS) shell.setState('playing');
    } else if (st === 'playing') {
      updateWorld(dt);
    } else if (st === 'dying') {
      updateWorld(dt);
      if (shell.stateTime >= DYING_MS) {
        if (lives <= 0) {
          shell.gameOver(score, 'WAVE ' + wave);
          return;
        }
        // Come back in the middle once it's clear.
        const clear = !rocks.some(r => Math.hypot(r.x - FW / 2, r.y - FH / 2) < r.r + 70) && !saucer;
        if (clear || shell.stateTime > DYING_MS + 4000) {
          ship = makeShip();
          shell.setState('playing');
        }
      }
    }
  }

  // ---------- Render ----------

  function drawShip(x, y, angle, scale = 1) {
    V.draw(ctx, SHIP, x, y, { angle, scale, color: C.cyan, width: 1.6, glow: 10 });
  }

  function drawField() {
    for (const rock of rocks) V.draw(ctx, rock.shape, rock.x, rock.y, { angle: rock.angle, color: C.text, width: 1.4, glow: 6 });
    for (const s of shots) {
      ctx.fillStyle = C.cyan;
      ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
    }
    for (const s of saucerShots) {
      ctx.fillStyle = C.pink;
      ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
    }
    if (saucer) {
      const spec = SAUCER[saucer.kind];
      V.draw(ctx, SAUCER_SHAPE, saucer.x, saucer.y, { scale: saucer.kind === 'small' ? 0.6 : 1, color: spec.color, width: 1.4, glow: 10, closed: false });
    }
    for (const d of debris) {
      ctx.globalAlpha = d.life / d.max;
      V.draw(ctx, d.line, d.x, d.y, { angle: d.angle, color: d.color, width: 1.3, glow: 4, closed: false });
    }
    ctx.globalAlpha = 1;
    if (ship && ship.hyper <= 0 && !(ship.safe > 0 && blink(100))) {
      drawShip(ship.x, ship.y, ship.angle);
      if (ship.thrusting && blink(60)) V.draw(ctx, FLAME, ship.x, ship.y, { angle: ship.angle, color: C.yellow, width: 1.4, glow: 8, closed: false });
    }
  }

  function drawFooter() {
    const y = H - FOOT;
    ctx.fillStyle = 'rgba(41, 240, 255, 0.6)';
    ctx.fillRect(0, y, W, 2);
    if (demo) return;
    const spare = Math.max(0, lives - (shell.state === 'dying' ? 0 : 1));
    for (let i = 0; i < Math.min(spare, 8); i++) drawShip(20 + i * 20, y + 20, -Math.PI / 2, 0.7);
  }

  function drawMessages() {
    const cx = W / 2;
    const cy = HUD + FH / 2;
    const st = shell.state;
    if (st === 'ready') {
      if (blink(150)) A.text(ctx, 'GET READY', cx, cy - 50, { size: 18, color: C.yellow, glow: 12 });
    } else if (st === 'dying' && shell.stateTime > 700 && lives > 0) {
      A.text(ctx, lives === 1 ? 'LAST SHIP!' : lives + ' SHIPS LEFT', cx, cy - 50, { size: 12, color: C.yellow, glow: 10 });
    } else if (banner && st === 'playing') {
      ctx.globalAlpha = 1 - banner.t / 1800;
      A.text(ctx, banner.text, cx, cy - 50, { size: 18, color: C.cyan, glow: 12 });
      ctx.globalAlpha = 1;
    }
  }

  function render() {
    ctx.save();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    shell.drawHud(score, wave);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HUD, W, FH);
    ctx.clip();
    ctx.translate(0, HUD);
    drawField();
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
