// Neon Arcade easter egg (menu): hover on the sign for 15 seconds (--burnout in the CSS) and a random letter sputters out.
// A random member of the 8-bit repair crew shows up from a random side: walking in from the left or right, rappelling
// down a rope from above, or climbing out of a manhole in the line below. He bangs the letter with his wrench until it
// lights back up, hops, and leaves a different way than he came. Keep hovering and another letter goes 15 seconds later.
// Moving off the sign resets everything.
// Phones and tablets can't hover, so there the sign switches itself on 1.5 seconds after the menu opens, the first
// letter goes out after 10 seconds with the menu open (then every 15), and closing the menu resets it.
// The crew is skipped for visitors who turn animations off. It lives in assets/crew.js, which has to load first.
(() => {
  const item = document.querySelector(".neon-item");
  if (!item) return;
  const touch = matchMedia("(hover: none)").matches;
  const WARM_UP = 1500, FIRST_BURNOUT = 10000;   // touch screens only: ms after the menu opens

  // Touch screens: light the sign a moment after the menu opens, like a neon sign warming up
  if (touch) {
    const menu = document.getElementById("menu");
    let warming = 0;
    new MutationObserver(() => {
      clearTimeout(warming);
      if (menu.classList.contains("open")) {
        warming = setTimeout(() => { item.classList.add("lit"); crewStart(FIRST_BURNOUT - WARM_UP); }, WARM_UP);
      } else {
        item.classList.remove("lit");
        crewReset();
      }
    }).observe(menu, { attributes: true, attributeFilter: ["class"] });
  }

  const Crew = window.Crew;   // assets/crew.js
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const crewStart = first => { if (Crew && !calm) start(first); };
  const crewReset = () => { if (Crew && !calm) reset(); };
  if (!Crew || calm) return;

  // ===== The show =====
  const WIDTH = 22, HEIGHT = 29, GROUND = 2, SPEED = 90;   // px; walking speed in px per second
  const SIDES = ["left", "right", "top", "bottom"];
  let timers = [], frames = 0, stage = null, dude = null, letter = null, art = null;
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  const wait = () => (parseFloat(getComputedStyle(item).getPropertyValue("--burnout")) || 15) * 1000;
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

  function start(first = wait()) {
    reset();
    later(first, burnOut);
  }

  function burnOut() {
    const letters = item.querySelectorAll(".na-p");
    letter = pick(letters);
    letter.classList.add("na-dying");
    later(4800, callRepairman);
  }

  function callRepairman() {
    art = Crew.sprites(pick(Crew.list));
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

  if (!touch) {
    item.addEventListener("mouseenter", () => start());
    item.addEventListener("mouseleave", reset);
  }
  item.addEventListener("focus", () => start());
  item.addEventListener("blur", () => { if (!item.classList.contains("lit")) reset(); });
})();
