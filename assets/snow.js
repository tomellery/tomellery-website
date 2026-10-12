// Live conditions at Brighton (weather model data from open-meteo.com, free, no key needed).
// Fills any element with a data-snow attribute, e.g. <span data-snow></span>.
// If the weather service can't be reached, those elements stay hidden.
(function () {
  const BRIGHTON = { lat: 40.598, lon: -111.583, elevationM: 2669 };
  const url = "https://api.open-meteo.com/v1/forecast"
    + `?latitude=${BRIGHTON.lat}&longitude=${BRIGHTON.lon}&elevation=${BRIGHTON.elevationM}`
    + "&current=temperature_2m&hourly=snowfall&past_days=1&forecast_days=1"
    + "&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=America%2FDenver";

  // data-snow="short" gets a compact version, e.g. "BRIGHTON · 6″ NEW" or "BRIGHTON · 38°F"
  function show(full, short) {
    document.querySelectorAll("[data-snow]").forEach(el => {
      el.textContent = el.dataset.snow === "short" ? short : full;
      el.closest("[data-snow-wrap]")?.removeAttribute("hidden");
    });
  }

  fetch(url)
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(d => {
      // Add up the last 24 hourly readings up to the current hour (times are Salt Lake local time)
      const hour = d.current.time.slice(0, 13);
      let end = d.hourly.time.findIndex(t => t.slice(0, 13) === hour);
      if (end === -1) end = d.hourly.time.length - 1;
      const snow = d.hourly.snowfall.slice(Math.max(0, end - 23), end + 1).reduce((a, b) => a + (b || 0), 0);
      const temp = Math.round(d.current.temperature_2m) + "°F";
      const inches = Math.round(snow);
      show(inches > 0 ? `BRIGHTON · ${inches}″ NEW · ${temp}` : `BRIGHTON · NO NEW SNOW · ${temp}`,
           inches > 0 ? `BRIGHTON · ${inches}″ NEW` : `BRIGHTON · ${temp}`);
    })
    .catch(() => {});
})();
