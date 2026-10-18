// Neon Arcade easter egg (menu): hover on the sign for a minute (--burnout in the CSS) and a random letter sputters out.
// A random member of the 8-bit repair crew shows up from a random side: walking in from the left or right, rappelling
// down a rope from above, or climbing out of a manhole in the line below. He bangs the letter with his wrench until it
// lights back up, hops, and leaves a different way than he came. Keep hovering and another letter goes a minute later.
// Moving off the sign resets everything. Skipped for visitors who turn animations off.
// All 20 crew members are laid out side by side in drafts/repairmen.html (kept offline).
(() => {
  const item = document.querySelector(".neon-item");
  if (!item || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // ===== The crew =====
  // Every sprite is 10 x 13 pixels, facing right. Rows 10-12 are legs (swapped for walking).
  // Arms: A at columns 0 and 7 on rows 7-8; the hammer frames move the right arm and add the wrench (Z).
  // Shared keys: E eye, A arm, L legs, X boots (K unless legsK says otherwise). Everything else is per character.
  const FACE = ["..SSSS....", "..SSES....", "..SSSS...."];
  const LEGS = {
    stand: ["..LL.LL...", "..LL.LL...", ".XXX.XXX.."],
    walk1: ["..LL.LL...", ".LL...LL..", ".XX...XX.."],
    walk2: ["...LLL....", "...LLL....", "...XXX...."],
  };
  const SKIN = "#f1c27d", SKIN2 = "#c68642", EYE = "#0a0a0a", WRENCH = "#c3cad4";

  const CREW = [
    { name: "The Classic",
      c: { Y: "#ffd23f", S: SKIN, O: "#ff5a1f", B: "#2f6fdf", L: "#2f6fdf", K: "#4a3220", A: SKIN },
      rows: ["..YYYY....", ".YYYYYY...", "YYYYYYYY..", ...FACE, ".OOOOOO...", "AOBBBBOA..", "A.BBBB.A..", "..BBBB...."] },
    { name: "Hi-Vis",
      c: { W: "#f4f4f4", S: SKIN, V: "#c6ff2e", R: "#d9d9d9", D: "#3a3a3a", N: "#1d2b4f", L: "#1d2b4f", K: "#111", A: "#3a3a3a" },
      rows: ["..WWWW....", ".WWWWWW...", "WWWWWWWW..", ...FACE, ".VVDDVV...", "AVRRRRVA..", "A.VDDV.A..", "..NNNN...."] },
    { name: "Shredder",
      c: { O: "#ff5a1f", S: SKIN, K: "#111", C: "#29f0ff", T: "#14a39a", P: "#222", L: "#222", A: "#14a39a" },
      rows: ["...OO.....", "..OOOO....", ".OOOOOO...", "..SSSS....", ".KCCCC....", "..SSSS....", ".TTTTTT...", "ATTTTTTA..", "A.TTTT.A..", "..PPPP...."] },
    { name: "Sparky",
      c: { W: "#f4f4f4", S: SKIN2, B: "#3d7bd9", Y: "#ffd23f", J: "#33507a", L: "#33507a", K: "#3a2a1a", A: "#3d7bd9" },
      rows: ["..WWWW....", ".WWWWWW...", "WWWWWWWW..", ...FACE, ".BBBBBB...", "ABBBBBBA..", "A.YYYY.A..", "..JJJJ...."] },
    { name: "Bolt-Bot",
      c: { R: "#ff3b3b", M: "#9aa3ad", C: "#29f0ff", D: "#4b5560", L: "#9aa3ad", K: "#4b5560", A: "#9aa3ad" },
      rows: ["....R.....", "....M.....", "..MMMM....", "..MCCM....", "..MMMM....", "...MM.....", ".MMMMMM...", "AMMRMMMA..", "A.MDDM.A..", "..MMMM...."] },
    { name: "Night Ninja",
      c: { D: "#34344a", R: "#ff3b3b", S: SKIN, L: "#34344a", K: "#34344a", A: "#34344a" },
      rows: ["..DDDD....", ".DDDDDD...", "RRRRRRR...", "..DDDD....", "..SSES....", "..DDDD....", ".DDDDDD...", "ADDDDDDA..", "A.RRRR.A..", "..DDDD...."] },
    { name: "Gramps",
      c: { C: "#7a5634", S: SKIN, G: "#222", W: "#eeeeee", F: "#3f7d4a", P: "#6b6457", L: "#6b6457", K: "#2a2a2a", A: "#3f7d4a" },
      rows: ["..........", "..CCCC....", ".CCCCCCC..", "..SSSS....", "..SGEG....", "..WWWW....", ".FFFFFF...", "AFFFFFFA..", "A.FFFF.A..", "..PPPP...."] },
    { name: "The Welder",
      c: { D: "#3a3d42", V: "#3dff7a", R: "#8a5a32", B: "#1d2b4f", L: "#1d2b4f", K: "#111", A: "#8a5a32" },
      rows: ["..DDDD....", ".DDDDDD...", ".DDDDDD...", "..DDVV....", "..DDVV....", "..DDDD....", ".RRRRRR...", "ARRRRRRA..", "A.RRRR.A..", "..BBBB...."] },
    { name: "Ski Patrol",
      c: { K: "#3a3a3a", S: SKIN, R: "#e02424", W: "#ffffff", L: "#3a3a3a", A: "#e02424" },
      rows: ["..KKKK....", ".KKKKKK...", ".KKKKKK...", ...FACE, ".RRWRRR...", "ARWWWRRA..", "A.RWRR.A..", "..KKKK...."], legsK: "#777" },
    { name: "Zorp",
      c: { G: "#6dff6d", K: "#0a0a0a", P: "#8b3dff", L: "#8b3dff", A: "#6dff6d" },
      rows: ["..G..G....", "..GGGG....", ".GGGGGG...", ".GGKKGK...", ".GGGGGG...", "..GGGG....", ".PPPPPP...", "APPPPPPA..", "A.PPPP.A..", "..PPPP...."], legsK: "#6dff6d" },
    { name: "Bones",
      c: { W: "#ecebe4", K: "#0a0a0a", A: "#ecebe4", L: "#ecebe4" },
      rows: ["..........", "..WWWW....", ".WWWWWW...", ".WWKWK....", ".WWWWWW...", "..WKWK....", "...WW.....", "AWWWWWWA..", "A.W.WW.A..", "..WWWW...."],
      legs: { stand: ["..W..W....", "..W..W....", ".WW.WW...."], walk1: ["..W..W....", ".W....W...", "WW....WW.."], walk2: ["...WW.....", "...WW.....", "..WWW....."] } },
    { name: "Holly the Elf",
      c: { W: "#ffffff", G: "#1fae4b", S: SKIN, R: "#e02424", D: "#151515", Y: "#ffd23f", L: "#1fae4b", K: "#e02424", A: "#e02424" },
      rows: ["......WW..", "...GGGG...", "..GGGG....", "..SSSS....", ".SSSES....", "..SSSS....", ".RRRRRR...", "ARRRRRRA..", "A.DYYD.A..", "..GGGG...."] },
    { name: "Foreman Cat",
      c: { Y: "#ffd23f", F: "#f08a24", E: EYE, W: "#fff3e0", L: "#f08a24", K: "#fff3e0", A: "#f08a24" },
      rows: [".FYYYYF...", ".YYYYYY...", "YYYYYYYY..", ".FFFFFF...", "..FFEFE...", "..FWWWF...", ".FFFFFF...", "AFFWWFFA..", "A.FWWF.A..", "F.FFFF...."] },
    { name: "Space Tech",
      c: { W: "#eef1f5", Y: "#ffc93c", R: "#e02424", B: "#3d7bd9", L: "#eef1f5", K: "#8b939c", A: "#eef1f5" },
      rows: ["..WWWW....", ".WWWWWW...", ".WWYYYY...", ".WWYYYY...", ".WWWWWW...", "..WWWW....", ".WWWWWW...", "AWWRBWWA..", "A.WWWW.A..", "..WWWW...."] },
    { name: "Pinky",
      c: { P: "#ff8ad8", W: "#ffffff", B: "#2340ff", A: "#ff8ad8", L: "#ff8ad8", K: "#ff8ad8" },
      rows: ["..........", "..PPP.....", ".PPPPP....", "PPPPPPP...", "PPPWWPW...", "PPPWBPB...", "PPPPPPP...", "APPPPPPA..", "PPPPPPP...", "PPPPPPP..."],
      legs: { stand: ["PPPPPPP...", "PPPPPPP...", "P.PP.PP..."], walk1: ["PPPPPPP...", "PPPPPPP...", ".PP.PP.P.."], walk2: ["PPPPPPP...", "PPPPPPP...", "P.PP.PP..."] } },
    { name: "Punk",
      c: { P: "#ff2e88", S: SKIN, K: "#3a3a3a", W: "#c3cad4", B: "#33507a", L: "#33507a", A: "#3a3a3a" },
      rows: ["...PP.....", "...PP.....", "..SPPS....", ...FACE, ".KKKKKK...", "AKWKKWKA..", "A.KKKK.A..", "..BBBB...."] },
    { name: "Night Shift",
      c: { Y: "#ffd23f", W: "#ffffff", Q: "#fff7b0", S: SKIN2, N: "#1d2b4f", R: "#c9ced6", L: "#1d2b4f", K: "#111", A: "#1d2b4f" },
      rows: ["..YYYY....", ".YYYYYWQQ.", "YYYYYYYY..", ...FACE, ".NNNNNN...", "ANRRRRNA..", "A.NNNN.A..", "..NNNN...."] },
    { name: "Frosty",
      c: { K: "#151515", W: "#f6f8ff", O: "#ff8a1f", R: "#e02424", A: "#7a5634", L: "#f6f8ff" },
      rows: ["..KKKK....", "..KKKK....", ".KKKKKK...", "..WWWW....", "..WWKWOO..", "..WWWW....", ".RRRRRR...", "AWWWWWWA..", "A.WWKW.A..", ".WWWWWW..."],
      legs: { stand: ["WWWWWWWW..", "WWWWKWWW..", ".WWWWWW..."], walk1: ["WWWWWWWW..", "WWWWKWWW..", ".WWWWWW..."], walk2: [".WWWWWWW..", "WWWWKWWW..", "..WWWWW..."] } },
    { name: "The Boss",
      c: { G: "#ffcf3f", S: SKIN, K: "#0a0a0a", D: "#2c2f36", W: "#ffffff", R: "#e02424", L: "#2c2f36", A: "#2c2f36" },
      rows: ["..GGGG....", ".GGGGGG...", "GGGGGGGG..", "..SSSS....", "..SKKK....", "..SSSS....", ".DDWWDD...", "ADDDRDDA..", "A.DDRD.A..", "..DDDD...."] },
    { name: "Off-Duty",
      c: { O: "#ff5a1f", S: SKIN, K: "#3a3a3a", W: "#f2efe6", J: "#33507a", L: "#33507a", A: "#3a3a3a" },
      rows: ["..OOOO....", ".OOOOOO...", ".OOOOOO...", ...FACE, ".KKKKKK...", "AKKWWKKA..", "A.KWWK.A..", "..JJJJ...."], legsK: "#f2efe6" },
  ];

  const set = (rows, list) => {
    const g = rows.map(r => r.split(""));
    list.forEach(([x, y, v]) => { g[y][x] = v; });
    return g.map(r => r.join(""));
  };
  const svg = (rows, colors) => '<svg viewBox="0 0 10 13" shape-rendering="crispEdges" aria-hidden="true">'
    + rows.map((row, y) => [...row].map((c, x) => colors[c] ? `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${colors[c]}"/>` : "").join("")).join("")
    + "</svg>";

  // All five frames for one crew member, as ready-to-use SVG
  function sprites(m) {
    const legs = m.legs || LEGS;
    const stand = m.rows.concat(legs.stand);
    const rows = {
      walk1: m.rows.concat(legs.walk1),
      walk2: m.rows.concat(legs.walk2),
      stand,
      up: set(stand, [[7, 7, "."], [7, 8, "."], [7, 6, "A"], [7, 5, "A"], [8, 4, "Z"], [8, 3, "Z"], [8, 2, "Z"], [9, 2, "Z"]]),
      down: set(stand, [[7, 8, "."], [7, 7, "A"], [8, 7, "A"], [9, 7, "Z"], [9, 6, "Z"], [9, 8, "Z"]]),
    };
    const colors = { E: EYE, ...m.c, Z: WRENCH, X: m.legsK || m.c.K };
    return Object.fromEntries(Object.entries(rows).map(([name, r]) => [name, svg(r, colors)]));
  }

  // ===== The show =====
  const WIDTH = 22, HEIGHT = 29, GROUND = 2, SPEED = 90;   // px; walking speed in px per second
  const SIDES = ["left", "right", "top", "bottom"];
  let timers = [], frames = 0, stage = null, dude = null, letter = null, art = null;
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  const wait = () => (parseFloat(getComputedStyle(item).getPropertyValue("--burnout")) || 60) * 1000;
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const px = n => Math.round(n) + "px";

  function add(cls, parent) {
    const el = document.createElement("span");
    el.className = cls;
    parent.appendChild(el);
    return el;
  }

  // Cycle through sprite frames; onFrame gets each frame's name as it shows
  function play(names, ms, onFrame) {
    clearInterval(frames);
    let i = 0;
    const show = () => { const n = names[i++ % names.length]; dude.innerHTML = art[n]; onFrame && onFrame(n); };
    show();
    if (names.length > 1) frames = setInterval(show, ms);
  }

  // Put something somewhere instantly, or slide it there over ms
  function place(el, props) {
    el.style.transition = "none";
    for (const k in props) el.style[k] = px(props[k]);
    el.offsetWidth;   // make the browser take the new spot now, so the next move slides from here
  }
  function move(el, props, ms, done) {
    el.style.transition = Object.keys(props).map(k => `${k} ${ms}ms linear`).join(", ");
    requestAnimationFrame(() => requestAnimationFrame(() => { for (const k in props) el.style[k] = px(props[k]); }));
    if (done) later(ms + 30, done);
  }
  const face = left => dude.classList.toggle("face-left", left);

  function walk(to, done) {
    const from = parseFloat(dude.style.left);
    face(to < from);
    play(["walk1", "walk2"], 150);
    move(dude, { left: to }, Math.abs(to - from) / SPEED * 1000, done);
  }

  // Rope from the line above, down to just over his head height off the ground
  function lowerRope(spot, done) {
    const rope = add("na-rope", stage);
    place(rope, { left: spot + WIDTH / 2 - 1, height: 0 });
    move(rope, { height: stage.clientHeight - GROUND - 8 }, 400, () => done(rope));
  }
  function raiseRope(rope) {
    move(rope, { height: 0 }, 400, () => rope.remove());
  }

  // Manhole in the line below: the cover slides aside, then back
  function openManhole(spot, done) {
    const hole = add("na-hole", item), cover = add("na-cover", item);
    place(hole, { left: spot - 1 });
    place(cover, { left: spot - 1 });
    move(cover, { left: spot + WIDTH + 3 }, 300, () => done({ hole, cover }));
  }
  function closeManhole(spot, m, done) {
    move(m.cover, { left: spot - 1 }, 300, () => { m.hole.remove(); m.cover.remove(); done && done(); });
  }

  // Each way in ends with him standing on the line just right of the dead letter, facing it
  const ENTER = {
    left: (spot, next) => { place(dude, { left: -WIDTH - 2, bottom: GROUND }); walk(spot, () => { face(true); next(); }); },
    right: (spot, next) => { place(dude, { left: stage.clientWidth + 2, bottom: GROUND }); walk(spot, () => { face(true); next(); }); },
    top: (spot, next) => lowerRope(spot, rope => {
      place(dude, { left: spot, bottom: stage.clientHeight + 2 });
      face(true);
      play(["up", "stand"], 160);
      move(dude, { bottom: GROUND }, 1100, () => { play(["stand"]); raiseRope(rope); next(); });
    }),
    bottom: (spot, next) => openManhole(spot, m => {
      place(dude, { left: spot, bottom: -HEIGHT - 2 });
      face(true);
      play(["up", "stand"], 160);
      move(dude, { bottom: GROUND }, 800, () => { play(["stand"]); closeManhole(spot, m); next(); });
    }),
  };
  const EXIT = {
    left: (spot, done) => walk(-WIDTH - 2, done),
    right: (spot, done) => walk(stage.clientWidth + 2, done),
    top: (spot, done) => lowerRope(spot, rope => {
      play(["up", "stand"], 160);
      move(dude, { bottom: stage.clientHeight + 2 }, 1100, () => { raiseRope(rope); later(450, done); });
    }),
    bottom: (spot, done) => openManhole(spot, m => {
      play(["up", "stand"], 160);
      move(dude, { bottom: -HEIGHT - 2 }, 700, () => closeManhole(spot, m, done));
    }),
  };

  function reset() {
    timers.forEach(clearTimeout);
    timers = [];
    clearInterval(frames);
    item.querySelectorAll(".na-stage, .na-hole, .na-cover, .na-spark").forEach(el => el.remove());
    item.querySelectorAll(".na-dying, .na-fixing").forEach(el => el.classList.remove("na-dying", "na-fixing"));
    stage = dude = letter = null;
  }

  function start() {
    reset();
    later(wait(), burnOut);
  }

  function burnOut() {
    const letters = item.querySelectorAll(".na-p");
    letter = pick(letters);
    letter.classList.add("na-dying");
    later(4800, callRepairman);
  }

  function callRepairman() {
    art = sprites(pick(CREW));
    // The stage clips him to the sign's row, so he appears out of the lines and the sides
    stage = add("na-stage", item);
    dude = add("na-dude", stage);
    place(dude, { left: -WIDTH - 2, bottom: GROUND });   // off-stage until his entrance puts him somewhere
    const box = item.getBoundingClientRect(), l = letter.getBoundingClientRect();
    const spot = l.right - box.left - 2;
    const from = pick(SIDES), to = pick(SIDES.filter(s => s !== from));
    ENTER[from](spot, () => fix(spot, () => EXIT[to](spot, finished)));
  }

  function fix(spot, next) {
    play(["up", "down"], 180, n => n === "down" && sparks(spot));
    later(1600, () => { letter.classList.remove("na-dying"); letter.classList.add("na-fixing"); });
    later(2900, () => {
      play(["stand"]);
      dude.classList.add("hop");
      later(500, () => { dude.classList.remove("hop"); next(); });
    });
  }

  function finished() {
    clearInterval(frames);
    stage.remove();
    stage = dude = null;
    letter.classList.remove("na-fixing");
    later(wait(), burnOut);
  }

  // A few sparks off the wrench (on his left, since he faces the letter)
  function sparks(spot) {
    for (let i = 0; i < 3; i++) {
      const s = add("na-spark", stage);
      s.style.left = px(spot + 1);
      s.style.bottom = px(18 + Math.random() * 6);
      s.style.setProperty("--dx", px(-4 - Math.random() * 12));
      s.style.setProperty("--dy", px(-10 + Math.random() * 14));
      setTimeout(() => s.remove(), 450);
    }
  }

  item.addEventListener("mouseenter", start);
  item.addEventListener("mouseleave", reset);
  item.addEventListener("focus", start);
  item.addEventListener("blur", reset);
})();
