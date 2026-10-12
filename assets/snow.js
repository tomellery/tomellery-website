// Live conditions for the mountains (weather model data from open-meteo.com, free, no key needed).
// This is mountain weather, not the resorts' official snow reports.
//
//   <span data-snow></span>               -> Brighton, full:  "BRIGHTON · 6″ NEW · 24°F"
//   <span data-snow="short"></span>       -> Brighton, short: "BRIGHTON · 6″ NEW" or "BRIGHTON · 38°F"
//   <div data-snow-strip></div>           -> every mountain, as a slowly drifting row of stacked cells
//   <div data-snow-grid></div>            -> every mountain, as a board (add ="local" for Utah only)
//   <div data-snow-ticker></div>          -> every mountain, as a one-line scrolling ticker
//
// Anything wrapped in data-snow-wrap stays hidden until the data arrives (and if it never does).
(function () {
  // To add a mountain: name, short name (for small spaces), state, latitude, longitude, base elevation in meters.
  // Brighton (home mountain) goes first.
  const MOUNTAINS = [
    // Utah
    ["Brighton",          "Brighton",     "UT", 40.598, -111.583, 2669],
    ["Solitude",          "Solitude",     "UT", 40.620, -111.592, 2442],
    ["Alta",              "Alta",         "UT", 40.588, -111.638, 2600],
    ["Snowbird",          "Snowbird",     "UT", 40.581, -111.657, 2365],
    ["Park City",         "Park City",    "UT", 40.651, -111.508, 2103],
    ["Deer Valley",       "Deer Valley",  "UT", 40.637, -111.478, 2003],
    ["Snowbasin",         "Snowbasin",    "UT", 41.216, -111.857, 1951],
    ["Powder Mountain",   "Powder Mtn",   "UT", 41.379, -111.781, 2100],
    ["Sundance",          "Sundance",     "UT", 40.393, -111.588, 1859],
    // The OGs
    ["Bear Mountain",     "Bear Mtn",     "CA", 34.227, -116.860, 2195],
    ["Mammoth Mountain",  "Mammoth",      "CA", 37.651, -119.027, 2424],
    ["Palisades Tahoe",   "Palisades",    "CA", 39.197, -120.235, 1890],
    ["Big Sky",           "Big Sky",      "MT", 45.286, -111.401, 2286],
    ["Jackson Hole",      "Jackson Hole", "WY", 43.588, -110.828, 1924],
  ];
  const [NAME, SHORT, STATE, LAT, LON, ELEV] = [0, 1, 2, 3, 4, 5];
  const col = i => MOUNTAINS.map(m => m[i]).join(",");
  const url = "https://api.open-meteo.com/v1/forecast"
    + `?latitude=${col(LAT)}&longitude=${col(LON)}&elevation=${col(ELEV)}`
    + "&current=temperature_2m&hourly=snowfall&past_days=1&forecast_days=1"
    + "&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=auto";

  // New snow over the last 24 hourly readings, up to the current hour (in each mountain's local time)
  function summarize(d) {
    const hour = d.current.time.slice(0, 13);
    let end = d.hourly.time.findIndex(t => t.slice(0, 13) === hour);
    if (end === -1) end = d.hourly.time.length - 1;
    const snow = d.hourly.snowfall.slice(Math.max(0, end - 23), end + 1).reduce((a, b) => a + (b || 0), 0);
    return { inches: Math.round(snow), temp: Math.round(d.current.temperature_2m) + "°F" };
  }

  const reveal = el => el.closest("[data-snow-wrap]")?.removeAttribute("hidden");

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
  const cell = (m, i) => `
    <div class="snow-cell${m.inches > 0 ? " fresh" : ""}">
      <small>${MOUNTAINS[i][SHORT].toUpperCase()}</small>
      <b>${m.inches}″</b>
      <span>${m.temp}</span>
    </div>`;

  fetch(url)
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(list => {
      const data = (Array.isArray(list) ? list : [list]).map(summarize);

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
        const row = data.map(cell).join("");
        el.innerHTML = `<div class="snow-track">${row}${row}</div>`;
        reveal(el);
        drift(el);
      });

      // Board
      document.querySelectorAll("[data-snow-grid]").forEach(el => {
        const localOnly = el.dataset.snowGrid === "local";
        el.innerHTML = data.map((m, i) => (!localOnly || MOUNTAINS[i][STATE] === "UT") ? cell(m, i) : "").join("");
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
