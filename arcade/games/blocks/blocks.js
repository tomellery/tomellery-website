/*
 * Block Drop: a Neon Arcade falling-blocks puzzle. Slide and turn the falling pieces to fill whole rows;
 * full rows vanish and everything above drops. Clear several at once for big points.
 * Play states: ready -> playing <-> paused (rows flash inside 'playing'), dying (stack hit the top).
 * The shell runs title, pause, initials and game over.
 */
(function () {
  'use strict';

  const A = window.Arcade;
  const C = A.COLORS;

  const GAME_ID = 'blocks';
  const W = 480;
  const H = 600;
  const HUD = 48;
  const COLS = 10;
  const ROWS = 18;
  const CELL = 28;
  const WX = 24; // the well's top-left corner
  const WY = HUD + 24;
  const PX = WX + COLS * CELL + 24; // the side panel

  const READY_MS = 1200;
  const DYING_MS = 1600;
  const CLEAR_MS = 380;
  const LOCK_MS = 380; // a moment to slide a piece after it lands
  const LOCK_RESETS = 12;
  const SOFT_MS = 40;
  const DEMO_STEP_MS = 70;
  const LINE_POINTS = [0, 100, 300, 500, 800];

  // Each piece is four cells in an n x n box; turning rotates the box.
  const PIECES = {
    I: { n: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]], color: C.pink },
    O: { n: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]], color: C.cyan },
    T: { n: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]], color: C.yellow },
    S: { n: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]], color: '#b26bff' },
    Z: { n: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]], color: C.green },
    J: { n: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]], color: '#ff9f1c' },
    L: { n: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]], color: '#4d8bff' },
  };
  const TYPES = Object.keys(PIECES);
  const KICKS = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]];

  // ---------- State ----------

  const canvas = document.getElementById('game');
  const { ctx } = A.createScreen(canvas, W, H);
  const input = A.createInput({ swipeTarget: canvas, keyRepeat: false });
  const slideLeft = A.createRepeater({ delay: 170, rate: 50 });
  const slideRight = A.createRepeater({ delay: 170, rate: 50 });
  const fx = A.createEffects();

  // Settled blocks are painted onto their own canvas whenever the stack changes.
  const boardArt = document.createElement('canvas');
  boardArt.width = COLS * CELL * 2;
  boardArt.height = ROWS * CELL * 2;
  const bctx = boardArt.getContext('2d');
  bctx.scale(2, 2);

  let demo = true;
  let board, piece, nextType, bag;
  let score = 0;
  let lines = 0;
  let level = 1;
  let fallT = 0;
  let lockT = 0;
  let lockResets = 0;
  let clearing = null;
  let splash = null;
  let demoPlan = null;
  let demoT = 0;
  let shake = 0;

  const shell = A.createShell({
    ctx, width: W, height: H, id: GAME_ID,
    title: ['BLOCK', 'DROP'],
    titleColors: [C.cyan, C.yellow],
    howTo: [
      ['FILL WHOLE ROWS TO CLEAR THEM', C.text],
      ['CLEAR 4 AT ONCE FOR BIG POINTS', C.yellow],
      ['FASTER EVERY 10 ROWS', C.pink],
      [A.isTouch ? 'TAP OR TURN BUTTON TO ROTATE' : 'UP ROTATES - SPACE DROPS', C.cyan],
      [A.isTouch ? 'SWIPE OR BUTTONS TO SLIDE' : 'LEFT/RIGHT SLIDE - DOWN SOFT', C.dim],
    ],
    hudLabel: 'LEVEL',
    newGame, showTitle,
  });

  const fallMs = () => Math.max(55, 900 * Math.pow(0.82, level - 1));
  const sfx = (name, arg) => { if (!demo) A.sound.play(name, arg); };
  const blink = (ms = 500) => Math.floor(shell.clock / ms) % 2 === 0;

  // ---------- Pieces ----------

  // Pieces come in shuffled sets of all seven, so none is ever missing for long.
  function draw() {
    if (!bag || !bag.length) {
      bag = TYPES.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  }

  function makePiece(type) {
    const spec = PIECES[type];
    return { type, n: spec.n, cells: spec.cells.map(c => c.slice()), x: Math.floor((COLS - spec.n) / 2), y: type === 'I' ? -1 : 0, rot: 0 };
  }

  const turned = (cells, n, dir) => cells.map(([x, y]) => (dir > 0 ? [n - 1 - y, x] : [y, n - 1 - x]));

  function fits(cells, px, py, b = board) {
    return cells.every(([cx, cy]) => {
      const x = px + cx;
      const y = py + cy;
      return x >= 0 && x < COLS && y < ROWS && (y < 0 || !b[y][x]);
    });
  }

  function spawn() {
    piece = makePiece(nextType);
    nextType = draw();
    fallT = 0;
    lockT = 0;
    lockResets = 0;
    demoPlan = null;
    if (!fits(piece.cells, piece.x, piece.y)) topOut();
  }

  // ---------- Moves ----------

  function nudgeLock() {
    if (lockT > 0 && lockResets < LOCK_RESETS) {
      lockT = 0;
      lockResets++;
    }
  }

  function slide(dx) {
    if (!piece || !fits(piece.cells, piece.x + dx, piece.y)) return false;
    piece.x += dx;
    nudgeLock();
    sfx('move');
    return true;
  }

  // Turning tries a few small shoves (off a wall, off the stack) before giving up.
  function rotate(dir) {
    if (!piece || piece.type === 'O') return;
    const cells = turned(piece.cells, piece.n, dir);
    for (const [kx, ky] of KICKS) {
      if (fits(cells, piece.x + kx, piece.y + ky)) {
        piece.cells = cells;
        piece.x += kx;
        piece.y += ky;
        piece.rot = (piece.rot + dir + 4) % 4;
        nudgeLock();
        sfx('rotate');
        return;
      }
    }
  }

  function dropRows() {
    let n = 0;
    while (fits(piece.cells, piece.x, piece.y + n + 1)) n++;
    return n;
  }

  function hardDrop() {
    if (!piece) return;
    const n = dropRows();
    piece.y += n;
    addScore(n * 2);
    lock();
  }

  function addScore(points) {
    if (!demo) score += points;
  }

  // ---------- Locking and clearing rows ----------

  function lock() {
    const color = TYPES.indexOf(piece.type) + 1;
    for (const [cx, cy] of piece.cells) {
      const y = piece.y + cy;
      if (y < 0) {
        topOut();
        return;
      }
      board[y][piece.x + cx] = color;
    }
    piece = null;
    sfx('lock');
    const full = [];
    for (let y = 0; y < ROWS; y++) if (board[y].every(v => v)) full.push(y);
    paintBoard();
    if (full.length) {
      clearing = { rows: full, t: 0 };
      sfx(full.length === 4 ? 'quad' : 'clear', full.length);
      if (full.length === 4) {
        splash = { t: 0 };
        shake = 8;
        full.forEach(y => fx.burst(WX + (COLS * CELL) / 2, WY + y * CELL + CELL / 2, C.yellow, 24, 0.25));
      }
    } else {
      spawn();
    }
  }

  function finishClear() {
    const rows = clearing.rows;
    board = board.filter((_, y) => !rows.includes(y));
    while (board.length < ROWS) board.unshift(new Array(COLS).fill(0));
    addScore(LINE_POINTS[rows.length] * level);
    if (!demo) {
      lines += rows.length;
      const was = level;
      level = 1 + Math.floor(lines / 10);
      if (level > was) {
        splash = { t: 0, text: 'LEVEL ' + level };
        sfx('levelup');
      }
    }
    clearing = null;
    paintBoard();
    spawn();
  }

  function topOut() {
    piece = null;
    if (demo) {
      showTitle();
      return;
    }
    shake = 10;
    sfx('die');
    shell.setState('dying');
  }

  // ---------- Games ----------

  function resetBoard() {
    board = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
    bag = null;
    nextType = draw();
    clearing = null;
    splash = null;
    paintBoard();
    spawn();
  }

  function newGame() {
    if (window.track) track('play:' + GAME_ID);
    demo = false;
    score = 0;
    lines = 0;
    level = 1;
    fx.clear();
    resetBoard();
    shell.setState('ready');
    A.sound.play('start');
  }

  function showTitle() {
    demo = true;
    score = 0;
    lines = 0;
    level = 3;
    fx.clear();
    resetBoard();
    shell.setState('title');
  }

  // ---------- Attract-mode AI ----------
  // For every turn and column the CPU imagines dropping the piece and rates the stack it would leave:
  // fewer holes, lower and flatter is better, and full rows are a bonus.

  function rate(b) {
    const heights = [];
    let holes = 0;
    for (let x = 0; x < COLS; x++) {
      let top = ROWS;
      for (let y = 0; y < ROWS; y++) {
        if (b[y][x]) {
          if (top === ROWS) top = y;
        } else if (top < ROWS) holes++;
      }
      heights.push(ROWS - top);
    }
    const full = b.filter(row => row.every(v => v)).length;
    let bumps = 0;
    for (let x = 1; x < COLS; x++) bumps += Math.abs(heights[x] - heights[x - 1]);
    return -0.51 * heights.reduce((s, h) => s + h, 0) + 0.76 * full - 0.36 * holes * 4 - 0.18 * bumps;
  }

  function planDemo() {
    let best = null;
    let cells = PIECES[piece.type].cells.map(c => c.slice());
    for (let rot = 0; rot < 4; rot++) {
      for (let x = -2; x < COLS; x++) {
        if (!fits(cells, x, piece.y)) continue;
        let y = piece.y;
        while (fits(cells, x, y + 1)) y++;
        const b = board.map(row => row.slice());
        let ok = true;
        for (const [cx, cy] of cells) {
          if (y + cy < 0) ok = false;
          else b[y + cy][x + cx] = 1;
        }
        if (!ok) continue;
        const value = rate(b);
        if (!best || value > best.value) best = { rot, x, value };
      }
      cells = turned(cells, piece.n, 1);
    }
    return best || { rot: piece.rot, x: piece.x };
  }

  function demoStep(dt) {
    if (!piece) return;
    if (!demoPlan) demoPlan = planDemo();
    if ((demoT -= dt) > 0) return;
    demoT = DEMO_STEP_MS;
    // A turn or slide can be blocked by the stack; don't keep trying forever.
    if ((demoPlan.tries = (demoPlan.tries || 0) + 1) > 12) hardDrop();
    else if (piece.rot !== demoPlan.rot) rotate(1);
    else if (piece.x < demoPlan.x) slide(1);
    else if (piece.x > demoPlan.x) slide(-1);
    else hardDrop();
  }

  // ---------- Input ----------

  input.on(action => {
    if (shell.handle(action)) return;
    if (shell.state !== 'playing' || clearing || !piece) return;
    if (action === 'left') slide(-1);
    else if (action === 'right') slide(1);
    else if (action === 'up' || action === 'tap') rotate(1);
    else if (action === 'start') hardDrop();
    else if (action === 'down') softStep();
  });

  // Z turns the other way, X the usual way.
  window.addEventListener('keydown', e => {
    if (e.repeat || shell.state !== 'playing' || clearing || !piece) return;
    if (e.code === 'KeyZ') rotate(-1);
    else if (e.code === 'KeyX') rotate(1);
  });

  function softStep() {
    if (piece && fits(piece.cells, piece.x, piece.y + 1)) {
      piece.y++;
      addScore(1);
      fallT = 0;
    }
  }

  // ---------- Update ----------

  function updatePlay(dt) {
    if (clearing) {
      if ((clearing.t += dt) >= CLEAR_MS) finishClear();
      return;
    }
    if (!piece) return;
    if (demo) demoStep(dt);
    else {
      for (let n = slideLeft.tick(input.isDown('left'), dt); n > 0; n--) slide(-1);
      for (let n = slideRight.tick(input.isDown('right'), dt); n > 0; n--) slide(1);
    }
    if (!piece) return;
    const soft = !demo && input.isDown('down');
    if (fits(piece.cells, piece.x, piece.y + 1)) {
      lockT = 0;
      fallT += dt;
      const every = soft ? Math.min(SOFT_MS, fallMs()) : fallMs();
      while (fallT >= every && fits(piece.cells, piece.x, piece.y + 1)) {
        fallT -= every;
        piece.y++;
        if (soft) addScore(1);
      }
    } else if ((lockT += dt) >= LOCK_MS) {
      lock();
    }
  }

  function update(dt) {
    shell.update(dt);
    fx.update(dt);
    shake = Math.max(0, shake - dt * 0.02);
    if (splash && (splash.t += dt) > 1300) splash = null;
    const st = shell.state;
    if (st === 'title' || st === 'playing') updatePlay(dt);
    else if (st === 'ready' && shell.stateTime >= READY_MS) shell.setState('playing');
    else if (st === 'dying' && shell.stateTime >= DYING_MS) shell.gameOver(score, 'LEVEL ' + level + '  ROWS ' + lines);
  }

  // ---------- Render ----------

  function drawCell(g, x, y, color, { glow = true, ghost = false } = {}) {
    const px = x * CELL;
    const py = y * CELL;
    g.save();
    if (ghost) {
      g.strokeStyle = color;
      g.globalAlpha = 0.35;
      g.lineWidth = 1.5;
      g.strokeRect(px + 3, py + 3, CELL - 6, CELL - 6);
      g.restore();
      return;
    }
    g.fillStyle = color;
    g.globalAlpha = 0.22;
    g.fillRect(px + 2, py + 2, CELL - 4, CELL - 4);
    g.globalAlpha = 1;
    g.strokeStyle = color;
    g.lineWidth = 2;
    if (glow) {
      g.shadowColor = color;
      g.shadowBlur = 8;
    }
    g.strokeRect(px + 3, py + 3, CELL - 6, CELL - 6);
    g.shadowBlur = 0;
    g.fillStyle = color;
    g.fillRect(px + 7, py + 7, 4, 4);
    g.restore();
  }

  function paintBoard() {
    bctx.clearRect(0, 0, COLS * CELL, ROWS * CELL);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (board[y][x]) drawCell(bctx, x, y, PIECES[TYPES[board[y][x] - 1]].color);
      }
    }
  }

  function drawWell() {
    ctx.fillStyle = '#0a0918';
    ctx.fillRect(WX, WY, COLS * CELL, ROWS * CELL);
    ctx.fillStyle = '#14122a';
    for (let x = 1; x < COLS; x++) ctx.fillRect(WX + x * CELL, WY, 1, ROWS * CELL);
    for (let y = 1; y < ROWS; y++) ctx.fillRect(WX, WY + y * CELL, COLS * CELL, 1);
    ctx.save();
    ctx.strokeStyle = C.cyan;
    ctx.shadowColor = C.cyan;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.strokeRect(WX - 3, WY - 3, COLS * CELL + 6, ROWS * CELL + 6);
    ctx.restore();

    ctx.save();
    ctx.translate(WX, WY);
    ctx.drawImage(boardArt, 0, 0, COLS * CELL, ROWS * CELL);
    if (clearing && blink(70)) {
      ctx.fillStyle = 'rgba(244, 241, 255, 0.85)';
      clearing.rows.forEach(y => ctx.fillRect(0, y * CELL + 2, COLS * CELL, CELL - 4));
    }
    if (piece && shell.state !== 'dying') {
      const color = PIECES[piece.type].color;
      const g = dropRows();
      if (g > 0) piece.cells.forEach(([cx, cy]) => { if (piece.y + cy + g >= 0) drawCell(ctx, piece.x + cx, piece.y + cy + g, color, { ghost: true }); });
      piece.cells.forEach(([cx, cy]) => { if (piece.y + cy >= 0) drawCell(ctx, piece.x + cx, piece.y + cy, color); });
    }
    // Topping out: the stack greys over from the bottom up.
    if (shell.state === 'dying') {
      const rows = Math.min(ROWS, Math.floor((shell.stateTime / DYING_MS) * ROWS * 1.3));
      ctx.fillStyle = 'rgba(7, 6, 15, 0.7)';
      ctx.fillRect(0, (ROWS - rows) * CELL, COLS * CELL, rows * CELL);
    }
    ctx.restore();
  }

  function drawPanel() {
    A.text(ctx, 'NEXT', PX + 66, WY + 8, { size: 10, color: C.dim });
    ctx.strokeStyle = '#2a2650';
    ctx.lineWidth = 2;
    ctx.strokeRect(PX, WY + 22, 132, 92);
    if (nextType) {
      const spec = PIECES[nextType];
      const xs = spec.cells.map(c => c[0]);
      const ys = spec.cells.map(c => c[1]);
      const w = Math.max(...xs) - Math.min(...xs) + 1;
      const h = Math.max(...ys) - Math.min(...ys) + 1;
      ctx.save();
      ctx.translate(PX + 66 - (w * CELL) / 2 - Math.min(...xs) * CELL, WY + 68 - (h * CELL) / 2 - Math.min(...ys) * CELL);
      spec.cells.forEach(([cx, cy]) => drawCell(ctx, cx, cy, spec.color));
      ctx.restore();
    }
    A.text(ctx, 'ROWS', PX + 66, WY + 150, { size: 10, color: C.dim });
    A.text(ctx, String(demo ? 0 : lines), PX + 66, WY + 174, { size: 16, color: C.text });
    A.text(ctx, 'NEXT LEVEL', PX + 66, WY + 216, { size: 8, color: C.dim });
    A.text(ctx, demo ? '-' : String(10 - (lines % 10)) + ' ROWS', PX + 66, WY + 236, { size: 10, color: C.green });
    A.text(ctx, '4 ROWS =', PX + 66, WY + 290, { size: 8, color: C.dim });
    A.text(ctx, String(800 * (demo ? 1 : level)), PX + 66, WY + 310, { size: 12, color: C.yellow });
  }

  function drawMessages() {
    const cx = WX + (COLS * CELL) / 2;
    const cy = WY + (ROWS * CELL) / 2;
    if (shell.state === 'ready' && blink(150)) A.text(ctx, 'GET READY', cx, cy, { size: 14, color: C.yellow, glow: 12 });
    if (splash && shell.state === 'playing') {
      ctx.globalAlpha = 1 - splash.t / 1300;
      A.text(ctx, splash.text || '4 ROWS!', cx, cy - 40 - splash.t * 0.02, { size: splash.text ? 16 : 24, color: splash.text ? C.green : C.yellow, glow: 16 });
      ctx.globalAlpha = 1;
    }
  }

  function render() {
    ctx.save();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    shell.drawHud(score, demo ? 1 : level);
    drawWell();
    drawPanel();
    fx.draw(ctx);
    drawMessages();
    shell.drawOverlay();
    ctx.restore();
  }

  showTitle();
  A.waitForFont().then(() => A.startLoop({ update, render }));
})();
