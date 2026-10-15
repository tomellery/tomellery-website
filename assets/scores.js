// Shared high scores for the secret games, kept by a Cloudflare Worker (worker/scores.js).
// The browser's own copy is used straight away and whenever the Worker can't be reached.
(function () {
  const API = "https://tomellery-scores.tomellery1818.workers.dev";

  function local(game) {
    try { return parseInt(localStorage.getItem(game + "Hi"), 10) || 0; } catch (e) { return 0; }
  }
  function keep(game, n) {
    try { localStorage.setItem(game + "Hi", n); } catch (e) {}
  }

  function send(game, score, onHi) {
    if (!API) return;
    fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game, score }) })
      .then(r => r.json())
      .then(d => { if (d.hi > 0) { keep(game, Math.max(local(game), d.hi)); onHi && onHi(d.hi); } })
      .catch(() => {});
  }

  // Calls onHi with the local best now, then again with the shared best when it arrives.
  window.loadHi = function (game, onHi) {
    const mine = local(game);
    onHi(mine);
    if (!API) return;
    fetch(API + "?game=" + game, { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        const hi = d.hi || 0;
        if (mine > hi) send(game, mine, onHi);   // this browser has a better score the Worker hasn't seen
        else if (hi > mine) { keep(game, hi); onHi(hi); }
      })
      .catch(() => {});
  };

  // 8-bit "NEW HIGH SCORE" banner: letters type in, bounce and blink, with a burst of pixels.
  // Call every frame while the game-over screen shows; since = performance.now() when the record was set.
  window.drawNewHi = function (ctx, cx, cy, since) {
    const t = (performance.now() - since) / 1000;
    const text = "NEW HIGH SCORE!", step = 13;
    ctx.save();
    ctx.font = "bold 16px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = "#39ff7a"; ctx.shadowBlur = 8;
    ctx.fillStyle = Math.floor(t * 4) % 2 ? "#b6ffcf" : "#39ff7a";
    const shown = Math.min(text.length, Math.floor(t / 0.04));
    const x0 = cx - (text.length - 1) * step / 2;
    for (let i = 0; i < shown; i++) {
      const hop = Math.round(Math.abs(Math.sin(t * 7 - i * 0.45)) * 2) * 2;   // jumps in 2px steps, not smoothly
      ctx.fillText(text[i], x0 + i * step, cy - hop);
    }
    if (t < 1.4) {
      ctx.globalAlpha = Math.min(1, (1.4 - t) * 2);
      ctx.fillStyle = "#39ff7a";
      for (let i = 0; i < 28; i++) {
        const a = i * 2.4, v = 70 + (i * 37) % 90;
        const px = cx + Math.cos(a) * v * t, py = cy + Math.sin(a) * v * t + 160 * t * t;
        ctx.fillRect(Math.round(px / 3) * 3, Math.round(py / 3) * 3, 3, 3);
      }
    }
    ctx.restore();
  };

  window.saveHi = function (game, score, onHi) {
    keep(game, Math.max(local(game), score));
    send(game, score, onHi);
  };
})();
