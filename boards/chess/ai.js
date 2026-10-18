// Chess computer player (runs in a Web Worker). Gets { fen, level }, answers { move: "e2e4" }.
// Alpha-beta search with a capture search at the end so it doesn't stop mid-trade, scored by material
// plus piece-square tables (the well-known "simplified evaluation" values).
//   Easy   — looks one move ahead with lots of randomness, so it blunders.
//   Medium — two moves ahead, a little randomness.
//   Hard   — searches as deep as it can in about two seconds.
"use strict";
importScripts("engine.js?v=1");
const { Chess } = self.ChessEngine;

const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
// Tables are from White's side, a8 first; Black reads them mirrored.
const PST = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
  e: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50],
};

// Score from the side to move's point of view
function evaluate(g) {
  const b = g.b;
  let heavy = 0;
  for (let s = 0; s < 120; s++) {
    if (s & 0x88) { s += 7; continue; }
    const p = b[s];
    if (p && p !== "k" && p !== "K" && p !== "p" && p !== "P") heavy += VAL[p.toLowerCase()];
  }
  const kingTable = heavy <= 1600 ? PST.e : PST.k;
  let score = 0, wb = 0, bb = 0;
  for (let s = 0; s < 120; s++) {
    if (s & 0x88) { s += 7; continue; }
    const p = b[s];
    if (!p) continue;
    const t = p.toLowerCase(), r = s >> 4, f = s & 7, table = t === "k" ? kingTable : PST[t];
    if (p < "a") { score += VAL[t] + table[r * 8 + f]; if (t === "b") wb++; }
    else { score -= VAL[t] + table[(7 - r) * 8 + f]; if (t === "b") bb++; }
  }
  if (wb >= 2) score += 30;
  if (bb >= 2) score -= 30;
  return g.turn === "w" ? score : -score;
}

const MATE = 100000, INF = 1e9, STOP = new Error("time");
let deadline = 0, nodes = 0;
const tick = () => { if ((++nodes & 1023) === 0 && Date.now() > deadline) throw STOP; };

// Best-looking moves first (good captures, promotions), so alpha-beta cuts more
function order(ms, first) {
  for (const m of ms) {
    m.o = m.cap ? 10 * VAL[m.cap.toLowerCase()] - VAL[m.p.toLowerCase()] + 1000 : 0;
    if (m.promo) m.o += VAL[m.promo.toLowerCase()];
    if (first && m.from === first.from && m.to === first.to && m.promo === first.promo) m.o = 1e7;
  }
  return ms.sort((a, b) => b.o - a.o);
}

function quiesce(g, a, b, ply) {
  tick();
  const stand = evaluate(g);
  if (stand >= b) return b;
  if (stand > a) a = stand;
  if (ply > 32) return a;
  for (const m of order(g.moves(true))) {
    g.make(m);
    const s = -quiesce(g, -b, -a, ply + 1);
    g.unmake(m);
    if (s >= b) return b;
    if (s > a) a = s;
  }
  return a;
}

function search(g, depth, a, b, ply) {
  tick();
  const check = g.inCheck();
  if (check && ply < 16) depth++;          // look one deeper when in check, so mates aren't missed
  if (depth <= 0) return quiesce(g, a, b, ply);
  const ms = g.moves();
  if (!ms.length) return check ? -MATE + ply : 0;
  if (g.half >= 100) return 0;
  for (const m of order(ms)) {
    g.make(m);
    const s = -search(g, depth - 1, -b, -a, ply + 1);
    g.unmake(m);
    if (s >= b) return b;
    if (s > a) a = s;
  }
  return a;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function choose(fen, level) {
  const g = new Chess(fen), ms = shuffle(g.moves());
  if (ms.length <= 1) return ms[0] || null;
  nodes = 0;

  if (level === "easy" || level === "medium") {
    // Score every move fully, then add noise so it doesn't always find the best one
    const depth = level === "easy" ? 0 : 1, noise = level === "easy" ? 220 : 40;
    deadline = Date.now() + (level === "easy" ? 800 : 2500);
    let best = ms[0], top = -INF;
    try {
      for (const m of order(ms)) {
        g.make(m);
        const s = -search(g, depth, -INF, INF, 1) + (Math.random() * 2 - 1) * noise;
        g.unmake(m);
        if (s > top) { top = s; best = m; }
      }
    } catch (e) { if (e !== STOP) throw e; }
    return best;
  }

  // Hard: deepen one move at a time until the clock runs out, keeping the last finished answer
  deadline = Date.now() + 2000;
  let best = order(ms)[0];
  for (let d = 1; d <= 10; d++) {
    let a = -INF, bestNow = null;
    try {
      for (const m of order(ms, best)) {
        g.make(m);
        const s = -search(g, d - 1, -INF, -a, 1);
        g.unmake(m);
        if (s > a) { a = s; bestNow = m; }
      }
    } catch (e) { if (e !== STOP) throw e; break; }
    best = bestNow;
    if (a > MATE - 200) break;   // found a forced mate
  }
  return best;
}

onmessage = e => {
  const { fen, level } = e.data;
  const m = choose(fen, level);
  postMessage({ move: m ? Chess.prototype.uci(m) : null });
};
