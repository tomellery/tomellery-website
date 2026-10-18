// Checkers rules for the Game Room (American / English draughts): men move diagonally forward, kings both ways,
// captures are compulsory, multi-jumps must be finished, and a man reaching the far row is crowned (which ends the move).
// Used by the page and by the computer player (ai.js, in a worker), so it attaches to `self` in both.
// Squares 0-63, row by row from the top; only dark squares ((row + col) odd) are used.
// b = black man, B = black king, r = red man, R = red king. Black starts at the top and moves first.
(function (root) {
  "use strict";

  const FORWARD = { b: [[1, -1], [1, 1]], r: [[-1, -1], [-1, 1]] };
  const ALL = [[1, -1], [1, 1], [-1, -1], [-1, 1]];
  const side = p => (p ? p.toLowerCase() : "");
  const isKing = p => p !== "" && p < "a";
  const QUIET_DRAW = 80;   // 40 moves each with no capture and no man moving = draw

  // Standard square numbers 1-32 (Black's side is 1-12)
  const num = i => (i >> 3) * 4 + ((i & 7) >> 1) + 1;

  function Checkers() { this.reset(); }

  Checkers.prototype.reset = function () {
    this.b = new Array(64).fill("");
    for (let i = 0; i < 64; i++) {
      const r = i >> 3, c = i & 7;
      if ((r + c) & 1) { if (r < 3) this.b[i] = "b"; else if (r > 4) this.b[i] = "r"; }
    }
    this.turn = "b";
    this.quiet = 0;
    this.stack = [];
    this.played = [];
    this.keys = [this.key()];
  };

  Checkers.prototype.key = function () { return this.b.map(p => p || ".").join("") + this.turn; };

  // Legal moves: { path: [from, ..., to], caps: [captured squares], p, crown }.
  // If any capture exists, only captures are legal.
  Checkers.prototype.moves = function () {
    const b = this.b, us = this.turn, jumps = [], steps = [];
    for (let s = 0; s < 64; s++) {
      const p = b[s];
      if (side(p) !== us) continue;
      const king = isKing(p);
      this.jumps(s, s, [s], [], king, p, jumps);
      if (jumps.length) continue;
      for (const [dr, dc] of king ? ALL : FORWARD[us]) {
        const r = (s >> 3) + dr, c = (s & 7) + dc;
        if (r < 0 || r > 7 || c < 0 || c > 7) continue;
        const t = r * 8 + c;
        if (!b[t]) steps.push({ path: [s, t], caps: [], p, crown: !king && r === (us === "b" ? 7 : 0) });
      }
    }
    return jumps.length ? jumps : steps;
  };

  // Every complete jump sequence from `at`. Captured pieces stay on the board until the move ends,
  // so they can't be jumped twice or landed on; the starting square counts as empty.
  Checkers.prototype.jumps = function (s0, at, path, caps, king, p, out) {
    const b = this.b, us = side(p);
    let more = false;
    for (const [dr, dc] of king ? ALL : FORWARD[us]) {
      const r = (at >> 3) + dr * 2, c = (at & 7) + dc * 2;
      if (r < 0 || r > 7 || c < 0 || c > 7) continue;
      const mid = at + dr * 8 + dc, land = r * 8 + c, mp = b[mid];
      if (!mp || side(mp) === us || caps.includes(mid)) continue;
      if (b[land] && land !== s0) continue;
      more = true;
      if (!king && r === (us === "b" ? 7 : 0)) out.push({ path: path.concat(land), caps: caps.concat(mid), p, crown: true });
      else this.jumps(s0, land, path.concat(land), caps.concat(mid), king, p, out);
    }
    if (!more && caps.length) out.push({ path, caps, p, crown: false });
  };

  Checkers.prototype.make = function (m) {
    const b = this.b, from = m.path[0], to = m.path[m.path.length - 1];
    this.stack.push(b.slice(), this.turn, this.quiet);
    b[from] = "";
    for (const c of m.caps) b[c] = "";
    b[to] = m.crown ? m.p.toUpperCase() : m.p;
    this.quiet = m.caps.length || !isKing(m.p) ? 0 : this.quiet + 1;
    this.turn = this.turn === "b" ? "r" : "b";
  };

  Checkers.prototype.unmake = function () {
    this.quiet = this.stack.pop(); this.turn = this.stack.pop(); this.b = this.stack.pop();
  };

  Checkers.prototype.count = function (who) { return this.b.filter(p => side(p) === who).length; };

  // { over: false } or { over: true, result: "b" | "r" | "draw", why }
  Checkers.prototype.status = function () {
    if (!this.moves().length) {
      const winner = this.turn === "b" ? "r" : "b";
      return { over: true, result: winner, why: this.count(this.turn) ? "no moves left" : "all pieces taken" };
    }
    if (this.quiet >= QUIET_DRAW) return { over: true, result: "draw", why: "40 moves without progress" };
    const k = this.keys[this.keys.length - 1];
    if (this.keys.filter(x => x === k).length >= 3) return { over: true, result: "draw", why: "repetition" };
    return { over: false };
  };

  // 11-15 for a move, 22x15x6 for jumps
  Checkers.prototype.text = m => m.path.map(num).join(m.caps.length ? "x" : "-");
  // Saved / sent form: board squares joined with dots
  Checkers.prototype.code = m => m.path.join(".");
  Checkers.prototype.fromCode = function (c) { return this.moves().find(m => m.path.join(".") === c) || null; };

  Checkers.prototype.play = function (m) {
    const text = this.text(m);
    this.make(m);
    this.played.push({ m, text });
    this.keys.push(this.key());
    return text;
  };
  Checkers.prototype.undo = function () {
    const last = this.played.pop();
    if (!last) return null;
    this.unmake();
    this.keys.pop();
    return last;
  };

  // Board as text (for the computer player)
  Checkers.prototype.save = function () { return { b: this.b.slice(), turn: this.turn, quiet: this.quiet }; };
  Checkers.prototype.load = function (s) { this.b = s.b.slice(); this.turn = s.turn; this.quiet = s.quiet || 0; this.stack = []; this.played = []; this.keys = [this.key()]; };

  root.CheckersEngine = { Checkers, num, side, isKing };
})(typeof self !== "undefined" ? self : this);
