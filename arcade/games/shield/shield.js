/*
 * Sky Shield: a Neon Arcade game. Missiles rain down on six cities; fire interceptors from three bases
 * and catch them in expanding blasts. Blasts set off more blasts, so chain reactions score big.
 * Play states: ready (wave intro) -> playing <-> paused, tally (end-of-wave bonus), dying (last city
 * gone). The shell runs title, pause, initials and game over.
 */
(function () {
  'use strict';

  const A = window.Arcade;
  const C = A.COLORS;

  const GAME_ID = 'shield';
  const W = 480;
  const H = 600;
  const HUD = 48;
  const GROUND = H - 64; // top of the ground strip
  const SKY_TOP = HUD + 4;

  const READY_MS = 1800;
  const DYING_MS = 3000;
  const TALLY_STEP_MS = 45;
  const AMMO = 10;
  const BONUS_CITY_EVERY = 10000;
  const MY_SPEED = 0.5; // px per ms; the middle base fires faster
  const MY_BLAST = 34;
  const ENEMY_BLAST = 22;
  const CURSOR_SPEED = 0.42;

  const BASES = [40, 240, 440];
  const CITIES = [96, 144, 190, 290, 336, 384];
  const POINTS = { missile: 25, split: 25, bomber: 100, seeker: 125 };

  // The sky, ground and missile colours change every two waves.
  const PALETTES = [
    { ground: '#c79a1a', enemy: '#ff3b3b', mine: C.cyan, city: C.cyan, sky: '#07060f' },
    { ground: '#2bcf63', enemy: C.yellow, mine: C.pink, city: '#b26bff', sky: '#0b0620' },
    { ground: C.pink, enemy: C.green, mine: C.yellow, city: C.cyan, sky: '#06121c' },
    { ground: C.cyan, enemy: '#ff9f1c', mine: C.green, city: C.pink, sky: '#120618' },
    { ground: '#b26bff', enemy: C.cyan, mine: '#ff3b3b', city: C.yellow, sky: '#07060f' },
  ];

  // ---------- State ----------

  const canvas = document.getElementById('game');
  const { ctx } = A.createScreen(canvas, W, H);
  const input = A.createInput({ pointerTarget: canvas, screen: { width: W, height: H } });
  const blasts = A.createBlasts();
  const fx = A.createEffects();

  let demo = true;
  let wave = 1;
  let score = 0;
  let nextCity = BONUS_CITY_EVERY;
  let bankedCities = 0;
  let cities, bases, enemies, mine, bombers;
  let toLaunch = 0;
  let salvoT = 0;
  let bomberT = 0;
  let demoT = 0;
  let cursor = { x: W / 2, y: (SKY_TOP + GROUND) / 2 };
  let tally = null;
  let flash = 0;
  let shake = 0;

  const shell = A.createShell({
    ctx, width: W, height: H, id: GAME_ID,
    title: ['SKY', 'SHIELD'],
    titleColors: [C.cyan, C.yellow],
    howTo: [
      ['MISSILES ARE FALLING!', '#ff3b3b'],
      [A.isTouch ? 'TAP THE SKY TO FIRE' : 'CLICK THE SKY TO FIRE', C.cyan],
      ['BLASTS SET OFF MORE BLASTS', C.yellow],
      ['SAVE YOUR CITIES AND AMMO', C.green],
      [A.isTouch ? 'NEAREST BASE FIRES' : 'OR ARROWS + SPACE / Z X C', C.dim],
    ],
    hudLabel: 'WAVE',
    newGame, showTitle,
  });

  const rand = (a, b) => a + Math.random() * (b - a);
  const pal = () => PALETTES[Math.floor((wave - 1) / 2) % PALETTES.length];
  const multiplier = () => Math.min(6, Math.ceil(wave / 2));
  const sfx = (name, arg) => { if (!demo) A.sound.play(name, arg); };
  const blink = (ms = 500) => Math.floor(shell.clock / ms) % 2 === 0;
  const enemySpeed = () => Math.min(0.1, 0.028 + (wave - 1) * 0.005);

  // ---------- Waves ----------

  function startWave() {
    bases = BASES.map(x => ({ x, ammo: AMMO, alive: true }));
    enemies = [];
    mine = [];
    bombers = [];
    blasts.clear();
    toLaunch = Math.min(30, 10 + wave * 2);
    salvoT = READY_MS + 400;
    bomberT = rand(6000, 9000);
    // Banked bonus cities rebuild destroyed ones.
    for (const city of cities) {
      if (!city.alive && bankedCities > 0) {
        city.alive = true;
        bankedCities--;
      }
    }
  }

  function newGame() {
    if (window.track) track('play:' + GAME_ID);
    demo = false;
    wave = 1;
    score = 0;
    nextCity = BONUS_CITY_EVERY;
    bankedCities = 0;
    cities = CITIES.map(x => ({ x, alive: true }));
    fx.clear();
    startWave();
    shell.setState('ready');
    A.sound.play('alarm');
  }

  function showTitle() {
    demo = true;
    wave = 1;
    score = 0;
    cities = CITIES.map(x => ({ x, alive: true }));
    fx.clear();
    startWave();
    salvoT = 300;
    shell.setState('title');
  }

  function addScore(points) {
    if (demo) return;
    score += points;
    while (score >= nextCity) {
      nextCity += BONUS_CITY_EVERY;
      bankedCities++;
      fx.float(W / 2, GROUND - 40, 'BONUS CITY!', C.green);
      A.sound.play('powerup');
    }
  }

  // ---------- Enemy missiles ----------

  function targets() {
    return cities.filter(c => c.alive).map(c => c.x).concat(bases.filter(b => b.alive).map(b => b.x));
  }

  function launchEnemy(kind, sx, sy) {
    const list = targets();
    if (!list.length) return;
    const tx = list[Math.floor(Math.random() * list.length)] + rand(-6, 6);
    const e = { kind, sx, sy, x: sx, y: sy, tx, ty: GROUND, speed: enemySpeed() * (kind === 'seeker' ? 0.8 : rand(0.85, 1.15)) };
    if (kind === 'split') e.splitAt = rand(SKY_TOP + 120, GROUND - 180);
    enemies.push(e);
  }

  // Missiles come down in salvos; later waves add splitters and seekers.
  function releaseSalvo() {
    const n = Math.min(toLaunch, 2 + Math.floor(Math.random() * Math.min(4, 1 + wave / 2)));
    for (let i = 0; i < n; i++) {
      let kind = 'missile';
      if (wave >= 2 && Math.random() < Math.min(0.35, 0.1 + wave * 0.03)) kind = 'split';
      if (wave >= 6 && Math.random() < 0.15) kind = 'seeker';
      launchEnemy(kind, rand(10, W - 10), SKY_TOP);
    }
    toLaunch -= n;
    salvoT = rand(1600, 3000) * Math.max(0.5, 1 - wave * 0.04);
  }

  function updateEnemy(e, dt) {
    let dx = e.tx - e.x;
    let dy = e.ty - e.y;
    // Seekers swerve sideways away from any blast in their path.
    if (e.kind === 'seeker') {
      const near = blasts.list.find(b => Math.hypot(b.x - e.x, b.y - e.y) < b.max + 40);
      if (near) {
        e.sx = e.x;
        e.sy = e.y;
        dx = e.x - near.x;
        dy = Math.max(0.3, Math.abs(dy)) * 0.4;
      }
    }
    const d = Math.hypot(dx, dy) || 1;
    e.x += (dx / d) * e.speed * dt;
    e.y += (dy / d) * e.speed * dt;
    if (e.kind === 'split' && e.y >= e.splitAt) {
      e.dead = true;
      const parts = 2 + (Math.random() < 0.4 ? 1 : 0);
      for (let i = 0; i < parts; i++) launchEnemy('missile', e.x, e.y);
      return;
    }
    if (e.y >= GROUND - 2) {
      e.dead = true;
      impact(e.x);
    }
  }

  // A missile reaching the ground flattens any city or base it lands on.
  function impact(x) {
    blasts.add(x, GROUND - 4, { radius: ENEMY_BLAST, owner: 'ground' });
    fx.burst(x, GROUND - 6, pal().enemy, 18, 0.18);
    shake = 6;
    const city = cities.find(c => c.alive && Math.abs(c.x - x) < 20);
    if (city) {
      city.alive = false;
      flash = 300;
      sfx('crumble');
      if (!cities.some(c => c.alive) && !demo) {
        shell.setState('dying');
      }
      return;
    }
    const base = bases.find(b => b.alive && Math.abs(b.x - x) < 20);
    if (base) {
      base.alive = false;
      base.ammo = 0;
      sfx('crumble');
    } else {
      sfx('boom');
    }
  }

  // Bombers cross the sky dropping missiles until they're caught in a blast.
  function updateBombers(dt) {
    if (wave >= 3 && toLaunch > 0 && (bomberT -= dt) <= 0) {
      bomberT = rand(7000, 11000);
      const left = Math.random() < 0.5;
      bombers.push({ x: left ? -20 : W + 20, y: rand(SKY_TOP + 70, SKY_TOP + 200), vx: (left ? 1 : -1) * 0.06, dropT: 1200 });
    }
    for (const b of bombers) {
      b.x += b.vx * dt;
      if ((b.dropT -= dt) <= 0 && toLaunch > 0 && b.x > 20 && b.x < W - 20) {
        b.dropT = rand(1400, 2200);
        launchEnemy('missile', b.x, b.y + 6);
        toLaunch--;
      }
      if (b.x < -30 || b.x > W + 30) b.dead = true;
    }
  }

  // ---------- Your interceptors ----------

  function fireFrom(base, x, y) {
    if (!base || !base.alive || base.ammo <= 0) return false;
    y = Math.min(y, GROUND - 30);
    base.ammo--;
    const fast = base === bases[1];
    mine.push({ sx: base.x, sy: GROUND - 14, x: base.x, y: GROUND - 14, tx: x, ty: y, speed: MY_SPEED * (fast ? 1.4 : 1) });
    sfx('launch');
    return true;
  }

  // Fire from the nearest base that still has ammo.
  function fireAt(x, y) {
    const ready = bases.filter(b => b.alive && b.ammo > 0).sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x));
    if (ready.length) fireFrom(ready[0], x, y);
    else sfx('wall');
  }

  function updateMine(dt) {
    for (const m of mine) {
      const dx = m.tx - m.x;
      const dy = m.ty - m.y;
      const d = Math.hypot(dx, dy);
      const stepLen = m.speed * dt;
      if (d <= stepLen) {
        m.dead = true;
        blasts.add(m.tx, m.ty, { radius: MY_BLAST, owner: 'player' });
        sfx('boom');
      } else {
        m.x += (dx / d) * stepLen;
        m.y += (dy / d) * stepLen;
      }
    }
  }

  // Anything inside a blast pops into a blast of its own, which can catch more.
  function catchInBlasts() {
    for (const e of enemies) {
      const b = e.dead ? null : blasts.hit(e.x, e.y);
      if (!b) continue;
      e.dead = true;
      if (b.owner !== 'ground') addScore(POINTS[e.kind] * multiplier()); // only your blasts and their chains score
      blasts.add(e.x, e.y, { radius: ENEMY_BLAST, owner: 'chain' });
      sfx('brick', Math.min(12, enemies.filter(o => o.dead).length));
    }
    for (const b of bombers) {
      if (b.dead || !blasts.hit(b.x, b.y, 6)) continue;
      b.dead = true;
      addScore(POINTS.bomber * multiplier());
      fx.float(b.x, b.y - 12, String(POINTS.bomber * multiplier()), C.yellow);
      blasts.add(b.x, b.y, { radius: ENEMY_BLAST + 4, owner: 'chain' });
      sfx('boom');
    }
    enemies = enemies.filter(e => !e.dead);
    bombers = bombers.filter(b => !b.dead);
  }

  // ---------- Attract-mode AI ----------
  // Every so often the CPU picks the lowest missile and fires where it will be when the shot arrives.

  function demoFire(dt) {
    if ((demoT -= dt) > 0) return;
    demoT = rand(350, 700);
    const threat = enemies.filter(e => !blasts.hit(e.x, e.y, 30)).sort((a, b) => b.y - a.y)[0];
    if (!threat) return;
    const base = bases.filter(b => b.alive && b.ammo > 0).sort((a, b) => Math.abs(a.x - threat.x) - Math.abs(b.x - threat.x))[0];
    if (!base) return;
    const travel = Math.hypot(threat.x - base.x, threat.y - GROUND) / (MY_SPEED * (base === bases[1] ? 1.4 : 1));
    const d = Math.hypot(threat.tx - threat.x, threat.ty - threat.y) || 1;
    const ahead = Math.min(d, threat.speed * (travel + 450));
    fireFrom(base, threat.x + ((threat.tx - threat.x) / d) * ahead, threat.y + ((threat.ty - threat.y) / d) * ahead);
  }

  // ---------- End of wave ----------

  function waveDone() {
    return toLaunch <= 0 && !enemies.length && !bombers.length && !mine.length && !blasts.list.length;
  }

  // Count up the bonus one shell and one city at a time, arcade style.
  function startTally() {
    tally = {
      ammo: bases.reduce((sum, b) => sum + (b.alive ? b.ammo : 0), 0),
      cities: cities.filter(c => c.alive).length,
      countedAmmo: 0,
      countedCities: 0,
      t: 0,
      doneT: 0,
      points: 0,
    };
    shell.setState('tally');
  }

  function updateTally(dt) {
    tally.t += dt;
    while (tally.t >= TALLY_STEP_MS) {
      tally.t -= TALLY_STEP_MS;
      if (tally.countedAmmo < tally.ammo) {
        tally.countedAmmo++;
        tally.points += 5 * multiplier();
        addScore(5 * multiplier());
        sfx('tick');
      } else if (tally.countedCities < tally.cities) {
        tally.countedCities++;
        tally.points += 100 * multiplier();
        addScore(100 * multiplier());
        sfx('select');
        tally.t -= TALLY_STEP_MS * 4; // cities count slower
      } else {
        // Everything counted: a moment to admire it, then the next wave.
        if ((tally.doneT += TALLY_STEP_MS) >= 1400) {
          wave++;
          startWave();
          shell.setState('ready');
          sfx('alarm');
        }
        return;
      }
    }
  }

  // ---------- Input ----------

  input.onPointer(p => {
    cursor.x = Math.max(4, Math.min(W - 4, p.x));
    cursor.y = Math.max(SKY_TOP + 4, Math.min(GROUND - 30, p.y));
  });

  input.on(action => {
    if (shell.handle(action)) return;
    if (shell.state !== 'playing') return;
    if (action === 'tap' || action === 'start') fireAt(cursor.x, cursor.y);
  });

  // Z, X and C fire from the left, middle and right base.
  window.addEventListener('keydown', e => {
    const i = { KeyZ: 0, KeyX: 1, KeyC: 2 }[e.code];
    if (i === undefined || e.repeat || shell.state !== 'playing') return;
    A.sound.unlock();
    if (!fireFrom(bases[i], cursor.x, cursor.y)) sfx('wall');
  });

  // ---------- Update ----------

  function updateWorld(dt) {
    if (toLaunch > 0 && (salvoT -= dt) <= 0) releaseSalvo();
    updateBombers(dt);
    enemies.forEach(e => updateEnemy(e, dt));
    enemies = enemies.filter(e => !e.dead);
    bombers = bombers.filter(b => !b.dead);
    updateMine(dt);
    mine = mine.filter(m => !m.dead);
    blasts.update(dt);
    catchInBlasts();
  }

  function update(dt) {
    shell.update(dt);
    fx.update(dt);
    flash = Math.max(0, flash - dt);
    shake = Math.max(0, shake - dt * 0.02);
    const st = shell.state;

    if (st === 'title') {
      demoFire(dt);
      updateWorld(dt);
      if (waveDone() || !cities.some(c => c.alive)) {
        if (!cities.some(c => c.alive) || wave >= 3) showTitle();
        else {
          wave++;
          startWave();
          salvoT = 600;
        }
      }
    } else if (st === 'ready') {
      if (shell.stateTime >= READY_MS) shell.setState('playing');
    } else if (st === 'playing') {
      // Keyboard players steer the crosshair with the arrows.
      const kx = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
      const ky = (input.isDown('down') ? 1 : 0) - (input.isDown('up') ? 1 : 0);
      if (kx || ky) {
        cursor.x = Math.max(4, Math.min(W - 4, cursor.x + kx * CURSOR_SPEED * dt));
        cursor.y = Math.max(SKY_TOP + 4, Math.min(GROUND - 30, cursor.y + ky * CURSOR_SPEED * dt));
      }
      updateWorld(dt);
      if (shell.state === 'playing' && waveDone()) startTally();
    } else if (st === 'tally') {
      updateTally(dt);
    } else if (st === 'dying') {
      blasts.update(dt);
      if (shell.stateTime >= DYING_MS) shell.gameOver(score, 'WAVE ' + wave);
    }
  }

  // ---------- Render ----------

  function drawCity(x, color, alive) {
    ctx.save();
    if (alive) {
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.fillRect(x - 14, GROUND - 10, 8, 10);
      ctx.fillRect(x - 6, GROUND - 18, 8, 18);
      ctx.fillRect(x + 2, GROUND - 13, 6, 13);
      ctx.fillRect(x + 8, GROUND - 7, 6, 7);
      ctx.shadowBlur = 0;
      ctx.fillStyle = C.bg;
      ctx.fillRect(x - 4, GROUND - 15, 2, 2);
      ctx.fillRect(x - 1, GROUND - 11, 2, 2);
      ctx.fillRect(x + 4, GROUND - 9, 2, 2);
    } else {
      ctx.fillStyle = '#4a4670';
      ctx.fillRect(x - 13, GROUND - 4, 26, 4);
      ctx.fillRect(x - 8, GROUND - 7, 6, 3);
      ctx.fillRect(x + 3, GROUND - 6, 5, 2);
    }
    ctx.restore();
  }

  function drawBase(base, ground) {
    ctx.fillStyle = ground;
    ctx.beginPath();
    ctx.moveTo(base.x - 30, GROUND);
    ctx.lineTo(base.x - 14, GROUND - 16);
    ctx.lineTo(base.x + 14, GROUND - 16);
    ctx.lineTo(base.x + 30, GROUND);
    ctx.fill();
    if (!base.alive) {
      ctx.fillStyle = C.bg;
      ctx.fillRect(base.x - 6, GROUND - 16, 12, 6);
      return;
    }
    // Remaining interceptors stacked in a little pyramid.
    ctx.fillStyle = pal().mine;
    let n = 0;
    for (let row = 0; row < 4 && n < base.ammo; row++) {
      for (let i = 0; i <= row && n < base.ammo; i++, n++) {
        ctx.fillRect(base.x - row * 3 + i * 6 - 1, GROUND + 6 + row * 6, 3, 4);
      }
    }
  }

  function drawScene() {
    const p = pal();
    ctx.fillStyle = p.sky;
    ctx.fillRect(0, HUD, W, GROUND - HUD);
    if (flash > 0 && Math.floor(flash / 60) % 2) {
      ctx.fillStyle = 'rgba(255, 59, 59, 0.18)';
      ctx.fillRect(0, HUD, W, GROUND - HUD);
    }
    // Ground strip with bases and cities.
    ctx.fillStyle = p.ground;
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = 'rgba(7, 6, 15, 0.55)';
    ctx.fillRect(0, GROUND + 4, W, H - GROUND);
    bases.forEach(b => drawBase(b, p.ground));
    cities.forEach(c => drawCity(c.x, p.city, c.alive));

    // Enemy trails and heads.
    ctx.lineWidth = 1.2;
    for (const e of enemies) {
      ctx.strokeStyle = p.enemy;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(e.sx, e.sy);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = blink(80) ? C.text : p.enemy;
      ctx.fillRect(e.x - 1.5, e.y - 1.5, 3, 3);
      if (e.kind === 'seeker') {
        ctx.strokeStyle = C.text;
        ctx.strokeRect(e.x - 4, e.y - 4, 8, 8);
      }
    }
    for (const b of bombers) {
      A.vector.draw(ctx, [[-12, 0], [-4, -3], [10, -2], [14, 0], [10, 2], [-4, 3]], b.x, b.y, { scale: b.vx < 0 ? -1 : 1, color: p.enemy, width: 1.4, glow: 8 });
      A.vector.draw(ctx, [[-2, -2], [-6, -9], [-1, -9], [4, -2]], b.x, b.y, { scale: b.vx < 0 ? -1 : 1, color: p.enemy, width: 1.2, glow: 6, closed: false });
    }
    // Your interceptors and where they're heading.
    for (const m of mine) {
      ctx.strokeStyle = p.mine;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(m.sx, m.sy);
      ctx.lineTo(m.x, m.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = C.text;
      ctx.beginPath();
      ctx.moveTo(m.tx - 4, m.ty - 4);
      ctx.lineTo(m.tx + 4, m.ty + 4);
      ctx.moveTo(m.tx + 4, m.ty - 4);
      ctx.lineTo(m.tx - 4, m.ty + 4);
      ctx.stroke();
    }
    blasts.draw(ctx, [C.text, p.mine, p.enemy, C.yellow], shell.clock);
  }

  function drawCursor() {
    if (shell.state !== 'playing' && shell.state !== 'ready') return;
    const { x, y } = cursor;
    ctx.save();
    ctx.strokeStyle = C.text;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 9, y);
    ctx.lineTo(x - 3, y);
    ctx.moveTo(x + 3, y);
    ctx.lineTo(x + 9, y);
    ctx.moveTo(x, y - 9);
    ctx.lineTo(x, y - 3);
    ctx.moveTo(x, y + 3);
    ctx.lineTo(x, y + 9);
    ctx.stroke();
    ctx.restore();
  }

  function drawMessages() {
    const cx = W / 2;
    const cy = (HUD + GROUND) / 2;
    const st = shell.state;
    if (st === 'ready') {
      A.text(ctx, 'WAVE ' + wave, cx, cy - 40, { size: 20, color: C.yellow, glow: 12 });
      A.text(ctx, multiplier() + ' X POINTS', cx, cy - 6, { size: 12, color: pal().mine });
      if (blink(200)) A.text(ctx, 'DEFEND CITIES', cx, cy + 26, { size: 10, color: C.text });
    } else if (st === 'tally' && tally) {
      A.text(ctx, 'BONUS POINTS', cx, cy - 60, { size: 14, color: C.yellow, glow: 10 });
      ctx.fillStyle = pal().mine;
      for (let i = 0; i < tally.countedAmmo; i++) ctx.fillRect(cx - 90 + (i % 15) * 6, cy - 30 + Math.floor(i / 15) * 8, 3, 5);
      for (let i = 0; i < tally.countedCities; i++) drawCityAt(cx - 75 + i * 30, cy + 26);
      A.text(ctx, A.pad(tally.points, 5), cx, cy + 60, { size: 14, color: C.text });
    } else if (st === 'dying') {
      if (blink(250)) A.text(ctx, 'THE END', cx, cy, { size: 28, color: '#ff3b3b', glow: 18 });
    }
  }

  function drawCityAt(x, y) {
    ctx.save();
    ctx.translate(0, y - GROUND);
    drawCity(x, pal().city, true);
    ctx.restore();
  }

  function render() {
    ctx.save();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    shell.drawHud(score, wave);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HUD, W, H - HUD); // blasts near the top stay below the score bar
    ctx.clip();
    drawScene();
    fx.draw(ctx);
    drawCursor();
    ctx.restore();
    drawMessages();
    if (!demo && bankedCities > 0) A.text(ctx, '+' + bankedCities + ' CITY', W - 12, H - 12, { size: 8, color: C.green, align: 'right' });
    shell.drawOverlay();
    ctx.restore();
  }

  showTitle();
  A.waitForFont().then(() => A.startLoop({ update, render }));
})();
