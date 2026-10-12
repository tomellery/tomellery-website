// Swipe (phones) or arrow keys (computers) to move between the link page designs.
// Order: Lift Ticket (home) -> Trail Signs -> Blueprint -> Classic -> back to Lift Ticket.
(function () {
  const PAGES = ["index.html", "options/design-trailsigns.html", "options/design-blueprint.html", "options/design-classic.html"];

  const inOptions = location.pathname.includes("/options/");
  const prefix = inOptions ? "../" : "";
  const path = location.pathname.endsWith("/") ? location.pathname + "index.html" : location.pathname;
  const current = PAGES.findIndex(p =>
    p === "index.html" ? !inOptions && path.endsWith("/index.html") : path.endsWith("/" + p));
  if (current === -1) return;

  // Slide-in when arriving from a swipe
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
    const next = (current + step + PAGES.length) % PAGES.length;
    const dir = step > 0 ? "left" : "right";
    try { sessionStorage.setItem("swipeDir", dir); } catch (e) {}
    document.body.classList.add("swipe-out-" + dir);
    // On the real site, link home as the plain folder ("tomellery.com/") so it matches the
    // address people type and can't show a stale saved copy of "/index.html".
    let target = prefix + PAGES[next];
    if (PAGES[next] === "index.html" && location.protocol !== "file:") target = prefix || "./";
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
