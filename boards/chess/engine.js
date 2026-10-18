// Chess rules for the Game Room: legal moves (castling, en passant, promotion), check, mate, draws, SAN notation.
// Used by the page and by the computer player (ai.js, in a worker), so it attaches to `self` in both.
// Squares are 0x88: index = row * 16 + file, row 0 is rank 8 (so a8 = 0, h1 = 119). Off the board when (sq & 0x88).
// Pieces are FEN letters: uppercase white, lowercase black, "" empty.
(function (root) {
  "use strict";

  const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const KNIGHT = [-33, -31, -18, -14, 14, 18, 31, 33];
  const BISHOP = [-17, -15, 15, 17];
  const ROOK = [-16, -1, 1, 16];
  const KING = [-17, -16, -15, -1, 1, 15, 16, 17];
  const CASTLE = { K: 1, Q: 2, k: 4, q: 8 };
  // Castling rights kept when a piece moves from or to a square (a king or rook leaving, or a rook being taken)
  const RIGHTS = new Array(128).fill(15);
  RIGHTS[112] = 13; RIGHTS[119] = 14; RIGHTS[116] = 12; RIGHTS[0] = 7; RIGHTS[7] = 11; RIGHTS[4] = 3;
  // Where the rook goes when castling, by the king's destination: [rook from, rook to]
  const ROOK_HOP = { 118: [119, 117], 114: [112, 115], 6: [7, 5], 2: [0, 3] };

  const sqIndex = n => (8 - +n[1]) * 16 + (n.charCodeAt(0) - 97);
  const sqName = s => "abcdefgh"[s & 7] + (8 - (s >> 4));
  const colorOf = p => (p < "a" ? "w" : "b");
  const isW = p => p !== "" && p < "a";
  const isB = p => p !== "" && p > "Z";

  function Chess(fen) { this.load(fen || START); }

  Chess.prototype.load = function (fen) {
    fen = fen || START;
    const [pos, turn, castle, ep, half, full] = fen.trim().split(/\s+/);
    this.b = new Array(128).fill("");
    this.king = { w: -1, b: -1 };
    let r = 0, f = 0;
    for (const c of pos) {
      if (c === "/") { r++; f = 0; }
      else if (c >= "1" && c <= "8") f += +c;
      else {
        const s = r * 16 + f++;
        this.b[s] = c;
        if (c === "K") this.king.w = s;
        if (c === "k") this.king.b = s;
      }
    }
    this.turn = turn === "b" ? "b" : "w";
    this.castle = 0;
    for (const c of castle || "-") if (CASTLE[c]) this.castle |= CASTLE[c];
    this.ep = ep && ep !== "-" ? sqIndex(ep) : -1;
    this.half = +half || 0;
    this.full = +full || 1;
    this.stack = [];
    this.played = [];          // [{ m, san }] for moves made with play()
    this.keys = [this.key()];  // position after each played move, for threefold repetition
  };

  Chess.prototype.fen = function () {
    let s = "";
    for (let r = 0; r < 8; r++) {
      let e = 0;
      for (let f = 0; f < 8; f++) {
        const p = this.b[r * 16 + f];
        if (!p) e++;
        else { if (e) s += e; e = 0; s += p; }
      }
      if (e) s += e;
      if (r < 7) s += "/";
    }
    let c = "";
    for (const k of "KQkq") if (this.castle & CASTLE[k]) c += k;
    return [s, this.turn, c || "-", this.ep >= 0 ? sqName(this.ep) : "-", this.half, this.full].join(" ");
  };

  Chess.prototype.key = function () { return this.fen().split(" ").slice(0, 4).join(" "); };

  // Is square s attacked by color `by`?
  Chess.prototype.attacked = function (s, by) {
    const b = this.b, w = by === "w";
    const P = w ? "P" : "p", N = w ? "N" : "n", K = w ? "K" : "k";
    const B1 = w ? "B" : "b", R1 = w ? "R" : "r", Q = w ? "Q" : "q";
    let t = s + (w ? 15 : -15);
    if (!(t & 0x88) && b[t] === P) return true;
    t = s + (w ? 17 : -17);
    if (!(t & 0x88) && b[t] === P) return true;
    for (const d of KNIGHT) { t = s + d; if (!(t & 0x88) && b[t] === N) return true; }
    for (const d of KING) { t = s + d; if (!(t & 0x88) && b[t] === K) return true; }
    for (const d of BISHOP) {
      for (t = s + d; !(t & 0x88); t += d) { const p = b[t]; if (p) { if (p === B1 || p === Q) return true; break; } }
    }
    for (const d of ROOK) {
      for (t = s + d; !(t & 0x88); t += d) { const p = b[t]; if (p) { if (p === R1 || p === Q) return true; break; } }
    }
    return false;
  };

  Chess.prototype.inCheck = function () { return this.attacked(this.king[this.turn], this.turn === "w" ? "b" : "w"); };

  // Moves that follow the piece rules but may leave the king in check. capsOnly: captures and promotions only.
  // A move is { from, to, p, cap, promo, flag } with flag 0 normal, 1 double pawn push, 2 en passant, 3 castle.
  Chess.prototype.pseudo = function (capsOnly) {
    const b = this.b, us = this.turn, out = [];
    const mine = us === "w" ? isW : isB, theirs = us === "w" ? isB : isW;
    const add = (from, to, p, cap, flag) => {
      if ((p === "P" && to < 8) || (p === "p" && to >= 112)) {
        for (const q of us === "w" ? "QNRB" : "qnrb") out.push({ from, to, p, cap, promo: q, flag });
      } else out.push({ from, to, p, cap, promo: "", flag });
    };
    for (let s = 0; s < 120; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = b[s];
      if (!mine(p)) continue;
      const t = p.toLowerCase();
      if (t === "p") {
        const dir = us === "w" ? -16 : 16, one = s + dir;
        if (!(one & 0x88) && !b[one]) {
          const promoting = one < 8 || one >= 112;
          if (!capsOnly || promoting) add(s, one, p, "", 0);
          const two = one + dir;
          if (!capsOnly && (s >> 4) === (us === "w" ? 6 : 1) && !b[two]) add(s, two, p, "", 1);
        }
        for (const c of [one - 1, one + 1]) {
          if (c & 0x88) continue;
          if (theirs(b[c])) add(s, c, p, b[c], 0);
          else if (c === this.ep) add(s, c, p, us === "w" ? "p" : "P", 2);
        }
      } else if (t === "n" || t === "k") {
        for (const d of t === "n" ? KNIGHT : KING) {
          const c = s + d;
          if ((c & 0x88) || mine(b[c])) continue;
          if (b[c]) add(s, c, p, b[c], 0);
          else if (!capsOnly) add(s, c, p, "", 0);
        }
        if (t === "k" && !capsOnly) this.castles(s, out);
      } else {
        const dirs = t === "b" ? BISHOP : t === "r" ? ROOK : KING;
        for (const d of dirs) {
          for (let c = s + d; !(c & 0x88); c += d) {
            if (b[c]) { if (theirs(b[c])) add(s, c, p, b[c], 0); break; }
            if (!capsOnly) add(s, c, p, "", 0);
          }
        }
      }
    }
    return out;
  };

  Chess.prototype.castles = function (s, out) {
    const b = this.b;
    if (this.turn === "w") {
      if (s !== 116 || this.attacked(116, "b")) return;
      if ((this.castle & 1) && b[119] === "R" && !b[117] && !b[118] && !this.attacked(117, "b") && !this.attacked(118, "b"))
        out.push({ from: 116, to: 118, p: "K", cap: "", promo: "", flag: 3 });
      if ((this.castle & 2) && b[112] === "R" && !b[115] && !b[114] && !b[113] && !this.attacked(115, "b") && !this.attacked(114, "b"))
        out.push({ from: 116, to: 114, p: "K", cap: "", promo: "", flag: 3 });
    } else {
      if (s !== 4 || this.attacked(4, "w")) return;
      if ((this.castle & 4) && b[7] === "r" && !b[5] && !b[6] && !this.attacked(5, "w") && !this.attacked(6, "w"))
        out.push({ from: 4, to: 6, p: "k", cap: "", promo: "", flag: 3 });
      if ((this.castle & 8) && b[0] === "r" && !b[3] && !b[2] && !b[1] && !this.attacked(3, "w") && !this.attacked(2, "w"))
        out.push({ from: 4, to: 2, p: "k", cap: "", promo: "", flag: 3 });
    }
  };

  Chess.prototype.make = function (m) {
    const b = this.b;
    this.stack.push(this.castle, this.ep, this.half);
    b[m.to] = m.promo || m.p;
    b[m.from] = "";
    if (m.flag === 2) b[m.to + (this.turn === "w" ? 16 : -16)] = "";
    else if (m.flag === 3) { const [rf, rt] = ROOK_HOP[m.to]; b[rt] = b[rf]; b[rf] = ""; }
    if (m.p === "K") this.king.w = m.to;
    else if (m.p === "k") this.king.b = m.to;
    this.castle &= RIGHTS[m.from] & RIGHTS[m.to];
    this.ep = m.flag === 1 ? (m.from + m.to) >> 1 : -1;
    this.half = m.cap || m.p === "P" || m.p === "p" ? 0 : this.half + 1;
    if (this.turn === "b") this.full++;
    this.turn = this.turn === "w" ? "b" : "w";
  };

  Chess.prototype.unmake = function (m) {
    const b = this.b;
    this.turn = this.turn === "w" ? "b" : "w";
    if (this.turn === "b") this.full--;
    this.half = this.stack.pop(); this.ep = this.stack.pop(); this.castle = this.stack.pop();
    b[m.from] = m.p;
    if (m.flag === 2) { b[m.to] = ""; b[m.to + (this.turn === "w" ? 16 : -16)] = m.cap; }
    else b[m.to] = m.cap;
    if (m.flag === 3) { const [rf, rt] = ROOK_HOP[m.to]; b[rf] = b[rt]; b[rt] = ""; }
    if (m.p === "K") this.king.w = m.from;
    else if (m.p === "k") this.king.b = m.from;
  };

  // Legal moves only
  Chess.prototype.moves = function (capsOnly) {
    const us = this.turn, them = us === "w" ? "b" : "w", out = [];
    for (const m of this.pseudo(capsOnly)) {
      this.make(m);
      if (!this.attacked(this.king[us], them)) out.push(m);
      this.unmake(m);
    }
    return out;
  };

  // Neither side can possibly mate: bare kings, one minor piece, or bishops all on one square color
  Chess.prototype.insufficient = function () {
    const minors = [];
    for (let s = 0; s < 120; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = this.b[s].toLowerCase();
      if (!p || p === "k") continue;
      if (p === "p" || p === "r" || p === "q") return false;
      minors.push([p, ((s >> 4) + (s & 7)) & 1]);
    }
    if (minors.length <= 1) return true;
    return minors.every(([p, c]) => p === "b" && c === minors[0][1]);
  };

  // { over: false, check } or { over: true, result: "w" | "b" | "draw", why }
  Chess.prototype.status = function () {
    const legal = this.moves(), check = this.inCheck();
    if (!legal.length) return check
      ? { over: true, result: this.turn === "w" ? "b" : "w", why: "checkmate" }
      : { over: true, result: "draw", why: "stalemate" };
    if (this.half >= 100) return { over: true, result: "draw", why: "50-move rule" };
    const k = this.keys[this.keys.length - 1];
    if (this.keys.filter(x => x === k).length >= 3) return { over: true, result: "draw", why: "repetition" };
    if (this.insufficient()) return { over: true, result: "draw", why: "not enough pieces" };
    return { over: false, check };
  };

  // Standard algebraic notation (Nf3, exd5, O-O, e8=Q+), worked out before the move is made
  Chess.prototype.san = function (m) {
    let s;
    if (m.flag === 3) s = (m.to & 7) === 6 ? "O-O" : "O-O-O";
    else {
      const t = m.p.toUpperCase();
      if (t === "P") s = (m.cap ? sqName(m.from)[0] + "x" : "") + sqName(m.to) + (m.promo ? "=" + m.promo.toUpperCase() : "");
      else {
        const rivals = this.moves().filter(o => o.p === m.p && o.to === m.to && o.from !== m.from);
        let dis = "";
        if (rivals.length) {
          const file = rivals.some(o => (o.from & 7) === (m.from & 7)), rank = rivals.some(o => (o.from >> 4) === (m.from >> 4));
          dis = !file ? sqName(m.from)[0] : !rank ? sqName(m.from)[1] : sqName(m.from);
        }
        s = t + dis + (m.cap ? "x" : "") + sqName(m.to);
      }
    }
    this.make(m);
    const check = this.inCheck(), mate = check && !this.moves().length;
    this.unmake(m);
    return s + (mate ? "#" : check ? "+" : "");
  };

  // Move as text for saving and sending: e2e4, e7e8q
  Chess.prototype.uci = m => sqName(m.from) + sqName(m.to) + (m.promo ? m.promo.toLowerCase() : "");
  Chess.prototype.fromUci = function (u) { return this.moves().find(m => this.uci(m) === u) || null; };

  // Make a move for real (kept in the history for undo, repetition and the move list)
  Chess.prototype.play = function (m) {
    const san = this.san(m);
    this.make(m);
    this.played.push({ m, san });
    this.keys.push(this.key());
    return san;
  };
  Chess.prototype.undo = function () {
    const last = this.played.pop();
    if (!last) return null;
    this.unmake(last.m);
    this.keys.pop();
    return last;
  };

  root.ChessEngine = { Chess, START, sqName, sqIndex, colorOf };
})(typeof self !== "undefined" ? self : this);
