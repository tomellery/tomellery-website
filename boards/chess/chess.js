// Chess page: board, seats, move list, new game / undo / flip / resign, saving the game in progress.
(function () {
  "use strict";
  const { Chess, colorOf } = window.ChessEngine;
  const KEY = "te-boards-chess";
  const NAME = { w: "White", b: "Black" };
  const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9 };

  // Board squares 0-63 <-> engine 0x88 squares
  const to88 = i => (i >> 3) * 16 + (i & 7);
  const from88 = s => (s >> 4) * 8 + (s & 7);
  const ROOK_HOP = { 118: [119, 117], 114: [112, 115], 6: [7, 5], 2: [0, 3] };

  // ===== Pieces, drawn here so they look the same on every phone (chess symbols turn into emoji on iOS) =====
  const SHAPES = {
    p: `<rect x="22" y="79" width="56" height="11" rx="4"/>
        <path d="M36 80 C36 67 42 59 44 52 H56 C58 59 64 67 64 80 Z"/>
        <ellipse cx="50" cy="51" rx="13" ry="4.5"/>
        <circle cx="50" cy="35" r="12"/>`,
    r: `<rect x="20" y="79" width="60" height="11" rx="4"/>
        <path d="M33 80 L36 45 H64 L67 80 Z"/>
        <path d="M28 17 H37 V24 H45 V17 H55 V24 H63 V17 H72 V36 L67 42 H33 L28 36 Z"/>
        <rect x="30" y="41" width="40" height="7" rx="2"/>`,
    n: `<rect x="20" y="79" width="60" height="11" rx="4"/>
        <path d="M34 80 C33 65 40 57 48 50 C42 50 35 53 30 50 C23 46 25 38 31 34 L45 22 L45 13 L54 19 C68 21 77 36 75 55 C74 66 70 74 68 80 Z"/>
        <circle cx="44" cy="30" r="2.8" class="acc"/>
        <path d="M58 23 C67 30 71 42 69 58" fill="none" class="acc-line"/>`,
    b: `<rect x="20" y="79" width="60" height="11" rx="4"/>
        <path d="M37 80 C37 69 42 63 43 58 H57 C58 63 63 69 63 80 Z"/>
        <path d="M50 19 C61 28 65 40 59 52 H41 C35 40 39 28 50 19 Z"/>
        <ellipse cx="50" cy="57" rx="15" ry="4.5"/>
        <circle cx="50" cy="14" r="5"/>
        <path d="M55 29 L46 40" fill="none" class="acc-line"/>`,
    q: `<rect x="20" y="79" width="60" height="11" rx="4"/>
        <path d="M35 80 C35 69 40 61 38 55 H62 C60 61 65 69 65 80 Z"/>
        <path d="M23 30 L36 54 H64 L77 30 L63 42 L62 22 L56 40 L50 17 L44 40 L38 22 L37 42 Z"/>
        <ellipse cx="50" cy="55" rx="16" ry="4.5"/>
        <circle cx="23" cy="28" r="4.2"/><circle cx="38" cy="20" r="4.2"/><circle cx="50" cy="14" r="4.2"/><circle cx="62" cy="20" r="4.2"/><circle cx="77" cy="28" r="4.2"/>`,
    k: `<rect x="20" y="79" width="60" height="11" rx="4"/>
        <path d="M35 80 C35 69 40 62 38 57 H62 C60 62 65 69 65 80 Z"/>
        <path d="M50 32 C41 23 25 26 27 40 C29 49 37 53 38 57 H62 C63 53 71 49 73 40 C75 26 59 23 50 32 Z"/>
        <ellipse cx="50" cy="57" rx="16" ry="4.5"/>
        <path d="M46 6 H54 V13 H61 V21 H54 V32 H46 V21 H39 V13 H46 Z"/>`,
  };
  function piece(k) {
    // Colors come from the stylesheet (--pw-* white, --pb-* black)
    const c = k < "a" ? "pw" : "pb";
    const shapes = SHAPES[k.toLowerCase()]
      .replace(/class="acc"/g, `style="fill:var(--${c}-acc);stroke:none"`)
      .replace(/class="acc-line"/g, `style="stroke:var(--${c}-acc)" stroke-width="3" stroke-linecap="round"`);
    return `<svg viewBox="0 0 100 100" aria-hidden="true"><g style="fill:var(--${c}-fill);stroke:var(--${c}-line)" stroke-width="3.2" stroke-linejoin="round">${shapes}</g></svg>`;
  }

  // ===== State =====
  const g = new Chess();
  const $ = id => document.getElementById(id);
  const ai = BR.thinker("ai.js?v=1");
  let opts = null, over = null, thinking = false, legal = [], sel = -1;

  const board = new BR.Board($("board"), {
    draw: piece,
    coords: i => ({ file: "abcdefgh"[i & 7], rank: 8 - (i >> 3) }),
    onPress, onDrop,
  });

  function map() {
    const out = {};
    for (let i = 0; i < 64; i++) { const p = g.b[to88(i)]; if (p) out[i] = p; }
    return out;
  }
  function pairs(m) {
    const out = [[from88(m.from), from88(m.to)]];
    if (m.flag === 3) { const [rf, rt] = ROOK_HOP[m.to]; out.push([from88(rf), from88(rt)]); }
    return out;
  }

  // ===== Drawing everything but the pieces =====
  function render(m) {
    board.sync(map(), m ? pairs(m) : []);
    legal = over ? [] : g.moves();
    const last = g.played[g.played.length - 1];
    board.mark("last", last ? [from88(last.m.from), from88(last.m.to)] : []);
    board.mark("check", g.inCheck() ? [from88(g.king[g.turn])] : []);
    select(-1);
    seats(); moveList(); status(); buttons();
  }

  function select(i) {
    sel = i;
    const tos = i < 0 ? [] : legal.filter(m => m.from === to88(i));
    board.mark("sel", i < 0 ? [] : [i]);
    board.mark("to", tos.map(m => from88(m.to)));
    board.mark("cap", tos.filter(m => m.cap).map(m => from88(m.to)));
  }

  // Pieces each side has taken, worked out from what's missing
  function taken(by) {
    const them = by === "w" ? "b" : "w", have = { p: 0, n: 0, b: 0, r: 0, q: 0 }, start = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    for (let i = 0; i < 64; i++) {
      const p = g.b[to88(i)];
      if (p && colorOf(p) === them && have[p.toLowerCase()] !== undefined) have[p.toLowerCase()]++;
    }
    const out = [];
    for (const t of "qrbnp") for (let k = have[t]; k < start[t]; k++) out.push(t);
    return out;
  }

  function seats() {
    const top = board.flip ? "w" : "b", bottom = top === "w" ? "b" : "w";
    const caps = { w: taken("w"), b: taken("b") };
    const worth = c => caps[c].reduce((s, t) => s + VAL[t], 0);
    const lead = worth("w") - worth("b");
    for (const [el, c] of [[$("seat-top"), top], [$("seat-bottom"), bottom]]) {
      const them = c === "w" ? "b" : "w";
      const icons = caps[c].map(t => piece(them === "w" ? t.toUpperCase() : t)).join("");
      const plus = (c === "w" ? lead : -lead) > 0 ? `<b>+${Math.abs(lead)}</b>` : "";
      const ai_ = opts && opts.mode === "ai";
      BR.seat(el, {
        who: !opts ? NAME[c] : ai_ ? (c === opts.you ? "You" : "Computer") : NAME[c],
        sub: !opts ? "" : ai_ ? (c === opts.you ? NAME[c] : BR.LEVELS[opts.level]) : "",
        on: opts && !over && g.turn === c,
        thinking: thinking && ai_ && c !== opts.you,
        taken: icons + plus,
      });
    }
  }

  function moveList() {
    const el = $("moves");
    el.innerHTML = g.played.map((x, i) => (i % 2 === 0 ? `<li><span class="n">${i / 2 + 1}.</span>` : "")
      + `<span${i === g.played.length - 1 ? ' class="last"' : ""}>${x.san}</span>` + (i % 2 ? " </li>" : " ")).join("")
      + (g.played.length % 2 ? "</li>" : "");
    el.scrollTop = el.scrollHeight;
  }

  function status() {
    const el = $("status");
    let text = "", hot = false;
    if (!opts) text = "";
    else if (over) { text = resultLine(); hot = true; }
    else if (opts.mode === "ai") {
      text = g.turn === opts.you ? (g.inCheck() ? "Check · your move" : "Your move") : "Computer's move";
      hot = g.turn === opts.you && g.inCheck();
    } else { text = NAME[g.turn] + " to move" + (g.inCheck() ? " · check" : ""); hot = g.inCheck(); }
    el.textContent = text;
    el.classList.toggle("hot", hot);
  }

  function buttons() {
    const mine = opts && opts.mode === "ai" ? g.played.length - (opts.you === "b" ? 1 : 0) : g.played.length;
    $("undo").disabled = !opts || !!over || mine <= 0;
    $("resign").disabled = !opts || !!over;
  }

  // ===== Moving =====
  const canMove = () => opts && !over && !thinking && (opts.mode === "local" || g.turn === opts.you);
  const mine = i => { const p = g.b[to88(i)]; return p && colorOf(p) === g.turn; };

  function onPress(i) {
    if (!canMove()) return false;
    if (sel >= 0 && sel !== i && tryMove(sel, i)) return false;
    if (mine(i)) { select(i); return true; }
    select(-1);
    return false;
  }
  function onDrop(from, to) { return canMove() && tryMove(from, to) === true; }

  // true = moved, "promo" = asking which piece, false = not a legal move
  function tryMove(fi, ti) {
    const ms = legal.filter(m => m.from === to88(fi) && m.to === to88(ti));
    if (!ms.length) return false;
    if (ms.length > 1) { promote(ms); return "promo"; }
    play(ms[0]);
    return true;
  }

  function promote(ms) {
    const s = BR.sheet(`<p class="eyebrow">Promotion</p><h2>Pick a piece</h2>
      <div class="promo">${ms.map((m, i) => `<button type="button" data-i="${i}" aria-label="${m.promo}">${piece(m.promo)}</button>`).join("")}</div>`,
      { onClose: () => select(-1) });
    s.el.querySelectorAll(".promo button").forEach(b => b.addEventListener("click", () => { s.close(); play(ms[+b.dataset.i]); }));
  }

  function play(m) {
    g.play(m);
    const st = g.status();
    if (st.over) over = { result: st.result, why: st.why };
    render(m);
    save();
    if (over) return finished();
    next();
  }

  function next() {
    if (!opts || over || opts.mode !== "ai" || g.turn === opts.you) return;
    thinking = true; seats(); status();
    ai.ask({ fen: g.fen(), level: opts.level }).then(r => {
      thinking = false;
      const m = r.move && g.fromUci(r.move);
      if (m) play(m); else render();
    }).catch(() => { thinking = false; seats(); });
  }

  // ===== Game over =====
  function resultLine() {
    const { result, why } = over;
    if (result === "draw") return "Draw · " + why;
    if (opts.mode === "ai") return (result === opts.you ? "You win" : "Computer wins") + " · " + why;
    return NAME[result] + " wins · " + why;
  }
  function finished() {
    if (opts.mode === "ai") BR.record("chess", opts.level, over.result === "draw" ? "d" : over.result === opts.you ? "w" : "l");
    setTimeout(() => BR.message({
      eyebrow: opts.mode === "ai" ? "vs Computer · " + BR.LEVELS[opts.level] : "Pass & play",
      title: over.why === "checkmate" ? "Checkmate" : over.why === "resigned" ? "Resigned" : "Draw",
      line: resultLine() + "." + recordLine(),
      actions: [{ label: "Look at board" }, { label: "Play again", primary: true, run: () => newGame(opts) }],
      dismiss: () => {},
    }), 700);
  }
  function recordLine() {
    if (opts.mode !== "ai") return "";
    const r = BR.recordOf("chess")[opts.level];
    return r ? `<br>Your record vs ${BR.LEVELS[opts.level]}: ${r.w}–${r.l}${r.d ? "–" + r.d : ""}` : "";
  }

  // ===== Buttons =====
  function undo() {
    if ($("undo").disabled) return;
    ai.stop(); thinking = false;
    g.undo();
    if (opts.mode === "ai" && g.turn !== opts.you && g.played.length) g.undo();
    render(); save(); next();
  }
  function resign() {
    if (!opts || over) return;
    const loser = opts.mode === "ai" ? opts.you : g.turn;
    BR.message({
      title: "Resign?",
      line: opts.mode === "ai" ? "This counts as a loss against the computer." : NAME[loser] + " gives up the game.",
      actions: [{ label: "Keep playing" }, { label: "Resign", primary: true, run: () => {
        ai.stop(); thinking = false;
        over = { result: loser === "w" ? "b" : "w", why: "resigned" };
        render(); save(); finished();
      } }],
      dismiss: () => {},
    });
  }
  function flip() { board.flip = !board.flip; board.layout(); render(); }

  function newGame(o) {
    ai.stop(); thinking = false;
    opts = { mode: o.mode, level: o.level, side: o.side, you: o.you };
    g.load();
    over = null;
    board.flip = opts.mode === "ai" && opts.you === "b";
    board.clear(); board.layout();
    render(); save(); next();
  }
  function askNew(first) {
    BR.setup({
      game: "Chess", sides: [["w", "White"], ["b", "Black"]], last: opts,
      onStart: newGame, onCancel: first ? null : () => {},
    });
  }

  function save() { BR.store.set(KEY, { opts, moves: g.played.map(x => g.uci(x.m)), over }); }
  function restore() {
    const s = BR.store.get(KEY, null);
    if (!s || !s.opts) return false;
    opts = s.opts;
    for (const u of s.moves || []) { const m = g.fromUci(u); if (!m) break; g.play(m); }
    over = s.over || null;
    board.flip = opts.mode === "ai" && opts.you === "b";
    board.layout();
    render(); next();
    return true;
  }

  $("new").addEventListener("click", () => askNew(false));
  $("undo").addEventListener("click", undo);
  $("flip").addEventListener("click", flip);
  $("resign").addEventListener("click", resign);

  if (!restore()) { render(); askNew(true); }
})();
