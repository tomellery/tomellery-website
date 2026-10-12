// Swipe (phones) or arrow keys (computers) to move between the link page designs.
// To change the order, edit this list. "" is the home page (tomellery.com).
(function () {
  const ROTATION = [
    "",                         // Lift Ticket (home)
    "designs/trailsigns.html",  // Trail Signs
    "designs/monolith.html",    // Monolith
    "designs/jobsite.html",     // Job Site
    "designs/fieldbook.html",   // Field Book
    "designs/businesscard.html" // Business Card
  ];

  const root = new URL("../", document.currentScript.src);
  const isFile = location.protocol === "file:";
  const here = location.origin === "null" ? location.href.split(/[?#]/)[0] : location.origin + location.pathname;
  const urlFor = p => new URL(p || (isFile ? "index.html" : ""), root).href;
  const current = ROTATION.findIndex(p =>
    p === "" ? here === root.href || here === new URL("index.html", root).href : here === urlFor(p));
  if (current === -1) return;

  // Tidy the address bar: drop the fresh-copy "?s=" tag added when swiping here
  if (/[?&]s=/.test(location.search)) {
    try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
  }

  const style = document.createElement("style");
  style.textContent = `
    body.swipe-out-left  { transition: opacity .18s ease, transform .18s ease; opacity: 0; transform: translateX(-40px); }
    body.swipe-out-right { transition: opacity .18s ease, transform .18s ease; opacity: 0; transform: translateX(40px); }
    body.swipe-in-left   { animation: swipeInLeft .28s ease both; }
    body.swipe-in-right  { animation: swipeInRight .28s ease both; }
    @keyframes swipeInLeft  { from { opacity: 0; transform: translateX(40px); }  to { opacity: 1; transform: none; } }
    @keyframes swipeInRight { from { opacity: 0; transform: translateX(-40px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) {
      body.swipe-out-left, body.swipe-out-right, body.swipe-in-left, body.swipe-in-right { animation: none; transition: none; transform: none; }
    }`;
  document.head.appendChild(style);

  let arrived = null;
  try { arrived = sessionStorage.getItem("swipeDir"); sessionStorage.removeItem("swipeDir"); } catch (e) {}
  if (arrived) {
    document.body.classList.add("swipe-in-" + arrived);
    document.body.addEventListener("animationend", () => document.body.classList.remove("swipe-in-" + arrived), { once: true });
  }

  let leaving = false;
  function go(step) {
    if (leaving) return;
    leaving = true;
    const next = (current + step + ROTATION.length) % ROTATION.length;
    const dir = step > 0 ? "left" : "right";
    try { sessionStorage.setItem("swipeDir", dir); } catch (e) {}
    document.body.classList.add("swipe-out-" + dir);
    // A one-time "?s=" tag makes the phone fetch a fresh copy instead of a saved one.
    let target = urlFor(ROTATION[next]);
    if (!isFile) target += "?s=" + Date.now();
    setTimeout(() => { location.href = target; }, 180);
  }

  // Touch: a quick, mostly-horizontal swipe
  let sx = 0, sy = 0, st = 0;
  addEventListener("touchstart", e => {
    if (e.touches.length !== 1) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
  }, { passive: true });
  addEventListener("touchend", e => {
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Date.now() - st < 700 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  }, { passive: true });

  // Keyboard: left/right arrows
  addEventListener("keydown", e => {
    if (e.target.closest && e.target.closest("input, textarea")) return;
    if (e.key === "ArrowRight") go(1);
    if (e.key === "ArrowLeft") go(-1);
  });

  // Coming back with the browser's back button: make sure the page is visible
  addEventListener("pageshow", () => {
    leaving = false;
    document.body.classList.remove("swipe-out-left", "swipe-out-right");
  });
})();
