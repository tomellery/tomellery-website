// Secret snow dump: press the "BRIGHTON · …" snow line in the top bar and it starts snowing all over the page.
// The longer you hold it, the harder it snows; hold past ~3 s and walls of snow come crashing down. Taps add up too.
// On a keyboard: type "dump" (each extra p turns it up) or "bury" (straight to a wall; each extra y brings another).
// Snow piles up on TOM ELLERY, the TE badge, every link, the small print and the divider lines, and stays until you reload.
// Swipe or move the mouse through a pile to knock it off. Dark mode only.
(function () {
  const CELL = 2;    // pile resolution in px
  const WALLS = 5;   // most walls of snow one blizzard can bring
  const BURY = 3.5;  // at full blizzard, every pile can get this many times deeper
  const WALL_SPEED = 320; // px per second: how fast the bury's wall of snow comes down the screen
  // What snow can land on, and how deep it can get there (px)
  const KINDS = { solid: 26, name: 12, line: 7, thin: 6, small: 5 };
  const COLORS = { solid: "#00f", name: "#0f0", line: "#ff0", thin: "#f00", small: "#0ff" };
  const GRAB = { solid: 1, name: 1, line: .4, thin: 1, small: .6 }; // how "sticky" each kind is (thin dividers hold less)
  const MAX = { small: 4 }; // never deeper than this, even after a bury, so it doesn't bury the line of text above
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const light = () => document.documentElement.dataset.theme === "light";

  let canvas, ctx, W, H, groups = [], flakes = [], bits = [], dumpUntil = 0, running = false, spreadNext = false;
  let capMul = 1, maxBits = 600, heavy = false; // a hard snowfall raises these
  let buryAt = -99, power = 0, walls = 0, hold = null; // see raise()

  // ---------- Surfaces: every spot where something solid has open air right above it ----------
  const isFixed = el => { for (let n = el; n && n !== document.body; n = n.parentElement) if (getComputedStyle(n).position === "fixed") return true; return false; };

  function buildGroup(fixed) {
    const docW = fixed ? innerWidth : document.documentElement.scrollWidth;
    const docH = fixed ? innerHeight : document.documentElement.scrollHeight;
    const ox = fixed ? 0 : scrollX, oy = fixed ? 0 : scrollY;
    const m = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    m.canvas.width = docW; m.canvas.height = docH;
    let any = false;

    const text = (el, kind) => {
      if (!el || isFixed(el) !== fixed) return;
      const r = el.getBoundingClientRect();
      if (!r.width || r.bottom < -docH || r.top > docH * 2) return;
      const cs = getComputedStyle(el), fs = parseFloat(cs.fontSize);
      m.font = `400 ${fs}px Anton`;
      m.letterSpacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
      const t = el.textContent.toUpperCase();
      // Where the text's baseline really is on screen: an empty inline-block sits exactly on it
      const probe = document.createElement("span");
      probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
      el.appendChild(probe);
      const onScreen = probe.getBoundingClientRect().top;
      probe.remove();
      // The poster layout stretches the name taller (scaleY on .fitbox); draw it the same way
      const box = el.closest(".fitbox"), s = box ? +((box.style.transform.match(/scaleY\(([\d.]+)\)/) || [])[1] || 1) : 1;
      const cy = box ? box.getBoundingClientRect().top + box.getBoundingClientRect().height / 2 : 0;
      m.setTransform(1, 0, 0, s, 0, (cy + oy) * (1 - s));
      const base = (s !== 1 ? cy + (onScreen - cy) / s : onScreen) + oy;
      if (kind === "thin") { m.strokeStyle = COLORS.thin; m.lineWidth = parseFloat(cs.webkitTextStrokeWidth) || 1.5; m.strokeText(t, r.left + ox, base); }
      else { m.fillStyle = COLORS[kind]; m.fillText(t, r.left + ox, base); }
      m.setTransform(1, 0, 0, 1, 0, 0);
      any = true;
    };
    // Small print: a ledge along the top of every line of text inside el
    const ledge = (el, kind) => {
      if (!el || isFixed(el) !== fixed) return;
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n; (n = w.nextNode());) {
        if (!n.textContent.trim()) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        // The tops of the capital letters: baseline (box top + font ascent) minus the cap height
        m.font = getComputedStyle(n.parentElement).font;
        const fm = m.measureText("H"), cap = fm.fontBoundingBoxAscent - fm.actualBoundingBoxAscent;
        m.fillStyle = COLORS[kind];
        for (const r of rg.getClientRects()) if (r.width) { m.fillRect(r.left + ox, r.top + oy + cap, r.width, 1); any = true; }
      }
    };
    const rect = (el, kind, edge) => {
      if (!el || isFixed(el) !== fixed) return;
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      m.fillStyle = COLORS[kind];
      if (edge === "bottom") m.fillRect(r.left + ox, r.bottom + oy - 1, r.width, 1);
      else m.fillRect(r.left + ox, r.top + oy, r.width, edge === "top" ? 1 : r.height);
      any = true;
    };

    text(document.querySelector("h1 .tom"), "solid");
    text(document.querySelector("h1 .ellery"), "thin");
    rect(document.querySelector(".badge"), "solid");
    rect(document.querySelector(".rule"), "solid");
    rect(document.querySelector(".menu-btn"), "line", "top");
    document.querySelectorAll("#links .name").forEach(n => text(n, "name"));
    rect(document.querySelector("#links"), "line", "top");
    document.querySelectorAll("#links li").forEach(li => rect(li, "line", "bottom"));
    ledge(document.querySelector(".bar .right"), "small");
    ledge(document.querySelector(".bio"), "small");
    ledge(document.querySelector(".now"), "small");
    document.querySelectorAll("#links .n, #links .h").forEach(n => ledge(n, "small"));
    rect(document.querySelector(".crypto-ribbon:not([hidden])"), "line", "top");
    rect(document.querySelector(".snow-board:not([hidden])"), "line", "top");
    ledge(document.querySelector(".snow-board:not([hidden]) .snow-head"), "small");
    ledge(document.querySelector("footer"), "small");
    if (!any) return null;

    const a = m.getImageData(0, 0, docW, docH).data, cols = [], all = [];
    for (let c = 0; c * CELL < docW; c++) {
      const x = c * CELL + 1, list = [];
      let prev = false;
      for (let y = 0; y < docH; y++) {
        const i = (y * docW + x) * 4, solid = a[i + 3] > 90;
        if (solid && !prev) {
          const r = a[i] > 128, g = a[i + 1] > 128, b = a[i + 2] > 128;
          const kind = r && g ? "line" : g && b ? "small" : r ? "thin" : g ? "name" : "solid";
          // A flake picks evenly among everything below it in its column (see land), so snow ends up all over
          // instead of TOM and the first link shielding everything under them
          const s = { x: c * CELL, y, d: 0, cap: KINDS[kind], lim: Math.min(MAX[kind] || Infinity, y * .6), /* near the top of the page there's no room for a tall pile */ grab: GRAB[kind], l: null, r: null };
          list.push(s); all.push(s);
        }
        prev = solid;
      }
      cols.push(list);
    }
    // Neighbors on either side, so snow can slide downhill
    for (let c = 0; c < cols.length - 1; c++) for (const s of cols[c]) {
      let best = null;
      for (const t of cols[c + 1]) if (Math.abs(t.y - s.y) <= 3 && (!best || Math.abs(t.y - s.y) < Math.abs(best.y - s.y))) best = t;
      if (best && !best.l) { s.r = best; best.l = s; }
    }
    // How far each spot is from the nearest end of its ledge (for the pillow shape after a bury)
    for (const s of all) {
      let a = 0, b = 0;
      for (let n = s.l; n && a < 12; n = n.l) a++;
      for (let n = s.r; n && b < 12; n = n.r) b++;
      s.e = Math.min(a, b);
    }
    return { fixed, cols, all };
  }
  function build() { groups = [buildGroup(true), buildGroup(false)].filter(Boolean); }

  const off = g => g.fixed ? [0, 0] : [scrollX, scrollY];

  function settle(g) {
    for (const s of g.all) {
      if (s.d <= 0) continue;
      for (const n of [s.l, s.r]) {
        if (!n) continue;
        const top = s.y - s.d, nTop = n.y - n.d;
        // After a bury the snow is heavy and wet: it sits like a pillow, nearly flat on top with steep rounded shoulders
        const slope = heavy ? Math.max(1.2, 8 / (Math.min(s.e, n.e) + 1)) : 1.7;
        if (top < nTop - slope) { const move = Math.min(s.d, (nTop - top - slope) / 2); s.d -= move; n.d += move; }
      }
      // Edges can't hold much: the extra falls off as a little clump
      const edge = heavy ? Math.min(s.cap * capMul, s.lim) * .45 : 1.4;
      if ((!s.l || !s.r) && s.d > edge) {
        const extra = s.d - edge, [ox, oy] = off(g); s.d = edge;
        if (extra > .35 && bits.length < maxBits) bits.push({ x: s.x + 1 - ox + (s.l ? 2 : -2), y: s.y - 1 - oy, vx: (s.l ? 1 : -1) * 20, vy: 0, t: now(), life: 1.2, r: 1 + Math.min(1.4, extra * .3) });
      }
      const max = Math.min(s.cap * capMul, s.lim);
      if (s.d > max) s.d = max;
    }
  }

  // Moving through a pile (mouse or finger) knocks it off
  function knock(x, y, dx, dy) {
    for (const g of groups) {
      const [ox, oy] = off(g), px = x + ox, py = y + oy;
      for (let c = Math.max(0, Math.floor((px - 14) / CELL)); c <= Math.min(g.cols.length - 1, Math.floor((px + 14) / CELL)); c++) {
        for (const s of g.cols[c]) {
          if (s.d < .3 || py < s.y - s.d - 12 || py > s.y + 8) continue;
          for (let i = 0; i < Math.min(5, Math.ceil(s.d / 2)) && bits.length < maxBits; i++)
            bits.push({ x: s.x + 1 - ox, y: s.y - Math.random() * s.d - oy, vx: dx * 6 + (Math.random() - .5) * 90, vy: dy * 6 - 60 - Math.random() * 120, t: now(), life: .9 + Math.random() * .6, r: Math.random() * 1.4 + .7 });
          s.d = 0;
        }
      }
    }
  }
  let lx = null, ly = null;
  const move = (x, y) => { if (lx !== null && groups.length) knock(x, y, x - lx, y - ly); lx = x; ly = y; };
  addEventListener("pointermove", e => { if (e.pointerType === "mouse") move(e.clientX, e.clientY); }, { passive: true });
  addEventListener("touchmove", e => { const t = e.touches[0]; if (t) move(t.clientX, t.clientY); }, { passive: true });
  addEventListener("touchend", () => { lx = ly = null; }, { passive: true });

  // ---------- Flakes ----------
  const now = () => performance.now() / 1000;
  // A dump starts with the whole screen full of falling snow; after that new flakes come in from the top.
  // Some are fat clumps that land as a little mound instead of a dusting: more of them the harder it snows.
  const flake = spread => {
    const clump = Math.random() < .06 + .2 * Math.min(1, power);
    return { x: Math.random() * W, y: spread ? Math.random() * H : -10 - Math.random() * 60, r: clump ? Math.random() * 2 + 2.5 : Math.random() * 2 + .8,
      clump, a: Math.random() * .4 + .5, vy: Math.random() * 70 + 60, p: Math.random() * 6, sway: Math.random() * 14 + 4 };
  };
  // Which surface (if any) the flake hits as it falls from y0 to f.y
  function hit(f, y0) {
    for (const g of groups) {
      const [ox, oy] = off(g), c = Math.floor((f.x + ox) / CELL);
      if (c < 0 || c >= g.cols.length) continue;
      const list = g.cols[c];
      let onScreen = 0; // surfaces in this column that are above the bottom of the screen
      while (onScreen < list.length && list[onScreen].y < oy + H) onScreen++;
      for (let i = 0; i < onScreen; i++) {
        const s = list[i], top = s.y - s.d;
        if (top < y0 + oy || top >= f.y + oy + f.r) continue;
        // Regular snow picks evenly among everything still below it on screen, so it doesn't fall off the bottom unused.
        // The bury's wall is heavy: it mostly sticks to the first thing it hits.
        if (Math.random() < (f.wall ? s.grab * f.stick : s.grab / (onScreen - i))) return { s, g };
      }
    }
    return null;
  }
  // Drop snow on a surface; a clump spreads into a mound over the columns on either side
  function deposit({ s, g }, f) {
    if (!f.clump) { s.d += f.r * (f.wall ? 2.5 : .9); return; }
    const k = Math.max(1, Math.round(f.r * (f.wall ? 2.2 : 1.4) / CELL)), amt = f.r * (f.wall ? 5 : 1.4);
    s.d += amt;
    for (const side of ["l", "r"]) for (let n = s[side], i = 1; n && i <= k; n = n[side], i++) n.d += amt * Math.sqrt(1 - (i / (k + 1)) ** 2); // rounded, like a dropped snowball
    // A little puff where it hits
    const [ox, oy] = off(g);
    for (let i = 0; i < 3 && bits.length < maxBits; i++)
      bits.push({ x: s.x + 1 - ox, y: s.y - s.d - oy, vx: (Math.random() - .5) * 120, vy: -40 - Math.random() * 90, t: now(), life: .35 + Math.random() * .3, r: Math.random() * 1.2 + .6 });
  }

  function size() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    // Use the canvas's own size on screen (on phones the window's reported height changes as the toolbar hides)
    W = canvas.clientWidth || innerWidth; H = canvas.clientHeight || innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  let last = 0;
  function frame(ms) {
    const t = ms / 1000, dt = Math.min(.05, t - last); last = t;
    const L = light(), snow = L ? "#ffffff" : "#f2efe6";
    ctx.clearRect(0, 0, W, H);
    // Snow is dark mode only: switching to light mode melts it all
    if (L) {
      flakes = []; bits = []; dumpUntil = 0; buryAt = -99; hold = null; power = 0; walls = 0;
      groups.forEach(g => g.all.forEach(s => { s.d = 0; }));
      running = false; return;
    }

    // Still holding the snow line: keep turning it up (full blizzard after 3 s)
    if (hold) raise(hold.from + (t - hold.at) / 3);
    else if (power && t >= dumpUntil) { power = 0; walls = 0; } // it's stopped: next time starts fresh

    // The harder it's snowing, the more flakes are in the air
    const target = t < dumpUntil ? Math.round(Math.min(3000, W * (.4 + 2.6 * Math.min(1, power)))) : 0;
    let falling = 0;
    for (const f of flakes) if (!f.wall) falling++;
    for (; falling < target; falling++) flakes.push(flake(spreadNext));
    spreadNext = false;

    // The bury's whiteout: a haze that rides down the screen with the front of the wall, then clears
    const since = t - buryAt;
    if (since < 4) {
      const front = since * WALL_SPEED, a = .3 * (1 - since / 4), rgb = L ? "10,10,10" : "242,239,230";
      const grad = ctx.createLinearGradient(0, 0, 0, front + 40);
      grad.addColorStop(0, `rgba(${rgb},${a * .4})`);
      grad.addColorStop(Math.max(0, front / (front + 40)), `rgba(${rgb},${a * (L ? .5 : 1)})`);
      grad.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, Math.min(H, front + 40));
    }

    ctx.fillStyle = L ? "rgb(10,10,10)" : snow;
    for (let i = flakes.length - 1; i >= 0; i--) {
      const f = flakes[i], y0 = f.y;
      f.p += dt; f.y += f.vy * dt; f.x += Math.cos(f.p) * f.sway * .6 * dt;
      const h = f.y > -20 && hit(f, y0);
      if (h) deposit(h, f);
      if (h || f.y > H + 10) { if (t < dumpUntil && !f.wall) flakes[i] = flake(); else flakes.splice(i, 1); continue; }
      if (f.y < -20) continue;
      ctx.globalAlpha = f.a * (L ? .35 : 1);
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7);
      if (f.clump) ctx.arc(f.x + f.r * .55, f.y - f.r * .35, f.r * .65, 0, 7); // lumpy, not a perfect ball
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Piles
    for (const g of groups) {
      settle(g);
      const [ox, oy] = off(g);
      if (L) { ctx.fillStyle = "rgba(10,10,10,.16)"; for (const s of g.all) if (s.d > .25) { const y = s.y - s.d - oy; if (y > -20 && y < H) ctx.fillRect(s.x - ox, y - 1, CELL, 1); } }
      ctx.fillStyle = snow;
      for (const s of g.all) if (s.d > .25) { const y = s.y - s.d - oy; if (y > -20 && y < H) ctx.fillRect(s.x - ox, y, CELL, s.d + (s.d > 3 ? 3 : .6)); } // deep piles tuck down over the top edge so no gap shows
    }

    // Knocked-off snow and clumps
    ctx.fillStyle = L ? "rgb(10,10,10)" : snow;
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i], age = t - b.t;
      if (age > b.life) { bits.splice(i, 1); continue; }
      b.vy += 700 * dt; b.vx *= 1 - 1.5 * dt; b.x += b.vx * dt; b.y += b.vy * dt;
      ctx.globalAlpha = (1 - age / b.life) * (L ? .45 : .9);
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }

  function setup() {
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.setAttribute("aria-hidden", "true");
      canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:45";
      document.body.appendChild(canvas);
      ctx = canvas.getContext("2d");
      size();
      addEventListener("resize", () => { size(); build(); });
    }
    if (!groups.length) build();
    if (!running) { running = true; last = now(); requestAnimationFrame(frame); }
  }

  // ---------- How hard it's snowing ----------
  // One dial, "power", that every trigger turns up and never down while it's snowing:
  //   .3 a tap · .35 typing "dump" · up to 1 by holding for 3 s (or holding the p key) = full blizzard
  //   1 and every .4 past it: another wall of snow comes down (up to WALLS of them)
  // Once the snow stops, the dial goes back to 0 (the piles stay).
  function raise(p) {
    if (light()) return; // dark mode only
    setup();
    power = Math.max(power, p);
    const pc = Math.min(1, power);
    capMul = Math.max(capMul, 1 + (BURY - 1) * pc); // piles can get deeper the harder it snows
    maxBits = Math.max(maxBits, 600 + 1400 * pc);
    if (capMul > 2) heavy = true;
    if (reduce) { // no falling snow: the piles just appear, deeper the harder you pushed
      groups.forEach(g => g.all.forEach(s => { s.d = Math.max(s.d, Math.min(s.lim, s.cap * capMul * (s.l && s.r ? .9 : .5) * Math.max(.15, pc))); }));
      return;
    }
    if (now() >= dumpUntil) spreadNext = true; // starting fresh: fill the whole screen at once
    dumpUntil = Math.max(dumpUntil, now() + 4 + 8 * pc); // keeps falling 4-12 s after you let go
    while (walls < WALLS && power >= 1 + .4 * walls) wall(walls++ === 0);
  }

  // A wall of snow comes down from the top of the screen and lands in heavy clumps on every ledge, letter and line
  function wall(first) {
    buryAt = now();
    // Densest right at the front edge, thinning out behind it
    const n = Math.min(6000, Math.round(W * H / 120 * (first ? 1 : .6)));
    for (let i = 0; i < n; i++) {
      const clump = Math.random() < .35;
      flakes.push({ wall: true, clump, x: Math.random() * W, y: -8 - Math.random() ** 2 * H * 1.6,
        r: clump ? 3 + Math.random() ** 1.5 * 7 : Math.random() * 2 + 1, stick: clump ? .95 : .7, a: Math.random() * .15 + .85,
        vy: WALL_SPEED + Math.random() * 140, p: Math.random() * 6, sway: Math.random() * 8 });
    }
    // Whumpf: the page takes the hit as the front comes down over the name
    setTimeout(() => { const w = document.querySelector(".wrap"); if (w && w.animate) w.animate(
      [{ transform: "none" }, { transform: `translateY(${first ? 8 : 4}px)` }, { transform: "translateY(-3px)" }, { transform: "translateY(1px)" }, { transform: "none" }],
      { duration: 600, easing: "ease-out" }); }, 600);
  }

  // If the intro (name drawing in, rows fading up) is still playing, skip it to the end first,
  // so the snow lands where things end up, not where they were mid-animation
  const later = fn => {
    const busy = document.getAnimations().filter(a => a.playState !== "finished" && isFinite(a.effect.getComputedTiming().iterations));
    if (!busy.length) return fn();
    busy.forEach(a => { try { a.finish(); } catch (e) {} });
    fn();
  };

  // ---------- The secret spot ----------
  function start() {
    document.querySelectorAll('.bar [data-snow="short"]').forEach(el => {
      el.style.cursor = "default";
      el.style.webkitTapHighlightColor = "transparent";
      el.style.userSelect = el.style.webkitUserSelect = "none";
      el.style.webkitTouchCallout = "none";
      // Snow starts the moment you press, and gets heavier the longer you hold (each tap also adds a little)
      el.addEventListener("pointerdown", () => later(() => { if (light()) return; hold = { at: now(), from: Math.max(.3, power + .1) }; raise(hold.from); }));
      ["pointerup", "pointerleave", "pointercancel"].forEach(ev => el.addEventListener(ev, () => { hold = null; }));
      el.addEventListener("contextmenu", e => e.preventDefault());
    });
    // "dump" = a good snowfall, and every extra p (dumppppp, or just hold the p key) cranks it up.
    // "bury" = straight to a wall of snow, and every extra y brings another.
    let typed = "", more = "";
    addEventListener("keydown", e => {
      if (e.key.length !== 1) return;
      const k = e.key.toLowerCase();
      typed = (typed + k).slice(-4);
      if (typed === "dump") { typed = ""; more = "p"; later(() => raise(.35)); }
      else if (typed === "bury") { typed = ""; more = "y"; later(() => raise(1)); }
      else if (k === more && power) raise(power + (k === "p" ? .08 : .4));
      else more = "";
    });
  }
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", start); else start();
})();
