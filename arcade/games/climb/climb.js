/*
 * Barrel Climb: Avalanche Peak. A Neon Arcade climbing game: Shredder (from the arcade's own crew) climbs
 * an icy lift tower to rescue the ski-patrol pup, while the Yeti at the top rolls snowballs down that
 * grow as they roll. Stage 1 is sloped girders and ladders; stage 2 pulls the summit's bolts until it
 * collapses. Stages alternate and get faster.
 * Play states: ready -> playing <-> paused, dying, clear (stage won), collapse (bolts all out).
 * The shell runs title, pause, initials and game over.
 */
(function () {
  'use strict';

  const A = window.Arcade;
  const C = A.COLORS;

  const GAME_ID = 'climb';
  const W = 480;
  const H = 600;
  const HUD = 48;

  const START_LIVES = 3;
  const EXTRA_LIFE_AT = 10000;
  const READY_MS = 1600;
  const DYING_MS = 2000;
  const CLEAR_MS = 2600;
  const COLLAPSE_MS = 3000;
  const AXE_MS = 9000;
  const MAX_FALL = 34; // drop further than this and you don't get up
  const BONUS_TICK_MS = 2000;
  const ICE_BLUE = '#29f0ff';
  const SNOW = '#f4f1ff';
  const YETI_WHITE = '#e8f4ff';
  const BOLT_GAP = 9;

  // Stage 1, the lift tower: girders alternate slope so snowballs zig-zag all the way down.
  const TOWER = {
    girders: [
      { x1: 0, y1: 556, x2: 480, y2: 546 },
      { x1: 0, y1: 460, x2: 440, y2: 474 },
      { x1: 30, y1: 396, x2: 470, y2: 382 },
      { x1: 0, y1: 300, x2: 440, y2: 314 },
      { x1: 30, y1: 236, x2: 470, y2: 222 },
      { x1: 30, y1: 142, x2: 440, y2: 152 },
      { x1: 170, y1: 92, x2: 310, y2: 92 }, // the summit, where the pup is
    ],
    // [x, girder above, girder below, broken]
    ladders: [[380, 1, 0], [110, 1, 0, true], [90, 2, 1], [270, 2, 1], [330, 3, 2], [170, 3, 2, true], [80, 4, 3], [240, 4, 3], [400, 5, 4], [280, 5, 4, true], [260, 6, 5]],
    axes: [[400, 2], [120, 4]],
    pickups: [['mittens', 150, 2], ['thermos', 340, 4], ['goggles', 330, 5]],
    start: { x: 60, g: 0 },
    yeti: { x: 72, g: 5 },
    pup: { x: 210, g: 6 },
  };

  // Stage 2, the summit: flat floors held up by bolts. Walk over all eight to pull them out.
  const SUMMIT = {
    girders: [
      { x1: 0, y1: 556, x2: 480, y2: 556 },
      { x1: 20, y1: 470, x2: 460, y2: 470 },
      { x1: 20, y1: 388, x2: 460, y2: 388 },
      { x1: 20, y1: 306, x2: 460, y2: 306 },
      { x1: 20, y1: 224, x2: 460, y2: 224 },
      { x1: 60, y1: 142, x2: 420, y2: 142 },
      { x1: 190, y1: 92, x2: 290, y2: 92 },
    ],
    ladders: [[60, 1, 0], [240, 1, 0], [420, 1, 0], [160, 2, 1], [320, 2, 1], [60, 3, 2], [240, 3, 2], [420, 3, 2], [160, 4, 3], [320, 4, 3], [100, 5, 4], [380, 5, 4]],
    bolts: [[120, 1], [360, 1], [120, 2], [360, 2], [120, 3], [360, 3], [120, 4], [360, 4]],
    axes: [[420, 2], [60, 4]],
    pickups: [['thermos', 300, 1], ['mittens', 200, 3], ['goggles', 240, 5]],
    start: { x: 30, g: 0 },
    yeti: { x: 240, g: 5 },
    pup: { x: 240, g: 6 },
  };

  const PICKUP_POINTS = { mittens: 300, thermos: 500, goggles: 800 };

  // ---------- Sprites ----------

  // Shredder from the arcade's construction crew (assets/crew.js), frame by frame, at 2x.
  function crewFrames(name) {
    const crew = window.Crew && window.Crew.list.find(m => m.name === name);
    const LEGS = {
      stand: ['..LL.LL...', '..LL.LL...', '.XXX.XXX..'],
      walk1: ['..LL.LL...', '.LL...LL..', '.XX...XX..'],
      walk2: ['...LLL....', '...LLL....', '...XXX....'],
    };
    const set = (rows, list) => {
      const g = rows.map(r => r.split(''));
      list.forEach(([x, y, v]) => { g[y][x] = v; });
      return g.map(r => r.join(''));
    };
    if (!crew) {
      const plain = ['..OOOO....', '.OOOOOO...', '..SSSS....', '..SSES....', '..SSSS....', '..SSSS....', '.TTTTTT...', 'ATTTTTTA..', 'A.TTTT.A..', '..PPPP....', '..PP.PP...', '..PP.PP...', '.XXX.XXX..'];
      const pal = { O: '#ff5a1f', S: '#f1c27d', E: '#0a0a0a', T: '#14a39a', A: '#14a39a', P: '#222', X: '#111' };
      const s = A.makeSprite(plain, pal, 2);
      return { stand: s, walk1: s, walk2: s, lift: s, flail: s };
    }
    const legs = crew.legs || LEGS;
    const stand = crew.rows.concat(legs.stand);
    const arms = [[0, 7, '.'], [0, 8, '.'], [7, 7, '.'], [7, 8, '.'], [0, 6, 'A'], [0, 5, 'A'], [7, 6, 'A'], [7, 5, 'A']];
    const pal = { E: '#0a0a0a', ...crew.c, X: crew.legsK || crew.c.K };
    return {
      stand: A.makeSprite(stand, pal, 2),
      walk1: A.makeSprite(crew.rows.concat(legs.walk1), pal, 2),
      walk2: A.makeSprite(crew.rows.concat(legs.walk2), pal, 2),
      lift: A.makeSprite(set(stand, arms), pal, 2),
      flail: A.makeSprite(set(crew.rows.concat(legs.walk1), arms), pal, 2),
    };
  }
  let HERO = null;

  const YETI_PAL = { W: YETI_WHITE, B: '#5a7ab8', R: '#ff3b3b', K: '#07091c' };
  const YETI_HEAD = ['....WWWWWWWW....', '...WWWWWWWWWW...', '...WWBBBBBBWW...', '...WWBRBBRBWW...', '...WWBBBBBBWW...', '....WWBKKBWW....'];
  const YETI = [
    YETI_HEAD.concat(['..WWWWWWWWWWWW..', '.WWWWWWWWWWWWWW.', 'WWWWWWWWWWWWWWWW', 'WWW.WWWWWWWW.WWW', 'WW..WWWWWWWW..WW', 'WW..WWWWWWWW..WW', '....WWWWWWWW....', '....WWW..WWW....', '...WWWW..WWWW...', '...WWW....WWW...']),
    ['WW..WWWWWWWW..WW', 'WW.WWWWWWWWWW.WW', 'WWWWWBBBBBBWWWWW', '.WWWWBRBBRBWWWW.', '...WWBBBBBBWW...', '....WWBKKBWW....', '..WWWWWWWWWWWW..', '..WWWWWWWWWWWW..', '..WWWWWWWWWWWW..', '...WWWWWWWWWW...', '....WWWWWWWW....', '....WWWWWWWW....', '....WWWWWWWW....', '....WWW..WWW....', '...WWWW..WWWW...', '...WWW....WWW...'],
  ].map(m => A.makeSprite(m, YETI_PAL, 3));
  const PUP = [
    ['........BB', '.......OOB', 'OOOOOOOEOO', 'OPPPPPPOOO', 'OOOOOOOO..', 'O.O..O.O..', 'O.O..O.O..'],
    ['.......BB.', '.......OOB', 'OOOOOOOEOO', 'OPPPPPPOOO', 'OOOOOOOO..', '.O.O..O.O.', '.O.O..O.O.'],
  ].map(m => A.makeSprite(m, { O: '#ffb84d', B: '#a8602a', E: C.bg, P: C.pink }, 2));

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
  let stage, world, girderLadders, player, balls, sprites, axes, pickups, bolts;
  let bonus = 0;
  let bonusT = 0;
  let throwT = 0;
  let spriteT = 0;
  let crystalT = 0;
  let jumpQueued = false;
  let yetiPose = 0;
  let yetiT = 0;
  let deathKind = '';
  let shake = 0;

  const shell = A.createShell({
    ctx, width: W, height: H, id: GAME_ID,
    title: ['AVALANCHE', 'PEAK'],
    titleColors: [ICE_BLUE, SNOW],
    howTo: [
      ['CLIMB TO SAVE THE PATROL PUP', '#ffb84d'],
      ['JUMP THE SNOWBALLS - 100', SNOW],
      ['ICE AXE SMASHES THEM', ICE_BLUE],
      ["DON'T FALL TOO FAR!", C.pink],
      [A.isTouch ? 'D-PAD MOVES - JUMP BUTTON' : 'ARROWS MOVE/CLIMB - SPACE JUMPS', C.dim],
    ],
    hudLabel: 'LEVEL',
    newGame, showTitle,
  });

  const rand = (a, b) => a + Math.random() * (b - a);
  const sfx = (name, arg) => { if (!demo) A.sound.play(name, arg); };
  const blink = (ms = 500) => Math.floor(shell.clock / ms) % 2 === 0;
  const tier = () => Math.floor((level - 1) / 2); // each pair of stages gets faster
  const isTower = () => stage === TOWER;
  const downhill = g => Math.sign((g.y2 - g.y1) * (g.x2 - g.x1)) || 1;
  const girderOf = (b, reach = 8) => world.groundAt(b.x, b.y - 4, reach);
  // Floors keep their stage index even after pulled bolts split them into pieces.
  const floorAt = (i, x) => world.girders.find(g => g.floor === i && x >= Math.min(g.x1, g.x2) && x <= Math.max(g.x1, g.x2)) || world.girders.find(g => g.floor === i);

  // ---------- Stages ----------

  function buildStage() {
    stage = level % 2 === 1 ? TOWER : SUMMIT;
    const girders = stage.girders.map((g, i) => ({ ...g, floor: i }));
    const surface = (g, x) => g.y1 + ((x - g.x1) * (g.y2 - g.y1)) / (g.x2 - g.x1);
    const ladders = stage.ladders.map(([x, up, low, broken]) => ({ x, top: surface(girders[up], x), bottom: surface(girders[low], x), up, low, broken: !!broken }));
    world = A.createPlatforms({ girders, ladders, width: W, jump: 0.33 });
    girderLadders = girders;
    axes = stage.axes.map(([x, g]) => ({ x, y: surface(girders[g], x) - 22, taken: false }));
    pickups = stage.pickups.map(([kind, x, g]) => ({ kind, x, y: surface(girders[g], x) - 10, taken: false }));
    bolts = (stage.bolts || []).map(([x, g]) => ({ x, g, out: false }));
    resetRun();
  }

  // Back to the bottom: after a lost life the stage itself stays as it was (pulled bolts stay out).
  function resetRun() {
    const s = stage.start;
    const g = floorAt(s.g, s.x);
    player = { x: s.x, y: world.surface(g, s.x), vx: 0, vy: 0, onGround: true, ladder: null, facing: 1, walk: 0, axe: 0 };
    balls = [];
    sprites = [];
    bonus = Math.min(8000, 5000 + tier() * 1000);
    bonusT = 0;
    throwT = 1600;
    spriteT = isTower() ? 0 : 3000;
    jumpQueued = false;
  }

  function newGame() {
    if (window.track) track('play:' + GAME_ID);
    demo = false;
    level = 1;
    score = 0;
    lives = START_LIVES;
    bonusLife = false;
    fx.clear();
    buildStage();
    shell.setState('ready');
    A.sound.play('start');
  }

  function showTitle() {
    demo = true;
    level = 1;
    score = 0;
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

  function die(kind) {
    if (shell.state !== 'playing' && shell.state !== 'title') return;
    deathKind = kind;
    fx.burst(player.x, player.y - 14, SNOW, 26, 0.2);
    sfx('die');
    shake = 8;
    if (demo) {
      showTitle();
      return;
    }
    lives--;
    shell.setState('dying');
  }

  // ---------- The player ----------

  function controls() {
    if (demo) return demoControls();
    const ctl = { left: input.isDown('left'), right: input.isDown('right'), up: input.isDown('up'), down: input.isDown('down'), jump: jumpQueued };
    jumpQueued = false;
    return ctl;
  }

  function updatePlayer(dt) {
    const ctl = controls();
    // Holding the ice axe: no climbing and no jumping, just walking and smashing.
    if (player.axe > 0) {
      player.axe -= dt;
      ctl.up = ctl.down = ctl.jump = false;
    }
    const event = world.step(player, dt, ctl);
    if (event === 'jump') sfx('jump');
    if (player.onGround && (ctl.left || ctl.right)) player.walk += dt;
    if (player.ladder && player.climbing) player.walk += dt;
    if (event === 'land' && player.fall > MAX_FALL) die('fall');

    // Grab ice axes and pickups by touching them.
    for (const a of axes) {
      if (!a.taken && Math.abs(a.x - player.x) < 12 && Math.abs(a.y - (player.y - 14)) < 18) {
        a.taken = true;
        player.axe = AXE_MS;
        sfx('powerup');
      }
    }
    for (const p of pickups) {
      if (!p.taken && Math.abs(p.x - player.x) < 12 && Math.abs(p.y - (player.y - 10)) < 16) {
        p.taken = true;
        addScore(PICKUP_POINTS[p.kind] * (1 + tier()), p.x, p.y - 12, C.pink);
        sfx('bonus');
      }
    }
    // Walking over a bolt pulls it out, leaving a gap to jump.
    const ground = player.onGround ? girderOf(player, 6) : null;
    if (ground) {
      for (const b of bolts) if (!b.out && Math.abs(b.x - player.x) <= 5 && ground.g.floor === b.g) pullBolt(b);
      // Reaching the summit (stage 1) wins it.
      if (isTower() && ground.g.floor === 6) winStage();
    }
  }

  function pullBolt(b) {
    b.out = true;
    addScore(100 * (1 + tier()), b.x, stage.girders[b.g].y1 - 20, C.yellow);
    sfx('pop');
    // The floor the bolt held splits in two, with a gap where it was.
    const next = [];
    for (const g of world.girders) {
      if (g.floor === b.g && b.x > Math.min(g.x1, g.x2) && b.x < Math.max(g.x1, g.x2)) {
        next.push({ ...g, x2: b.x - BOLT_GAP, y2: g.y1 });
        next.push({ ...g, x1: b.x + BOLT_GAP, y1: g.y2 });
      } else next.push(g);
    }
    world.setGirders(next);
    if (bolts.every(o => o.out)) {
      addScore(Math.max(0, bonus), W / 2, HUD + 80, C.green);
      sfx('collapse');
      shake = 14;
      shell.setState('collapse');
    }
  }

  function winStage() {
    addScore(Math.max(0, bonus), W / 2, HUD + 80, C.green);
    sfx('home');
    if (demo) {
      showTitle();
      return;
    }
    shell.setState('clear');
  }

  // ---------- Snowballs ----------
  // They roll downhill, drop off girder ends onto the next girder down, sometimes take a ladder,
  // and grow as they go. One that reaches the bottom cracks the ice crystal and frees an ice sprite.

  const ballSpeed = () => Math.min(0.15, 0.085 + tier() * 0.01);

  function throwBall() {
    const x = stage.yeti.x + 36;
    const g = floorAt(stage.yeti.g, x);
    const b = { x, y: world.surface(g, x), r: 6, g, vx: downhill(g) * ballSpeed(), vy: 0, mode: 'roll', dist: 0, seen: new Set(), jumped: false, spin: 0 };
    balls.push(b);
    yetiPose = 1;
    yetiT = 400;
  }

  function updateBall(b, dt) {
    if (b.mode === 'roll') {
      b.x += b.vx * dt;
      b.dist += Math.abs(b.vx) * dt;
      b.spin += b.vx * dt * 0.2;
      b.r = 6 + Math.min(4, b.dist / 380);
      const minX = Math.min(b.g.x1, b.g.x2);
      const maxX = Math.max(b.g.x1, b.g.x2);
      if (b.x < minX || b.x > maxX) {
        b.mode = 'fall';
        b.vy = 0;
        return;
      }
      b.y = world.surface(b.g, b.x);
      // Passing the top of a ladder: maybe take it down, more often when you're below.
      for (const l of world.ladders) {
        if (b.seen.has(l) || Math.abs(l.x - b.x) > 2 || Math.abs(l.top - b.y) > 4) continue;
        b.seen.add(l);
        const chance = 0.18 + (player.y > b.y + 20 && Math.abs(player.x - l.x) < 120 ? 0.3 : 0);
        if (Math.random() < chance) {
          b.mode = 'ladder';
          b.ladder = l;
          b.x = l.x;
        }
      }
      if (b.g.floor === 0 && b.x < 44) {
        b.dead = true;
        crackCrystal();
      }
    } else if (b.mode === 'ladder') {
      b.y += 0.08 * dt;
      if (b.y >= b.ladder.bottom) {
        b.y = b.ladder.bottom;
        const ground = world.groundAt(b.x, b.y - 3, 6);
        if (ground) {
          b.g = ground.g;
          b.mode = 'roll';
          b.vx = downhill(ground.g) * ballSpeed();
        } else b.mode = 'fall';
      }
    } else {
      const before = b.y;
      b.vy += 0.0018 * dt;
      b.y += b.vy * dt;
      b.x += b.vx * 0.3 * dt;
      const ground = world.groundAt(b.x, before, b.y - before + 1);
      if (ground && b.vy > 0) {
        b.y = ground.y;
        b.g = ground.g;
        b.mode = 'roll';
        b.vx = downhill(ground.g) * ballSpeed();
        sfx('roll');
      }
      if (b.y > H + 30) b.dead = true;
    }
  }

  function crackCrystal() {
    crystalT = 600;
    fx.burst(30, world.surface(floorAt(0, 30), 30) - 14, ICE_BLUE, 14, 0.15);
    if (sprites.length < 2 + tier()) spawnSprite(30, 0);
    sfx('zap');
  }

  // ---------- Ice sprites ----------
  // They wander the girders toward you and drift up and down ladders.

  function spawnSprite(x, gIndex) {
    const g = floorAt(gIndex, x);
    sprites.push({ x, y: world.surface(g, x), vx: 0, vy: 0, onGround: true, ladder: null, facing: 1, mind: 0, want: 1, climb: 0 });
  }

  function updateSprites(dt) {
    if (!isTower() && (spriteT -= dt) <= 0) {
      spriteT = Math.max(2500, 6000 - tier() * 800);
      if (sprites.length < 3 + tier()) spawnSprite(Math.random() < 0.5 ? 40 : 440, 4);
    }
    for (const s of sprites) {
      if ((s.mind -= dt) <= 0) {
        s.mind = rand(800, 2000);
        s.want = Math.random() < 0.7 ? Math.sign(player.x - s.x) || 1 : -s.want;
        s.climb = player.y < s.y - 20 ? -1 : player.y > s.y + 20 ? 1 : 0;
      }
      const ctl = { left: s.want < 0, right: s.want > 0, up: s.climb < 0 && Math.random() < 0.7, down: s.climb > 0 && Math.random() < 0.7 };
      if (s.ladder) {
        ctl.left = ctl.right = false;
        ctl.up = s.ladderDir < 0;
        ctl.down = s.ladderDir > 0;
      }
      // Turn around at girder ends instead of walking off.
      if (s.onGround && !world.groundAt(s.x + s.want * 8, s.y - 4, 10)) {
        s.want = -s.want;
        ctl.left = s.want < 0;
        ctl.right = s.want > 0;
      }
      const wasLadder = s.ladder;
      world.step(s, dt * 0.5, ctl);
      if (!wasLadder && s.ladder) s.ladderDir = ctl.up ? -1 : 1;
      if (!s.onGround && !s.ladder) s.dead = true; // slipped off somewhere: melt away
    }
    sprites = sprites.filter(s => !s.dead);
  }

  // ---------- Collisions ----------

  function collide() {
    const px = player.x;
    const py = player.y - 13;
    const swinging = player.axe > 0;
    const smashX = px + player.facing * 14;
    for (const b of balls) {
      const by = b.y - b.r;
      if (swinging && Math.abs(b.x - smashX) < b.r + 10 && Math.abs(by - py) < b.r + 14) {
        b.dead = true;
        addScore((b.r > 9 ? 500 : 300) * (1 + tier()), b.x, by - 10, ICE_BLUE);
        fx.burst(b.x, by, SNOW, 18, 0.18);
        sfx('bonk');
        continue;
      }
      // Jumped clean over it.
      if (!b.jumped && !player.onGround && !player.ladder && Math.abs(b.x - px) < 10 && player.y < b.y - b.r * 2) {
        b.jumped = true;
        addScore(100 * (1 + tier()), px, player.y - 34, C.yellow);
        sfx('select');
      }
      // Hit if it overlaps your body: your feet below its top, your head above its bottom.
      if (Math.abs(b.x - px) < b.r + 1 && player.y > b.y - b.r * 2 + 3 && player.y - 24 < b.y) {
        die('hit');
        return;
      }
    }
    for (const s of sprites) {
      const sy = s.y - 9;
      if (swinging && Math.abs(s.x - smashX) < 18 && Math.abs(sy - py) < 20) {
        s.dead = true;
        addScore(500 * (1 + tier()), s.x, sy - 10, ICE_BLUE);
        fx.burst(s.x, sy, ICE_BLUE, 18, 0.18);
        sfx('bonk');
        continue;
      }
      if (Math.abs(s.x - px) < 12 && Math.abs(sy - py) < 16) {
        die('hit');
        return;
      }
    }
    balls = balls.filter(b => !b.dead);
    sprites = sprites.filter(s => !s.dead);
  }

  // ---------- Attract-mode AI ----------
  // The CPU heads for the nearest whole ladder up from the girder it's on, climbs it, and hops
  // any snowball rolling at it.

  function demoControls() {
    const ctl = { left: false, right: false, up: false, down: false, jump: false };
    if (player.ladder) {
      ctl.up = true;
      return ctl;
    }
    if (!player.onGround) return ctl;
    const ground = girderOf(player, 6);
    if (!ground) return ctl;
    const gi = ground.g.floor;
    const ups = world.ladders.filter(l => !l.broken && l.low === gi);
    const target = ups.sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x))[0];
    for (const b of balls) {
      const ahead = (b.x - player.x) * (b.vx || 0) < 0 && Math.abs(b.x - player.x) < 34 && Math.abs(b.y - player.y) < 8;
      if (ahead && b.mode === 'roll') {
        ctl.jump = true;
        return ctl;
      }
    }
    if (!target) return ctl;
    if (Math.abs(target.x - player.x) < 3) ctl.up = true;
    else if (target.x < player.x) ctl.left = true;
    else ctl.right = true;
    return ctl;
  }

  // ---------- Input ----------

  input.on(action => {
    if (shell.handle(action)) return;
    if (shell.state === 'playing' && (action === 'start' || action === 'tap')) jumpQueued = true;
  });

  // ---------- Update ----------

  function updateWorld(dt) {
    if (yetiT > 0 && (yetiT -= dt) <= 0) yetiPose = 0;
    if (crystalT > 0) crystalT -= dt;
    if (isTower() && (throwT -= dt) <= 0) {
      throwT = Math.max(1100, rand(2200, 3600) - tier() * 300);
      throwBall();
    }
    if (!isTower() && yetiT <= 0 && Math.random() < dt / 1500) {
      yetiPose = 1; // pounds his chest
      yetiT = 300;
    }
    updatePlayer(dt);
    if (shell.state !== 'playing' && shell.state !== 'title') return;
    balls.forEach(b => updateBall(b, dt));
    balls = balls.filter(b => !b.dead);
    updateSprites(dt);
    collide();
    if (!demo && (bonusT += dt) >= BONUS_TICK_MS) {
      bonusT = 0;
      bonus -= 100;
      if (bonus <= 0) {
        bonus = 0;
        die('time');
      }
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
      if (lives <= 0) shell.gameOver(score, 'LEVEL ' + level);
      else {
        resetRun();
        shell.setState('ready');
      }
    } else if ((st === 'clear' && shell.stateTime >= CLEAR_MS) || (st === 'collapse' && shell.stateTime >= COLLAPSE_MS)) {
      level++;
      buildStage();
      shell.setState('ready');
    }
  }

  // ---------- Render ----------

  function drawGirder(g, t = 1) {
    const thick = 7;
    ctx.save();
    ctx.fillStyle = ICE_BLUE;
    ctx.globalAlpha = 0.9 * t;
    ctx.beginPath();
    ctx.moveTo(g.x1, g.y1);
    ctx.lineTo(g.x2, g.y2);
    ctx.lineTo(g.x2, g.y2 + thick);
    ctx.lineTo(g.x1, g.y1 + thick);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = t;
    ctx.fillStyle = SNOW;
    ctx.beginPath();
    ctx.moveTo(g.x1, g.y1 - 2);
    ctx.lineTo(g.x2, g.y2 - 2);
    ctx.lineTo(g.x2, g.y2);
    ctx.lineTo(g.x1, g.y1);
    ctx.closePath();
    ctx.fill();
    // girder lattice ticks
    ctx.fillStyle = '#0e3a52';
    const len = Math.abs(g.x2 - g.x1);
    for (let d = 10; d < len; d += 16) {
      const x = Math.min(g.x1, g.x2) + d;
      ctx.fillRect(x, world.surface(g, x) + 2, 2, thick - 3);
    }
    ctx.restore();
  }

  function drawLadder(l) {
    ctx.save();
    ctx.strokeStyle = '#b26bff';
    ctx.lineWidth = 2;
    const top = l.top + 1;
    const bottom = l.bottom;
    ctx.beginPath();
    ctx.moveTo(l.x - 6, top);
    ctx.lineTo(l.x - 6, bottom);
    ctx.moveTo(l.x + 6, top);
    ctx.lineTo(l.x + 6, bottom);
    for (let y = top + 6; y < bottom; y += 8) {
      // Broken ladders are missing their middle rungs.
      if (l.broken && y > top + (bottom - top) * 0.3 && y < top + (bottom - top) * 0.7) continue;
      ctx.moveTo(l.x - 6, y);
      ctx.lineTo(l.x + 6, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawCrystal() {
    const x = 26;
    const y = world.surface(floorAt(0, x), x);
    ctx.save();
    ctx.fillStyle = crystalT > 0 && blink(60) ? SNOW : ICE_BLUE;
    ctx.shadowColor = ICE_BLUE;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(x, y - 34);
    ctx.lineTo(x + 11, y - 18);
    ctx.lineTo(x, y);
    ctx.lineTo(x - 11, y - 18);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = SNOW;
    ctx.fillRect(x - 2, y - 26, 4, 14);
    ctx.restore();
  }

  function drawItems() {
    for (const a of axes) {
      if (a.taken) continue;
      const bob = Math.sin(shell.clock / 250) * 2;
      drawAxe(a.x, a.y + bob, 0);
    }
    for (const p of pickups) {
      if (p.taken) continue;
      const y = p.y + Math.sin(shell.clock / 300 + p.x) * 2;
      ctx.save();
      if (p.kind === 'mittens') {
        ctx.fillStyle = C.pink;
        ctx.fillRect(p.x - 9, y - 6, 7, 10);
        ctx.fillRect(p.x + 2, y - 6, 7, 10);
        ctx.fillRect(p.x - 11, y - 3, 3, 4);
        ctx.fillRect(p.x + 8, y - 3, 3, 4);
      } else if (p.kind === 'thermos') {
        ctx.fillStyle = ICE_BLUE;
        ctx.fillRect(p.x - 4, y - 9, 8, 16);
        ctx.fillStyle = SNOW;
        ctx.fillRect(p.x - 5, y - 11, 10, 3);
      } else {
        ctx.fillStyle = C.yellow;
        ctx.fillRect(p.x - 11, y - 1, 22, 3);
        ctx.fillStyle = ICE_BLUE;
        ctx.fillRect(p.x - 8, y - 4, 7, 6);
        ctx.fillRect(p.x + 1, y - 4, 7, 6);
      }
      ctx.restore();
    }
    for (const b of bolts) {
      if (b.out) continue;
      const g = stage.girders[b.g];
      ctx.fillStyle = C.yellow;
      ctx.fillRect(b.x - 4, g.y1 - 1, 8, 8);
      ctx.fillStyle = C.bg;
      ctx.fillRect(b.x - 1, g.y1 + 1, 2, 4);
    }
  }

  function drawAxe(x, y, swing) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(swing);
    ctx.fillStyle = '#a8602a';
    ctx.fillRect(-1, -2, 3, 18);
    ctx.fillStyle = '#cfd8e8';
    ctx.fillRect(-7, -4, 14, 4);
    ctx.fillRect(5, -4, 3, 8);
    ctx.restore();
  }

  function drawYetiAndPup() {
    const yg = stage.girders[stage.yeti.g];
    let yx = stage.yeti.x;
    let yy = yg.y1 - 24;
    if (shell.state === 'collapse') yy += Math.pow(shell.stateTime / 600, 2) * 40; // tumbling down
    A.drawSprite(ctx, YETI[yetiPose], yx, yy);
    const pg = stage.girders[stage.pup.g];
    const frame = Math.floor(shell.clock / 300) % 2;
    let px = stage.pup.x;
    let py = pg.y1 - 8;
    if (shell.state === 'clear' || shell.state === 'collapse') {
      // Saved: the pup bounces with joy.
      py -= Math.abs(Math.sin(shell.stateTime / 140)) * 10;
    } else if (frame && blink(900)) {
      ctx.fillStyle = SNOW;
      A.roundRect(ctx, px + 8, py - 26, 30, 14, 4);
      A.text(ctx, 'YIP!', px + 23, py - 19, { size: 6, color: C.bg });
    }
    A.drawSprite(ctx, PUP[frame], px, py);
  }

  function drawBalls() {
    for (const b of balls) {
      const y = b.y - b.r;
      ctx.save();
      ctx.fillStyle = SNOW;
      ctx.shadowColor = SNOW;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(b.x, y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#bcd8ff';
      ctx.beginPath();
      ctx.arc(b.x + Math.cos(b.spin) * b.r * 0.45, y + Math.sin(b.spin) * b.r * 0.45, b.r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawSprites() {
    for (const s of sprites) {
      const y = s.y - 11 + Math.sin(shell.clock / 120 + s.x) * 2;
      ctx.save();
      ctx.fillStyle = blink(90) ? SNOW : ICE_BLUE;
      ctx.shadowColor = ICE_BLUE;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(s.x, y - 10);
      ctx.lineTo(s.x + 7, y);
      ctx.lineTo(s.x, y + 10);
      ctx.lineTo(s.x - 7, y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPlayer() {
    if (!HERO) HERO = crewFrames('Shredder');
    const st = shell.state;
    if (st === 'dying') {
      const t = shell.stateTime / DYING_MS;
      A.drawSprite(ctx, HERO.flail, player.x, player.y - 13 - (deathKind === 'fall' ? 0 : Math.sin(t * Math.PI) * 20), { angle: t * Math.PI * 4 });
      return;
    }
    let frame = HERO.stand;
    if (player.ladder) frame = Math.floor(player.walk / 140) % 2 ? HERO.lift : HERO.stand;
    else if (!player.onGround) frame = HERO.walk1;
    else if (input.isDown('left') || input.isDown('right') || (demo && player.vx)) frame = Math.floor(player.walk / 110) % 2 ? HERO.walk1 : HERO.walk2;
    A.drawSprite(ctx, frame, player.x, player.y - 13, { flip: player.ladder ? Math.floor(player.walk / 140) % 2 === 1 : player.facing < 0 });
    if (player.axe > 0 && !(player.axe < 2000 && blink(100))) {
      const swing = Math.sin(shell.clock / 70) > 0 ? -0.2 : 1.3;
      drawAxe(player.x + player.facing * 8, player.y - 26, player.facing > 0 ? swing : -swing);
    }
  }

  function drawBonus() {
    const x = W - 124;
    const y = HUD + 8;
    ctx.strokeStyle = C.pink;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, 110, 34);
    A.text(ctx, 'BONUS', x + 55, y + 10, { size: 8, color: C.pink });
    A.text(ctx, String(demo ? 5000 : bonus), x + 55, y + 24, { size: 12, color: bonus <= 1000 && !demo && blink(250) ? C.red : C.text });
    if (!demo) {
      for (let i = 0; i < Math.min(lives - (shell.state === 'dying' ? 0 : 1), 5); i++) {
        if (!HERO) HERO = crewFrames('Shredder');
        A.drawSprite(ctx, HERO.stand, 20 + i * 18, HUD + 22, { scale: 0.6 });
      }
    }
  }

  function drawScene() {
    ctx.fillStyle = '#07091c';
    ctx.fillRect(0, HUD, W, H - HUD);
    ctx.fillStyle = 'rgba(244, 241, 255, 0.5)';
    for (let i = 0; i < 40; i++) {
      const sx = (i * 97) % W;
      const sy = HUD + ((i * 53 + shell.clock * 0.01 * (1 + (i % 3))) % (H - HUD));
      ctx.fillRect(sx, sy, 2, 2);
    }
    const collapsing = shell.state === 'collapse';
    const shakeX = collapsing ? Math.sin(shell.stateTime / 30) * 3 : 0;
    ctx.save();
    ctx.translate(shakeX, 0);
    world.ladders.forEach(drawLadder);
    world.girders.forEach(g => {
      // In the collapse the upper floors drop away.
      if (collapsing && g.floor > 0 && stage === SUMMIT) {
        ctx.save();
        ctx.translate(0, Math.pow(shell.stateTime / 900, 2) * 30 * (6 - Math.min(5, g.floor)));
        drawGirder(g, Math.max(0, 1 - shell.stateTime / COLLAPSE_MS));
        ctx.restore();
      } else drawGirder(g);
    });
    ctx.restore();
    if (isTower()) drawCrystal();
    drawItems();
    drawYetiAndPup();
  }

  function drawMessages() {
    const cx = W / 2;
    const cy = H / 2;
    const st = shell.state;
    if (st === 'ready') {
      A.text(ctx, isTower() ? 'THE LIFT TOWER' : 'THE SUMMIT', cx, cy - 20, { size: 16, color: ICE_BLUE, glow: 12 });
      if (blink(150)) A.text(ctx, isTower() ? 'CLIMB TO THE PUP!' : 'PULL ALL 8 BOLTS!', cx, cy + 12, { size: 10, color: C.yellow });
    } else if (st === 'clear') {
      A.text(ctx, 'PUP SAVED!', cx, cy - 20, { size: 20, color: C.green, glow: 14 });
    } else if (st === 'collapse') {
      A.text(ctx, 'AVALANCHE!', cx, cy - 20, { size: 22, color: SNOW, glow: 16 });
    } else if (st === 'dying' && shell.stateTime > 800) {
      const msg = lives <= 0 ? 'GAME OVER' : deathKind === 'time' ? 'TOO SLOW!' : lives === 1 ? 'LAST LIFE!' : lives + ' LIVES LEFT';
      A.text(ctx, msg, cx, cy, { size: 14, color: lives <= 0 ? C.red : C.yellow, glow: 10 });
    }
  }

  function render() {
    ctx.save();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    shell.drawHud(score, level);
    drawScene();
    drawSprites();
    drawBalls();
    drawPlayer();
    fx.draw(ctx);
    drawBonus();
    drawMessages();
    shell.drawOverlay();
    ctx.restore();
  }

  showTitle();
  A.waitForFont().then(() => A.startLoop({ update, render }));
})();
