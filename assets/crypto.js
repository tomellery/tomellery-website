// Crypto ticker ribbon, like a stock ticker. Fills any element with data-crypto-ticker.
// Prices from CoinGecko (free, no key), refreshed every 2 minutes. If it can't be reached, the ribbon stays hidden.
// Swipe or drag it to scroll; let go and it drifts again. Hover (computers) pauses it.
(function () {
  // To add a coin: [ticker symbol, CoinGecko id]. "TOTAL" = total crypto market cap (from CoinGecko's global stats).
  const COINS = [
    ["BTC", "bitcoin"], ["ETH", "ethereum"], ["SOL", "solana"], ["SUI", "sui"],
    ["LTC", "litecoin"], ["DOGE", "dogecoin"], ["WIF", "dogwifcoin"], ["TOTAL", "total"],
  ];
  const url = "https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&include_24hr_change=true&ids="
    + COINS.map(c => c[1]).filter(id => id !== "total").join(",");
  const globalUrl = "https://api.coingecko.com/api/v3/global";

  const price = n => "$" + (n >= 1e12 ? (n / 1e12).toFixed(2) + "T"
    : n >= 1e9 ? (n / 1e9).toFixed(1) + "B"
    : n >= 1000 ? Math.round(n).toLocaleString("en-US")
    : n >= 1 ? n.toFixed(2) : n.toFixed(4));

  function render(el, d) {
    const items = COINS.filter(([, id]) => d[id]).map(([sym, id]) => {
      const ch = d[id].usd_24h_change || 0;
      const dir = ch >= 0 ? "up" : "down";
      return `<div class="coin"><small>${sym}</small><b>${price(d[id].usd)}</b><em class="${dir}">${ch >= 0 ? "▲" : "▼"}${Math.abs(ch).toFixed(1)}%</em></div>`;
    }).join("");
    if (!items) return;
    const keep = el.querySelector(".crypto-track") ? el.scrollLeft : 0;
    el.innerHTML = `<div class="crypto-track">${items}${items}</div>`; // doubled so the loop is seamless
    el.scrollLeft = keep;
    el.closest("[data-crypto-wrap]")?.removeAttribute("hidden");
    if (!el.dataset.drifting) { el.dataset.drifting = "1"; drift(el); }
  }

  // Slow drift that loops; pauses while touched, dragged or hovered
  function drift(el) {
    const SPEED = 30, RESUME = 2500;
    let pos = el.scrollLeft, last = performance.now(), busyUntil = 0, dragging = false, dragX = 0, dragStart = 0;
    const half = () => el.scrollWidth / 2;
    const hold = () => { busyUntil = Infinity; };
    const release = () => { busyUntil = performance.now() + RESUME; };
    el.addEventListener("touchstart", hold, { passive: true });
    el.addEventListener("touchend", release, { passive: true });
    el.addEventListener("touchcancel", release, { passive: true });
    el.addEventListener("wheel", release, { passive: true });
    if (matchMedia("(hover: hover)").matches) {
      el.addEventListener("mouseenter", hold);
      el.addEventListener("mouseleave", () => { dragging = false; release(); });
    }
    el.addEventListener("pointerdown", e => {
      if (e.pointerType !== "mouse") return;
      dragging = true; dragX = e.clientX; dragStart = el.scrollLeft; el.classList.add("grabbing");
    });
    addEventListener("pointermove", e => { if (dragging) el.scrollLeft = dragStart - (e.clientX - dragX); });
    addEventListener("pointerup", () => { if (dragging) { dragging = false; el.classList.remove("grabbing"); } });
    el.addEventListener("scroll", () => {
      if (el.scrollLeft >= half()) el.scrollLeft -= half();
      else if (el.scrollLeft <= 0 && busyUntil > performance.now()) el.scrollLeft += half();
    }, { passive: true });

    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    (function step(now) {
      const dt = Math.min(.1, (now - last) / 1000); last = now;
      if (now > busyUntil) {
        if (Math.abs(el.scrollLeft - pos) > 2) pos = el.scrollLeft;
        pos += SPEED * dt;
        if (pos >= half()) pos -= half();
        el.scrollLeft = pos;
      }
      requestAnimationFrame(step);
    })(last);
  }

  // Keep the last good numbers so a missed refresh (e.g. the free service being busy) never blanks a coin
  let lastPrices = null, lastTotal = null;
  function update() {
    const getJSON = u => fetch(u).then(r => r.ok ? r.json() : Promise.reject(r.status));
    Promise.all([getJSON(url).catch(() => null), getJSON(globalUrl).catch(() => null)])
      .then(([d, g]) => {
        if (d) lastPrices = d;
        if (g && g.data) lastTotal = { usd: g.data.total_market_cap.usd, usd_24h_change: g.data.market_cap_change_percentage_24h_usd };
        if (!lastPrices) return;
        const all = Object.assign({}, lastPrices, lastTotal ? { total: lastTotal } : {});
        document.querySelectorAll("[data-crypto-ticker]").forEach(el => render(el, all));
        if (!lastTotal) setTimeout(retryTotal, 15000); // try TOTAL again soon if it was missed
      });
  }
  let retried = false;
  function retryTotal() { if (!retried) { retried = true; update(); } }
  update();
  setInterval(update, 120000);
})();
