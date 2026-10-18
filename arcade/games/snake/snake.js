/*
 * Neon Snake: the first game in the Neon Arcade.
 * States: title (attract mode with a demo snake) -> ready -> playing <-> paused
 *         -> dying -> entry (initials, if it's a high score) -> gameover
 */
(function () {
  'use strict';

  const A = window.Arcade;
  const C = A.COLORS;

  const GAME_ID = 'snake';
  const COLS = 24;
  const ROWS = 24;
  const CELL = 20;
  const HUD = 48;
  const W = COLS * CELL;
  const H = ROWS * CELL + HUD;

  const FOOD_PER_LEVEL = 5;
  const BONUS_CHANCE = 0.3;
  const BONUS_MS = 6000;
  const READY_MS = 1200;
  const DYING_MS = 1500;
  const DEMO_TICK_MS = 85;

  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  const canvas = document.getElementById('game');
  const { ctx } = A.createScreen(canvas, W, H);
  const input = A.createInput({ swipeTarget: canvas });

  let state = 'title';
  let stateTime = 0;
  let clock = 0;
  let demo = true;
  let hiScore = A.scores.best(GAME_ID);

  let snake, dir, turns, grow, food, bonus, score, level, eaten, tickMs, tickAcc;
  const fx = A.createEffects();
  let shake = 0;
  let banner = null;
  let entry = null;
  let rank = -1;

  const speedFor = lvl => Math.max(55, 140 - (lvl - 1) * 10);
  const same = (a, b) => a.x === b.x && a.y === b.y;
  const sfx = name => { if (!demo) A.sound.play(name); };
  const blink = (ms = 500) => Math.floor(clock / ms) % 2 === 0;

  function setState(next) {
    state = next;
    stateTime = 0;
  }

  // ---------- Game rules ----------

  function reset() {
    snake = [{ x: 8, y: 12 }, { x: 7, y: 12 }, { x: 6, y: 12 }];
    dir = DIRS.right;
    turns = [];
    grow = 0;
    score = 0;
    level = 1;
    eaten = 0;
    tickMs = demo ? DEMO_TICK_MS : speedFor(1);
    tickAcc = 0;
    food = null;
    bonus = null;
    banner = null;
    food = freeCell();
  }

  function freeCell() {
    const taken = new Set(snake.map(s => s.x + ',' + s.y));
    if (food) taken.add(food.x + ',' + food.y);
    if (bonus) taken.add(bonus.x + ',' + bonus.y);
    const free = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!taken.has(x + ',' + y)) free.push({ x, y });
      }
    }
    return free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }

  // Buffer up to 3 turns so quick taps (e.g. up-then-left) aren't lost between ticks.
  function queueTurn(d) {
    const last = turns.length ? turns[turns.length - 1] : dir;
    if (d === last || (d.x === -last.x && d.y === -last.y) || turns.length >= 3) return;
    turns.push(d);
  }

  // The tail moves out of the way on this tick unless the snake is growing.
  function blocked(cell, willGrow) {
    if (cell.x < 0 || cell.y < 0 || cell.x >= COLS || cell.y >= ROWS) return true;
    const body = willGrow ? snake : snake.slice(0, -1);
    return body.some(s => same(s, cell));
  }

  function step() {
    if (demo) turns = [demoTurn()];
    if (turns.length) dir = turns.shift();

    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    const ateFood = food && same(head, food);
    const ateBonus = bonus && same(head, bonus);
    if (blocked(head, grow > 0 || ateFood || ateBonus)) {
      die();
      return;
    }

    snake.unshift(head);

    if (ateFood) {
      eaten++;
      grow += 1;
      score += 10 * level;
      burst(head, C.pink, 14);
      sfx('eat');
      if (!demo && eaten % FOOD_PER_LEVEL === 0) levelUp();
      food = freeCell();
      if (!bonus && Math.random() < BONUS_CHANCE) {
        const cell = freeCell();
        if (cell) bonus = { x: cell.x, y: cell.y, ttl: BONUS_MS };
      }
    }

    if (ateBonus) {
      const points = 50 * level;
      grow += 2;
      score += points;
      burst(head, C.yellow, 24);
      fx.float(head.x * CELL + CELL / 2, head.y * CELL, '+' + points);
      sfx('bonus');
      bonus = null;
    }

    if (grow > 0) grow--;
    else snake.pop();

    if (!food) endRound(); // filled the whole board
  }

  function levelUp() {
    level++;
    tickMs = speedFor(level);
    banner = { text: 'LEVEL ' + level, t: 0 };
    sfx('levelup');
  }

  function die() {
    if (demo) {
      reset();
      return;
    }
    burst(snake[0], C.red, 30);
    shake = 10;
    sfx('die');
    setState('dying');
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

  function startGame() {
    demo = false;
    reset();
    setState('ready');
    A.sound.play('start');
  }

  function showTitle() {
    demo = true;
    reset();
    setState('title');
  }

  function pause() {
    setState('paused');
    A.sound.play('pause');
  }

  // ---------- Attract-mode AI ----------
  // Greedy toward the food, but refuses moves into pockets too small to fit its body.

  function demoTurn() {
    let best = dir;
    let bestScore = Infinity;
    for (const d of Object.values(DIRS)) {
      if (d.x === -dir.x && d.y === -dir.y) continue;
      const cell = { x: snake[0].x + d.x, y: snake[0].y + d.y };
      if (blocked(cell, false)) continue;
      const dist = Math.abs(cell.x - food.x) + Math.abs(cell.y - food.y);
      const trapped = openSpace(cell, snake.length) < snake.length ? 1000 : 0;
      const value = dist + trapped + Math.random() * 0.5;
      if (value < bestScore) {
        bestScore = value;
        best = d;
      }
    }
    return best;
  }

  function openSpace(from, cap) {
    const body = new Set(snake.slice(0, -1).map(s => s.x + ',' + s.y));
    const seen = new Set([from.x + ',' + from.y]);
    const todo = [from];
    while (todo.length && seen.size < cap) {
      const c = todo.pop();
      for (const d of Object.values(DIRS)) {
        const n = { x: c.x + d.x, y: c.y + d.y };
        const k = n.x + ',' + n.y;
        if (n.x < 0 || n.y < 0 || n.x >= COLS || n.y >= ROWS || body.has(k) || seen.has(k)) continue;
        seen.add(k);
        todo.push(n);
      }
    }
    return seen.size;
  }

  // ---------- Effects ----------

  function burst(cell, color, count) {
    fx.burst(cell.x * CELL + CELL / 2, cell.y * CELL + CELL / 2, color, count, 0.2);
  }

  // ---------- Input ----------

  input.on(action => {
    switch (state) {
      case 'title':
        if (action === 'start' || action === 'tap') startGame();
        break;
      case 'ready':
      case 'playing':
        if (DIRS[action]) queueTurn(DIRS[action]);
        else if (action === 'pause' && state === 'playing') pause();
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
        if (stateTime < 600) break; // don't skip the screen by accident
        if (action === 'start' || action === 'tap') startGame();
        else if (action === 'pause') showTitle();
        break;
    }
  });

  A.onBlur(() => { if (state === 'playing') pause(); });

  // ---------- Update ----------

  function update(dt) {
    clock += dt;
    stateTime += dt;
    shake = Math.max(0, shake - dt * 0.02);

    fx.update(dt);
    if (banner && (banner.t += dt) > 1400) banner = null;

    if (state === 'ready' && stateTime >= READY_MS) setState('playing');
    if (state === 'dying' && stateTime >= DYING_MS) endRound();
    if (state === 'gameover' && stateTime >= 20000) showTitle(); // back to attract mode

    if (state === 'title' || state === 'playing') {
      if (bonus && (bonus.ttl -= dt) <= 0) bonus = null;
      tickAcc += dt;
      while (tickAcc >= tickMs) {
        tickAcc -= tickMs;
        step();
        if (state !== 'playing' && state !== 'title') break;
      }
    }
  }

  // ---------- Render ----------

  function drawHud() {
    const shown = demo ? 0 : score;
    A.text(ctx, 'SCORE', 16, 16, { size: 8, color: C.dim, align: 'left' });
    A.text(ctx, A.pad(shown), 16, 33, { size: 14, align: 'left' });
    A.text(ctx, 'LEVEL', W / 2, 16, { size: 8, color: C.dim });
    A.text(ctx, String(demo ? 1 : level), W / 2, 33, { size: 14, color: C.green });
    A.text(ctx, 'HI-SCORE', W - 16, 16, { size: 8, color: C.dim, align: 'right' });
    A.text(ctx, A.pad(Math.max(hiScore, shown)), W - 16, 33, { size: 14, color: C.pink, align: 'right' });
    ctx.fillStyle = 'rgba(41, 240, 255, 0.6)';
    ctx.fillRect(0, HUD - 2, W, 2);
  }

  function drawBoard() {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#0b0a18' : '#0e0d1f';
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
  }

  function drawPickups() {
    if (food) {
      const r = CELL * 0.32 * (1 + Math.sin(clock / 120) * 0.12);
      ctx.save();
      ctx.fillStyle = C.pink;
      ctx.shadowColor = C.pink;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Bonus star blinks when it's about to vanish.
    if (bonus && (bonus.ttl > 2000 || blink(100))) {
      const cx = bonus.x * CELL + CELL / 2;
      const cy = bonus.y * CELL + CELL / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(clock / 400);
      ctx.fillStyle = C.yellow;
      ctx.shadowColor = C.yellow;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const rad = i % 2 ? 3.5 : 9;
        const a = (i / 8) * Math.PI * 2;
        ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawSnake() {
    const flash = state === 'dying' ? (blink(100) ? C.red : C.text) : null;
    for (let i = snake.length - 1; i >= 0; i--) {
      const s = snake[i];
      const t = i / Math.max(1, snake.length - 1);
      ctx.save();
      ctx.fillStyle = flash || 'hsl(' + (140 + t * 25) + ', 100%, ' + (62 - t * 30) + '%)';
      if (i === 0) {
        ctx.shadowColor = flash || C.green;
        ctx.shadowBlur = 16;
      }
      A.roundRect(ctx, s.x * CELL + 1.5, s.y * CELL + 1.5, CELL - 3, CELL - 3, i === 0 ? 6 : 4);
      ctx.restore();
    }

    // Eyes look the way the snake is heading.
    const head = snake[0];
    const cx = head.x * CELL + CELL / 2;
    const cy = head.y * CELL + CELL / 2;
    const side = { x: -dir.y, y: dir.x };
    ctx.fillStyle = C.bg;
    for (const k of [-1, 1]) {
      ctx.fillRect(cx + dir.x * 3 + side.x * 4 * k - 1.5, cy + dir.y * 3 + side.y * 4 * k - 1.5, 3, 3);
    }
  }

  const dim = alpha => A.dim(ctx, W, H, alpha);

  function drawOverlay() {
    const cx = W / 2;
    const cy = HUD + (ROWS * CELL) / 2;
    const startPrompt = A.isTouch ? 'TAP TO START' : 'PRESS ENTER';

    if (state === 'title') {
      dim(0.55);
      A.text(ctx, 'NEON', cx, 120, { size: 22, color: C.cyan, glow: 16 });
      A.text(ctx, 'SNAKE', cx, 166, { size: 40, color: C.pink, glow: 20 });
      // Attract mode alternates between how-to-play and the high score table.
      if (Math.floor(clock / 5000) % 2 === 0) {
        A.text(ctx, 'EAT ORBS TO GROW', cx, 250, { size: 10, color: C.pink });
        A.text(ctx, 'STARS = BONUS POINTS', cx, 282, { size: 10, color: C.yellow });
        A.text(ctx, 'AVOID WALLS & YOUR TAIL', cx, 314, { size: 10 });
        A.text(ctx, A.isTouch ? 'SWIPE OR D-PAD TO TURN' : 'ARROWS / WASD TO TURN', cx, 346, { size: 10, color: C.cyan });
      } else {
        A.drawScoreTable(ctx, GAME_ID, cx, 236);
      }
      if (blink()) A.text(ctx, startPrompt, cx, 440, { size: 14, color: C.yellow, glow: 10 });
      A.text(ctx, '(C) 2026 NEON ARCADE', cx, 500, { size: 8, color: C.dim });
    } else if (state === 'ready') {
      if (blink(150)) A.text(ctx, 'GET READY', cx, cy - 60, { size: 20, color: C.yellow, glow: 12 });
    } else if (state === 'paused') {
      dim(0.7);
      A.text(ctx, 'PAUSED', cx, cy - 20, { size: 28, color: C.cyan, glow: 16 });
      if (blink()) A.text(ctx, A.isTouch ? 'TAP TO RESUME' : 'PRESS P TO RESUME', cx, cy + 30, { size: 10 });
    } else if (state === 'entry') {
      dim(0.8);
      if (blink(250)) A.text(ctx, 'NEW HIGH SCORE!', cx, 130, { size: 18, color: C.yellow, glow: 14 });
      A.text(ctx, A.pad(score), cx, 180, { size: 24, color: C.pink, glow: 12 });
      A.text(ctx, 'ENTER YOUR INITIALS', cx, 250, { size: 10 });
      entry.draw(ctx, cx, 330, clock);
      A.text(ctx, A.isTouch ? 'UP/DOWN PICK - TAP NEXT' : 'UP/DOWN PICK - ENTER NEXT', cx, 420, { size: 8, color: C.dim });
    } else if (state === 'gameover') {
      dim(0.75);
      A.text(ctx, 'GAME OVER', cx, 110, { size: 32, color: C.red, glow: 18 });
      A.text(ctx, 'SCORE ' + A.pad(score), cx, 160, { size: 14 });
      A.drawScoreTable(ctx, GAME_ID, cx, 220, { highlight: rank, t: clock });
      if (stateTime > 600 && blink()) A.text(ctx, A.isTouch ? 'TAP TO PLAY AGAIN' : 'ENTER TO PLAY AGAIN', cx, 430, { size: 12, color: C.yellow, glow: 10 });
      if (!A.isTouch) A.text(ctx, 'ESC FOR TITLE', cx, 470, { size: 8, color: C.dim });
    }

    if (banner) {
      ctx.globalAlpha = 1 - banner.t / 1400;
      A.text(ctx, banner.text, cx, cy - 60, { size: 20, color: C.green, glow: 14 });
      ctx.globalAlpha = 1;
    }
  }

  function render() {
    ctx.save();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    drawHud();
    ctx.save();
    ctx.translate(0, HUD);
    drawBoard();
    drawPickups();
    drawSnake();
    fx.draw(ctx);
    ctx.restore();
    drawOverlay();
    ctx.restore();
  }

  showTitle();
  A.waitForFont().then(() => A.startLoop({ update, render }));
})();
