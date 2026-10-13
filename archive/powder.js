// ============================================================
//  Fresh Powder (DRAFT): computers only. The empty space around the page becomes a snowfield.
//  - Your mouse carves ski tracks; fast turns throw spray.
//  - It really snows: the snowfall rate comes from Brighton's last 24 hours.
//  - Snow piles up on TOM ELLERY, the badge and the rule. Sweep the mouse across it to knock it off.
//  - Tracks slowly fill back in (faster when it's dumping).
//  - Tom always gets first tracks: a line is already carved down the right side when you arrive.
//  Phones, tablets and reduced-motion get nothing (the page stays exactly as it is).
//  Preview other conditions with ?powder=12 (inches), or use the DRAFT buttons bottom right.
// ============================================================
(function () {
  const desktop = matchMedia("(min-width: 1024px) and (hover: hover) and (pointer: fine)");
  if (!desktop.matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const root = document.documentElement;
  root.classList.add("powder");

  const INSTAGRAM = (window.TE && TE.links.find(l => l.id === "instagram")) || { handle: "@tom.a.ellery", url: "https://www.instagram.com/tom.a.ellery" };
  const CELL = 2;          // snow pile resolution in px
  const SKI_GAP = 3.2;     // half the distance between the two skis
  const light = () => root.dataset.theme === "light";

  // ---------- Canvases: tracks behind the page, snow in front ----------
  const canvas = cls => { const c = document.createElement("canvas"); c.className = cls; c.setAttribute("aria-hidden", "true"); document.body.appendChild(c); return c; };
  const back = canvas("powder-back"), front = canvas("powder-front");
  const bx = back.getContext("2d"), fx = front.getContext("2d");
  let W, H, col = { l: 0, r: 0 };
  function size() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    for (const [c, x] of [[back, bx], [front, fx]]) { c.width = W * dpr; c.height = H * dpr; x.setTransform(dpr, 0, 0, dpr, 0, 0); }
    const r = document.querySelector(".wrap").getBoundingClientRect();
    col = { l: r.left + 16, r: r.right - 16 };
  }
  size();

  // ---------- Snowfall: real 24 hr total at Brighton ----------
  const forced = new URLSearchParams(location.search).get("powder");
  let inches = forced !== null ? Math.max(0, +forced || 0) : 0, live = null;
  const fillTime = () => 75 / (1 + inches * .5);                       // seconds until a track is gone
  // The number shown stays the real one, but the page exaggerates it so every inch is easy to see
  const BOOST = 2.6;
  const vis = () => inches * BOOST;
  const flakeTarget = () => Math.round(Math.min(1100, 16 + vis() * 22));
  // Tracks: "full" (long lines + Tom's first tracks), "subtle" (a short faint tail) or "off"
  let trackMode = "subtle";
  const trackLife = ghost => trackMode === "full" ? fillTime() * (ghost ? 2.5 : 1) : Math.min(fillTime(), 3.5);
  function setInches(v) { inches = v; hudSnow(); }
  fetch("https://api.open-meteo.com/v1/forecast?latitude=40.598&longitude=-111.583&elevation=2669&current=snowfall"
    + "&hourly=snowfall&past_days=1&forecast_days=1&precipitation_unit=inch&timezone=auto")
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(d => {
      const hour = d.current.time.slice(0, 13);
      let end = d.hourly.time.findIndex(t => t.slice(0, 13) === hour);
      if (end === -1) end = d.hourly.time.length - 1;
      const sum = d.hourly.snowfall.slice(Math.max(0, end - 23), end + 1).reduce((a, b) => a + (b || 0), 0);
      live = Math.round(sum * 10) / 10;
      if (forced === null) setInches(live);
      dust();
    })
    .catch(() => { live = 0; hudSnow(); dust(); });

  // ---------- HUD (bottom left): conditions + your run ----------
  const hud = document.createElement("aside");
  hud.className = "powder-hud";
  hud.innerHTML = `
    <small data-p="snow">BRIGHTON · …</small>
    <small data-p="fill"></small>
    <div class="run"><b data-p="ft">DROP IN</b><span data-p="turns">MOVE YOUR MOUSE</span></div>
    <a data-p="cta" href="${INSTAGRAM.url}" target="_blank" rel="noopener" hidden>NICE LINE. RIDE WITH ME <em>${INSTAGRAM.handle} ↗</em></a>`;
  document.body.appendChild(hud);
  const $ = k => hud.querySelector(`[data-p="${k}"]`);
  const fmtIn = v => (v > 0 && v < 1 ? v.toFixed(1) : Math.round(v)) + "″";
  function hudSnow() {
    $("snow").textContent = inches > 0 ? `BRIGHTON · ${fmtIn(inches)} LAST 24 HR` : "BRIGHTON · NO NEW SNOW · BLUEBIRD";
    $("fill").textContent = trackMode === "full" ? `TRACKS FILL IN ~${Math.round(fillTime())}s` : "";
  }
  hudSnow();

  // ---------- Tracks ----------
  const segs = [];          // carved pieces, in page coordinates
  const labels = [];        // text written in the snow
  const bits = [];          // spray and knocked-off snow, in page coordinates
  const run = { dist: 0, turns: 0 };
  const rider = () => ({ last: null, n: null, a: 0, dxAcc: 0, dir: 0 });
  const you = rider(), tom = rider();

  function carve(r, x, y, now, ghost) {
    if (!r.last) { r.last = { x, y, t: now }; return; }
    const dx = x - r.last.x, dy = y - r.last.y, dist = Math.hypot(dx, dy);
    if (dist < 3) return;
    const n = { x: -dy / dist, y: dx / dist };
    const prevN = r.n || n;
    // Average the normal with the last one so the two ski lines stay joined through turns
    const avg = { x: (n.x + prevN.x) / 2, y: (n.y + prevN.y) / 2 }, al = Math.hypot(avg.x, avg.y) || 1;
    if (trackMode !== "off") segs.push({ ax: r.last.x, ay: r.last.y, bx: x, by: y, an: prevN, bn: { x: avg.x / al, y: avg.y / al }, t: now, life: trackLife(ghost) });
    if (segs.length > 7000) segs.splice(0, segs.length - 7000);

    // Spray on hard, fast turns (thrown to the outside of the turn)
    const a = Math.atan2(dy, dx);
    let da = a - r.a; da = Math.atan2(Math.sin(da), Math.cos(da));
    const speed = dist / Math.max(.008, (now - r.last.t) / 1000);
    if (r.n && speed > 500 && Math.abs(da) > .07) {
      const side = -Math.sign(da), k = Math.min(10, Math.round(speed / 260));
      for (let i = 0; i < k; i++) {
        const v = 60 + Math.random() * 180;
        bits.push({ x: x + n.x * side * SKI_GAP, y: y + n.y * side * SKI_GAP,
          vx: n.x * side * v + dx / dist * speed * .08, vy: n.y * side * v + dy / dist * speed * .08 - 80 * Math.random(),
          t: now, life: .45 + Math.random() * .5, r: Math.random() * 1.6 + .6 });
      }
    }

    // Your run: distance and turns (a turn = the side-to-side direction flipping)
    if (!ghost) {
      run.dist += dist;
      r.dxAcc += dx;
      if (Math.abs(r.dxAcc) > 28) {
        const d = Math.sign(r.dxAcc);
        if (r.dir && d !== r.dir) run.turns++;
        r.dir = d; r.dxAcc = 0;
      }
      knock(x, y, dx, dy);
    }
    r.a = a; r.n = n; r.last = { x, y, t: now };
  }

  addEventListener("pointermove", e => {
    if (e.pointerType !== "mouse" || document.body.classList.contains("menu-open")) return;
    carve(you, e.pageX, e.pageY, performance.now() / 1000, false);
  }, { passive: true });
  document.addEventListener("mouseleave", () => { you.last = null; you.n = null; });
  addEventListener("scroll", () => { you.last = null; you.n = null; }, { passive: true });

  // Tom's line: first tracks down the right side, carved right after the name finishes drawing
  function firstTracks() {
    const gutter = W - col.r;
    if (gutter < 160) return;
    const x0 = col.r + gutter * .5, amp = Math.min(110, gutter * .22);
    const top = scrollY + 150, bottom = scrollY + H - 50, dur = 3.4, start = performance.now() / 1000;
    let done = 0;
    tom.last = tom.n = null;
    labels.push({ text: "FIRST TRACKS · T.E.", x: x0 - amp, y: top - 26, t: start, life: fillTime() * 2.5 });
    (function step() {
      const now = performance.now() / 1000, p = Math.min(1, (now - start) / dur);
      // Walk the path in small steps so the S-turns stay smooth even if frames are slow
      const ease = q => q * (2 - q) * .35 + q * .65; // a little faster at the top
      const at = q => ({ x: x0 + Math.sin(ease(q) * Math.PI * 6) * amp * (.6 + .4 * ease(q)), y: top + (bottom - top) * ease(q) });
      for (let q = done + .004; q < p; q += .004) { const pt = at(q); carve(tom, pt.x, pt.y, now, true); }
      done = p;
      const pt = at(p); carve(tom, pt.x, pt.y, now, true);
      tom.head = p < 1 ? { x: tom.last.x, y: tom.last.y } : null;
      if (p < 1) requestAnimationFrame(step);
    })();
  }

  // ---------- Snow piling up on the name, badge and rule ----------
  let cols = [], surfaces = [];
  async function buildSurfaces() {
    try { await document.fonts.load('400 100px "Anton"'); } catch (e) {}
    const docW = document.documentElement.scrollWidth;
    const pick = s => document.querySelector(s);
    const ul = pick("#links"), maxY = Math.ceil((ul ? ul.getBoundingClientRect().top : 900) + scrollY + 4);
    const m = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    m.canvas.width = docW; m.canvas.height = maxY;
    m.fillStyle = m.strokeStyle = "#00f"; // blue = solid shapes, red = the thin ELLERY outline

    const text = (el, stroke) => {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el), fs = parseFloat(cs.fontSize);
      m.font = `400 ${fs}px Anton`;
      m.letterSpacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
      const t = el.textContent.toUpperCase(), tm = m.measureText(t);
      const asc = tm.fontBoundingBoxAscent, desc = tm.fontBoundingBoxDescent, lh = parseFloat(cs.lineHeight) || fs;
      const base = r.top + scrollY + (lh - asc - desc) / 2 + asc;
      if (stroke) { m.lineWidth = 1.5; m.strokeText(t, r.left + scrollX, base); } else m.fillText(t, r.left + scrollX, base);
    };
    const box = (el, h) => { if (!el) return; const r = el.getBoundingClientRect(); m.fillRect(r.left + scrollX, r.top + scrollY, r.width, h || r.height); };
    text(pick("h1 .tom"), false);
    m.strokeStyle = "#f00"; text(pick("h1 .ellery"), true); m.strokeStyle = "#00f";
    box(pick(".badge")); box(pick(".rule")); box(pick(".menu-btn"), 1); box(ul, 1);

    // A surface is any spot where something solid has open air right above it
    const a = m.getImageData(0, 0, docW, maxY).data;
    cols = []; surfaces = [];
    for (let c = 0; c * CELL < docW; c++) {
      const x = c * CELL + 1, list = [];
      let prev = false;
      for (let y = 0; y < maxY; y++) {
        const solid = a[(y * docW + x) * 4 + 3] > 90;
        if (solid && !prev) { const thin = a[(y * docW + x) * 4] > 128; // thin outline strokes can only hold a little
          const s = { c, x: c * CELL, y, d: 0, cap: thin ? 3.5 : 16, l: null, r: null }; list.push(s); surfaces.push(s); }
        prev = solid;
      }
      cols.push(list);
    }
    // Link each surface to its neighbor on either side (so snow can slide downhill)
    for (let c = 0; c < cols.length - 1; c++) {
      for (const s of cols[c]) {
        let best = null;
        for (const t of cols[c + 1]) if (Math.abs(t.y - s.y) <= 3 && (!best || Math.abs(t.y - s.y) < Math.abs(best.y - s.y))) best = t;
        if (best && !best.l) { s.r = best; best.l = s; }
      }
    }
    dust();
  }
  // When it has snowed, the name is already wearing some when you show up
  let dusted = false;
  function dust() {
    if (dusted || !surfaces.length || live === null) return;
    dusted = true;
    const depth = inches > 0 ? Math.min(12, 2 + vis() * .35) : 0;
    if (depth) surfaces.forEach(s => { s.d = Math.min(s.cap, (s.l && s.r) ? depth * (.7 + Math.random() * .3) : depth * .3); });
    for (let i = 0; i < 30; i++) settle();
  }

  function settle() {
    for (const s of surfaces) {
      if (s.d <= 0) continue;
      for (const n of [s.l, s.r]) {
        if (!n) continue;
        const top = s.y - s.d, nTop = n.y - n.d;
        if (top < nTop - 1.7) { const move = Math.min(s.d, (nTop - top - 1.7) / 2); s.d -= move; n.d += move; }
      }
      // Edges can't hold much: the extra falls off as a little clump
      if ((!s.l || !s.r) && s.d > 1.4) {
        const extra = s.d - 1.4; s.d = 1.4;
        if (extra > .35) bits.push({ x: s.x + CELL / 2 + (s.l ? 2 : -2), y: s.y - 1, vx: (s.l ? 1 : -1) * 20, vy: 0, t: performance.now() / 1000, life: 1.2, r: 1 + Math.min(1.4, extra * .3), fall: true });
      }
      if (s.d > s.cap) s.d = s.cap;
    }
  }

  // Sweeping the mouse through a pile blasts it off
  function knock(x, y, dx, dy) {
    if (!cols.length) return;
    const now = performance.now() / 1000, c0 = Math.floor((x - 14) / CELL), c1 = Math.floor((x + 14) / CELL);
    for (let c = Math.max(0, c0); c <= Math.min(cols.length - 1, c1); c++) {
      for (const s of cols[c]) {
        if (s.d < .3 || y < s.y - s.d - 12 || y > s.y + 8) continue;
        const k = Math.min(4, Math.ceil(s.d / 2));
        for (let i = 0; i < k; i++) bits.push({ x: s.x + 1, y: s.y - Math.random() * s.d, vx: dx * 6 + (Math.random() - .5) * 90, vy: dy * 6 - 60 - Math.random() * 120, t: now, life: .9 + Math.random() * .6, r: Math.random() * 1.4 + .7, fall: true });
        s.d = 0;
      }
    }
  }

  // ---------- Falling flakes (viewport coordinates) ----------
  const flakes = [];
  const flake = top => ({ x: Math.random() * W, y: top ? -8 - Math.random() * 40 : Math.random() * H, r: Math.random() * 1.8 + .6,
    a: Math.random() * .45 + .35, vy: Math.random() * 30 + 22 + Math.min(40, vis() * .8), p: Math.random() * 6, sway: Math.random() * 14 + 4 });

  function land(f, y0) {
    const c = Math.floor((f.x + scrollX) / CELL);
    if (c < 0 || c >= cols.length) return false;
    const from = y0 + scrollY, to = f.y + scrollY;
    for (const s of cols[c]) {
      const top = s.y - s.d;
      if (top >= from && top < to + f.r) { s.d += f.r * .45; return true; }
    }
    return false;
  }

  // ---------- Loop ----------
  let last = performance.now();
  function frame(nowMs) {
    const dt = Math.min(.05, (nowMs - last) / 1000), now = nowMs / 1000; last = nowMs;
    const L = light(), sx = scrollX, sy = scrollY;
    const ink = L ? "10,10,10" : "242,239,230", snow = L ? "#ffffff" : "#f2efe6";

    // Tracks (behind the page), faded in buckets by age
    bx.clearRect(0, 0, W, H);
    while (segs.length && now - segs[0].t > segs[0].life) segs.shift();
    const B = 8, buckets = Array.from({ length: B }, () => []);
    for (const g of segs) {
      const left = 1 - (now - g.t) / g.life;
      if (left > 0) buckets[Math.min(B - 1, Math.floor(left * B))].push(g);
    }
    bx.lineCap = "round";
    const fade = trackMode === "full" ? 1 : .5;
    buckets.forEach((list, i) => {
      if (!list.length) return;
      const k = (i + 1) / B;
      bx.beginPath();
      for (const g of list) { bx.moveTo(g.ax - sx, g.ay - sy); bx.lineTo(g.bx - sx, g.by - sy); }
      bx.lineWidth = SKI_GAP * 2 + 3; bx.strokeStyle = `rgba(${ink},${(L ? .035 : .04) * k * fade})`; bx.stroke();
      bx.beginPath();
      for (const g of list) for (const side of [1, -1]) {
        bx.moveTo(g.ax + g.an.x * SKI_GAP * side - sx, g.ay + g.an.y * SKI_GAP * side - sy);
        bx.lineTo(g.bx + g.bn.x * SKI_GAP * side - sx, g.by + g.bn.y * SKI_GAP * side - sy);
      }
      bx.lineWidth = 1.2; bx.strokeStyle = `rgba(${ink},${(L ? .2 : .24) * k * fade})`; bx.stroke();
    });
    bx.font = "700 10px 'JetBrains Mono', monospace"; bx.letterSpacing = "2.5px";
    for (let i = labels.length - 1; i >= 0; i--) {
      const lb = labels[i], left = 1 - (now - lb.t) / lb.life;
      if (left <= 0) { labels.splice(i, 1); continue; }
      bx.fillStyle = `rgba(${ink},${.5 * Math.min(1, left * 2)})`; bx.fillText(lb.text, lb.x - sx, lb.y - sy);
    }
    // Keep the tracks quiet behind the text column
    bx.globalCompositeOperation = "destination-out";
    const g = bx.createLinearGradient(col.l - 40, 0, col.r + 40, 0);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(.06, "rgba(0,0,0,.72)"); g.addColorStop(.94, "rgba(0,0,0,.72)"); g.addColorStop(1, "rgba(0,0,0,0)");
    bx.fillStyle = g; bx.fillRect(col.l - 40, 0, col.r - col.l + 80, H);
    bx.globalCompositeOperation = "source-over";

    // Snow (in front of the page)
    fx.clearRect(0, 0, W, H);
    settle();
    // Piles
    if (L) { // a soft outline so white snow still reads on paper
      fx.fillStyle = "rgba(10,10,10,.16)";
      for (const s of surfaces) if (s.d > .25) { const y = s.y - s.d - sy; if (y > -20 && y < H) fx.fillRect(s.x - sx, y - 1, CELL, 1); }
    }
    fx.fillStyle = snow;
    for (const s of surfaces) if (s.d > .25) { const y = s.y - s.d - sy; if (y > -20 && y < H) fx.fillRect(s.x - sx, y, CELL, s.d + .6); }

    // Flakes
    const target = flakeTarget();
    while (flakes.length < target) flakes.push(flake(flakes.length > 0));
    if (flakes.length > target) flakes.length = target;
    const wind = Math.sin(now * .13) * 12 + Math.sin(now * .41) * 5;
    fx.fillStyle = L ? "rgb(10,10,10)" : snow;
    for (let i = 0; i < flakes.length; i++) {
      const f = flakes[i], y0 = f.y;
      f.p += dt; f.y += f.vy * dt; f.x += (Math.cos(f.p) * f.sway * .6 + wind) * dt;
      if (cols.length && land(f, y0)) { flakes[i] = flake(true); continue; }
      if (f.y > H + 10 || f.x < -20 || f.x > W + 20) { flakes[i] = flake(true); continue; }
      fx.globalAlpha = f.a * (L ? .35 : 1);
      fx.beginPath(); fx.arc(f.x + Math.sin(f.p) * f.sway * .3, f.y, f.r, 0, 7); fx.fill();
    }
    // Spray and clumps
    fx.fillStyle = L ? "rgb(10,10,10)" : snow;
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i], age = now - b.t;
      if (age > b.life) { bits.splice(i, 1); continue; }
      b.vy += (b.fall ? 700 : 520) * dt; b.vx *= 1 - 1.5 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      fx.globalAlpha = (1 - age / b.life) * (L ? .45 : .9);
      fx.beginPath(); fx.arc(b.x - sx, b.y - sy, b.r, 0, 7); fx.fill();
    }
    fx.globalAlpha = 1;
    // Tom's "skier" dot while the first line is being carved
    if (tom.head) {
      fx.fillStyle = "#ff5a1f";
      fx.beginPath(); fx.arc(tom.head.x - sx, tom.head.y - sy, 3.5, 0, 7); fx.fill();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // HUD run stats
  let ctaShown = false;
  setInterval(() => {
    if (run.dist < 30) return;
    $("ft").textContent = Math.round(run.dist * .6).toLocaleString() + " FT";
    $("turns").textContent = `${run.turns} TURN${run.turns === 1 ? "" : "S"} · YOUR RUN`;
    if (!ctaShown && run.turns >= 16) { ctaShown = true; $("cta").hidden = false; }
  }, 200);

  // Build once the name has finished drawing in, then let Tom drop in first
  setTimeout(() => { buildSurfaces(); if (trackMode === "full") firstTracks(); }, 2300);
  let rz;
  addEventListener("resize", () => {
    size();
    clearTimeout(rz); rz = setTimeout(() => { dusted = false; buildSurfaces(); }, 250);
  });
  desktop.addEventListener("change", () => location.reload());

  // ---------- DRAFT ONLY: preview other conditions ----------
  const ctl = document.createElement("div");
  ctl.className = "powder-draft";
  ctl.innerHTML = `<span>DRAFT · SNOW</span>${[["LIVE", null], ["0″", 0], ["3″", 3], ["12″", 12], ["24″", 24]].map(([t, v]) =>
    `<button type="button" data-v="${v}">${t}</button>`).join("")}`;
  document.body.appendChild(ctl);
  ctl.innerHTML += `<span class="gap">TRACKS</span>${["subtle", "full", "off"].map(m => `<button type="button" data-t="${m}">${m.toUpperCase()}</button>`).join("")}`;
  const mark = () => ctl.querySelectorAll("[data-t]").forEach(b => b.setAttribute("aria-pressed", b.dataset.t === trackMode));
  mark();
  ctl.querySelectorAll("[data-t]").forEach(b => b.addEventListener("click", () => {
    trackMode = b.dataset.t; mark(); hudSnow();
    if (trackMode === "off") segs.length = labels.length = 0;
    if (trackMode === "full") firstTracks();
  }));
  ctl.querySelectorAll("[data-v]").forEach(b => b.addEventListener("click", () => {
    setInches(b.dataset.v === "null" ? (live || 0) : +b.dataset.v);
    dusted = false; surfaces.forEach(s => s.d = 0); dust();
  }));
})();
