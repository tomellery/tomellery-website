// Live conditions for the local mountains (weather model data from open-meteo.com, free, no key needed).
// This is mountain weather, not the resorts' official snow reports.
//
//   <span data-snow></span>          -> Brighton, full:  "BRIGHTON · 6″ NEW · 24°F"
//   <span data-snow="short"></span>  -> Brighton, short: "BRIGHTON · 6″ NEW" or "BRIGHTON · 38°F"
//   <div data-snow-ticker></div>     -> every mountain, as a scrolling ticker
//   <div data-snow-grid></div>       -> every mountain, as a conditions board (one cell each)
//
// Anything wrapped in data-snow-wrap stays hidden until the data arrives (and if it never does).
(function () {
  // Name, latitude, longitude, base elevation in meters, short name for small spaces.
  // Brighton (home mountain) goes first.
  const MOUNTAINS = [
    ["Brighton",        40.598, -111.583, 2669, "Brighton"],
    ["Solitude",        40.620, -111.592, 2442, "Solitude"],
    ["Alta",            40.588, -111.638, 2600, "Alta"],
    ["Snowbird",        40.581, -111.657, 2365, "Snowbird"],
    ["Park City",       40.651, -111.508, 2103, "Park City"],
    ["Deer Valley",     40.637, -111.478, 2003, "Deer Valley"],
    ["Snowbasin",       41.216, -111.857, 1951, "Snowbasin"],
    ["Powder Mountain", 41.379, -111.781, 2100, "Powder Mtn"],
    ["Sundance",        40.393, -111.588, 1859, "Sundance"],
  ];
  const col = i => MOUNTAINS.map(m => m[i]).join(",");
  const url = "https://api.open-meteo.com/v1/forecast"
    + `?latitude=${col(1)}&longitude=${col(2)}&elevation=${col(3)}`
    + "&current=temperature_2m&hourly=snowfall&past_days=1&forecast_days=1"
    + "&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=America%2FDenver";

  // New snow over the last 24 hourly readings, up to the current hour (times are Salt Lake local time)
  function summarize(d) {
    const hour = d.current.time.slice(0, 13);
    let end = d.hourly.time.findIndex(t => t.slice(0, 13) === hour);
    if (end === -1) end = d.hourly.time.length - 1;
    const snow = d.hourly.snowfall.slice(Math.max(0, end - 23), end + 1).reduce((a, b) => a + (b || 0), 0);
    return { inches: Math.round(snow), temp: Math.round(d.current.temperature_2m) + "°F" };
  }

  function reveal(el) { el.closest("[data-snow-wrap]")?.removeAttribute("hidden"); }

  fetch(url)
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(list => {
      const data = (Array.isArray(list) ? list : [list]).map(summarize);

      const b = data[0];
      const full = b.inches > 0 ? `BRIGHTON · ${b.inches}″ NEW · ${b.temp}` : `BRIGHTON · NO NEW SNOW · ${b.temp}`;
      const short = b.inches > 0 ? `BRIGHTON · ${b.inches}″ NEW` : `BRIGHTON · ${b.temp}`;
      document.querySelectorAll("[data-snow]").forEach(el => {
        el.textContent = el.dataset.snow === "short" ? short : full;
        reveal(el);
      });

      document.querySelectorAll("[data-snow-ticker]").forEach(el => {
        const items = data.map((m, i) => {
          const snow = m.inches > 0 ? `<em>${m.inches}″ NEW</em>` : "NO NEW SNOW";
          return `<span><b>${MOUNTAINS[i][0].toUpperCase()}</b> ${snow} · ${m.temp}</span><i>●</i>`;
        }).join("");
        el.innerHTML = `<span class="label">❄ LAST 24 HRS</span><i>●</i>` + items;
        el.innerHTML += el.innerHTML; // doubled so the scroll loops seamlessly
        reveal(el);
      });

      document.querySelectorAll("[data-snow-grid]").forEach(el => {
        el.innerHTML = data.map((m, i) => `
          <div class="snow-cell${m.inches > 0 ? " fresh" : ""}">
            <small>${MOUNTAINS[i][4].toUpperCase()}</small>
            <b>${m.inches}″</b>
            <span>${m.temp}</span>
          </div>`).join("");
        reveal(el);
      });
    })
    .catch(() => {});
})();
