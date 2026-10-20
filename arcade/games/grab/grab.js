/*
 * Line Grab: a Neon Arcade game. Draw lines out from the edge to fence off parts of the board; each
 * closed-off part (the side without the Storm) is claimed and reveals a slice of the hidden picture.
 * Claim 75% to clear the level. The Storm kills you if it touches your unfinished line, Crawlers run
 * along the edges, and a Fuse burns up your line if you stop halfway.
 * Play states: ready -> playing <-> paused, dying, clear. The shell runs title, pause, initials, game over.
 */
(function () {
  'use strict';

  const A = window.Arcade;
  const C = A.COLORS;
  const V = A.vector;

  const GAME_ID = 'grab';
  const W = 480;
  const H = 600;
  const HUD = 48;
  const CELL = 4;
  const BX = 16; // the board's top-left corner
  const BY = HUD + 14;
  const COLS = 112;
  const ROWS = 118;
  const BW = COLS * CELL;
  const BH = ROWS * CELL;

  const OPEN = 0;
  const CLAIMED = 1;
  const TRAIL = 3;

  const GOAL = 75;
  const START_LIVES = 3;
  const EXTRA_LIFE_AT = 20000;
  const READY_MS = 1500;
  const DYING_MS = 1600;
  const CLEAR_MS = 3200;
  const EDGE_STEP_MS = 18;
  const FAST_STEP_MS = 22;
  const SLOW_STEP_MS = 46;
  const CRAWLER_STEP_MS = 34;
  const FUSE_WAIT_MS = 420;
  const FUSE_STEP_MS = 30;
  const SPLIT_BONUS = 5000;

  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const DIR_LIST = Object.values(DIRS);

  // ---------- State ----------

  const canvas = document.getElementById('game');
  const { ctx } = A.createScreen(canvas, W, H);
  const input = A.createInput({ swipeTarget: canvas });
  const fx = A.createEffects();

  // The hidden picture, the revealed part of it, and the glowing edges each live on their own canvas.
  const makeLayer = () => {
    const c = document.createElement('canvas');
    c.width = BW * 2;
    c.height = BH * 2;
    const g = c.getContext('2d');
    g.scale(2, 2);
    return { c, g };
  };
  const picture = makeLayer();
  const reveal = makeLayer();
  const edges = makeLayer();

  let demo = true;
  let level = 1;
  let score = 0;
  let lives = START_LIVES;
  let bonusLife = false;
  let grid, interior, claimed, player, trail, storms, crawlers, fuse;
  let heldDir = null;
  let slowHeld = false;
  let clearBonus = 0;
  let demoPlan = null;
  let shake = 0;

  const shell = A.createShell({
    ctx, width: W, height: H, id: GAME_ID,
    title: ['LINE', 'GRAB'],
    titleColors: [C.cyan, C.pink],
    howTo: [
      ['DRAW LINES TO FENCE OFF AREAS', C.text],
      ['CLAIM 75% - REVEAL THE PICTURE', C.yellow],
      ['THE STORM BREAKS UNFINISHED LINES', C.pink],
      [A.isTouch ? 'SLOW DRAW = DOUBLE POINTS' : 'SPACE DRAWS - Z SLOW = 2X POINTS', C.green],
      ['CRAWLERS RUN THE EDGES', C.dim],
    ],
    hudLabel: 'LEVEL',
    newGame, showTitle,
  });

  const idx = (x, y) => y * COLS + x;
  const inside = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
  const cell = (x, y) => (inside(x, y) ? grid[idx(x, y)] : CLAIMED);
  const rand = (a, b) => a + Math.random() * (b - a);
  const sfx = (name, arg) => { if (!demo) A.sound.play(name, arg); };
  const blink = (ms = 500) => Math.floor(shell.clock / ms) % 2 === 0;
  const pct = () => Math.floor((claimed / interior) * 100);

  // An edge is claimed ground that touches open ground: the only places you can walk safely.
  function isEdge(x, y) {
    if (cell(x, y) !== CLAIMED || !inside(x, y)) return false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && inside(x + dx, y + dy) && grid[idx(x + dx, y + dy)] === OPEN) return true;
      }
    }
    return false;
  }

  // ---------- Pictures ----------
  // Each level hides a neon scene, painted once and uncovered piece by piece.

  function paintPicture(n) {
    const g = picture.g;
    g.clearRect(0, 0, BW, BH);
    const scene = (n - 1) % 4;
    if (scene === 0) {
      // Synthwave sunset over a glowing grid
      const sky = g.createLinearGradient(0, 0, 0, BH * 0.6);
      sky.addColorStop(0, '#1a0640');
      sky.addColorStop(1, '#ff2e88');
      g.fillStyle = sky;
      g.fillRect(0, 0, BW, BH * 0.6);
      g.fillStyle = '#ffe14d';
      g.beginPath();
      g.arc(BW / 2, BH * 0.6, 110, Math.PI, 0);
      g.fill();
      g.fillStyle = '#ff2e88';
      for (let i = 0; i < 6; i++) g.fillRect(BW / 2 - 120, BH * 0.6 - 12 - i * 16, 240, 3 + i * 0.6);
      g.fillStyle = '#07021a';
      g.fillRect(0, BH * 0.6, BW, BH * 0.4);
      g.strokeStyle = '#29f0ff';
      g.lineWidth = 1.5;
      for (let i = -10; i <= 10; i++) {
        g.beginPath();
        g.moveTo(BW / 2 + i * 12, BH * 0.6);
        g.lineTo(BW / 2 + i * 70, BH);
        g.stroke();
      }
      for (let i = 1; i < 9; i++) {
        const y = BH * 0.6 + Math.pow(i / 9, 2) * BH * 0.4;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(BW, y);
        g.stroke();
      }
    } else if (scene === 1) {
      // City at night
      g.fillStyle = '#060a24';
      g.fillRect(0, 0, BW, BH);
      g.fillStyle = '#f4f1ff';
      for (let i = 0; i < 90; i++) g.fillRect(rand(0, BW), rand(0, BH * 0.5), 1.5, 1.5);
      g.fillStyle = '#ffe9b0';
      g.beginPath();
      g.arc(BW * 0.78, BH * 0.16, 30, 0, Math.PI * 2);
      g.fill();
      for (let x = 0; x < BW;) {
        const w = rand(28, 60);
        const h = rand(BH * 0.25, BH * 0.7);
        g.fillStyle = ['#1c1240', '#2a1f5c', '#14224a'][Math.floor(rand(0, 3))];
        g.fillRect(x, BH - h, w, h);
        g.fillStyle = Math.random() < 0.5 ? '#ffe14d' : '#29f0ff';
        for (let wy = BH - h + 8; wy < BH - 8; wy += 12) {
          for (let wx = x + 5; wx < x + w - 6; wx += 9) if (Math.random() < 0.45) g.fillRect(wx, wy, 4, 5);
        }
        g.fillStyle = '#ff2e88';
        g.fillRect(x, BH - h, w, 2);
        x += w + rand(2, 8);
      }
    } else if (scene === 2) {
      // Palm beach at sunset
      const sky = g.createLinearGradient(0, 0, 0, BH * 0.62);
      sky.addColorStop(0, '#3a0a5e');
      sky.addColorStop(0.6, '#ff6a3d');
      sky.addColorStop(1, '#ffd23f');
      g.fillStyle = sky;
      g.fillRect(0, 0, BW, BH * 0.62);
      g.fillStyle = '#fff3a0';
      g.beginPath();
      g.arc(BW * 0.5, BH * 0.6, 60, Math.PI, 0);
      g.fill();
      g.fillStyle = '#0a1f4a';
      g.fillRect(0, BH * 0.62, BW, BH * 0.38);
      g.fillStyle = '#ff9f1c';
      for (let i = 0; i < 26; i++) g.fillRect(BW * 0.5 - rand(10, 80), BH * 0.64 + i * 6, rand(30, 160), 2);
      const palm = (px, ph, lean) => {
        g.strokeStyle = '#12052a';
        g.lineWidth = 8;
        g.beginPath();
        g.moveTo(px, BH);
        g.quadraticCurveTo(px + lean, BH - ph / 2, px + lean * 1.4, BH - ph);
        g.stroke();
        g.lineWidth = 6;
        for (let a = 0; a < 7; a++) {
          const ang = -Math.PI + (a / 6) * Math.PI;
          g.beginPath();
          g.moveTo(px + lean * 1.4, BH - ph);
          g.quadraticCurveTo(px + lean * 1.4 + Math.cos(ang) * 40, BH - ph + Math.sin(ang) * 30 - 10, px + lean * 1.4 + Math.cos(ang) * 70, BH - ph + 25);
          g.stroke();
        }
      };
      palm(70, 300, 30);
      palm(BW - 60, 240, -26);
    } else {
      // Ringed planet in deep space
      g.fillStyle = '#04030c';
      g.fillRect(0, 0, BW, BH);
      for (let i = 0; i < 160; i++) {
        g.fillStyle = Math.random() < 0.2 ? '#29f0ff' : '#f4f1ff';
        g.fillRect(rand(0, BW), rand(0, BH), 1.5, 1.5);
      }
      const neb = g.createRadialGradient(BW * 0.3, BH * 0.7, 10, BW * 0.3, BH * 0.7, 220);
      neb.addColorStop(0, 'rgba(178, 107, 255, 0.55)');
      neb.addColorStop(1, 'rgba(178, 107, 255, 0)');
      g.fillStyle = neb;
      g.fillRect(0, 0, BW, BH);
      const planet = g.createRadialGradient(BW * 0.55, BH * 0.38, 10, BW * 0.6, BH * 0.42, 120);
      planet.addColorStop(0, '#ffe14d');
      planet.addColorStop(1, '#ff2e88');
      g.fillStyle = planet;
      g.beginPath();
      g.arc(BW * 0.6, BH * 0.42, 100, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#29f0ff';
      g.lineWidth = 6;
      g.beginPath();
      g.ellipse(BW * 0.6, BH * 0.42, 170, 34, -0.3, 0, Math.PI * 2);
      g.stroke();
    }
  }

  // Copies newly claimed cells from the picture onto the revealed layer, row by row in runs.
  function uncover(cells, slow) {
    const rows = new Map();
    for (const i of cells) {
      const y = Math.floor(i / COLS);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push(i % COLS);
    }
    const g = reveal.g;
    rows.forEach((xs, y) => {
      xs.sort((a, b) => a - b);
      let start = xs[0];
      for (let k = 1; k <= xs.length; k++) {
        if (k < xs.length && xs[k] === xs[k - 1] + 1) continue;
        const x0 = start * CELL;
        const w = (xs[k - 1] - start + 1) * CELL;
        g.drawImage(picture.c, x0 * 2, y * CELL * 2, w * 2, CELL * 2, x0, y * CELL, w, CELL);
        if (slow) {
          g.fillStyle = 'rgba(255, 225, 77, 0.22)';
          g.fillRect(x0, y * CELL, w, CELL);
        }
        if (k < xs.length) start = xs[k];
      }
    });
  }

  function paintEdges() {
    const g = edges.g;
    g.clearRect(0, 0, BW, BH);
    g.fillStyle = C.cyan;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) if (isEdge(x, y)) g.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
  }

  // ---------- Levels ----------

  function setupLevel() {
    grid = new Uint8Array(COLS * ROWS);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) grid[idx(x, y)] = CLAIMED;
    }
    interior = (COLS - 2) * (ROWS - 2);
    claimed = 0;
    paintPicture(level);
    reveal.g.clearRect(0, 0, BW, BH);
    paintEdges();
    player = { x: Math.floor(COLS / 2), y: ROWS - 1, drawing: false, slow: false, stepT: 0, still: 0 };
    trail = [];
    fuse = null;
    const count = level >= 3 ? 2 : 1;
    storms = [];
    for (let i = 0; i < count; i++) storms.push(makeStorm(BW * (0.3 + 0.4 * i), BH * 0.4));
    resetCrawlers();
    demoPlan = null;
  }

  function makeStorm(x, y) {
    const speed = Math.min(0.16, 0.07 + level * 0.012);
    const s = { x, y, vx: 0, vy: 0, speed, turnT: 0, spin: 0, angle: 0, history: [] };
    V.push(s, rand(0, Math.PI * 2), speed);
    return s;
  }

  function resetCrawlers() {
    const count = Math.min(4, 1 + Math.ceil(level / 2));
    crawlers = [];
    for (let i = 0; i < count; i++) crawlers.push({ x: Math.floor(COLS / 2), y: 0, dir: i % 2 ? DIRS.left : DIRS.right, stepT: 0, wait: 1500 + i * 1800 });
  }

  function newGame() {
    if (window.track) track('play:' + GAME_ID);
    demo = false;
    level = 1;
    score = 0;
    lives = START_LIVES;
    bonusLife = false;
    fx.clear();
    setupLevel();
    shell.setState('ready');
    A.sound.play('start');
  }

  function showTitle() {
    demo = true;
    level = 1 + Math.floor(Math.random() * 4);
    score = 0;
    fx.clear();
    setupLevel();
    shell.setState('title');
  }

  function addScore(points) {
    if (demo) return;
    score += points;
    if (!bonusLife && score >= EXTRA_LIFE_AT) {
      bonusLife = true;
      lives++;
      fx.float(W / 2, HUD + 60, '1UP!', C.green);
      A.sound.play('powerup');
    }
  }

  // ---------- Drawing and claiming ----------

  // Your line reached an edge again: it becomes solid, and every part of the open board that has no
  // Storm in it is claimed.
  function closeShape() {
    const slow = player.slow;
    for (const t of trail) grid[t] = CLAIMED;
    const newly = trail.slice();
    trail = [];
    fuse = null;
    player.drawing = false;

    const seen = new Uint8Array(COLS * ROWS);
    const stormRegions = new Set();
    const regions = [];
    for (let y = 1; y < ROWS - 1; y++) {
      for (let x = 1; x < COLS - 1; x++) {
        const i = idx(x, y);
        if (grid[i] !== OPEN || seen[i]) continue;
        const { mask, count } = A.floodFill(COLS, ROWS, (cx, cy) => grid[idx(cx, cy)] === OPEN, { c: x, r: y });
        const region = { mask, count, storm: false };
        for (let k = 0; k < mask.length; k++) if (mask[k]) seen[k] = 1;
        storms.forEach((s, si) => {
          const sx = Math.floor(s.x / CELL);
          const sy = Math.floor(s.y / CELL);
          if (inside(sx, sy) && mask[idx(sx, sy)]) {
            region.storm = true;
            stormRegions.add(si);
          }
        });
        regions.push(region);
      }
    }
    for (const region of regions) {
      if (region.storm) continue;
      for (let k = 0; k < region.mask.length; k++) {
        if (region.mask[k]) {
          grid[k] = CLAIMED;
          newly.push(k);
        }
      }
    }
    claimed += newly.length;
    uncover(newly, slow);
    paintEdges();

    addScore(Math.round((newly.length / interior) * 10000) * (slow ? 2 : 1)); // 100 points per 1% (200 slow)
    if (newly.length > 40) {
      const sweep = Math.min(4, Math.max(1, Math.round(newly.length / 600)));
      sfx('clear', sweep);
    }
    // Two Storms fenced into separate areas: a big bonus.
    if (storms.length > 1 && regions.filter(r => r.storm).length > 1 && !player.splitDone) {
      player.splitDone = true;
      addScore(SPLIT_BONUS);
      fx.float(W / 2, HUD + 80, 'STORM SPLIT! ' + SPLIT_BONUS, C.yellow);
      sfx('bonus');
    }
    if (pct() >= GOAL) {
      clearBonus = (pct() - GOAL) * 1000;
      addScore(clearBonus);
      sfx('levelup');
      if (demo) {
        showTitle();
        return;
      }
      shell.setState('clear');
    }
  }

  function tryMove(d) {
    const nx = player.x + d.x;
    const ny = player.y + d.y;
    if (!inside(nx, ny)) return false;
    const target = grid[idx(nx, ny)];
    if (!player.drawing) {
      if (isEdge(nx, ny)) {
        player.x = nx;
        player.y = ny;
        return true;
      }
      // Step off the edge into open ground only while a draw button is held.
      if (target === OPEN && wantsDraw()) {
        player.drawing = true;
        player.slow = wantsSlow();
        player.startX = player.x;
        player.startY = player.y;
        player.x = nx;
        player.y = ny;
        grid[idx(nx, ny)] = TRAIL;
        trail = [idx(nx, ny)];
        return true;
      }
      return false;
    }
    if (target === TRAIL) return false; // can't cross your own line
    player.x = nx;
    player.y = ny;
    if (target === OPEN) {
      grid[idx(nx, ny)] = TRAIL;
      trail.push(idx(nx, ny));
    } else {
      closeShape();
    }
    return true;
  }

  const wantsDraw = () => (demo ? !!demoPlan && demoPlan.drawing : input.isDown('start') || input.isDown('slow') || slowHeld);
  const wantsSlow = () => !demo && (input.isDown('slow') || slowHeld);

  function updatePlayer(dt) {
    const d = demo ? demoDir() : heldDir && input.isDown(heldDir) ? DIRS[heldDir] : Object.keys(DIRS).map(k => (input.isDown(k) ? DIRS[k] : null)).find(Boolean);
    const stepMs = !player.drawing ? EDGE_STEP_MS : player.slow ? SLOW_STEP_MS : FAST_STEP_MS;
    // While drawing you have to keep the draw button held, or you stop (and the fuse gets you).
    let moved = false;
    if (d && (!player.drawing || wantsDraw())) {
      player.stepT += dt;
      while (player.stepT >= stepMs && (shell.state === 'playing' || shell.state === 'title')) {
        player.stepT -= stepMs;
        if (!tryMove(d)) {
          player.stepT = 0;
          if (demo) demoPlan = null;
          break;
        }
        moved = true;
        if (demo && demoPlan && demoPlan.legs[0]) demoPlan.legs[0][1]--;
        if (!player.drawing) break;
      }
    } else {
      player.stepT = 0;
    }
    if (!player.drawing) return;
    // Stopping halfway lights a fuse at the start of your line; moving again puts it out.
    if (moved) {
      player.still = 0;
      fuse = null;
      return;
    }
    if ((player.still += dt) > FUSE_WAIT_MS && !fuse) fuse = { at: 0, stepT: 0 };
    if (fuse && (fuse.stepT += dt) >= FUSE_STEP_MS) {
      fuse.stepT = 0;
      fuse.at++;
      if (fuse.at >= trail.length) kill();
      else if (fuse.at % 6 === 0) sfx('tick');
    }
  }

  // ---------- Enemies ----------

  function updateStorms(dt) {
    for (const s of storms) {
      if ((s.turnT -= dt) <= 0) {
        s.turnT = rand(500, 1500);
        const a = Math.atan2(s.vy, s.vx) + rand(-1.2, 1.2);
        s.vx = Math.cos(a) * s.speed;
        s.vy = Math.sin(a) * s.speed;
      }
      // Bounce off anything that isn't open ground (or your line, which it breaks).
      const nx = s.x + s.vx * dt;
      const ny = s.y + s.vy * dt;
      const cx = cell(Math.floor(nx / CELL), Math.floor(s.y / CELL));
      const cy = cell(Math.floor(s.x / CELL), Math.floor(ny / CELL));
      if (cx === CLAIMED) s.vx = -s.vx;
      else s.x = nx;
      if (cy === CLAIMED) s.vy = -s.vy;
      else s.y = ny;
      s.angle += 0.004 * dt;
      s.history.unshift({ x: s.x, y: s.y, angle: s.angle });
      if (s.history.length > 6) s.history.pop();
      // Any of its lines touching your unfinished line is the end of you.
      if (player.drawing) {
        for (const seg of stormLines(s)) {
          for (let t = 0; t <= 1; t += 0.1) {
            const px = seg[0][0] + (seg[1][0] - seg[0][0]) * t;
            const py = seg[0][1] + (seg[1][1] - seg[0][1]) * t;
            if (cell(Math.floor(px / CELL), Math.floor(py / CELL)) === TRAIL) {
              kill();
              return;
            }
          }
        }
      }
    }
  }

  // The Storm is a few spinning glowing lines around its centre.
  function stormLines(s, angle = s.angle) {
    const lines = [];
    for (let i = 0; i < 3; i++) {
      const a = angle + (i * Math.PI) / 3;
      const r = 16 + i * 4;
      lines.push([[s.x + Math.cos(a) * r, s.y + Math.sin(a) * r], [s.x - Math.cos(a) * r, s.y - Math.sin(a) * r]]);
    }
    return lines;
  }

  // Crawlers follow the edges, keeping their direction where they can and turning where they must.
  function updateCrawlers(dt) {
    for (const c of crawlers) {
      if (c.wait > 0) {
        c.wait -= dt;
        continue;
      }
      if ((c.stepT += dt) < CRAWLER_STEP_MS * Math.max(0.6, 1 - level * 0.05)) continue;
      c.stepT = 0;
      const options = DIR_LIST.filter(d => !(d.x === -c.dir.x && d.y === -c.dir.y) && isEdge(c.x + d.x, c.y + d.y));
      let d = options.includes(c.dir) ? c.dir : options[Math.floor(Math.random() * options.length)];
      if (!d) d = { x: -c.dir.x, y: -c.dir.y };
      if (isEdge(c.x + d.x, c.y + d.y)) {
        c.x += d.x;
        c.y += d.y;
        c.dir = d;
      } else {
        c.dir = { x: -c.dir.x, y: -c.dir.y };
      }
      if (Math.abs(c.x - player.x) <= 1 && Math.abs(c.y - player.y) <= 1) kill();
    }
  }

  function kill() {
    if (shell.state === 'dying') return;
    const px = BX + player.x * CELL;
    const py = BY + player.y * CELL;
    fx.burst(px, py, C.yellow, 28, 0.2);
    fx.burst(px, py, C.pink, 14, 0.12);
    // Your unfinished line breaks apart and you're put back where it started.
    for (const t of trail) grid[t] = OPEN;
    trail = [];
    fuse = null;
    if (player.drawing) {
      player.x = player.startX;
      player.y = player.startY;
    }
    player.drawing = false;
    sfx('die');
    shake = 8;
    if (demo) {
      showTitle();
      return;
    }
    lives--;
    shell.setState('dying');
  }

  // ---------- Attract-mode AI ----------
  // The CPU walks the edge a little, then makes quick boxy grabs: in, across, and back out.

  function demoDir() {
    if (demoPlan && demoPlan.drawing && demoPlan.started && !player.drawing) demoPlan = null; // shape closed
    // A Crawler closing in along the edge: duck inward with a grab right away.
    const crawlerNear = crawlers.some(c => c.wait <= 0 && Math.abs(c.x - player.x) + Math.abs(c.y - player.y) < 14);
    if (crawlerNear && demoPlan && !demoPlan.drawing) demoPlan = null;
    if (!demoPlan) {
      const inward = DIR_LIST.filter(d => cell(player.x + d.x, player.y + d.y) === OPEN);
      const along = DIR_LIST.filter(d => isEdge(player.x + d.x, player.y + d.y));
      const stormFar = storms.every(st => Math.hypot(st.x - player.x * CELL, st.y - player.y * CELL) > 150);
      if (inward.length && (crawlerNear || (stormFar && Math.random() < 0.2))) {
        const d = inward[0];
        const side = Math.random() < 0.5 ? { x: d.y, y: d.x } : { x: -d.y, y: -d.x };
        demoPlan = { drawing: true, legs: [[d, Math.floor(rand(6, 16))], [side, Math.floor(rand(6, 18))], [{ x: -d.x, y: -d.y }, 999]] };
      } else {
        demoPlan = { drawing: false, legs: [[along[Math.floor(Math.random() * along.length)] || DIRS.left, Math.floor(rand(4, 30))]] };
      }
    }
    if (player.drawing) demoPlan.started = true;
    while (demoPlan.legs.length && demoPlan.legs[0][1] <= 0) demoPlan.legs.shift();
    if (!demoPlan.legs.length) {
      demoPlan = null;
      return null;
    }
    return demoPlan.legs[0][0];
  }

  // ---------- Input ----------

  input.on(action => {
    if (shell.handle(action)) return;
    if (DIRS[action]) heldDir = action;
  });

  // Z is the slow-draw button on keyboards.
  window.addEventListener('keydown', e => { if (e.code === 'KeyZ') slowHeld = true; });
  window.addEventListener('keyup', e => { if (e.code === 'KeyZ') slowHeld = false; });
  window.addEventListener('blur', () => { slowHeld = false; });

  // ---------- Update ----------

  function update(dt) {
    shell.update(dt);
    fx.update(dt);
    shake = Math.max(0, shake - dt * 0.02);
    const st = shell.state;
    if (st === 'title' || st === 'playing') {
      updatePlayer(dt);
      if (shell.state === st) updateStorms(dt);
      if (shell.state === st) updateCrawlers(dt);
    } else if (st === 'ready') {
      if (shell.stateTime >= READY_MS) shell.setState('playing');
    } else if (st === 'dying') {
      if (shell.stateTime >= DYING_MS) {
        if (lives <= 0) shell.gameOver(score, 'LEVEL ' + level + '  ' + pct() + '%');
        else {
          resetCrawlers();
          shell.setState('ready');
        }
      }
    } else if (st === 'clear') {
      if (shell.stateTime >= CLEAR_MS) {
        level++;
        setupLevel();
        shell.setState('ready');
      }
    }
  }

  // ---------- Render ----------

  function drawBoard() {
    ctx.save();
    ctx.translate(BX, BY);
    ctx.fillStyle = '#0a0918';
    ctx.fillRect(0, 0, BW, BH);
    if (shell.state === 'clear') {
      // Level cleared: the whole picture, flashing in.
      ctx.globalAlpha = Math.min(1, shell.stateTime / 700);
      ctx.drawImage(picture.c, 0, 0, BW, BH);
      ctx.globalAlpha = 1;
    } else {
      ctx.drawImage(reveal.c, 0, 0, BW, BH);
      ctx.save();
      ctx.shadowColor = C.cyan;
      ctx.shadowBlur = 6;
      ctx.drawImage(edges.c, 0, 0, BW, BH);
      ctx.restore();
    }
    // Your line, and the fuse burning along it.
    ctx.fillStyle = player.slow ? C.yellow : C.pink;
    for (const t of trail) ctx.fillRect((t % COLS) * CELL, Math.floor(t / COLS) * CELL, CELL, CELL);
    if (fuse && trail[fuse.at] !== undefined) {
      const t = trail[fuse.at];
      ctx.fillStyle = blink(60) ? C.text : C.red;
      ctx.fillRect((t % COLS) * CELL - 2, Math.floor(t / COLS) * CELL - 2, CELL + 4, CELL + 4);
    }
    if (shell.state !== 'clear') {
      for (const s of storms) {
        s.history.forEach((h, i) => {
          ctx.globalAlpha = 1 - i / s.history.length;
          for (const seg of stormLines(h, h.angle)) {
            V.draw(ctx, seg, 0, 0, { color: i % 2 ? C.pink : C.yellow, width: 1.6, glow: 8, closed: false });
          }
        });
        ctx.globalAlpha = 1;
      }
      for (const c of crawlers) {
        if (c.wait > 0) continue;
        ctx.save();
        ctx.fillStyle = blink(90) ? C.text : '#ff3b3b';
        ctx.shadowColor = '#ff3b3b';
        ctx.shadowBlur = 10;
        ctx.fillRect(c.x * CELL - 3, c.y * CELL - 3, CELL + 6, CELL + 6);
        ctx.restore();
      }
      if (!(shell.state === 'dying' && blink(100))) {
        const px = player.x * CELL + CELL / 2;
        const py = player.y * CELL + CELL / 2;
        V.draw(ctx, [[0, -7], [7, 0], [0, 7], [-7, 0]], px, py, { color: player.drawing ? (player.slow ? C.yellow : C.pink) : C.text, width: 2, glow: 10 });
      }
    }
    ctx.restore();
  }

  function drawFooter() {
    const y = BY + BH + 20;
    if (demo) return;
    for (let i = 0; i < Math.min(Math.max(0, lives - (shell.state === 'dying' ? 0 : 1)), 6); i++) {
      V.draw(ctx, [[0, -5], [5, 0], [0, 5], [-5, 0]], 24 + i * 18, y, { color: C.text, width: 1.6, glow: 6 });
    }
    const p = pct();
    const barX = 150;
    const barW = 200;
    A.text(ctx, 'CLAIMED', barX - 10, y, { size: 8, color: C.dim, align: 'right' });
    ctx.fillStyle = '#1c1a33';
    ctx.fillRect(barX, y - 6, barW, 12);
    ctx.fillStyle = p >= GOAL ? C.green : C.cyan;
    ctx.fillRect(barX, y - 6, (barW * Math.min(100, p)) / 100, 12);
    ctx.fillStyle = C.yellow;
    ctx.fillRect(barX + barW * (GOAL / 100), y - 9, 2, 18);
    A.text(ctx, p + '%', barX + barW + 12, y, { size: 10, color: C.text, align: 'left' });
  }

  function drawMessages() {
    const cx = W / 2;
    const cy = BY + BH / 2;
    const st = shell.state;
    if (st === 'ready') {
      A.text(ctx, 'LEVEL ' + level, cx, cy - 30, { size: 20, color: C.yellow, glow: 12 });
      if (blink(150)) A.text(ctx, 'CLAIM ' + GOAL + '%', cx, cy + 6, { size: 10, color: C.cyan });
    } else if (st === 'clear') {
      A.text(ctx, 'LEVEL CLEAR!', cx, cy - 20, { size: 20, color: C.green, glow: 14 });
      if (clearBonus) A.text(ctx, 'BONUS ' + clearBonus, cx, cy + 14, { size: 10, color: C.yellow });
    } else if (st === 'dying' && shell.stateTime > 600) {
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
    drawBoard();
    fx.draw(ctx);
    drawFooter();
    drawMessages();
    shell.drawOverlay();
    ctx.restore();
  }

  showTitle();
  A.waitForFont().then(() => A.startLoop({ update, render }));
})();
