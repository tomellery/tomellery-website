// Visitor stats: counts a page view, outbound link clicks, and named events (window.track("played snake")).
// Sends to the stats Worker (worker/stats.js). A visitor is a random id kept in the browser - nothing personal.
// Skipped for you: signing in on /stats/ sets "noStats" in this browser, so your own visits don't count.
(function () {
  const API = /^(localhost|127.0.0.1)$/.test(location.hostname) ? "http://127.0.0.1:8787" : "https://tomellery-stats.tomellery1818.workers.dev";
  let skip = false;
  try { skip = !!localStorage.getItem("noStats"); } catch (e) {}
  if (skip || navigator.doNotTrack === "1") { window.track = function () {}; return; }

  function id(store, key) {
    try {
      let v = store.getItem(key);
      if (!v) { v = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); store.setItem(key, v); }
      return v;
    } catch (e) { return ""; }
  }
  const vid = id(localStorage, "statsVid"), sid = id(sessionStorage, "statsSid");

  function send(type, name) {
    let ref = "";
    try { if (document.referrer) { const h = new URL(document.referrer).hostname; if (h !== location.hostname) ref = h.replace(/^www\./, ""); } } catch (e) {}
    const body = JSON.stringify({ type, name: name || "", path: location.pathname, ref: type === "view" ? ref : "", vid, sid });
    try {
      if (!(navigator.sendBeacon && navigator.sendBeacon(API + "/hit", new Blob([body], { type: "text/plain" })))) {
        fetch(API + "/hit", { method: "POST", body, keepalive: true, mode: "cors" }).catch(() => {});
      }
    } catch (e) {}
  }

  window.track = function (name) { send("event", name); };
  send("view");

  // Outbound links (another site), plus anything marked data-track="name".
  document.addEventListener("click", function (e) {
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    if (a.dataset.track) return send("click", a.dataset.track);
    if (a.hostname && a.hostname !== location.hostname && /^https?:$/.test(a.protocol)) {
      send("click", a.hostname.replace(/^www\./, "") + a.pathname.replace(/\/$/, ""));
    }
  }, true);
})();
