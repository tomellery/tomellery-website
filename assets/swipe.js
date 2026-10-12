// The swipe rotation. To change the order, edit this list.
// On tomellery.com the designs sit side by side in a carousel (see index.html);
// opened on their own, swiping jumps to the carousel at the next design.
(function () {
  const ROTATION = [
    { id: "liftticket",   file: "designs/liftticket.html",   title: "Lift Ticket" },
    { id: "trailsigns",   file: "designs/trailsigns.html",   title: "Trail Signs" },
    { id: "monolith",     file: "designs/monolith.html",     title: "Monolith" },
    { id: "jobsite",      file: "designs/jobsite.html",      title: "Job Site" },
    { id: "fieldbook",    file: "designs/fieldbook.html",    title: "Field Book" },
    { id: "businesscard", file: "designs/businesscard.html", title: "Business Card" },
  ];
  window.TE_ROTATION = ROTATION;
  if (window.TE_CAROUSEL) return; // the carousel page only needs the list

  const root = new URL("../", document.currentScript.src);
  const here = location.href.split(/[?#]/)[0];
  const current = ROTATION.findIndex(r => new URL(r.file, root).href === here);
  if (current === -1) return;

  // Inside the carousel: report gestures to it instead of changing pages
  let embedded = false;
  try { embedded = window.parent !== window && !!window.parent.TE_CAROUSEL; } catch (e) {}
  const send = msg => window.parent.postMessage(Object.assign({ te: "swipe" }, msg), location.origin === "null" ? "*" : location.origin);

  function go(step) {
    if (embedded) return send({ type: "step", step });
    const next = ROTATION[(current + step + ROTATION.length) % ROTATION.length];
    const home = location.protocol === "file:" ? new URL("index.html", root).href : root.href;
    location.href = home + "#" + next.id;
  }

  // Touch: follow the finger sideways, let vertical scrolling work normally
  if (embedded) {
    const st = document.createElement("style");
    st.textContent = "html, body { touch-action: pan-y; }";
    document.head.appendChild(st);
    // Room at the bottom so the carousel's dots never cover the end of the page
    const spacer = document.createElement("div");
    spacer.style.cssText = "height: 56px; flex-shrink: 0;";
    spacer.setAttribute("aria-hidden", "true");
    const addSpacer = () => document.body.appendChild(spacer);
    if (document.body) addSpacer(); else addEventListener("DOMContentLoaded", addSpacer);
  }
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
  function end(e) {
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy, ms = Date.now() - st0;
    if (embedded) { if (axis === "x") send({ type: "release", dx, ms }); }
    else if (ms < 700 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    axis = null;
  }
  addEventListener("touchend", end, { passive: true });
  addEventListener("touchcancel", e => { if (embedded && axis === "x") send({ type: "release", dx: 0, ms: 9999 }); axis = null; });

  // Keyboard: left/right arrows
  addEventListener("keydown", e => {
    if (e.target.closest && e.target.closest("input, textarea")) return;
    if (e.key === "ArrowRight") go(1);
    if (e.key === "ArrowLeft") go(-1);
  });
})();
