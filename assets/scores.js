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

  window.saveHi = function (game, score, onHi) {
    keep(game, Math.max(local(game), score));
    send(game, score, onHi);
  };
})();
