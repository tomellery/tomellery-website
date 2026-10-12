// Swipe (phones), trackpad, or arrow keys to move between the link page designs.
// To change the order, edit this list. "index.html" is the home page (tomellery.com).
(function () {
  const ROTATION = [
    { id: "liftticket",   file: "index.html",                title: "Lift Ticket" },
    { id: "trailsigns",   file: "designs/trailsigns.html",   title: "Trail Signs" },
    { id: "monolith",     file: "designs/monolith.html",     title: "Monolith" },
    { id: "jobsite",      file: "designs/jobsite.html",      title: "Job Site" },
    { id: "fieldbook",    file: "designs/fieldbook.html",    title: "Field Book" },
    { id: "businesscard", file: "designs/businesscard.html", title: "Business Card" },
  ];
  window.TE_ROTATION = ROTATION;
  if (window.TE_CAROUSEL) return; // the archived carousel only needs the list

  const root = new URL("../", document.currentScript.src);
  const isFile = location.protocol === "file:";
  const here = location.href.split(/[?#]/)[0];
  const urlFor = file => file === "index.html" && !isFile ? root.href : new URL(file, root).href;
  const current = ROTATION.findIndex(r => here === urlFor(r.file) || here === new URL(r.file, root).href);
  if (current === -1) return;

  // Inside the archived carousel: report gestures to it instead of changing pages
  let embedded = false;
  try { embedded = window.parent !== window && !!window.parent.TE_CAROUSEL; } catch (e) {}
  const send = msg => window.parent.postMessage(Object.assign({ te: "swipe" }, msg), isFile ? "*" : location.origin);

  // Tidy the address bar: drop the fresh-copy "?s=" tag added when swiping here
  if (/[?&]s=/.test(location.search)) {
    try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
  }

  // Slide animations between pages
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
    }
    ${embedded ? "html, body { touch-action: pan-y; }" : ""}`;
  document.head.appendChild(style);

  let arrived = null;
  try { arrived = sessionStorage.getItem("swipeDir"); sessionStorage.removeItem("swipeDir"); } catch (e) {}
  if (arrived && !embedded) {
    const start = () => {
      document.body.classList.add("swipe-in-" + arrived);
      document.body.addEventListener("animationend", () => document.body.classList.remove("swipe-in-" + arrived), { once: true });
    };
    if (document.body) start(); else addEventListener("DOMContentLoaded", start);
  }

  let leaving = false;
  function go(step) {
    if (embedded) return send({ type: "step", step });
    if (leaving) return;
    leaving = true;
    const next = ROTATION[(current + step + ROTATION.length) % ROTATION.length];
    const dir = step > 0 ? "left" : "right";
    try { sessionStorage.setItem("swipeDir", dir); } catch (e) {}
    document.body.classList.add("swipe-out-" + dir);
    // A one-time "?s=" tag makes the phone fetch a fresh copy instead of a saved one
    let target = urlFor(next.file);
    if (!isFile) target += "?s=" + Date.now();
    setTimeout(() => { location.href = target; }, 180);
  }

  // Touch: a quick, mostly-horizontal swipe
  let sx = 0, sy = 0, st0 = 0, axis = null;
  addEventListener("touchstart", e => {
    if (e.touches.length !== 1) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; st0 = Date.now(); axis = null;
  }, { passive: true });
  addEventListener("touchmove", e => {
    const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
    if (!axis && Math.abs(dx) + Math.abs(dy) > 10) axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    if (axis === "x" && embedded) send({ type: "drag", dx });
  }, { passive: true });
  addEventListener("touchend", e => {
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy, ms = Date.now() - st0;
    if (embedded) { if (axis === "x") send({ type: "release", dx, ms }); }
    else if (ms < 700 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    axis = null;
  }, { passive: true });

  // Trackpad: a two-finger sideways swipe
  let wheelX = 0, wheelLock = 0, wheelReset;
  addEventListener("wheel", e => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    const now = Date.now();
    if (now < wheelLock) return;
    wheelX += e.deltaX;
    if (Math.abs(wheelX) > 80) { go(wheelX > 0 ? 1 : -1); wheelX = 0; wheelLock = now + 700; }
    clearTimeout(wheelReset); wheelReset = setTimeout(() => wheelX = 0, 200);
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
