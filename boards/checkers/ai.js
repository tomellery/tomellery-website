// Checkers computer player (runs in a Web Worker). Gets { state, level }, answers { move: "40.33" }.
// Alpha-beta search that keeps going while jumps are forced, scored by material, advancement and a guarded back row.
//   Easy   — two moves ahead with lots of randomness.
//   Medium — seven moves ahead with a little randomness.
//   Hard   — searches as deep as it can in about two seconds.
"use strict";
importScripts("engine.js?v=1");
const { Checkers } = self.CheckersEngine;

function evaluate(g) {
  const b = g.b;
  let s = 0, mine = 0, theirs = 0;
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p) continue;
    const r = i >> 3, c = i & 7, black = p === "b" || p === "B";
    let v;
    if (p === "B" || p === "R") v = 160 + (3.5 - Math.abs(3.5 - c)) * 2 + (3.5 - Math.abs(3.5 - r)) * 2;
    else {
      const ahead = black ? r : 7 - r;   // rows advanced
      v = 100 + ahead * 4 + (ahead === 0 ? 10 : 0) + (c === 0 || c === 7 ? -3 : 0);
    }
    if (black === (g.turn === "b")) { s += v; mine += v; } else { s -= v; theirs += v; }
  }
  // When ahead, trading down is good: same lead counts for more with fewer pieces left
  if (mine !== theirs) s += Math.round((mine - theirs) * 300 / (mine + theirs + 300));
  return s;
}

const WIN = 100000, INF = 1e9, STOP = new Error("time");
let deadline = 0, nodes = 0;
const tick = () => { if ((++nodes & 1023) === 0 && Date.now() > deadline) throw STOP; };

function search(g, depth, a, b, ply) {
  tick();
  const ms = g.moves();
  if (!ms.length) return -WIN + ply;
  if ((depth <= 0 && !ms[0].caps.length) || ply > 64) return evaluate(g);   // keep going while jumps are forced
  if (ms.length > 1) ms.sort((x, y) => y.caps.length - x.caps.length);
  for (const m of ms) {
    g.make(m);
    const s = -search(g, depth - 1, -b, -a, ply + 1);
    g.unmake();
    if (s >= b) return b;
    if (s > a) a = s;
  }
  return a;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function choose(state, level) {
  const g = new Checkers();
  g.load(state);
  const ms = shuffle(g.moves());
  if (ms.length <= 1) return ms[0] || null;
  nodes = 0;

  if (level === "easy" || level === "medium") {
    const depth = level === "easy" ? 1 : 6, noise = level === "easy" ? 90 : 18;
    deadline = Date.now() + 2500;
    let best = ms[0], top = -INF;
    try {
      for (const m of ms) {
        g.make(m);
        const s = -search(g, depth, -INF, INF, 1) + (Math.random() * 2 - 1) * noise;
        g.unmake();
        if (s > top) { top = s; best = m; }
      }
    } catch (e) { if (e !== STOP) throw e; }
    return best;
  }

  deadline = Date.now() + 2000;
  let best = ms[0];
  for (let d = 1; d <= 30; d++) {
    let a = -INF, bestNow = null;
    const order = [best].concat(ms.filter(m => m !== best));
    try {
      for (const m of order) {
        g.make(m);
        const s = -search(g, d - 1, -INF, -a, 1);
        g.unmake();
        if (s > a) { a = s; bestNow = m; }
      }
    } catch (e) { if (e !== STOP) throw e; break; }
    best = bestNow;
    if (Math.abs(a) > WIN - 200) break;   // the game's outcome is settled
  }
  return best;
}

onmessage = e => {
  const m = choose(e.data.state, e.data.level);
  postMessage({ move: m ? m.path.join(".") : null });
};
