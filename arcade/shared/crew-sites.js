// Construction sites on the coming-soon cabinets: two random members of the 8-bit repair crew (assets/crew.js)
// work on each unfinished game. They are not very good at it, which is why the games are still coming soon.
//   CUBE HOPPER   one tosses cubes, the other catches them and stacks the pyramid
//                 (overthrows, missed catches that land on his head, a toss straight up onto his own head)
//   BARREL CLIMB  one rivets the girder from a ladder, the other holds it
//                 (barrels that get jumped or bowl him over, a slip off the ladder, a dropped wrench)
//   BLAST ZONE    one plants a charge, the other works the plunger
//                 (pushed too early, a charge that rolls back at them)
//   PIXEL HERO    one builds a platform, the other test-jumps it
//                 (it gives way, he overshoots it, the builder hammers his own foot)
// Everywhere: trips, faceplants, a hammered thumb, and naps on the job until the Boss walks by.
// About half the work goes wrong; a hover or tap on a cabinet always sets off a mishap.
// Personalities: the Boss never works, he only turns up to catch nappers. Gramps is slow and naps the most.
// Bones falls to pieces instead of falling over, then puts himself back together.
// Any other coming-soon card gets a general hammer-and-haul crew. A card stops being a site when it loses its
// "soon" class (when its game ships, its card turns into a link).
// Pauses while off screen or in a hidden tab; visitors who turn animations off see the crew standing at each site.
// Previewing: add ?gag=slip to the address to make every site that has that gag do it every time
// (gags: barrel slip drop thumb nap early rollback over miss self collapse overshoot foot),
// and ?crew=Bones,Gramps to put those two on every site.
(() => {
  const Crew = window.Crew;
  if (!Crew) return;
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const GROUND = 2, SPEED = 45;   // px off the bottom of the screen; walking speed in px per second
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const px = n => Math.round(n) + "px";
  const params = new URLSearchParams(location.search);
  const FORCE_GAG = params.get("gag");
  const FORCE_CREW = (params.get("crew") || "").split(",").map(n => Crew.list.find(m => m.name.toLowerCase() === n.trim().toLowerCase())).filter(Boolean);

  // Personalities, by crew name: pace scales walking and climbing; naps makes a nap the likelier mishap
  const BOSS = Crew.list.find(m => m.name === "The Boss");
  const TRAITS = { Gramps: { pace: 0.55, naps: 3 } };
  const trait = m => TRAITS[m.name] || { pace: 1, naps: 0 };

  // Two different random crew members (never the Boss: he doesn't do the work, he checks on it)
  function team() {
    if (FORCE_CREW.length === 2) return FORCE_CREW;
    const list = Crew.list.filter(m => m !== BOSS);
    const a = list.splice(Math.floor(Math.random() * list.length), 1)[0];
    return [a, pick(list)];
  }

  class Stopped extends Error {}

  // ===== One site per coming-soon card =====
  function makeSite(card, scene) {
    const art = card.querySelector(".card-art");
    const stage = document.createElement("div");
    stage.className = "cs-stage";
    stage.setAttribute("aria-hidden", "true");
    card.appendChild(stage);
    const tape = document.createElement("div");
    tape.className = "cs-tape";
    card.appendChild(tape);
    card.classList.add("cs-site");
    const site = { card, art, stage, scene, crew: team(), gen: 0, visible: true, poked: false, timers: [] };

    const poke = () => { site.poked = true; };
    card.addEventListener("mouseenter", poke);
    card.addEventListener("click", poke);
    new IntersectionObserver(([e]) => { site.visible = e.isIntersecting; }).observe(card);
    let resized = 0;
    new ResizeObserver(() => { clearTimeout(resized); resized = setTimeout(() => start(site), 250); }).observe(art);
    return site;
  }

  function stop(site) {
    site.gen++;
    site.timers.forEach(clearInterval);
    site.timers = [];
    site.stage.innerHTML = "";
  }

  function start(site) {
    stop(site);
    if (!site.card.classList.contains("soon")) return;
    // The stage sits exactly over the art's screen
    const c = site.card.getBoundingClientRect(), a = site.art.getBoundingClientRect();
    Object.assign(site.stage.style, {
      left: px(a.left - c.left - site.card.clientLeft + 2), top: px(a.top - c.top - site.card.clientTop + 2),
      width: px(a.width - 4), height: px(a.height - 4),
    });
    const s = kit(site);
    if (calm) { s.A.at(s.W * 0.3, GROUND); s.B.at(s.W * 0.6, GROUND); s.B.face(true); return; }
    site.scene(s).catch(e => { if (!(e instanceof Stopped)) throw e; });
  }

  // ===== The toolkit every scene gets =====
  function kit(site) {
    const gen = site.gen;
    const alive = () => { if (gen !== site.gen) throw new Stopped(); };
    const W = site.stage.clientWidth, H = site.stage.clientHeight;

    // Waits that hold still while the card is off screen or the tab is hidden
    // (counts real time, so a browser that runs timers late doesn't stretch the waits)
    async function sleep(ms) {
      while (ms > 0) {
        const t = performance.now();
        await new Promise(r => setTimeout(r, Math.min(ms, 100)));
        alive();
        if (site.visible && !document.hidden) ms -= performance.now() - t;
      }
    }
    // A repeating timer that dies with the site
    function every(ms, fn) {
      const t = setInterval(fn, ms);
      site.timers.push(t);
      return () => clearInterval(t);
    }

    function el(cls, x, y, parent = site.stage) {
      const e = document.createElement("span");
      e.className = cls;
      parent.appendChild(e);
      e.style.left = px(x);
      e.style.bottom = px(y);
      return e;
    }

    // Slide something from where it is to x, y (or along a list of points) over ms
    async function glide(e, points, ms, easing = "linear") {
      const from = { left: e.style.left, bottom: e.style.bottom };
      const frames = [from, ...points.map(([x, y]) => ({ left: px(x), bottom: px(y) }))];
      const anim = e.animate(frames, { duration: ms, easing, fill: "forwards" });
      await anim.finished.catch(() => {});
      const [x, y] = points[points.length - 1];
      e.style.left = px(x);
      e.style.bottom = px(y);
      anim.cancel();
      alive();
    }
    // A parabola from one point to another, peaking h px above the straight line between them
    const arcPoints = (x0, y0, x1, y1, h) => Array.from({ length: 10 }, (_, i) => {
      const t = (i + 1) / 10;
      return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + 4 * h * t * (1 - t)];
    });

    // Little bursts: sparks off a wrench, dust where someone lands
    function burst(cls, x, y, dir, n = 3) {
      for (let i = 0; i < n; i++) {
        const b = el(cls, x, y + rand(-2, 4));
        b.style.setProperty("--dx", px(dir ? dir * rand(3, 12) : rand(-12, 12)));
        b.style.setProperty("--dy", px(dir ? rand(-8, 8) : rand(0, 7)));
        setTimeout(() => b.remove(), 450);
      }
    }

    function actor(member) {
      const art = Crew.sprites(member);
      const e = el("cs-actor", -30, GROUND);
      const look = el("cs-look", 0, 0, e);   // the sprite itself; stars, bubbles and carried things sit beside it
      const t = trait(member);
      let timer = 0;
      const a = {
        el: e, member, x: -30, y: GROUND, pace: t.pace, sleepy: t.naps,
        show(name) { clearInterval(timer); look.innerHTML = art[name]; },
        play(names, ms = 160, onFrame) {
          clearInterval(timer);
          let i = 0;
          const next = () => { const n = names[i++ % names.length]; look.innerHTML = art[n]; onFrame && onFrame(n); };
          next();
          timer = setInterval(next, ms);
          site.timers.push(timer);
        },
        face(left) { e.classList.toggle("face-left", left); },
        facingLeft: () => e.classList.contains("face-left"),
        at(x, y = GROUND) { a.x = x; a.y = y; e.style.left = px(x); e.style.bottom = px(y); },
        async to(x, y, ms, easing) { await glide(e, [[x, y]], ms, easing); a.x = x; a.y = y; },
        async arc(x, y, h, ms) { await glide(e, arcPoints(a.x, a.y, x, y, h), ms); a.x = x; a.y = y; },
        async walk(x, speed = SPEED * a.pace) {
          if (Math.abs(x - a.x) < 1) return;
          a.face(x < a.x);
          a.play(["walk1", "walk2"], 150 / Math.max(1, speed / SPEED));
          await a.to(x, a.y, Math.abs(x - a.x) / speed * 1000);
          a.show("stand");
        },
        // Walk, but maybe trip on the way
        async stroll(x, chance = 0.35) {
          if (Math.random() < chance && Math.abs(x - a.x) > 30) {
            await a.walk(a.x + (x - a.x) * rand(0.35, 0.65));
            await trip(a);
          }
          await a.walk(x);
        },
        async hop(h = 8, ms = 320) { await a.arc(a.x, a.y, h, ms); },
        // Lean the sprite (deg), or lay it flat: forward = on his face, otherwise on his back
        tilt(deg, ms = 120) {
          look.style.transition = `transform ${ms}ms ease-in`;
          look.style.transform = deg ? `rotate(${deg}deg)` : "";
        },
        flat(forward) {
          const deg = (a.facingLeft() ? -1 : 1) * (forward ? 90 : -90);
          look.style.transition = "transform 140ms ease-in";
          look.style.transform = `translateY(4px) rotate(${deg}deg)`;
        },
        upright() { look.style.transition = "transform 160ms"; look.style.transform = ""; },
        hidden(on) { look.style.visibility = on ? "hidden" : ""; },
        say(text, ms = 1100) {
          const b = el("cs-bubble" + (text === "Z" ? " z" : ""), 4, 28, e);
          b.textContent = text;
          setTimeout(() => b.remove(), ms);
        },
        dizzy(on, low) {
          e.classList.toggle("cs-sooty", on === "sooty");
          const stars = e.querySelector(".cs-stars");
          if (on && !stars) el("cs-stars", 2, low ? 12 : 27, e);
          if (!on && stars) stars.remove();
        },
      };
      a.show("stand");
      return a;
    }

    // ===== The gag library =====

    // Down he goes, stars, and back up looking around to see if anyone noticed. Bones comes apart instead.
    async function crash(a, forward = true) {
      if (a.member.name === "Bones") return fallApart(a);
      a.show("flail");
      a.flat(forward);
      burst("cs-dust", a.x + 10, a.y, 0, 4);
      await sleep(200);
      a.dizzy("stars", true);
      await sleep(1500);
      a.dizzy(false);
      a.upright();
      a.show("stand");
      await a.hop(5, 220);
      await lookAround(a);
    }

    async function lookAround(a) {
      const left = a.facingLeft();
      a.face(!left); await sleep(300);
      a.face(left); await sleep(300);
      a.show("think"); await sleep(500);
      a.show("stand");
    }

    // Bones: scatters into a pile, the pieces hop back, and he's whole again
    async function fallApart(a) {
      a.hidden(true);
      const cx = a.x + 10;
      const bits = Array.from({ length: 6 }, () => el("cs-bone", cx, a.y + rand(6, 20)));
      await Promise.all(bits.map(b => glide(b, arcPoints(cx, a.y + 12, cx + rand(-16, 16), a.y, rand(6, 14)), 420, "ease-in")));
      burst("cs-dust", cx, a.y, 0, 4);
      await sleep(1100);
      a.say("?", 700);
      await sleep(500);
      await Promise.all(bits.map(b => glide(b, arcPoints(parseFloat(b.style.left), a.y, cx, a.y + 12, 10), 380)));
      bits.forEach(b => b.remove());
      a.hidden(false);
      a.show("stand");
      await a.hop(6, 240);
    }

    // A stumble mid-walk: half the time he catches himself, half the time it's a faceplant
    async function trip(a) {
      const lean = a.facingLeft() ? -25 : 25;
      a.show("flail");
      a.tilt(lean);
      await sleep(160);
      if (Math.random() < 0.5) {
        await a.hop(4, 200);
        a.tilt(-lean / 2); await sleep(140);
        a.tilt(0); a.show("stand");
        a.say("!", 700);
        await sleep(400);
      } else {
        await crash(a, true);
      }
    }

    // Hammers his own thumb (or foot): yelps and hops around holding it
    async function thumb(a, { onLadder = false } = {}) {
      a.show("down");
      await sleep(180);
      a.say("!", 1000);
      a.play(["lift", "think"], 140);
      if (onLadder) { for (let i = 0; i < 4; i++) { a.tilt(i % 2 ? -10 : 10); await sleep(180); } a.tilt(0); }
      else { for (let i = 0; i < 3; i++) await a.hop(6, 260); }
      a.show("stand");
      await sleep(400);
    }

    // Sits down for a nap. Most of the time the Boss walks by and he's suddenly very busy.
    async function nap(a, ground = a.y) {
      a.show("sit");
      const stopZ = every(900, () => a.say("Z", 850));
      a.say("Z", 850);
      await sleep(2600 + a.sleepy * 900);
      if (Math.random() < 0.75 && BOSS) {
        const boss = actor(BOSS);
        const fromRight = a.x < W / 2;
        boss.at(fromRight ? W + 4 : -24, ground);
        await boss.walk(fromRight ? a.x + 26 : a.x - 26, SPEED * 0.8);
        boss.face(fromRight);
        boss.say("!", 1000);
        await sleep(450);
        stopZ();
        a.show("stand");
        a.say("!", 700);
        await a.hop(10, 260);
        a.play(["up", "down"], 80, n => n === "down" && burst("cs-spark", a.x + (a.facingLeft() ? 0 : 20), a.y + 8, a.facingLeft() ? -1 : 1));
        await sleep(1200);
        boss.show("think");
        await sleep(500);
        await boss.walk(fromRight ? W + 4 : -24, SPEED * 0.8);
        boss.el.remove();
        await sleep(300);
        a.show("stand");
      } else {
        await sleep(600);
        stopZ();
        a.show("stand");
        a.say("?", 800);
        await sleep(500);
      }
    }

    const [mA, mB] = site.crew;
    const A = actor(mA), B = actor(mB);
    return {
      W, H, sleep, every, el, glide, arcPoints, alive, A, B,
      crash, trip, thumb, nap, lookAround,
      // Time for a mishap? Always right after a hover or tap, otherwise about as often as chance says.
      mishap(chance = 0.5) {
        if (site.poked) { site.poked = false; return true; }
        if (FORCE_GAG) return true;
        return Math.random() < chance;
      },
      // Pick one of the gags; a sleepy crew member (Gramps) makes "nap" likelier
      gag(list) {
        if (FORCE_GAG && list.includes(FORCE_GAG)) return FORCE_GAG;
        const sleepy = Math.max(A.sleepy, B.sleepy);
        return pick(list.includes("nap") ? list.concat(Array(sleepy).fill("nap")) : list);
      },
      // Whoever on this crew naps the most (Gramps), or the given one if nobody stands out
      napper: fallback => (A.sleepy || B.sleepy ? (A.sleepy >= B.sleepy ? A : B) : fallback),
      sparks: (x, y, dir = -1) => burst("cs-spark", x, y, dir),
      dust: (x, y) => burst("cs-dust", x, y, 0, 4),
      flash() { const f = el("cs-flash", 0, 0); setTimeout(() => f.remove(), 300); },
    };
  }

  // ===== The jobs =====

  // BARREL CLIMB: A rivets the girder from the ladder, B holds it.
  async function barrelClimb(s) {
    const { A, B, W, H } = s;
    const lx = Math.round(W * 0.6), top = Math.round(H * 0.42);
    const ladder = s.el("cs-ladder", lx, GROUND);
    ladder.style.height = px(top + 10);
    A.at(lx - 4, GROUND);
    B.at(lx + 16, GROUND);
    B.face(true);

    // A barrel rolls through. Usually B jumps it; sometimes it bowls him over.
    async function barrel() {
      const b = s.el("cs-barrel", -12, GROUND);
      const speed = 75, run = (W + 24) / speed * 1000;
      const rolling = s.glide(b, [[W + 12, GROUND]], run);
      if (Math.random() < 0.5) {
        // Take off as it gets close, stay up until it has rolled clear (it's 10 px, he's 20)
        await s.sleep(Math.max(0, (B.x - 14 + 12) / speed * 1000));
        B.show("lift");
        await B.hop(20, 600);
        B.show("stand");
      } else {
        await s.sleep(Math.max(0, (B.x - 8 + 12) / speed * 1000));
        B.say("!", 600);
        await s.crash(B, false);
        B.face(true);
      }
      await rolling;
      b.remove();
    }

    // B looks the other way, whistling; A wobbles, slips and drops off the ladder
    async function slip() {
      B.face(false);
      B.say("♪", 1600);
      for (let i = 0; i < 3; i++) { A.tilt(i % 2 ? -12 : 12); await s.sleep(150); }
      A.say("!", 600);
      A.show("flail");
      A.tilt(0);
      await A.to(A.x, GROUND, 380, "ease-in");
      await s.crash(A, false);
      B.face(true);
      B.say("?", 800);
      await s.sleep(400);
    }

    // A drops his wrench on B's head
    async function dropTool() {
      A.show("lift");
      const w = s.el("cs-wrench", A.x + 4, A.y + 14);
      await s.glide(w, [[B.x + 8, GROUND + 26]], 420, "ease-in");
      w.remove();
      B.say("!", 800);
      B.dizzy("stars");
      A.show("think");
      A.say("?", 900);
      await s.sleep(1400);
      B.dizzy(false);
      A.show("stand");
    }

    for (;;) {
      A.face(false);
      A.play(["lift", "stand"], 200);
      await A.to(lx - 4, top, 1500 / A.pace);
      A.face(true);
      let fell = false;
      for (let i = 0; i < 3 && !fell; i++) {
        A.play(["up", "down"], 180, n => n === "down" && s.sparks(A.x, A.y + 20, -1));
        await s.sleep(1400);
        if (s.mishap(0.45)) {
          const g = s.gag(["barrel", "barrel", "slip", "drop", "thumb", "nap"]);
          if (g === "barrel") await barrel();
          else if (g === "slip") { await slip(); fell = true; }
          else if (g === "drop") await dropTool();
          else if (g === "thumb") await s.thumb(A, { onLadder: true });
          else { B.face(false); await s.nap(B); B.face(true); }
        }
        A.show("stand");
        await s.sleep(500);
      }
      if (!fell) {
        A.face(false);
        A.play(["lift", "stand"], 200);
        await A.to(lx - 4, GROUND, 1200 / A.pace);
        A.show("stand");
      }
      await s.sleep(1200);
    }
  }

  // BLAST ZONE: B plants a charge, walks back, A works the plunger.
  async function blastZone(s) {
    const { A, B, W } = s;
    const plunger = s.el("cs-plunger", 4, GROUND);
    const safe = 40;
    A.at(18, GROUND);
    A.face(true);
    B.at(safe, GROUND);

    async function boom(bomb, at) {
      const bx = at != null ? at : parseFloat(bomb.style.left);
      plunger.classList.add("down");
      A.show("down");
      bomb.remove();
      const poof = s.el("cs-poof", bx - 10, GROUND);
      s.flash();
      await s.sleep(650);
      poof.remove();
      plunger.classList.remove("down");
      A.show("stand");
    }

    for (;;) {
      const x = Math.round(rand(W * 0.5, W * 0.78));
      await B.stroll(x);
      B.face(false);
      B.show("down");
      const bomb = s.el("cs-bomb", x + 19, GROUND);
      await s.sleep(600);
      B.show("stand");
      const g = s.mishap(0.5) ? s.gag(["early", "early", "rollback", "nap"]) : null;
      if (g === "early") {
        // Too early: B is still standing there
        A.show("up");
        await s.sleep(250);
        await boom(bomb);
        B.dizzy("sooty");
        await s.sleep(2200);
        B.dizzy(false);
        await B.walk(safe);
      } else if (g === "rollback") {
        // The charge rolls back toward them; everybody runs, and it goes off by the plunger
        await B.walk(safe);
        B.face(false);
        await s.sleep(300);
        bomb.classList.add("rolling");
        const back = s.glide(bomb, [[14, GROUND]], 1800);
        await s.sleep(700);
        A.say("!", 700); B.say("!", 700);
        await Promise.all([A.walk(-26, SPEED * 2.6), B.walk(-26, SPEED * 2.6)]);
        await back;
        await boom(bomb, 14);
        await s.sleep(500);
        A.dizzy("sooty"); B.dizzy("sooty");
        A.at(-26); B.at(-30);
        await Promise.all([A.walk(18), B.walk(safe)]);
        A.face(true);
        await s.sleep(1200);
        A.dizzy(false); B.dizzy(false);
      } else {
        await B.walk(safe);
        B.face(false);
        await s.sleep(400);
        if (g === "nap") {
          await s.nap(s.napper(A));
          A.face(true);
        }
        A.show("up");
        await s.sleep(500);
        await boom(bomb);
      }
      B.face(false);
      await s.sleep(1800);
    }
  }

  // CUBE HOPPER: A tosses cubes from the pile, B catches them and stacks the pyramid.
  async function cubeHopper(s) {
    const { A, B, W, H } = s;
    s.el("cs-pile", 2, GROUND);
    A.at(12, GROUND);
    const home = Math.round(W * 0.34);
    B.at(home, GROUND);
    B.face(true);
    const top = [Math.round(W * 0.5 - 4), Math.round(H * 0.78)];
    const hand = a => [a.x + 6, GROUND + 26];

    for (;;) {
      A.face(false);
      A.show("lift");
      const cube = s.el("cs-cube", A.x + 6, GROUND + 26);
      await s.sleep(400);
      A.show("stand");
      const g = s.mishap(0.5) ? s.gag(["over", "miss", "self", "nap"]) : null;
      if (g === "over") {
        // Overthrown: sails past B and bounces off the screen; they both go after it
        await s.glide(cube, s.arcPoints(...hand(A), W + 12, GROUND, 30), 1100);
        cube.remove();
        await Promise.all([B.stroll(W + 4, 0.4), s.sleep(300).then(() => A.walk(W + 4))]);
        await s.sleep(800);
        A.at(-24); B.at(-30);
        await Promise.all([A.walk(12), B.walk(home)]);
        A.face(false);
        B.face(true);
      } else if (g === "miss") {
        // B reaches too late; it lands on his head
        await s.glide(cube, s.arcPoints(...hand(A), B.x + 6, GROUND + 28, 20), 700);
        B.show("lift");
        B.say("!", 700);
        B.dizzy("stars");
        await s.glide(cube, s.arcPoints(B.x + 6, GROUND + 28, B.x + 30, GROUND, 8), 500, "ease-in");
        await s.sleep(1300);
        B.dizzy(false);
        B.show("stand");
        cube.remove();
        await s.lookAround(B);
        B.face(true);
      } else if (g === "self") {
        // A throws it straight up, loses it, and it comes down on him
        await s.glide(cube, [[A.x + 6, s.H - 10]], 500, "ease-out");
        A.show("think");
        A.say("?", 900);
        await s.sleep(500);
        await s.glide(cube, [[A.x + 6, GROUND + 26]], 380, "ease-in");
        cube.remove();
        await s.crash(A, false);
        A.face(false);
      } else {
        if (g === "nap") await s.nap(s.napper(B));
        B.face(true);
        await s.glide(cube, s.arcPoints(...hand(A), ...hand(B), 20), 700);
        B.show("lift");
        await s.sleep(350);
        B.face(false);
        await s.glide(cube, s.arcPoints(...hand(B), top[0], top[1], 12), 600);
        B.show("stand");
        cube.classList.add("placed");
        await s.sleep(500);
        cube.remove();
        B.face(true);
      }
      await s.sleep(900);
    }
  }

  // PIXEL HERO: A builds a floating platform a plank at a time, B test-jumps it.
  async function pixelHero(s) {
    const { A, B, W, H } = s;
    const floor = Math.round(H * 0.15);   // stand on the art's grass strip, not in it
    const py = Math.round(H * 0.42), seg = 12, n = 3, x0 = Math.round(W * 0.32), end = x0 + n * seg;
    B.at(W - 26, floor);
    B.face(true);
    A.at(x0 - 24, floor);

    for (;;) {
      const g = s.mishap(0.5) ? s.gag(["collapse", "collapse", "overshoot", "foot", "nap"]) : null;
      const planks = [];
      for (let i = 0; i < n; i++) {
        await A.walk(x0 + i * seg - 4);
        A.face(false);
        A.play(["up", "down"], 180, f => f === "down" && s.sparks(A.x + 14, py - 2, 1));
        await s.sleep(900);
        if (g === "foot" && i === n - 1) await s.thumb(A);
        planks.push(s.el("cs-plank", x0 + i * seg, py));
        planks[i].style.width = px(seg);
      }
      A.show("stand");
      await A.walk(x0 - 24);
      A.face(false);
      if (g === "nap") await s.nap(s.napper(A));
      await s.sleep(300);

      // B runs up and jumps on (or clean over it)
      await B.stroll(end + 4, 0.3);
      B.face(true);
      B.show("lift");
      if (g === "overshoot") {
        await B.arc(x0 - 18, floor, py - floor + 26, 820);   // clean over the top of it
        await s.crash(B, true);
        await B.walk(W - 26);
        B.face(true);
        planks.forEach(p => p.classList.add("falling"));
        await s.sleep(700);
        planks.forEach(p => p.remove());
        await s.sleep(800);
        continue;
      }
      await B.arc(x0 + seg - 4, py + 4, 16, 520);
      B.show("stand");
      await s.sleep(300);
      B.show("lift");
      await B.hop(8);
      B.show("stand");

      if (g === "collapse") {
        // It gives way
        await s.sleep(200);
        planks.forEach((p, i) => { p.classList.add("falling"); p.style.setProperty("--spin", (i - 1) * 25 + "deg"); });
        B.show("flail");
        await B.to(B.x, floor, 320, "ease-in");
        await s.crash(B, false);
      } else {
        await s.sleep(900);
        B.show("lift");
        await B.arc(end + 4, floor, 10, 480);
        B.show("stand");
        await s.sleep(600);
        planks.forEach(p => p.classList.add("falling"));
      }
      await s.sleep(700);
      planks.forEach(p => p.remove());
      await B.walk(W - 26);
      B.face(true);
      await s.sleep(1200);
    }
  }

  // Any other coming-soon game: A hammers, B hauls planks back and forth (and trips, and naps).
  async function general(s) {
    const { A, B, W } = s;
    A.at(Math.round(W * 0.4), GROUND);
    B.at(8, GROUND);
    for (;;) {
      A.play(["up", "down"], 180, n => n === "down" && s.sparks(A.x + 18, GROUND + 6, 1));
      B.show("lift");
      const plank = s.el("cs-plank", -2, 26, B.el);
      plank.style.width = "24px";
      await B.stroll(W - 26, 0.4);
      plank.remove();
      await s.sleep(1200);
      await B.stroll(8, 0.3);
      if (s.mishap(0.4)) {
        const g = s.gag(["thumb", "nap"]);
        if (g === "thumb") await s.thumb(A);
        else await s.nap(s.napper(A));
      }
      await s.sleep(1000);
    }
  }

  const JOBS = { "CUBE HOPPER": cubeHopper, "BARREL CLIMB": barrelClimb, "BLAST ZONE": blastZone, "PIXEL HERO": pixelHero };

  document.querySelectorAll(".game-card.soon").forEach(card => {
    const name = (card.querySelector("h2") || {}).textContent || "";
    start(makeSite(card, JOBS[name.trim()] || general));
  });
})();
