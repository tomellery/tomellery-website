/*
 * Stack Attack: a Neon Arcade game. Foreman Cat (from the arcade's crew) runs the lunch rush: walk the
 * length of each giant burger layer to drop it a floor, knock layers down onto the plates, and finish
 * all four burgers. Saucy, Nugget and Wedge chase you; squash them, ride them down, or stun them with salt.
 * Play states: ready -> playing <-> paused, dying, clear. The shell runs title, pause, initials, game over.
 */
(function () {
  'use strict';

  const A = window.Arcade;
  const C = A.COLORS;

  const GAME_ID = 'stack';
  const W = 480;
  const H = 600;
  const HUD = 48;

  const FLOOR_Y = [136, 220, 304, 388, 472];
  const FLOOR_X = [12, 468];
  const PLATE_Y = 566;
  const COLUMNS = [72, 180, 300, 408];
  const LAYER_W = 64;
  const SEGMENTS = 4;
  const LAYER_H = 8;

  const START_LIVES = 3;
  const EXTRA_LIFE_AT = 20000;
  const READY_MS = 1600;
  const DYING_MS = 1800;
  const CLEAR_MS = 2600;
  const STUN_MS = 3000;
  const SALT_START = 5;
  const RESPAWN_MS = 3500;
  const SNACK_MS = 8000;
  const RIDER_POINTS = [500, 1000, 2000, 4000, 8000];
  const BURGER = ['bunTop', 'lettuce', 'patty', 'bunBottom'];

  // [x, floor above, floor below] ladders, and for each burger the floor each of its four layers starts on.
  const STAGES = [
    {
      ladders: [[20, 0, 1], [20, 1, 2], [20, 2, 3], [20, 3, 4], [126, 0, 1], [126, 2, 3], [240, 0, 1], [240, 1, 2], [240, 3, 4], [354, 1, 2], [354, 2, 3], [460, 0, 1], [460, 1, 2], [460, 2, 3], [460, 3, 4]],
      layers: [[0, 1, 2, 3], [0, 2, 3, 4], [1, 2, 3, 4], [0, 1, 3, 4]],
    },
    {
      ladders: [[20, 0, 1], [20, 2, 3], [20, 3, 4], [126, 0, 1], [126, 1, 2], [126, 3, 4], [240, 0, 1], [240, 2, 3], [240, 3, 4], [354, 0, 1], [354, 1, 2], [354, 3, 4], [460, 0, 1], [460, 1, 2], [460, 2, 3]],
      layers: [[0, 1, 2, 4], [1, 2, 3, 4], [0, 1, 2, 3], [0, 2, 3, 4]],
    },
    {
      ladders: [[20, 0, 1], [20, 2, 3], [20, 3, 4], [126, 0, 1], [126, 1, 2], [240, 1, 2], [240, 2, 3], [240, 3, 4], [354, 0, 1], [354, 2, 3], [460, 1, 2], [460, 2, 3], [460, 3, 4]],
      layers: [[1, 2, 3, 4], [0, 1, 3, 4], [0, 2, 3, 4], [0, 1, 2, 4]],
    },
  ];

  // ---------- Sprites ----------

  let COOK = null;
  const cook = () => {
    if (!COOK) {
      COOK = A.crewSprite('Foreman Cat', 2);
      if (!COOK) {
        const s = A.makeSprite(['.FYYYYF...', '.YYYYYY...', 'YYYYYYYY..', '.FFFFFF...', '..FFEFE...', '..FWWWF...', '.FFFFFF...', 'AFFWWFFA..', 'A.FWWF.A..', 'F.FFFF....', '..FF.FF...', '..FF.FF...', '.WWW.WWW..'], { Y: '#ffd23f', F: '#f08a24', E: '#0a0a0a', W: '#fff3e0', A: '#f08a24' }, 2);
        COOK = { stand: s, walk1: s, walk2: s, lift: s, flail: s };
      }
    }
    return COOK;
  };

  const CHASERS = {
    saucy: {
      name: 'SAUCY', speed: 0.82, color: '#ff3b3b',
      maps: [
        ['..WWWW..', '...RR...', '..RRRR..', '.RRRRRR.', '.RWBRWB.', '.RRRRRR.', '.RYYYYR.', '.RYYYYR.', '.RRRRRR.', '.RRRRRR.', '..R..R..', '.RR..RR.'],
        ['..WWWW..', '...RR...', '..RRRR..', '.RRRRRR.', '.RWBRWB.', '.RRRRRR.', '.RYYYYR.', '.RYYYYR.', '.RRRRRR.', '.RRRRRR.', '.R....R.', 'RR....RR'],
      ],
      pal: { W: C.text, R: '#ff3b3b', Y: C.yellow, B: C.bg },
    },
    nugget: {
      name: 'NUGGET', speed: 0.7, color: '#e0a040',
      maps: [
        ['..GGGGGG..', '.GGGGGGGG.', 'GGWBGGWBGG', 'GGGGGGGGGG', 'GGGGKKGGGG', '.GGGGGGGG.', '..GGGGGG..', '..G....G..', '.GG....GG.'],
        ['..GGGGGG..', '.GGGGGGGG.', 'GGWBGGWBGG', 'GGGGGGGGGG', 'GGGGKKGGGG', '.GGGGGGGG.', '..GGGGGG..', '...G..G...', '..GG..GG..'],
      ],
      pal: { G: '#e0a040', W: C.text, B: C.bg, K: '#7a3a0a' },
    },
    wedge: {
      name: 'WEDGE', speed: 0.56, color: C.yellow,
      maps: [
        ['.........Y', '.......YYY', '.....YYYOY', '...YYYYYYY', '.YYWBYYWBY', 'YYYYYOYYYY', 'YYOYYYYYOY', '.Y.....Y..', 'YY....YY..'],
        ['.........Y', '.......YYY', '.....YYYOY', '...YYYYYYY', '.YYWBYYWBY', 'YYYYYOYYYY', 'YYOYYYYYOY', '..Y...Y...', '.YY..YY...'],
      ],
      pal: { Y: C.yellow, O: '#c9a800', W: C.text, B: C.bg },
    },
  };
  Object.values(CHASERS).forEach(c => { c.sprites = c.maps.map(m => A.makeSprite(m, c.pal, 2)); });
  const ORDER = ['saucy', 'nugget', 'wedge'];

  // ---------- State ----------

  const canvas = document.getElementById('game');
  const { ctx } = A.createScreen(canvas, W, H);
  const input = A.createInput({ swipeTarget: canvas });
  const fx = A.createEffects();

  let demo = true;
  let level = 1;
  let score = 0;
  let lives = START_LIVES;
  let bonusLife = false;
  let world, layers, plates, player, enemies, snack, cloud;
  let salt = SALT_START;
  let dropped = 0;
  let snackT = 0;
  let saltQueued = false;
  let shake = 0;

  const shell = A.createShell({
    ctx, width: W, height: H, id: GAME_ID,
    title: ['STACK', 'ATTACK'],
    titleColors: ['#ff9f1c', C.pink],
    howTo: [
      ['WALK ACROSS A LAYER TO DROP IT', C.text],
      ['FILL ALL FOUR PLATES', '#ff9f1c'],
      ['DROP LAYERS ON THE CHASERS!', C.green],
      [A.isTouch ? 'SALT BUTTON STUNS THEM' : 'SPACE SHAKES SALT - STUNS', C.cyan],
      ['SAUCY  NUGGET  WEDGE', '#ff3b3b'],
    ],
    hudLabel: 'LEVEL',
    newGame, showTitle,
  });

  const rand = (a, b) => a + Math.random() * (b - a);
  const sfx = (name, arg) => { if (!demo) A.sound.play(name, arg); };
  const blink = (ms = 500) => Math.floor(shell.clock / ms) % 2 === 0;
  const loop = () => Math.floor((level - 1) / STAGES.length); // each time round all three stages, it speeds up
  const floorOf = b => {
    const g = world.groundAt(b.x, b.y - 4, 8);
    return g ? g.g.floor : -1;
  };

  // ---------- Stages ----------

  function buildStage() {
    const stage = STAGES[(level - 1) % STAGES.length];
    const girders = FLOOR_Y.map((y, i) => ({ x1: FLOOR_X[0], y1: y, x2: FLOOR_X[1], y2: y, floor: i }));
    const ladders = stage.ladders.map(([x, up, low]) => ({ x, top: FLOOR_Y[up], bottom: FLOOR_Y[low] }));
    world = A.createPlatforms({ girders, ladders, width: W });
    layers = [];
    stage.layers.forEach((floors, col) => {
      floors.forEach((f, k) => {
        const kind = BURGER[k] === 'lettuce' && col % 2 ? 'cheese' : BURGER[k];
        layers.push({ col, kind, x: COLUMNS[col], floor: f, y: FLOOR_Y[f], state: 'rest', walked: new Array(SEGMENTS).fill(false), vy: 0, target: 0, riders: 0 });
      });
    });
    plates = COLUMNS.map(() => 0);
    dropped = 0;
    snack = null;
    snackT = 9000;
    resetActors();
  }

  function resetActors() {
    player = { x: 240, y: FLOOR_Y[4], vx: 0, vy: 0, onGround: true, ladder: null, facing: 1, walk: 0 };
    enemies = ORDER.map((kind, i) => makeEnemy(kind, 1200 + i * 2600));
    cloud = null;
    saltQueued = false;
  }

  function makeEnemy(kind, wait) {
    const left = Math.random() < 0.5;
    return { kind, x: left ? 20 : 460, y: FLOOR_Y[0], vx: 0, vy: 0, onGround: true, ladder: null, facing: left ? 1 : -1, state: 'wait', t: wait, think: 0, move: null, wander: null, walk: 0 };
  }

  function newGame() {
    if (window.track) track('play:' + GAME_ID);
    demo = false;
    level = 1;
    score = 0;
    lives = START_LIVES;
    bonusLife = false;
    salt = SALT_START;
    fx.clear();
    buildStage();
    shell.setState('ready');
    A.sound.play('start');
  }

  function showTitle() {
    demo = true;
    level = 1 + Math.floor(Math.random() * STAGES.length);
    score = 0;
    salt = 99;
    fx.clear();
    buildStage();
    shell.setState('title');
  }

  function addScore(points, x, y, color = C.yellow) {
    if (demo) return;
    score += points;
    if (x !== undefined) fx.float(x, y, String(points), color);
    if (!bonusLife && score >= EXTRA_LIFE_AT) {
      bonusLife = true;
      lives++;
      fx.float(W / 2, HUD + 60, '1UP!', C.green);
      A.sound.play('powerup');
    }
  }

  // ---------- Burger layers ----------

  // Walking along a resting layer presses down each quarter you cross; all four and it drops.
  function walkLayers() {
    if (!player.onGround) return;
    const f = floorOf(player);
    for (const l of layers) {
      if (l.state !== 'rest' || l.floor !== f) continue;
      const left = l.x - LAYER_W / 2;
      if (player.x < left || player.x > left + LAYER_W) continue;
      const seg = Math.min(SEGMENTS - 1, Math.floor((player.x - left) / (LAYER_W / SEGMENTS)));
      if (!l.walked[seg]) {
        l.walked[seg] = true;
        sfx('step');
        if (l.walked.every(Boolean)) drop(l);
      }
    }
  }

  // A layer falls to the next floor down (or onto the plate). Anyone standing on it rides it down.
  function drop(l) {
    l.state = 'fall';
    l.vy = 0;
    l.riders = 0;
    for (const e of enemies) {
      if (e.state !== 'walk' && e.state !== 'stun') continue;
      if (e.onGround && floorOf(e) === l.floor && Math.abs(e.x - l.x) < LAYER_W / 2) {
        e.state = 'ride';
        e.ride = l;
        l.riders++;
      }
    }
    l.floor = l.floor < FLOOR_Y.length - 1 ? l.floor + 1 : -1; // -1 = the plate
    l.target = l.floor >= 0 ? FLOOR_Y[l.floor] : PLATE_Y - 2 - plates[l.col] * (LAYER_H + 1);
    dropped++;
    addScore(50);
    sfx('plop');
  }

  function updateLayers(dt) {
    for (const l of layers) {
      if (l.state !== 'fall') continue;
      const before = l.y;
      // Plates fill up as layers arrive, so a layer heading for one aims at the current top of the stack.
      if (l.floor < 0) l.target = PLATE_Y - 2 - plates[l.col] * (LAYER_H + 1);
      l.vy = Math.min(0.45, l.vy + 0.0012 * dt);
      l.y = Math.min(l.target, l.y + l.vy * dt);
      // Squash any chaser it falls onto.
      for (const e of enemies) {
        if (e.state !== 'walk' && e.state !== 'stun') continue;
        if (Math.abs(e.x - l.x) < LAYER_W / 2 && e.y - 18 <= l.y && e.y - 18 > before) squash(e, l);
      }
      if (l.y < l.target) continue;
      land(l);
    }
  }

  function land(l) {
    l.state = 'rest';
    l.walked.fill(false);
    if (l.riders) {
      const points = RIDER_POINTS[Math.min(RIDER_POINTS.length - 1, l.riders - 1)] * (1 + loop());
      addScore(points, l.x, l.y - 24, C.green);
      sfx('bonus');
      for (const e of enemies) if (e.ride === l) respawnLater(e);
      l.riders = 0;
    }
    if (l.floor < 0) {
      l.state = 'plate';
      plates[l.col]++;
      sfx('lock');
      fx.burst(l.x, l.y - 4, '#ff9f1c', 10, 0.12);
      if (layers.every(o => o.state === 'plate')) stageClear();
      return;
    }
    // Landing on another layer knocks that one down in turn.
    const below = layers.find(o => o !== l && o.state === 'rest' && o.col === l.col && o.floor === l.floor);
    if (below) {
      addScore(100, l.x, l.y - 16, '#ff9f1c');
      drop(below);
    }
  }

  function squash(e, l) {
    addScore(500 * (1 + loop()), e.x, e.y - 30, C.green);
    fx.burst(e.x, e.y - 10, CHASERS[e.kind].color, 18, 0.18);
    sfx('squish');
    respawnLater(e);
  }

  function respawnLater(e) {
    const fresh = makeEnemy(e.kind, RESPAWN_MS);
    Object.assign(e, fresh, { ride: null });
  }

  function stageClear() {
    addScore(1000 * (1 + loop()), W / 2, HUD + 80, C.green);
    sfx('levelup');
    if (demo) {
      showTitle();
      return;
    }
    shell.setState('clear');
  }

  // ---------- Chasers ----------
  // Every so often each chaser asks the level for the way to its target: Saucy comes straight for you,
  // Nugget wanders until you're close and then pounces, Wedge lies in wait on the ladder nearest you.

  function targetFor(e) {
    const dist = Math.hypot(e.x - player.x, e.y - player.y);
    if (e.kind === 'nugget' && dist > 170) {
      if (!e.wander || Math.random() < 0.15) e.wander = { x: rand(30, 450), y: FLOOR_Y[Math.floor(Math.random() * FLOOR_Y.length)] };
      return e.wander;
    }
    if (e.kind === 'wedge' && dist > 70) {
      const near = world.ladders.slice().sort((a, b) => Math.hypot(a.x - player.x, a.bottom - player.y) - Math.hypot(b.x - player.x, b.bottom - player.y))[0];
      if (near) return { x: near.x, y: Math.abs(near.top - player.y) < Math.abs(near.bottom - player.y) ? near.top : near.bottom };
    }
    return player;
  }

  function updateEnemies(dt) {
    const speedUp = 1 + loop() * 0.12 + ((level - 1) % STAGES.length) * 0.04;
    for (const e of enemies) {
      if (e.state === 'wait') {
        if ((e.t -= dt) <= 0) e.state = 'walk';
        continue;
      }
      if (e.state === 'ride') {
        e.y = e.ride.y;
        continue;
      }
      if (e.state === 'stun') {
        if ((e.t -= dt) <= 0) e.state = 'walk';
        continue;
      }
      if ((e.think -= dt) <= 0) {
        e.think = 220;
        e.move = world.route(e, targetFor(e));
      }
      const ctl = { left: e.move === 'left', right: e.move === 'right', up: e.move === 'up', down: e.move === 'down' };
      world.step(e, dt * CHASERS[e.kind].speed * speedUp, ctl);
      if (e.move) e.walk += dt;
      e.x = Math.max(FLOOR_X[0] + 4, Math.min(FLOOR_X[1] - 4, e.x));
      if (!e.onGround && !e.ladder) respawnLater(e); // slipped off: back to the top
    }
  }

  function shakeSalt() {
    if (salt <= 0) {
      sfx('wall');
      return;
    }
    if (!demo) salt--;
    cloud = { x: player.x + player.facing * 26, y: player.y - 12, t: 0 };
    sfx('shake');
    for (const e of enemies) {
      if (e.state !== 'walk') continue;
      if (Math.abs(e.x - cloud.x) < 32 && Math.abs(e.y - player.y) < 22) {
        e.state = 'stun';
        e.t = STUN_MS;
        fx.burst(e.x, e.y - 14, C.text, 8, 0.08);
      }
    }
  }

  function collide() {
    for (const e of enemies) {
      if (e.state !== 'walk') continue;
      if (Math.abs(e.x - player.x) < 11 && Math.abs(e.y - player.y) < 14) {
        if (demo) {
          showTitle();
          return;
        }
        lives--;
        shake = 8;
        sfx('die');
        shell.setState('dying');
        return;
      }
    }
    if (snack && Math.abs(snack.x - player.x) < 14 && Math.abs(snack.y - player.y) < 14) {
      addScore(500 * (1 + loop()), snack.x, snack.y - 24, C.pink);
      salt++;
      snack = null;
      sfx('bonus');
    }
  }

  // ---------- Attract-mode AI ----------
  // The CPU cook heads for the nearest unfinished layer, walks it end to end, and salts anything close.

  function demoControls() {
    const ctl = { left: false, right: false, up: false, down: false };
    const threat = enemies.find(e => e.state === 'walk' && Math.abs(e.y - player.y) < 12 && Math.abs(e.x - player.x) < 56);
    if (threat && player.onGround) {
      player.facing = Math.sign(threat.x - player.x) || 1;
      if (!cloud) shakeSalt();
    }
    let best = null;
    for (const l of layers) {
      if (l.state !== 'rest') continue;
      const seg = l.walked.findIndex(w => !w);
      const x = l.x - LAYER_W / 2 + (seg + 0.5) * (LAYER_W / SEGMENTS);
      const d = Math.abs(x - player.x) + Math.abs(FLOOR_Y[l.floor] - player.y) * 2;
      if (!best || d < best.d) best = { x, y: FLOOR_Y[l.floor], d };
    }
    if (!best) return ctl;
    const move = world.route(player, best);
    if (move) ctl[move] = true;
    else ctl[best.x < player.x ? 'left' : 'right'] = Math.abs(best.x - player.x) > 1;
    return ctl;
  }

  // ---------- Input ----------

  input.on(action => {
    if (shell.handle(action)) return;
    if (shell.state === 'playing' && (action === 'start' || action === 'tap')) saltQueued = true;
  });

  // ---------- Update ----------

  function updatePlay(dt) {
    const ctl = demo ? demoControls() : { left: input.isDown('left'), right: input.isDown('right'), up: input.isDown('up'), down: input.isDown('down') };
    world.step(player, dt, ctl);
    player.x = Math.max(FLOOR_X[0] + 4, Math.min(FLOOR_X[1] - 4, player.x));
    if (ctl.left || ctl.right || (player.ladder && (ctl.up || ctl.down))) player.walk += dt;
    if (saltQueued) {
      saltQueued = false;
      shakeSalt();
    }
    if (cloud && (cloud.t += dt) > 450) cloud = null;
    walkLayers();
    updateLayers(dt);
    updateEnemies(dt);
    if (shell.state === 'playing' || shell.state === 'title') collide();
    // A snack shows up now and then once the burgers are under way: points and an extra shake of salt.
    if (dropped >= 2 && !snack && (snackT -= dt) <= 0) {
      snackT = 15000;
      snack = { x: 240, y: FLOOR_Y[2], t: SNACK_MS };
    }
    if (snack && (snack.t -= dt) <= 0) snack = null;
  }

  function update(dt) {
    shell.update(dt);
    fx.update(dt);
    shake = Math.max(0, shake - dt * 0.02);
    const st = shell.state;
    if (st === 'title' || st === 'playing') updatePlay(dt);
    else if (st === 'ready' && shell.stateTime >= READY_MS) shell.setState('playing');
    else if (st === 'dying') {
      updateLayers(dt);
      if (shell.stateTime >= DYING_MS) {
        if (lives <= 0) shell.gameOver(score, 'LEVEL ' + level);
        else {
          resetActors();
          shell.setState('ready');
        }
      }
    } else if (st === 'clear' && shell.stateTime >= CLEAR_MS) {
      level++;
      salt = Math.max(salt, SALT_START);
      buildStage();
      shell.setState('ready');
    }
  }

  // ---------- Render ----------

  function drawFloorsAndLadders() {
    ctx.save();
    for (const l of world.ladders) {
      ctx.strokeStyle = '#b26bff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(l.x - 6, l.top + 2);
      ctx.lineTo(l.x - 6, l.bottom);
      ctx.moveTo(l.x + 6, l.top + 2);
      ctx.lineTo(l.x + 6, l.bottom);
      for (let y = l.top + 8; y < l.bottom; y += 8) {
        ctx.moveTo(l.x - 6, y);
        ctx.lineTo(l.x + 6, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = C.cyan;
    ctx.shadowColor = C.cyan;
    ctx.shadowBlur = 8;
    for (const y of FLOOR_Y) ctx.fillRect(FLOOR_X[0], y, FLOOR_X[1] - FLOOR_X[0], 4);
    // Plates under each burger
    ctx.fillStyle = '#cfd8e8';
    ctx.shadowColor = '#cfd8e8';
    for (const x of COLUMNS) {
      ctx.fillRect(x - 40, PLATE_Y, 80, 4);
      ctx.fillRect(x - 32, PLATE_Y + 4, 64, 3);
    }
    ctx.restore();
  }

  function drawLayer(l) {
    const left = l.x - LAYER_W / 2;
    const segW = LAYER_W / SEGMENTS;
    for (let i = 0; i < SEGMENTS; i++) {
      const sag = l.state === 'rest' && l.walked[i] ? 3 : 0;
      const x = left + i * segW;
      const top = l.y - LAYER_H + sag - 2;
      ctx.save();
      if (l.kind === 'bunTop') {
        ctx.fillStyle = '#ff9f1c';
        ctx.fillRect(x, top - 3, segW, LAYER_H + 3);
        if (i === 0) ctx.clearRect(x, top - 3, 3, 3);
        if (i === SEGMENTS - 1) ctx.clearRect(x + segW - 3, top - 3, 3, 3);
        ctx.fillStyle = C.yellow;
        ctx.fillRect(x + 4, top - 1, 2, 2);
        ctx.fillRect(x + 11, top + 1, 2, 2);
      } else if (l.kind === 'lettuce') {
        ctx.fillStyle = C.green;
        ctx.fillRect(x, top + 2, segW, 4);
        for (let k = 0; k < segW; k += 4) ctx.fillRect(x + k, top + (k % 8 ? 6 : 0), 3, 3);
      } else if (l.kind === 'cheese') {
        ctx.fillStyle = C.yellow;
        ctx.fillRect(x, top + 1, segW, 4);
        ctx.fillRect(x + 5, top + 5, 3, 4);
      } else if (l.kind === 'patty') {
        ctx.fillStyle = '#c2552f';
        ctx.fillRect(x, top, segW, LAYER_H);
        ctx.fillStyle = '#7a2f18';
        ctx.fillRect(x + 3, top + 3, 8, 2);
      } else {
        ctx.fillStyle = '#ff9f1c';
        ctx.fillRect(x, top + 2, segW, LAYER_H - 2);
        ctx.fillStyle = '#c86f0a';
        ctx.fillRect(x, top + LAYER_H - 1, segW, 1);
      }
      ctx.restore();
    }
  }

  function drawChasers() {
    for (const e of enemies) {
      if (e.state === 'wait') continue;
      const spec = CHASERS[e.kind];
      const frame = Math.floor(e.walk / 140) % 2;
      const stunned = e.state === 'stun';
      if (stunned && e.t < 800 && blink(80)) continue;
      A.drawSprite(ctx, spec.sprites[stunned ? 0 : frame], e.x + (stunned ? Math.sin(shell.clock / 30) * 1.5 : 0), e.y - 12, { flip: e.facing < 0 });
      if (stunned) {
        for (let i = 0; i < 3; i++) {
          const a = shell.clock / 200 + (i * Math.PI * 2) / 3;
          ctx.fillStyle = C.yellow;
          ctx.fillRect(e.x + Math.cos(a) * 10 - 1.5, e.y - 30 + Math.sin(a) * 3, 3, 3);
        }
      }
    }
  }

  function drawCook() {
    const frames = cook();
    if (shell.state === 'dying') {
      const t = shell.stateTime / DYING_MS;
      A.drawSprite(ctx, frames.flail, player.x, player.y - 13 - Math.sin(t * Math.PI) * 16, { angle: t * Math.PI * 3 });
      return;
    }
    let frame = frames.stand;
    if (player.ladder) frame = Math.floor(player.walk / 140) % 2 ? frames.lift : frames.stand;
    else if (player.vx) frame = Math.floor(player.walk / 110) % 2 ? frames.walk1 : frames.walk2;
    A.drawSprite(ctx, frame, player.x, player.y - 13, { flip: player.ladder ? Math.floor(player.walk / 140) % 2 === 1 : player.facing < 0 });
  }

  function drawExtras() {
    if (cloud) {
      ctx.fillStyle = C.text;
      ctx.globalAlpha = 1 - cloud.t / 450;
      for (let i = 0; i < 14; i++) {
        const a = i * 2.4;
        const r = 6 + (cloud.t / 450) * 18 * ((i % 3) + 1) / 3;
        ctx.fillRect(cloud.x + Math.cos(a) * r, cloud.y + Math.sin(a) * r * 0.6, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
    if (snack && (snack.t > 2000 || blink(120))) {
      ctx.fillStyle = '#ff3b3b';
      ctx.fillRect(snack.x - 6, snack.y - 12, 12, 10);
      ctx.fillStyle = C.yellow;
      for (let i = 0; i < 4; i++) ctx.fillRect(snack.x - 5 + i * 3, snack.y - 18 + (i % 2) * 2, 2, 7);
    }
  }

  function drawFooter() {
    if (demo) return;
    const y = H - 18;
    const frames = cook();
    for (let i = 0; i < Math.min(lives - (shell.state === 'dying' ? 0 : 1), 5); i++) A.drawSprite(ctx, frames.stand, 16 + i * 16, y - 2, { scale: 0.55 });
    ctx.fillStyle = C.text;
    ctx.fillRect(W - 82, y - 8, 8, 12);
    ctx.fillStyle = C.dim;
    ctx.fillRect(W - 81, y - 11, 6, 3);
    A.text(ctx, 'SALT ' + salt, W - 12, y, { size: 8, color: C.text, align: 'right' });
  }

  function drawMessages() {
    const cx = W / 2;
    const cy = H / 2;
    if (shell.state === 'ready') {
      A.text(ctx, 'LUNCH RUSH ' + level, cx, cy - 30, { size: 16, color: '#ff9f1c', glow: 12 });
      if (blink(150)) A.text(ctx, 'STACK THOSE BURGERS!', cx, cy, { size: 10, color: C.yellow });
    } else if (shell.state === 'clear') {
      A.text(ctx, 'ORDER UP!', cx, cy - 20, { size: 22, color: C.green, glow: 14 });
    } else if (shell.state === 'dying' && shell.stateTime > 700) {
      const msg = lives <= 0 ? 'GAME OVER' : lives === 1 ? 'LAST LIFE!' : lives + ' LIVES LEFT';
      A.text(ctx, msg, cx, cy, { size: 14, color: lives <= 0 ? C.red : C.yellow, glow: 10 });
    }
  }

  function render() {
    ctx.save();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    shell.drawHud(score, level);
    drawFloorsAndLadders();
    layers.forEach(drawLayer);
    drawExtras();
    drawChasers();
    drawCook();
    fx.draw(ctx);
    drawFooter();
    drawMessages();
    shell.drawOverlay();
    ctx.restore();
  }

  showTitle();
  A.waitForFont().then(() => A.startLoop({ update, render }));
})();
