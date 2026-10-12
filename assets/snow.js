// Live conditions for the mountains (weather model data from open-meteo.com, free, no key needed).
// This is mountain weather, not the resorts' official snow reports.
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
  // To add a mountain: board, name, short name (for small spaces), state, latitude, longitude, base elevation in meters.
  // Each board shows up to 9 (a 3x3). Brighton (home mountain) goes first.
  const MOUNTAINS = [
    ["Utah",     "Brighton",          "Brighton",     "UT", 40.598, -111.583, 2669],
    ["Utah",     "Solitude",          "Solitude",     "UT", 40.620, -111.592, 2442],
    ["Utah",     "Alta",              "Alta",         "UT", 40.588, -111.638, 2600],
    ["Utah",     "Snowbird",          "Snowbird",     "UT", 40.581, -111.657, 2365],
    ["Utah",     "Park City",         "Park City",    "UT", 40.651, -111.508, 2103],
    ["Utah",     "Deer Valley",       "Deer Valley",  "UT", 40.637, -111.478, 2003],
    ["Utah",     "Snowbasin",         "Snowbasin",    "UT", 41.216, -111.857, 1951],
    ["Utah",     "Powder Mountain",   "Powder Mtn",   "UT", 41.379, -111.781, 2100],
    ["Utah",     "Sundance",          "Sundance",     "UT", 40.393, -111.588, 1859],
    ["The OGs",  "Bear Mountain",     "Bear Mtn",     "CA", 34.227, -116.860, 2195],
    ["The OGs",  "Mammoth Mountain",  "Mammoth",      "CA", 37.651, -119.027, 2424],
    ["The OGs",  "Palisades Tahoe",   "Palisades",    "CA", 39.197, -120.235, 1890],
    ["The OGs",  "Big Sky",           "Big Sky",      "MT", 45.286, -111.401, 2286],
    ["The OGs",  "Jackson Hole",      "Jackson Hole", "WY", 43.588, -110.828, 1924],
    ["The OGs",  "Whistler Blackcomb","Whistler",     "BC", 50.115, -122.948, 1100],
    ["The OGs",  "Vail",              "Vail",         "CO", 39.640, -106.374, 2476],
    ["The OGs",  "Telluride",         "Telluride",    "CO", 37.937, -107.812, 2659],
    ["The OGs",  "Mt. Baker",         "Mt. Baker",    "WA", 48.857, -121.665, 1080],
  ];
  const [BOARD, NAME, SHORT, STATE, LAT, LON, ELEV] = [0, 1, 2, 3, 4, 5, 6];
  const col = i => MOUNTAINS.map(m => m[i]).join(",");
  const url = "https://api.open-meteo.com/v1/forecast"
    + `?latitude=${col(LAT)}&longitude=${col(LON)}&elevation=${col(ELEV)}`
    + "&current=temperature_2m,snowfall,weather_code&hourly=snowfall&past_days=7&forecast_days=1"
    + "&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=auto";

  // New snow over the last 24 hours and the last 7 days, up to the current hour (in each mountain's local time)
  function summarize(d) {
    const hour = d.current.time.slice(0, 13);
    let end = d.hourly.time.findIndex(t => t.slice(0, 13) === hour);
    if (end === -1) end = d.hourly.time.length - 1;
    const sum = hours => Math.round(d.hourly.snowfall.slice(Math.max(0, end - hours + 1), end + 1).reduce((a, b) => a + (b || 0), 0));
    return { inches: sum(24), week: sum(24 * 7), temp: Math.round(d.current.temperature_2m) + "°F" };
  }

  // ===== Season totals (estimated) from SNOTEL, the government snow sensors at the mountains =====
  // Weather models badly undercount mountain snow over a season, so SEASON uses real measured precipitation
  // from the nearest SNOTEL sensor, counting only days cold enough to snow (avg <= 34°F), times a 12:1 snow ratio.
  // Mountains without a sensor nearby show "—".
  const SNOTEL = {
    "Brighton": "366:UT:SNTL", "Solitude": "366:UT:SNTL", "Alta": "1308:UT:SNTL", "Snowbird": "766:UT:SNTL",
    "Park City": "814:UT:SNTL", "Deer Valley": "814:UT:SNTL", "Snowbasin": "1300:UT:SNTL", "Powder Mountain": "1300:UT:SNTL",
    "Sundance": "820:UT:SNTL", "Palisades Tahoe": "784:CA:SNTL", "Big Sky": "590:MT:SNTL", "Jackson Hole": "689:WY:SNTL",
    "Vail": "842:CO:SNTL", "Telluride": "1344:CO:SNTL", "Mt. Baker": "909:WA:SNTL",
  };
  const SNOW_RATIO = 12, COLD_F = 34;
  let season = null;               // inches per mountain (same order as MOUNTAINS), null = no sensor
  const onSeason = [];             // things to redraw once season numbers arrive
  (function loadSeason() {
    const today = new Date(), y = today.getFullYear();
    const startYear = today.getMonth() >= 9 ? y : y - 1;                 // season starts Oct 1
    const iso = d => d.toISOString().slice(0, 10);
    const begin = iso(new Date(Date.UTC(startYear, 8, 30)));             // Sep 30, so Oct 1's increase counts
    const triplets = [...new Set(Object.values(SNOTEL))];
    fetch("https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data?stationTriplets=" + triplets.join(",")
      + `&elements=PREC,TAVG&duration=DAILY&beginDate=${begin}&endDate=${iso(today)}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(stations => {
        const total = {};
        stations.forEach(st => {
          const el = {};
          st.data.forEach(e => { el[e.stationElement.elementCode] = Object.fromEntries(e.values.map(v => [v.date, v.value])); });
          const P = el.PREC || {}, T = el.TAVG || {}, days = Object.keys(P).sort();
          let water = 0;
          for (let i = 1; i < days.length; i++) {
            const a = P[days[i - 1]], b = P[days[i]], t = T[days[i]];
            if (a == null || b == null || t == null) continue;
            if (t <= COLD_F) water += Math.max(0, b - a);
          }
          total[st.stationTriplet] = Math.round(water * SNOW_RATIO);
        });
        season = MOUNTAINS.map(m => SNOTEL[m[NAME]] in total ? total[SNOTEL[m[NAME]]] : null);
        onSeason.forEach(fn => fn());
      })
      .catch(() => { season = MOUNTAINS.map(() => null); onSeason.forEach(fn => fn()); });
  })();

  // Which number the boards show (default "week"): "day" (big = last 24 hours), "week" (big = last 7 days, "+X TODAY" below)
  // or "season" (big = estimated season total, "+X 7 DAYS" below).
  // Remembered per visitor; the 24 HR / 7 DAY / SEASON buttons are any element with data-snow-mode.
  let mode = "week";
  try { mode = localStorage.getItem("te-snow-mode") || "week"; } catch (e) {}

  const reveal = el => el.closest("[data-snow-wrap]")?.removeAttribute("hidden");

  // ===== Secret: faint snow falls across the page when it's snowing at Brighton right now =====
  // Only for visitors in dark mode. Preview it any time with ?snow in the address (e.g. tomellery.com/?snow).
  const SNOW_CODES = [71, 73, 75, 77, 85, 86]; // weather codes for snow and snow showers
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
    requestAnimationFrame(() => { c.style.opacity = "1"; });
    let last = performance.now();
    (function fall(now) {
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      ctx.clearRect(0, 0, W, H);
      flakes.forEach((f, i) => {
        f.y += f.vy * dt; f.p += dt;
        ctx.globalAlpha = f.a; ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(f.x + Math.sin(f.p) * f.sway, f.y, f.r, 0, 7); ctx.fill();
        if (f.y > H + 10) flakes[i] = flake(true);
      });
      requestAnimationFrame(fall);
    })(last);
  }
  function maybeSnow(isSnowingAtBrighton) {
    const run = () => letItSnow();
    const go = forceSnow || (isSnowingAtBrighton && matchMedia("(prefers-color-scheme: dark)").matches);
    if (!go) return;
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
  const seasonCell = (m, i) => {
    const v = season ? season[i] : undefined;   // undefined = still loading, null = no sensor nearby
    // The 7-day number comes from a different source (weather model), so never show a season smaller than it
    const big = v === undefined ? "…" : v === null ? "—" : Math.max(v, m.week) + "″";
    // Orange = fresh: the season number lights up when the mountain got snow this week
    return `
    <div class="snow-cell${m.week > 0 ? " fresh" : ""}">
      <small>${MOUNTAINS[i][SHORT].toUpperCase()}</small>
      <b>${big}</b>
      <em class="today${m.week > 0 ? " fresh" : ""}">+${m.week}″ 7 DAYS</em>
      <span>${m.temp}</span>
    </div>`;
  };
  const cell = (m, i, view = "day") => view === "season" ? seasonCell(m, i) : view === "week" ? `
    <div class="snow-cell${m.week > 0 ? " fresh" : ""}">
      <small>${MOUNTAINS[i][SHORT].toUpperCase()}</small>
      <b>${m.week}″</b>
      <em class="today${m.inches > 0 ? " fresh" : ""}">+${m.inches}″ TODAY</em>
      <span>${m.temp}</span>
    </div>` : `
    <div class="snow-cell${m.inches > 0 ? " fresh" : ""}">
      <small>${MOUNTAINS[i][SHORT].toUpperCase()}</small>
      <b>${m.inches}″</b>
      <span>${m.temp}</span>
    </div>`;

  fetch(url)
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(list => {
      const all = Array.isArray(list) ? list : [list];
      const data = all.map(summarize);

      // Let it snow on the page only while it's actually snowing at Brighton (first mountain) right now
      const now = all[0].current;
      maybeSnow((now.snowfall || 0) > 0 || SNOW_CODES.includes(now.weather_code));

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
        const row = data.map((m, i) => cell(m, i)).join("");
        el.innerHTML = `<div class="snow-track">${row}${row}</div>`;
        reveal(el);
        drift(el);
      });

      // Swipeable 3x3 boards, one per group, with dots
      document.querySelectorAll("[data-snow-boards]").forEach(el => {
        const groups = [...new Set(MOUNTAINS.map(m => m[BOARD]))];
        el.innerHTML = `<div class="snow-pages">${groups.map(g => `
          <section class="snow-page" aria-label="${g}">
            <h3>${g.toUpperCase()}</h3>
            <div class="snow-grid" data-board="${g}"></div>
          </section>`).join("")}</div>
          <div class="snow-dots">${groups.map((g, i) => `<button type="button" aria-label="Show ${g}"${i ? "" : ' aria-current="true"'}><i></i></button>`).join("")}</div>
          <p class="snow-note" hidden>SEASON = ESTIMATE SINCE OCT 1 FROM SNOTEL SNOW SENSORS · NOT OFFICIAL RESORT TOTALS</p>`;
        const fill = () => {
          el.querySelectorAll(".snow-grid").forEach(grid => {
            grid.innerHTML = data.map((m, i) => MOUNTAINS[i][BOARD] === grid.dataset.board ? cell(m, i, mode) : "").join("");
          });
          el.querySelector(".snow-note").hidden = mode !== "season";
        };
        fill();
        onSeason.push(() => { if (mode === "season") fill(); });
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
        el.innerHTML = data.map((m, i) => (!localOnly || MOUNTAINS[i][BOARD] === "Utah") ? cell(m, i) : "").join("");
        reveal(el);
      });

      // One-line ticker
      document.querySelectorAll("[data-snow-ticker]").forEach(el => {
        const items = data.map((m, i) => {
          const snow = m.inches > 0 ? `<em>${m.inches}″ NEW</em>` : "NO NEW SNOW";
          return `<span><b>${MOUNTAINS[i][NAME].toUpperCase()}</b> ${snow} · ${m.temp}</span><i>●</i>`;
        }).join("");
        el.innerHTML = `<span class="label">❄ LAST 24 HRS</span><i>●</i>` + items;
        el.innerHTML += el.innerHTML;
        reveal(el);
      });
    })
    .catch(() => {});
})();
