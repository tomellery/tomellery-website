// Checkers page: board, seats, move list, new game / undo / flip / resign, saving the game in progress.
// Jumps are entered one hop at a time (tap each landing square), so a multi-jump is never ambiguous.
(function () {
  "use strict";
  const { Checkers, side, isKing } = window.CheckersEngine;
  const KEY = "te-boards-checkers";
  const NAME = { b: "Black", r: "Red" };

  const COLORS = { r: ["#cf3a2b", "#7d1a11", "#f07a63"], b: ["#2b2622", "#0a0807", "#5a524a"] };
  function piece(k) {
    const [top, edge, shine] = COLORS[side(k)];
    const crown = isKing(k)
      ? `<path d="M31 57 L28 36 L40 46 L50 31 L60 46 L72 36 L69 57 Z" fill="#ffc94a" stroke="#6b4700" stroke-width="2.5" stroke-linejoin="round"/>`
      : "";
    return `<svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="54" r="39" fill="${edge}"/>
      <circle cx="50" cy="48" r="39" fill="${top}" stroke="${edge}" stroke-width="2"/>
      <circle cx="50" cy="48" r="30" fill="none" stroke="${edge}" stroke-width="3" opacity=".55"/>
      <circle cx="50" cy="48" r="21" fill="none" stroke="${shine}" stroke-width="2" opacity=".5"/>
      ${crown}</svg>`;
  }
  const disc = c => piece(c);

  // ===== State =====
  const g = new Checkers();
  const $ = id => document.getElementById(id);
  const ai = BR.thinker("ai.js?v=1");
  let opts = null, over = null, thinking = false, animating = false, legal = [], prefix = [];

  const board = new BR.Board($("board"), { draw: piece, onPress, onDrop });

  function map() {
    const out = {};
    g.b.forEach((p, i) => { if (p) out[i] = p; });
    return out;
  }

  function render(m) {
    board.sync(map(), m ? [[m.path[0], m.path[m.path.length - 1]]] : []);
    legal = over ? [] : g.moves();
    const last = g.played[g.played.length - 1];
    board.mark("last", last ? last.m.path : []);
    board.mark("hint", []);
    select([]);
    seats(); moveList(); status(); buttons();
  }

  // prefix = squares tapped so far for the move being entered
  function select(path) {
    prefix = path;
    const next = path.length ? legal.filter(m => path.every((s, i) => m.path[i] === s)).map(m => m.path[path.length]) : [];
    board.mark("sel", path.length ? [path[path.length - 1]] : []);
    board.mark("path", path.slice(0, -1));
    board.mark("to", next.filter(s => s !== undefined));
    board.mark("cap", []);
  }

  function seats() {
    const top = board.flip ? "r" : "b", bottom = top === "r" ? "b" : "r";
    for (const [el, c] of [[$("seat-top"), top], [$("seat-bottom"), bottom]]) {
      const them = c === "b" ? "r" : "b", lost = 12 - g.count(them);
      const ai_ = opts && opts.mode === "ai";
      BR.seat(el, {
        who: !opts ? NAME[c] : ai_ ? (c === opts.you ? "You" : "Computer") : NAME[c],
        sub: !opts ? "" : ai_ ? (c === opts.you ? NAME[c] : BR.LEVELS[opts.level]) : "",
        on: opts && !over && g.turn === c,
        thinking: thinking && ai_ && c !== opts.you,
        taken: lost ? disc(them) + `<b>×${lost}</b>` : "",
      });
    }
  }

  function moveList() {
    const el = $("moves");
    el.innerHTML = g.played.map((x, i) => (i % 2 === 0 ? `<li><span class="n">${i / 2 + 1}.</span>` : "")
      + `<span${i === g.played.length - 1 ? ' class="last"' : ""}>${x.text}</span>` + (i % 2 ? " </li>" : " ")).join("")
      + (g.played.length % 2 ? "</li>" : "");
    el.scrollTop = el.scrollHeight;
  }

  function status(note) {
    const el = $("status");
    let text = "", hot = false;
    const mustJump = legal.length && legal[0].caps.length;
    if (!opts) text = "";
    else if (over) { text = resultLine(); hot = true; }
    else if (note) { text = note; hot = true; }
    else if (opts.mode === "ai") {
      text = g.turn === opts.you ? (mustJump ? "Your move · you must jump" : "Your move") : "Computer's move";
      hot = g.turn === opts.you && mustJump;
    } else { text = NAME[g.turn] + " to move" + (mustJump ? " · must jump" : ""); hot = !!mustJump; }
    el.textContent = text;
    el.classList.toggle("hot", hot);
  }

  function buttons() {
    const mine = opts && opts.mode === "ai" ? g.played.length - (opts.you === "r" ? 1 : 0) : g.played.length;
    $("undo").disabled = !opts || !!over || mine <= 0;
    $("resign").disabled = !opts || !!over;
  }

  // ===== Moving =====
  const canMove = () => opts && !over && !thinking && !animating && (opts.mode === "local" || g.turn === opts.you);

  function onPress(i) {
    if (!canMove()) return false;
    if (prefix.length) {
      const fits = legal.filter(m => prefix.every((s, k) => m.path[k] === s) && m.path[prefix.length] === i);
      if (fits.length) {
        const path = prefix.concat(i), done = fits.find(m => m.path.length === path.length);
        if (done) play(done); else select(path);
        return false;
      }
    }
    if (legal.some(m => m.path[0] === i)) { select([i]); return true; }
    // Tapped a piece that can't move: if a jump is compulsory, show which pieces can jump
    if (side(g.b[i]) === g.turn && legal.length && legal[0].caps.length) {
      board.mark("hint", [...new Set(legal.map(m => m.path[0]))]);
      status("You have to jump");
      setTimeout(() => { board.mark("hint", []); status(); }, 1400);
    }
    select([]);
    return false;
  }

  // Dropping a dragged piece: on the final square of a move (or the next hop of a multi-jump)
  function onDrop(from, to) {
    if (!canMove()) return false;
    const ms = legal.filter(m => m.path[0] === from);
    const whole = ms.filter(m => m.path[m.path.length - 1] === to);
    if (whole.length === 1) { play(whole[0]); return true; }
    if (ms.some(m => m.path[1] === to)) { onPress(to); return false; }
    return false;
  }

  // Multi-jumps hop square to square before the captured pieces fade out
  function play(m) {
    g.play(m);
    const st = g.status();
    if (st.over) over = { result: st.result, why: st.why };
    select([]);
    const node = board.at.get(m.path[0]);
    let k = 1;
    animating = true;
    const hop = () => {
      if (node && k < m.path.length - 1) { node.classList.add("top"); board.place(node, m.path[k++]); setTimeout(hop, 230); return; }
      animating = false;
      render(m);
      save();
      if (over) return finished();
      next();
    };
    hop();
  }

  function next() {
    if (!opts || over || opts.mode !== "ai" || g.turn === opts.you) return;
    thinking = true; seats(); status();
    ai.ask({ state: g.save(), level: opts.level }).then(r => {
      thinking = false;
      const m = r.move && g.fromCode(r.move);
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
    if (opts.mode === "ai") BR.record("checkers", opts.level, over.result === "draw" ? "d" : over.result === opts.you ? "w" : "l");
    const win = opts.mode === "ai" && over.result === opts.you, lose = opts.mode === "ai" && over.result !== "draw" && !win;
    setTimeout(() => BR.message({
      eyebrow: opts.mode === "ai" ? "vs Computer · " + BR.LEVELS[opts.level] : "Pass & play",
      title: over.result === "draw" ? "Draw" : over.why === "resigned" ? "Resigned" : win ? "You win" : lose ? "Game over" : NAME[over.result] + " wins",
      line: resultLine() + "." + recordLine(),
      actions: [{ label: "Look at board" }, { label: "Play again", primary: true, run: () => newGame(opts) }],
      dismiss: () => {},
    }), 700);
  }
  function recordLine() {
    if (opts.mode !== "ai") return "";
    const r = BR.recordOf("checkers")[opts.level];
    return r ? `<br>Your record vs ${BR.LEVELS[opts.level]}: ${r.w}–${r.l}${r.d ? "–" + r.d : ""}` : "";
  }

  // ===== Buttons =====
  function undo() {
    if ($("undo").disabled || animating) return;
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
        over = { result: loser === "b" ? "r" : "b", why: "resigned" };
        render(); save(); finished();
      } }],
      dismiss: () => {},
    });
  }
  function flip() { board.flip = !board.flip; board.layout(); render(); }

  function newGame(o) {
    ai.stop(); thinking = false;
    opts = { mode: o.mode, level: o.level, side: o.side, you: o.you };
    g.reset();
    over = null;
    board.flip = opts.mode === "ai" && opts.you === "b";
    board.clear(); board.layout();
    render(); save(); next();
  }
  function askNew(first) {
    BR.setup({
      game: "Checkers", sides: [["r", "Red"], ["b", "Black"]], last: opts,
      onStart: newGame, onCancel: first ? null : () => {},
    });
  }

  function save() { BR.store.set(KEY, { opts, moves: g.played.map(x => g.code(x.m)), over }); }
  function restore() {
    const s = BR.store.get(KEY, null);
    if (!s || !s.opts) return false;
    opts = s.opts;
    for (const c of s.moves || []) { const m = g.fromCode(c); if (!m) break; g.play(m); }
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
