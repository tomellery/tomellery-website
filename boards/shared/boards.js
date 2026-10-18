// Game Room shared code: the board (squares, sliding pieces, tap and drag), the computer-player wrapper,
// the new-game / result / confirm sheets, and saved records. Each game page adds its own rules on top.
(function () {
  "use strict";

  // ===== Saved on this device =====
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  // Wins / losses / draws against the computer, per game and level: { chess: { hard: { w, l, d } } }
  const RECORD = "te-boards-record";
  function record(game, level, result) {
    const all = store.get(RECORD, {}), g = all[game] = all[game] || {}, r = g[level] = g[level] || { w: 0, l: 0, d: 0 };
    r[result]++;
    store.set(RECORD, all);
  }
  const recordOf = game => store.get(RECORD, {})[game] || {};

  // ===== The board =====
  // Squares are numbered 0-63, row by row from the top-left as the game sees it (a8 = 0 in chess).
  // flip turns the picture around without changing the numbers.
  class Board {
    constructor(el, { draw, coords, onPress, onDrop }) {
      this.el = el; this.draw = draw; this.coords = coords; this.onPress = onPress; this.onDrop = onDrop;
      this.flip = false; this.at = new Map(); this.drag = null;
      el.classList.add("board");
      el.innerHTML = '<div class="field"><div class="squares"></div><div class="pieces"></div></div>';
      this.field = el.firstChild;
      this.grid = this.field.firstChild;
      this.layer = this.field.lastChild;
      this.cells = [];
      for (let i = 0; i < 64; i++) {
        const b = document.createElement("button");
        b.type = "button"; b.tabIndex = -1;
        this.grid.appendChild(b);
      }
      this.layout();
      this.field.addEventListener("pointerdown", e => this.down(e));
      addEventListener("pointermove", e => this.move(e));
      addEventListener("pointerup", e => this.up(e));
      addEventListener("pointercancel", e => this.up(e, true));
      this.field.addEventListener("contextmenu", e => e.preventDefault());
    }

    // Lay the squares out (again after a flip) and move the pieces to match
    layout() {
      [...this.grid.children].forEach((b, i) => {
        const sq = this.flip ? 63 - i : i, r = sq >> 3, c = sq & 7;
        b.className = "sq" + ((r + c) & 1 ? " d" : "");
        b.dataset.sq = sq;
        b.innerHTML = "";
        this.cells[sq] = b;
        if (this.coords) {
          const { file, rank } = this.coords(sq);
          if (i % 8 === 0) b.insertAdjacentHTML("beforeend", `<span class="co r">${rank}</span>`);
          if (i >= 56) b.insertAdjacentHTML("beforeend", `<span class="co f">${file}</span>`);
        }
      });
      for (const [sq, n] of this.at) this.place(n, sq);
      this.marks = {};
    }

    place(node, sq) {
      const r = sq >> 3, c = sq & 7, x = this.flip ? 7 - c : c, y = this.flip ? 7 - r : r;
      node.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
    }

    // Highlight a set of squares with a class (and clear it everywhere else)
    mark(cls, squares) {
      const old = this.marks[cls] || [];
      old.forEach(sq => this.cells[sq].classList.remove(cls));
      squares.forEach(sq => this.cells[sq].classList.add(cls));
      this.marks[cls] = squares.slice();
    }

    clear() { this.layer.innerHTML = ""; this.at.clear(); }

    // Make the pieces match map ({ square: kind }). pairs are [from, to] slides, so moved pieces glide
    // instead of popping; anything captured fades out and anything new (or promoted) is redrawn.
    sync(map, pairs = []) {
      const moved = [];
      for (const [f, t] of pairs) {
        const n = this.at.get(f);
        if (n) { this.at.delete(f); moved.push([t, n]); }
      }
      for (const [t, n] of moved) {
        const old = this.at.get(t);
        if (old) this.vanish(old);
        this.at.set(t, n);
        n.classList.add("top");
        setTimeout(() => n.classList.remove("top"), 260);
      }
      for (const [sq, n] of [...this.at]) if (!map[sq]) { this.vanish(n); this.at.delete(sq); }
      for (const k in map) {
        const sq = +k;
        let n = this.at.get(sq);
        if (!n) {
          n = document.createElement("div");
          n.className = "pc new";
          this.place(n, sq);
          this.layer.appendChild(n);
          this.at.set(sq, n);
        }
        if (n.dataset.k !== map[k]) { n.dataset.k = map[k]; n.innerHTML = this.draw(map[k]); }
        this.place(n, sq);
      }
    }

    vanish(n) { n.classList.add("gone"); setTimeout(() => n.remove(), 220); }

    sqAt(x, y) {
      const r = this.field.getBoundingClientRect();
      const c = Math.floor((x - r.left) / r.width * 8), w = Math.floor((y - r.top) / r.height * 8);
      if (c < 0 || c > 7 || w < 0 || w > 7) return -1;
      return this.flip ? 63 - (w * 8 + c) : w * 8 + c;
    }

    // A press is a tap (select or move). If the game says the piece can be picked up, it can also be dragged.
    down(e) {
      if (e.button > 0 || this.drag) return;
      const sq = this.sqAt(e.clientX, e.clientY);
      if (sq < 0) return;
      e.preventDefault();
      const grab = this.onPress(sq);
      const node = this.at.get(sq);
      if (grab && node) this.drag = { sq, node, id: e.pointerId, x: e.clientX, y: e.clientY, live: false };
    }
    move(e) {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      if (!d.live && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
      d.live = true;
      d.node.classList.add("drag");
      const r = this.field.getBoundingClientRect(), s = r.width / 8;
      d.node.style.transform = `translate(${e.clientX - r.left - s / 2}px, ${e.clientY - r.top - s * .62}px) scale(1.12)`;
    }
    up(e, cancel) {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      this.drag = null;
      if (!d.live) return;
      d.node.classList.remove("drag");
      const to = cancel ? -1 : this.sqAt(e.clientX, e.clientY);
      const ok = to >= 0 && to !== d.sq && this.onDrop(d.sq, to);
      if (!ok && this.at.get(d.sq) === d.node) this.place(d.node, d.sq);   // snap back
    }
  }

  // ===== Computer player =====
  // Runs the game's ai.js in a background worker so the page never freezes while it thinks.
  // Replies wait at least minMs, so an instant answer doesn't feel like a jump-scare.
  function thinker(url) {
    let w = null, ticket = 0, reject = null;
    return {
      ask(data, minMs = 500) {
        this.stop();
        const me = ++ticket, t0 = Date.now();
        w = w || new Worker(url);
        return new Promise((res, rej) => {
          reject = rej;
          w.onmessage = e => setTimeout(() => { if (me === ticket) { reject = null; res(e.data); } }, Math.max(0, minMs - (Date.now() - t0)));
          w.onerror = err => { if (me === ticket) { reject = null; rej(err); } };
          w.postMessage(data);
        });
      },
      stop() {
        ticket++;
        if (reject) { reject(new Error("stopped")); reject = null; if (w) { w.terminate(); w = null; } }
      },
    };
  }

  // ===== Sheets =====
  function sheet(html, { onClose } = {}) {
    const bg = document.createElement("div");
    bg.className = "sheet-bg";
    bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(bg);
    const close = () => { bg.remove(); removeEventListener("keydown", esc); };
    const esc = e => { if (e.key === "Escape" && onClose) { close(); onClose(); } };
    addEventListener("keydown", esc);
    if (onClose) bg.addEventListener("pointerdown", e => { if (e.target === bg) { close(); onClose(); } });
    const btn = bg.querySelector(".actions .primary");
    if (btn) setTimeout(() => btn.focus({ preventScroll: true }), 50);
    return { el: bg.firstChild, close };
  }

  // Generic message: { eyebrow, title, line, actions: [{ label, primary, run }], dismiss }
  function message({ eyebrow = "", title, line = "", actions, dismiss }) {
    const s = sheet(`
      ${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ""}
      <h2>${title}</h2>
      ${line ? `<p class="line">${line}</p>` : ""}
      <div class="actions">${actions.map((a, i) => `<button class="btn${a.primary ? " primary" : ""}" data-i="${i}">${a.label}</button>`).join("")}</div>`,
      { onClose: dismiss });
    s.el.querySelectorAll(".actions .btn").forEach(b => b.addEventListener("click", () => { s.close(); const a = actions[+b.dataset.i]; if (a.run) a.run(); }));
    return s;
  }

  // New-game sheet. sides: [["w", "White"], ["b", "Black"]]. Calls onStart({ mode, level, you }).
  function setup({ game, sides, last, onStart, onCancel }) {
    const o = Object.assign({ mode: "ai", level: "medium", side: sides[0][0] }, last || {});
    const seg = (name, items) => `<div class="seg" data-name="${name}">${items.map(([v, label, small, off]) =>
      `<button type="button" data-v="${v}" ${off ? "disabled" : ""} aria-pressed="${o[name] === v}">${label}${small ? `<small>${small}</small>` : ""}</button>`).join("")}</div>`;
    const s = sheet(`
      <p class="eyebrow">Game Room · ${game}</p>
      <h2>New game</h2>
      <p class="label">Opponent</p>
      ${seg("mode", [["ai", "Computer"], ["local", "Pass & play", "1 device"], ["online", "Online", "soon", true]])}
      <div class="ai-only">
        <p class="label">Level</p>
        ${seg("level", [["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"]])}
        <p class="label">Play as</p>
        ${seg("side", sides.map(([v, l]) => [v, l]).concat([["random", "Random"]]))}
      </div>
      <p class="line local-only">Take turns on this phone or computer. Use Flip to turn the board around.</p>
      <div class="actions">
        ${onCancel ? `<button class="btn" data-a="cancel">Cancel</button>` : ""}
        <button class="btn primary" data-a="start">Start game</button>
      </div>`, { onClose: onCancel });
    const sync = () => {
      s.el.querySelector(".ai-only").hidden = o.mode !== "ai";
      s.el.querySelector(".local-only").hidden = o.mode !== "local";
    };
    s.el.querySelectorAll(".seg").forEach(g => g.addEventListener("click", e => {
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      o[g.dataset.name] = b.dataset.v;
      g.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
      sync();
    }));
    s.el.querySelector('[data-a="start"]').addEventListener("click", () => {
      s.close();
      const you = o.side === "random" ? sides[Math.random() < .5 ? 0 : 1][0] : o.side;
      onStart({ mode: o.mode, level: o.level, side: o.side, you });
    });
    const c = s.el.querySelector('[data-a="cancel"]');
    if (c) c.addEventListener("click", () => { s.close(); onCancel(); });
    sync();
  }

  // Seat line above / below the board
  function seat(el, { who, sub, on, thinking, taken = "" }) {
    el.className = "seat" + (on ? " on" : "");
    el.innerHTML = `<span class="dot"></span><span class="who">${who}</span><span class="sub${thinking ? " thinking" : ""}">${thinking ? "Thinking" : sub}</span><span class="taken">${taken}</span>`;
  }

  const LEVELS = { easy: "Easy", medium: "Medium", hard: "Hard" };

  window.BR = { store, record, recordOf, Board, thinker, sheet, message, setup, seat, LEVELS };
})();
