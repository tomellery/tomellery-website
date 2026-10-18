/*
 * Brick Buster: the second game in the Neon Arcade.
 * States: title (attract mode, the CPU plays) -> playing (ball rides the paddle until launched)
 *         <-> paused, lost (ball dropped) / clear (stage done) -> entry (initials) -> gameover
 */
(function () {
  'use strict';

  const A = window.Arcade;
  const C = A.COLORS;

  const GAME_ID = 'bricks';
  const W = 480;
  const H = 600;
  const HUD = 48;

  const COLS = 10;
  const BRICK_W = 44;
  const BRICK_H = 18;
  const GAP = 2;
  const GRID_X = (W - (COLS * BRICK_W + (COLS - 1) * GAP)) / 2;
  const GRID_Y = HUD + 56;

  const PADDLE_Y = H - 44;
  const PADDLE_H = 12;
  const PADDLE_W = 76;
  const WIDE_W = 120;
  const PADDLE_SPEED = 0.6; // px per ms with keys/buttons
  const MAX_BOUNCE = Math.PI / 3; // steepest angle off the paddle's edge
  const MIN_BOUNCE = 0.15;

  const BALL_R = 5;
  const MAX_SPEED = 0.62;
  const MAX_BALLS = 12;
  const START_LIVES = 3;
  const MAX_LIVES = 6;

  const POWER_CHANCE = 0.14;
  const POWER_FALL = 0.13;
  const WIDE_MS = 15000;
  const LOST_MS = 1200;
  const CLEAR_MS = 2200;
  const DEMO_SERVE_MS = 700;

  const BRICKS = {
    P: { color: C.pink, hp: 1, points: 50 },
    Y: { color: C.yellow, hp: 1, points: 40 },
    G: { color: C.green, hp: 1, points: 30 },
    C: { color: C.cyan, hp: 1, points: 20 },
    S: { color: '#c9c4e8', hp: 2, points: 80 }, // silver: two hits
    X: { color: '#4a4670', hp: Infinity, points: 0 }, // steel: unbreakable
  };

  // Each row is 10 bricks wide; '.' is empty. After the last stage they repeat, faster.
  const STAGES = [
    ['PPPPPPPPPP', 'YYYYYYYYYY', 'GGGGGGGGGG', 'CCCCCCCCCC', 'CCCCCCCCCC'],
    ['....SS....', '...PPPP...', '..YYYYYY..', '.GGGGGGGG.', 'CCCCCCCCCC'],
    ['S.S.S.S.S.', '.P.P.P.P.P', 'Y.Y.Y.Y.Y.', '.G.G.G.G.G', 'C.C.C.C.C.', '.S.S.S.S.S'],
    ['PPPPPPPPPP', 'P.XXXXXX.P', 'P.YYYYYY.P', 'P.GGGGGG.P', 'P........P', 'SSSS..SSSS'],
    ['....SS....', '...SPPS...', '..SYYYYS..', '.SGGGGGGS.', '..SCCCCS..', '...SPPS...', '....SS....'],
  ];

  const POWERS = {
    wide: { letter: 'W', color: C.cyan, label: 'WIDE!' },
    multi: { letter: 'M', color: C.pink, label: 'MULTI!' },
    slow: { letter: 'S', color: C.green, label: 'SLOW!' },
    life: { letter: '+', color: C.yellow, label: '1UP!' },
  };

  const canvas = document.getElementById('game');
  const { ctx } = A.createScreen(canvas, W, H);
  const input = A.createInput({ pointerTarget: canvas, screen: { width: W, height: H } });
  const fx = A.createEffects();

  let state = 'title';
  let stateTime = 0;
  let clock = 0;
  let demo = true;
  let hiScore = A.scores.best(GAME_ID);

  let stage, score, lives, bricks, balls, powers, paddle;
  let pointerX = null;
  let demoAim = 0;
  let shake = 0;
  let banner = null;
  let entry = null;
  let rank = -1;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));
  const sfx = (name, arg) => { if (!demo) A.sound.play(name, arg); };
  const blink = (ms = 500) => Math.floor(clock / ms) % 2 === 0;
  const baseSpeed = () => Math.min(0.3 + (stage - 1) * 0.03, 0.5);

  function setState(next) {
    state = next;
    stateTime = 0;
  }

  // ---------- Setup ----------

  function loadStage() {
    const layout = STAGES[(stage - 1) % STAGES.length];
    bricks = [];
    layout.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        const type = BRICKS[ch];
        if (!type) return;
        bricks.push({ x: GRID_X + c * (BRICK_W + GAP), y: GRID_Y + r * (BRICK_H + GAP), type, hp: type.hp, flash: 0 });
      });
    });
  }

  function serve() {
    balls = [{ x: paddle.x, y: PADDLE_Y - PADDLE_H / 2 - BALL_R, vx: 0, vy: 0, speed: baseSpeed(), stuck: true, combo: 0, trail: [] }];
    powers = [];
  }

  function resetGame() {
    stage = 1;
    score = 0;
    lives = START_LIVES;
    paddle = { x: W / 2, w: PADDLE_W, wideMs: 0, flash: 0 };
    pointerX = null;
    banner = null;
    fx.clear();
    loadStage();
    serve();
  }

  function newGame() {
    demo = false;
    resetGame();
    setState('playing');
    banner = { text: 'STAGE 1', t: 0 };
    A.sound.play('start');
  }

  function showTitle() {
    demo = true;
    resetGame();
    setState('title');
  }

  function pause() {
    setState('paused');
    A.sound.play('pause');
  }

  function launch() {
    let launched = false;
    balls.forEach(b => {
      if (!b.stuck) return;
      b.stuck = false;
      setAngle(b, (Math.random() - 0.5) * 0.6);
      launched = true;
    });
    if (launched) sfx('paddle');
  }

  // ---------- Ball physics ----------

  // Angle is measured from straight up; positive leans right.
  function setAngle(ball, angle) {
    ball.vx = Math.sin(angle) * ball.speed;
    ball.vy = -Math.cos(angle) * ball.speed;
  }

  function setSpeed(ball, speed) {
    const current = Math.hypot(ball.vx, ball.vy) || 1;
    ball.speed = speed;
    ball.vx *= speed / current;
    ball.vy *= speed / current;
  }

  function updateBalls(dt) {
    const current = balls;
    for (const ball of current) {
      if (ball.stuck) {
        ball.x = paddle.x;
        continue;
      }
      // Small sub-steps so a fast ball can't tunnel through a brick.
      const steps = Math.ceil((ball.speed * dt) / 3);
      for (let i = 0; i < steps && !ball.dead; i++) {
        moveBall(ball, dt / steps);
        if (balls !== current) return; // stage cleared or demo restarted mid-move
      }
      ball.trail.push({ x: ball.x, y: ball.y });
      if (ball.trail.length > 6) ball.trail.shift();
    }
    balls = balls.filter(b => !b.dead);
    if (!balls.length) ballLost();
  }

  function moveBall(ball, dt) {
    const px = ball.x;
    const py = ball.y;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx); sfx('wall'); }
    if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx); sfx('wall'); }
    if (ball.y < HUD + BALL_R) { ball.y = HUD + BALL_R; ball.vy = Math.abs(ball.vy); sfx('wall'); }
    if (ball.y > H + BALL_R * 2) { ball.dead = true; return; }

    // Paddle: where it hits decides the bounce angle, so players can aim.
    const top = PADDLE_Y - PADDLE_H / 2;
    if (ball.vy > 0 && ball.y + BALL_R >= top && py + BALL_R <= top + PADDLE_H / 2 &&
        Math.abs(ball.x - paddle.x) <= paddle.w / 2 + BALL_R) {
      const offset = clamp((ball.x - paddle.x) / (paddle.w / 2), -1, 1);
      // Never perfectly vertical, or the ball can get stuck bouncing in an empty column.
      const lean = offset || (Math.random() - 0.5);
      setAngle(ball, Math.sign(lean) * Math.max(MIN_BOUNCE, Math.abs(offset) * MAX_BOUNCE));
      ball.y = top - BALL_R;
      ball.combo = 0;
      paddle.flash = 100;
      demoAim = (Math.random() - 0.5) * paddle.w * 0.7;
      sfx('paddle');
      return;
    }

    for (const brick of bricks) {
      const nx = clamp(ball.x, brick.x, brick.x + BRICK_W);
      const ny = clamp(ball.y, brick.y, brick.y + BRICK_H);
      if ((ball.x - nx) ** 2 + (ball.y - ny) ** 2 > BALL_R * BALL_R) continue;

      // Bounce off whichever face the ball came through.
      const fromSide = px < brick.x || px > brick.x + BRICK_W;
      const fromEnd = py < brick.y || py > brick.y + BRICK_H;
      if (fromSide) ball.vx = px < brick.x ? -Math.abs(ball.vx) : Math.abs(ball.vx);
      if (fromEnd || !fromSide) ball.vy = py < brick.y ? -Math.abs(ball.vy) : Math.abs(ball.vy);
      ball.x = px;
      ball.y = py;
      hitBrick(brick, ball);
      return;
    }
  }

  function hitBrick(brick, ball) {
    brick.flash = 90;
    if (brick.hp === Infinity) { sfx('steel'); return; }
    brick.hp--;
    if (brick.hp > 0) { sfx('steel'); return; }

    bricks.splice(bricks.indexOf(brick), 1);
    const cx = brick.x + BRICK_W / 2;
    const cy = brick.y + BRICK_H / 2;
    score += brick.type.points;
    fx.burst(cx, cy, brick.type.color, 12);
    sfx('brick', ball.combo++);
    setSpeed(ball, Math.min(MAX_SPEED, ball.speed * 1.006));

    if (Math.random() < POWER_CHANCE) {
      const kind = Math.random() < 0.12 ? 'life' : ['wide', 'multi', 'slow'][Math.floor(Math.random() * 3)];
      powers.push({ x: cx, y: cy, kind });
    }
    if (!bricks.some(b => b.hp !== Infinity)) stageClear();
  }

  function ballLost() {
    if (demo) { serve(); return; }
    lives--;
    shake = 8;
    paddle.wideMs = 0;
    powers = [];
    sfx(lives > 0 ? 'lose' : 'die');
    setState('lost');
  }

  function stageClear() {
    if (demo) { showTitle(); return; }
    const bonus = 500 * stage;
    score += bonus;
    fx.float(W / 2, H / 2 + 40, 'BONUS +' + bonus);
    balls = [];
    powers = [];
    sfx('levelup');
    setState('clear');
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

  // ---------- Power-ups ----------

  function updatePowers(dt) {
    powers = powers.filter(p => {
      p.y += POWER_FALL * dt;
      if (p.y > H + 10) return false;
      const caught = Math.abs(p.y - PADDLE_Y) <= PADDLE_H / 2 + 7 && Math.abs(p.x - paddle.x) <= paddle.w / 2 + 14;
      if (caught) applyPower(p.kind);
      return !caught;
    });
  }

  function applyPower(kind) {
    const power = POWERS[kind];
    score += 100;
    fx.float(paddle.x, PADDLE_Y - 24, power.label, power.color);
    sfx('powerup');

    if (kind === 'wide') paddle.wideMs = WIDE_MS;
    else if (kind === 'life') lives = Math.min(MAX_LIVES, lives + 1);
    else if (kind === 'slow') balls.forEach(b => setSpeed(b, baseSpeed() * 0.85));
    else if (kind === 'multi') {
      launch();
      const extra = [];
      balls.forEach(b => {
        const angle = Math.atan2(b.vx, -b.vy);
        for (const spread of [-0.45, 0.45]) {
          if (balls.length + extra.length >= MAX_BALLS) return;
          const copy = { ...b, trail: [] };
          setAngle(copy, clamp(angle + spread, -1.3, 1.3));
          extra.push(copy);
        }
      });
      balls = balls.concat(extra);
    }
  }

  // ---------- Paddle ----------

  function updatePaddle(dt) {
    if (paddle.wideMs > 0) paddle.wideMs = Math.max(0, paddle.wideMs - dt);
    paddle.w = approach(paddle.w, paddle.wideMs > 0 ? WIDE_W : PADDLE_W, dt * 0.15);
    paddle.flash = Math.max(0, paddle.flash - dt);

    if (demo) {
      paddle.x = approach(paddle.x, demoTarget(), PADDLE_SPEED * dt);
    } else {
      const keys = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
      if (keys) {
        paddle.x += keys * PADDLE_SPEED * dt;
        pointerX = null; // keys take over until the mouse/finger moves again
      } else if (pointerX !== null) {
        paddle.x = approach(paddle.x, pointerX, 1.8 * dt);
      }
    }
    paddle.x = clamp(paddle.x, paddle.w / 2, W - paddle.w / 2);
  }

  // The CPU follows the lowest falling ball, hitting it off-centre so the demo isn't boring.
  function demoTarget() {
    const falling = balls.filter(b => b.vy > 0).sort((a, b) => b.y - a.y)[0];
    const ball = falling || balls[0];
    return ball ? ball.x + demoAim : W / 2;
  }

  // ---------- Input ----------

  input.on(action => {
    switch (state) {
      case 'title':
        if (action === 'start' || action === 'tap') newGame();
        break;
      case 'playing':
        if (action === 'start' || action === 'tap' || action === 'up') launch();
        else if (action === 'pause') pause();
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
        if (stateTime < 600) break;
        if (action === 'start' || action === 'tap') newGame();
        else if (action === 'pause') showTitle();
        break;
    }
  });

  input.onPointer(p => { if (!demo) pointerX = p.x; });

  A.onBlur(() => { if (state === 'playing') pause(); });

  // ---------- Update ----------

  function update(dt) {
    clock += dt;
    stateTime += dt;
    shake = Math.max(0, shake - dt * 0.02);
    fx.update(dt);
    bricks.forEach(b => { b.flash = Math.max(0, b.flash - dt); });
    if (banner && (banner.t += dt) > 1600) banner = null;

    if (state === 'title' || state === 'playing') {
      updatePaddle(dt);
      if (demo && balls[0] && balls[0].stuck && stateTime > DEMO_SERVE_MS) launch();
      updatePowers(dt);
      updateBalls(dt);
    } else if (state === 'lost' && stateTime >= LOST_MS) {
      if (lives > 0) {
        serve();
        setState('playing');
      } else {
        endRound();
      }
    } else if (state === 'clear' && stateTime >= CLEAR_MS) {
      stage++;
      loadStage();
      serve();
      paddle.wideMs = 0;
      banner = { text: 'STAGE ' + stage, t: 0 };
      setState('playing');
    } else if (state === 'gameover' && stateTime >= 20000) {
      showTitle();
    }
  }

  // ---------- Render ----------

  function drawHud() {
    const shown = demo ? 0 : score;
    A.text(ctx, 'SCORE', 16, 16, { size: 8, color: C.dim, align: 'left' });
    A.text(ctx, A.pad(shown), 16, 33, { size: 14, align: 'left' });
    A.text(ctx, 'STAGE', W / 2, 16, { size: 8, color: C.dim });
    A.text(ctx, String(stage), W / 2, 33, { size: 14, color: C.cyan });
    A.text(ctx, 'HI-SCORE', W - 16, 16, { size: 8, color: C.dim, align: 'right' });
    A.text(ctx, A.pad(Math.max(hiScore, shown)), W - 16, 33, { size: 14, color: C.pink, align: 'right' });
    ctx.fillStyle = 'rgba(41, 240, 255, 0.6)';
    ctx.fillRect(0, HUD - 2, W, 2);
  }

  function drawField() {
    ctx.fillStyle = '#0b0a18';
    ctx.fillRect(0, HUD, W, H - HUD);
    ctx.fillStyle = 'rgba(41, 240, 255, 0.05)';
    for (let x = 24; x < W; x += 24) ctx.fillRect(x, HUD, 1, H - HUD);
    for (let y = HUD + 24; y < H; y += 24) ctx.fillRect(0, y, W, 1);
  }

  function drawBricks() {
    for (const b of bricks) {
      ctx.save();
      ctx.fillStyle = b.flash > 0 ? C.text : b.type.color;
      if (b.type.hp !== Infinity) {
        ctx.shadowColor = b.type.color;
        ctx.shadowBlur = 8;
      }
      A.roundRect(ctx, b.x, b.y, BRICK_W, BRICK_H, 3);
      ctx.restore();

      // Bevel: light top edge, dark bottom edge.
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fillRect(b.x + 3, b.y + 2, BRICK_W - 6, 3);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(b.x + 3, b.y + BRICK_H - 4, BRICK_W - 6, 2);

      if (b.type.hp === Infinity) {
        ctx.fillStyle = '#8a85b3';
        ctx.fillRect(b.x + 5, b.y + 8, 3, 3);
        ctx.fillRect(b.x + BRICK_W - 8, b.y + 8, 3, 3);
      } else if (b.hp < b.type.hp) {
        // Cracked silver brick
        ctx.strokeStyle = C.bg;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(b.x + 14, b.y + 2);
        ctx.lineTo(b.x + 20, b.y + 9);
        ctx.lineTo(b.x + 16, b.y + 16);
        ctx.moveTo(b.x + 20, b.y + 9);
        ctx.lineTo(b.x + 30, b.y + 11);
        ctx.stroke();
      }
    }
  }

  function drawPaddle() {
    if (state === 'lost' && blink(100)) return;
    const x = paddle.x - paddle.w / 2;
    const y = PADDLE_Y - PADDLE_H / 2;
    ctx.save();
    ctx.shadowColor = C.cyan;
    ctx.shadowBlur = paddle.flash > 0 ? 24 : 14;
    ctx.fillStyle = paddle.flash > 0 ? C.text : C.cyan;
    A.roundRect(ctx, x, y, paddle.w, PADDLE_H, 6);
    ctx.restore();
    ctx.fillStyle = C.pink;
    A.roundRect(ctx, x, y, 10, PADDLE_H, 6);
    A.roundRect(ctx, x + paddle.w - 10, y, 10, PADDLE_H, 6);
  }

  function drawBalls() {
    for (const b of balls) {
      b.trail.forEach((t, i) => {
        ctx.globalAlpha = (i + 1) / (b.trail.length + 1) * 0.35;
        ctx.fillStyle = C.cyan;
        ctx.beginPath();
        ctx.arc(t.x, t.y, BALL_R * 0.8, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.fillStyle = C.text;
      ctx.shadowColor = C.text;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPowers() {
    for (const p of powers) {
      const power = POWERS[p.kind];
      ctx.save();
      ctx.fillStyle = C.bg;
      ctx.strokeStyle = power.color;
      ctx.lineWidth = 2;
      ctx.shadowColor = power.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(p.x - 14, p.y - 7, 28, 14, 7);
      else ctx.rect(p.x - 14, p.y - 7, 28, 14);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      A.text(ctx, power.letter, p.x + 1, p.y + 1, { size: 8, color: power.color });
    }
  }

  function drawLives() {
    for (let i = 0; i < lives - (state === 'playing' || state === 'title' ? 1 : 0); i++) {
      ctx.fillStyle = C.cyan;
      A.roundRect(ctx, 12 + i * 26, H - 16, 20, 6, 3);
    }
  }

  const dim = alpha => A.dim(ctx, W, H, alpha);

  function drawOverlay() {
    const cx = W / 2;
    const cy = H / 2 + 40;
    const startPrompt = A.isTouch ? 'TAP TO START' : 'PRESS ENTER';

    if (state === 'title') {
      dim(0.55);
      A.text(ctx, 'BRICK', cx, 130, { size: 36, color: C.cyan, glow: 18 });
      A.text(ctx, 'BUSTER', cx, 180, { size: 40, color: C.pink, glow: 20 });
      if (Math.floor(clock / 5000) % 2 === 0) {
        A.text(ctx, 'BREAK EVERY BRICK', cx, 262, { size: 10, color: C.yellow });
        A.text(ctx, 'SILVER TAKES TWO HITS', cx, 294, { size: 10 });
        A.text(ctx, 'STEEL NEVER BREAKS', cx, 326, { size: 10, color: C.dim });
        A.text(ctx, 'CATCH W M S + POWER-UPS', cx, 358, { size: 10, color: C.green });
        A.text(ctx, A.isTouch ? 'DRAG OR BUTTONS TO MOVE' : 'MOUSE OR ARROWS TO MOVE', cx, 390, { size: 10, color: C.cyan });
      } else {
        A.drawScoreTable(ctx, GAME_ID, cx, 252);
      }
      if (blink()) A.text(ctx, startPrompt, cx, 480, { size: 14, color: C.yellow, glow: 10 });
      A.text(ctx, '(C) 2026 NEON ARCADE', cx, 572, { size: 8, color: C.dim });
    } else if (state === 'playing') {
      if (balls[0] && balls[0].stuck && blink(400)) {
        A.text(ctx, A.isTouch ? 'TAP TO LAUNCH' : 'SPACE TO LAUNCH', cx, PADDLE_Y - 70, { size: 10, color: C.yellow });
      }
    } else if (state === 'paused') {
      dim(0.7);
      A.text(ctx, 'PAUSED', cx, cy - 20, { size: 28, color: C.cyan, glow: 16 });
      if (blink()) A.text(ctx, A.isTouch ? 'TAP TO RESUME' : 'PRESS P TO RESUME', cx, cy + 30, { size: 10 });
    } else if (state === 'clear') {
      A.text(ctx, 'STAGE CLEAR!', cx, cy - 20, { size: 22, color: C.green, glow: 16 });
    } else if (state === 'lost' && lives > 0) {
      A.text(ctx, lives === 1 ? 'LAST BALL!' : lives + ' BALLS LEFT', cx, cy, { size: 14, color: C.yellow, glow: 10 });
    } else if (state === 'entry') {
      dim(0.8);
      if (blink(250)) A.text(ctx, 'NEW HIGH SCORE!', cx, 150, { size: 18, color: C.yellow, glow: 14 });
      A.text(ctx, A.pad(score), cx, 200, { size: 24, color: C.pink, glow: 12 });
      A.text(ctx, 'ENTER YOUR INITIALS', cx, 280, { size: 10 });
      entry.draw(ctx, cx, 360, clock);
      A.text(ctx, A.isTouch ? 'UP/DOWN PICK - TAP NEXT' : 'UP/DOWN PICK - ENTER NEXT', cx, 450, { size: 8, color: C.dim });
    } else if (state === 'gameover') {
      dim(0.75);
      A.text(ctx, 'GAME OVER', cx, 130, { size: 32, color: C.red, glow: 18 });
      A.text(ctx, 'SCORE ' + A.pad(score) + '  STAGE ' + stage, cx, 180, { size: 12 });
      A.drawScoreTable(ctx, GAME_ID, cx, 250, { highlight: rank, t: clock });
      if (stateTime > 600 && blink()) A.text(ctx, A.isTouch ? 'TAP TO PLAY AGAIN' : 'ENTER TO PLAY AGAIN', cx, 470, { size: 12, color: C.yellow, glow: 10 });
      if (!A.isTouch) A.text(ctx, 'ESC FOR TITLE', cx, 510, { size: 8, color: C.dim });
    }

    if (banner && state === 'playing') {
      ctx.globalAlpha = 1 - banner.t / 1600;
      A.text(ctx, banner.text, cx, cy, { size: 22, color: C.cyan, glow: 14 });
      ctx.globalAlpha = 1;
    }
  }

  function render() {
    ctx.save();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    drawHud();
    drawField();
    drawBricks();
    drawPowers();
    drawPaddle();
    drawBalls();
    fx.draw(ctx);
    drawLives();
    drawOverlay();
    ctx.restore();
  }

  showTitle();
  A.waitForFont().then(() => A.startLoop({ update, render }));
})();
