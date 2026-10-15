// Live conditions for the mountains. This is mountain weather, not the resorts' official snow reports.
// The numbers come ready-made from the site's Cloudflare Worker (worker/scores.js), which refreshes them every 15 minutes:
// 24h / 7-day snow and temperature from the open-meteo.com weather model, SEASON from SNOTEL snow sensors.
// The mountain list is in assets/feeds.json.
//
//   <span data-snow></span>               -> Brighton, full:  "BRIGHTON · 6″ NEW · 24°F"
//   <span data-snow="short"></span>       -> Brighton, short: "BRIGHTON · 6″ NEW" or "BRIGHTON · 38°F"
//   <div data-snow-strip></div>           -> every mountain, as a slowly drifting row of stacked cells
//   <div data-snow-grid></div>            -> every mountain, as a board (add ="local" for Utah only)
//   <div data-snow-boards></div>          -> swipeable 3x3 boards, one per group (Utah, The OGs, ...)
//   <div data-snow-ticker></div>          -> every mountain, as a one-line scrolling ticker
//
// Anything wrapped in data-snow-wrap stays hidden until the data arrives (and if it never does).
(function () {
  const API = "https://tomellery-scores.tomellery1818.workers.dev/snow";

  // Which number the boards show (default "week"): "day" (big = last 24 hours), "week" (big = last 7 days, "+X TODAY" below)
  // or "season" (big = estimated season total, "+X 7 DAYS" below).
  // Remembered per visitor; the 24 HR / 7 DAY / SEASON buttons are any element with data-snow-mode.
  let mode = "week";
  try { mode = localStorage.getItem("te-snow-mode") || "week"; } catch (e) {}

  const reveal = el => el.closest("[data-snow-wrap]")?.removeAttribute("hidden");

  // ===== Secret: faint snow falls across the page when it's snowing at Brighton right now =====
  // Dark mode only (hidden in light mode, including ?snow). Preview it any time with ?snow in the address (e.g. tomellery.com/?snow).
  const forceSnow = /[?&]snow(=|&|$)/.test(location.search);
  let snowing = false;
  function letItSnow() {
    if (snowing || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    snowing = true;
    const c = document.createElement("canvas");
    c.setAttribute("aria-hidden", "true");
    c.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:40;opacity:0;transition:opacity 3s";
    document.body.appendChild(c);
    const ctx = c.getContext("2d");
    let W, H, flakes;
    const flake = top => ({ x: Math.random() * W, y: top ? -10 : Math.random() * H, r: Math.random() * 2 + .7,
      a: Math.random() * .4 + .3, vy: Math.random() * 35 + 18, p: Math.random() * 6, sway: Math.random() * 16 + 4 });
    const size = () => {
      const dpr = devicePixelRatio || 1;
      W = innerWidth; H = innerHeight; c.width = W * dpr; c.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      flakes = Array.from({ length: Math.round(W / 5) }, () => flake(false));
    };
    size(); addEventListener("resize", size);
    // Dark mode only: hide (and stop drawing) whenever the page is in light mode, even if it switches mid-visit
    const html = document.documentElement;
    const syncTheme = () => { c.hidden = html.dataset.theme === "light"; };
    syncTheme();
    new MutationObserver(syncTheme).observe(html, { attributes: true, attributeFilter: ["data-theme"] });
    requestAnimationFrame(() => { c.style.opacity = "1"; });
    let last = performance.now();
    (function fall(now) {
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      requestAnimationFrame(fall);
      if (c.hidden) return;
      ctx.clearRect(0, 0, W, H);
      flakes.forEach((f, i) => {
        f.y += f.vy * dt; f.p += dt;
        ctx.globalAlpha = f.a; ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(f.x + Math.sin(f.p) * f.sway, f.y, f.r, 0, 7); ctx.fill();
        if (f.y > H + 10) flakes[i] = flake(true);
      });
    })(last);
  }
  function maybeSnow(isSnowingAtBrighton) {
    const run = () => letItSnow();
    if (!forceSnow && !isSnowingAtBrighton) return;
    if (document.body) run(); else addEventListener("DOMContentLoaded", run);
  }
  if (forceSnow) maybeSnow(true);

  // Let people swipe/drag the strip; when nobody is touching it, it drifts slowly and loops.
  function drift(el) {
    const SPEED = 23;      // pixels per second (about one mountain every 4.5 seconds)
    const RESUME = 2500;   // wait this long after someone lets go before drifting again
    let pos = 0, last = performance.now(), busyUntil = 0, dragging = false, dragX = 0, dragStart = 0;
    const half = () => el.scrollWidth / 2;
    const hold = () => { busyUntil = Infinity; };
    const release = () => { busyUntil = performance.now() + RESUME; };

    el.addEventListener("touchstart", hold, { passive: true });
    el.addEventListener("touchend", release, { passive: true });
    el.addEventListener("touchcancel", release, { passive: true });
    el.addEventListener("wheel", () => { busyUntil = performance.now() + RESUME; }, { passive: true });
    if (matchMedia("(hover: hover)").matches) { // computers: pause while the mouse is over it
      el.addEventListener("mouseenter", hold);
      el.addEventListener("mouseleave", () => { dragging = false; release(); });
    }

    // Mouse: click and drag sideways
    el.addEventListener("pointerdown", e => {
      if (e.pointerType !== "mouse") return;
      dragging = true; dragX = e.clientX; dragStart = el.scrollLeft; el.classList.add("grabbing");
    });
    addEventListener("pointermove", e => { if (dragging) el.scrollLeft = dragStart - (e.clientX - dragX); });
    addEventListener("pointerup", () => { if (dragging) { dragging = false; el.classList.remove("grabbing"); } });

    // Keep looping when someone scrolls past either end
    el.addEventListener("scroll", () => {
      if (el.scrollLeft >= half()) el.scrollLeft -= half();
      else if (el.scrollLeft <= 0 && busyUntil > performance.now()) el.scrollLeft += half();
    }, { passive: true });

    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    (function step(now) {
      const dt = Math.min(.1, (now - last) / 1000); last = now;
      if (now > busyUntil) {
        if (Math.abs(el.scrollLeft - pos) > 2) pos = el.scrollLeft; // pick up where a swipe left off
        pos += SPEED * dt;
        if (pos >= half()) pos -= half();
        el.scrollLeft = pos;
      }
      requestAnimationFrame(step);
    })(last);
  }
  const seasonCell = m => {
    // null = no snow sensor nearby. The 7-day number comes from a different source (weather model),
    // so never show a season smaller than it.
    const big = m.season == null ? "—" : Math.max(m.season, m.week) + "″";
    // Orange = fresh: the season number lights up when the mountain got snow this week
    return `
    <div class="snow-cell${m.week > 0 ? " fresh" : ""}">
      <small>${m.short.toUpperCase()}</small>
      <b>${big}</b>
      <em class="today${m.week > 0 ? " fresh" : ""}">+${m.week}″ 7 DAYS</em>
      <span>${m.temp}</span>
    </div>`;
  };
  const cell = (m, view = "day") => view === "season" ? seasonCell(m) : view === "week" ? `
    <div class="snow-cell${m.week > 0 ? " fresh" : ""}">
      <small>${m.short.toUpperCase()}</small>
      <b>${m.week}″</b>
      <em class="today${m.inches > 0 ? " fresh" : ""}">+${m.inches}″ TODAY</em>
      <span>${m.temp}</span>
    </div>` : `
    <div class="snow-cell${m.inches > 0 ? " fresh" : ""}">
      <small>${m.short.toUpperCase()}</small>
      <b>${m.inches}″</b>
      <span>${m.temp}</span>
    </div>`;

  fetch(API)
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(feed => {
      const data = feed.mountains;

      // Let it snow on the page only while it's actually snowing at Brighton (first mountain) right now
      maybeSnow(feed.snowingAtHome);

      // Brighton readouts
      const b = data[0];
      const full = b.inches > 0 ? `BRIGHTON · ${b.inches}″ NEW · ${b.temp}` : `BRIGHTON · NO NEW SNOW · ${b.temp}`;
      const short = b.inches > 0 ? `BRIGHTON · ${b.inches}″ NEW` : `BRIGHTON · ${b.temp}`;
      document.querySelectorAll("[data-snow]").forEach(el => {
        el.textContent = el.dataset.snow === "short" ? short : full;
        reveal(el);
      });

      // Swipeable row of stacked cells that slowly drifts on its own (doubled so the loop is seamless)
      document.querySelectorAll("[data-snow-strip]").forEach(el => {
        const row = data.map(m => cell(m)).join("");
        el.innerHTML = `<div class="snow-track">${row}${row}</div>`;
        reveal(el);
        drift(el);
      });

      // Swipeable 3x3 boards, one per group, with dots
      document.querySelectorAll("[data-snow-boards]").forEach(el => {
        const groups = [...new Set(data.map(m => m.board))];
        el.innerHTML = `<div class="snow-pages">${groups.map(g => `
          <section class="snow-page" aria-label="${g}">
            <h3>${g.toUpperCase()}</h3>
            <div class="snow-grid" data-board="${g}"></div>
          </section>`).join("")}</div>
          <div class="snow-dots">${groups.map((g, i) => `<button type="button" aria-label="Show ${g}"${i ? "" : ' aria-current="true"'}><i></i></button>`).join("")}</div>
          <p class="snow-note" hidden>SEASON = ESTIMATE SINCE OCT 1 FROM SNOTEL SNOW SENSORS · NOT OFFICIAL RESORT TOTALS</p>`;
        const fill = () => {
          el.querySelectorAll(".snow-grid").forEach(grid => {
            grid.innerHTML = data.map(m => m.board === grid.dataset.board ? cell(m, mode) : "").join("");
          });
          el.querySelector(".snow-note").hidden = mode !== "season";
        };
        fill();
        document.querySelectorAll("[data-snow-mode]").forEach(btn => {
          btn.setAttribute("aria-pressed", btn.dataset.snowMode === mode);
          btn.addEventListener("click", () => {
            mode = btn.dataset.snowMode;
            try { localStorage.setItem("te-snow-mode", mode); } catch (e) {}
            document.querySelectorAll("[data-snow-mode]").forEach(b => b.setAttribute("aria-pressed", b.dataset.snowMode === mode));
            fill();
          });
        });
        const pages = el.querySelector(".snow-pages"), dots = [...el.querySelectorAll(".snow-dots button")];
        const mark = n => dots.forEach((d, i) => d.setAttribute("aria-current", i === n ? "true" : "false"));
        dots.forEach((d, i) => d.addEventListener("click", () => {
          mark(i);
          pages.scrollTo({ left: i * pages.clientWidth, behavior: "smooth" });
        }));
        const sync = () => mark(Math.round(pages.scrollLeft / pages.clientWidth));
        let syncTimer;
        pages.addEventListener("scroll", () => { clearTimeout(syncTimer); syncTimer = setTimeout(sync, 80); }, { passive: true });
        pages.addEventListener("scrollend", sync);
        reveal(el);
      });

      // Board
      document.querySelectorAll("[data-snow-grid]").forEach(el => {
        const localOnly = el.dataset.snowGrid === "local";
        el.innerHTML = data.map(m => (!localOnly || m.board === "Utah") ? cell(m) : "").join("");
        reveal(el);
      });

      // One-line ticker
      document.querySelectorAll("[data-snow-ticker]").forEach(el => {
        const items = data.map(m => {
          const snow = m.inches > 0 ? `<em>${m.inches}″ NEW</em>` : "NO NEW SNOW";
          return `<span><b>${m.name.toUpperCase()}</b> ${snow} · ${m.temp}</span><i>●</i>`;
        }).join("");
        el.innerHTML = `<span class="label">❄ LAST 24 HRS</span><i>●</i>` + items;
        el.innerHTML += el.innerHTML;
        reveal(el);
      });
    })
    .catch(() => {});
})();
