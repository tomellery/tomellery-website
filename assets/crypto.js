// Crypto ticker band, like a stock ticker. Fills any element with data-crypto-ticker.
// Prices, 24h change and coin logos from CoinGecko (free, no key), refreshed every 2 minutes.
// If it can't be reached, the band stays hidden; a missed refresh keeps the last good numbers.
// Swipe or drag it to scroll; let go and it drifts again. Hover (computers) pauses it.
(function () {
  // To add a coin: [ticker symbol, CoinGecko id]. "TOTAL" = total crypto market cap (from CoinGecko's global stats).
  // The first few are what people see when they reach the band, so the favorites go first.
  const COINS = [
    ["LINK", "chainlink"], ["TOTAL", "total"], ["BTC", "bitcoin"], ["ETH", "ethereum"],
    ["SOL", "solana"], ["SUI", "sui"], ["LTC", "litecoin"], ["DOGE", "dogecoin"], ["WIF", "dogwifcoin"], ["BONK", "bonk"],
  ];
  const ids = COINS.map(c => c[1]).filter(id => id !== "total").join(",");
  const marketsUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h`;
  const globalUrl = "https://api.coingecko.com/api/v3/global";
  // Icon for TOTAL (a small stack of coins)
  const TOTAL_ICON = "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><g fill="#ff5a1f" stroke="#0d0d0d" stroke-width=".8">
      <ellipse cx="8" cy="11.5" rx="6" ry="2.5"/><ellipse cx="8" cy="8" rx="6" ry="2.5"/><ellipse cx="8" cy="4.5" rx="6" ry="2.5"/></g></svg>`);

  // Tiny prices (like BONK) use the crypto-chart style $0.0₅347 = $0.00000347 (the small 5 = five zeros)
  // The small number is a <sub> tag, so it works in any font.
  function tiny(n) {
    const zeros = Math.ceil(-Math.log10(n)) - 1;               // zeros right after the decimal point
    const digits = Math.round(n * Math.pow(10, zeros + 3));    // the next 3 significant digits
    return `0.0<sub>${zeros}</sub>${digits}`;
  }
  const price = n => "$" + (n >= 1e12 ? (n / 1e12).toFixed(2) + "T"
    : n >= 1e9 ? (n / 1e9).toFixed(1) + "B"
    : n >= 1000 ? Math.round(n).toLocaleString("en-US")
    : n >= 1 ? n.toFixed(2)
    : n >= 0.0001 ? n.toFixed(4)
    : tiny(n));

  function render(el, d) {
    const items = COINS.filter(([, id]) => d[id]).map(([sym, id]) => {
      const c = d[id], ch = c.change || 0, dir = ch >= 0 ? "up" : "down";
      const logo = c.image ? `<img src="${c.image}" alt="" width="14" height="14" decoding="async">` : "";
      return `<div class="coin"><small>${logo}${sym}</small><b>${price(c.price)}</b><em class="${dir}">${ch >= 0 ? "▲" : "▼"}${Math.abs(ch).toFixed(1)}%</em></div>`;
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
    const SPEED = 30, RESUME = 1500; // resume drifting this long (ms) after someone lets go
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
    // Hold still at the start until the band is actually on screen, so people see the first coins
    let seen = false;
    new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting) && !seen) { seen = true; busyUntil = performance.now() + 1000; }
    }, { threshold: .6 }).observe(el);
    busyUntil = Infinity;
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

  // Keep the last good numbers so a missed refresh (e.g. the free service being busy) never blanks a coin.
  // They're also remembered in this browser for up to an hour, so the band shows up right away on the next visit
  // (even if CoinGecko is busy), and the live numbers replace them as soon as they arrive.
  const CACHE = "te-crypto", CACHE_MAX_AGE = 60 * 60 * 1000;
  let lastCoins = null, lastTotal = null, retried = false, misses = 0;
  const showAll = () => {
    const all = Object.assign({}, lastCoins, lastTotal ? { total: lastTotal } : {});
    document.querySelectorAll("[data-crypto-ticker]").forEach(el => render(el, all));
  };
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE) || "null");
    if (saved && Date.now() - saved.t < CACHE_MAX_AGE && saved.coins) { lastCoins = saved.coins; lastTotal = saved.total; showAll(); }
  } catch (e) {}
  function update() {
    const getJSON = u => fetch(u).then(r => r.ok ? r.json() : Promise.reject(r.status));
    Promise.all([getJSON(marketsUrl).catch(() => null), getJSON(globalUrl).catch(() => null)])
      .then(([markets, g]) => {
        const fresh = Array.isArray(markets) && markets.length;
        if (fresh) {
          lastCoins = {};
          markets.forEach(m => { lastCoins[m.id] = { price: m.current_price, change: m.price_change_percentage_24h, image: m.image }; });
        }
        if (g && g.data) lastTotal = { price: g.data.total_market_cap.usd, change: g.data.market_cap_change_percentage_24h_usd, image: TOTAL_ICON };
        // Prices didn't come through: try again soon (15s, 30s, 60s) instead of waiting for the next 2-minute refresh
        if (!fresh && misses < 3) setTimeout(update, 15000 * Math.pow(2, misses++));
        if (fresh) {
          misses = 0;
          try { localStorage.setItem(CACHE, JSON.stringify({ t: Date.now(), coins: lastCoins, total: lastTotal })); } catch (e) {}
        }
        if (!lastCoins) return;
        showAll();
        if (!lastTotal && !retried) { retried = true; setTimeout(update, 15000); } // try TOTAL again soon if it was missed
      });
  }
  update();
  setInterval(update, 120000);
})();
