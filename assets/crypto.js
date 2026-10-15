// Crypto ticker band, like a stock ticker. Fills any element with data-crypto-ticker.
// Prices, 24h change and coin logos come from CoinGecko by way of the site's Cloudflare Worker (worker/scores.js),
// which asks CoinGecko every 15 minutes and hands every visitor the same saved answer.
// The coin list is in assets/feeds.json. If prices can't be reached, the band stays hidden.
// Swipe or drag it to scroll; let go and it drifts again. Hover (computers) pauses it.
(function () {
  const API = "https://tomellery-scores.tomellery1818.workers.dev/crypto";
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

  function render(el, coins) {
    const items = coins.map(c => {
      const ch = c.change || 0, dir = ch >= 0 ? "up" : "down", image = c.id === "total" ? TOTAL_ICON : c.image;
      const logo = image ? `<img src="${image}" alt="" width="14" height="14" decoding="async">` : "";
      return `<div class="coin"><small>${logo}${c.sym}</small><b>${price(c.price)}</b><em class="${dir}">${ch >= 0 ? "▲" : "▼"}${Math.abs(ch).toFixed(1)}%</em></div>`;
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

  // The last prices are remembered in this browser for up to an hour, so the band shows up right away on the next visit,
  // and the Worker's numbers replace them as soon as they arrive. A missed refresh keeps the last good numbers.
  const CACHE = "te-crypto", CACHE_MAX_AGE = 60 * 60 * 1000;
  const REFRESH = 15 * 60 * 1000; // the Worker gets new prices every 15 minutes
  let misses = 0;
  const showAll = coins => document.querySelectorAll("[data-crypto-ticker]").forEach(el => render(el, coins));
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE) || "null");
    if (saved && Date.now() - saved.t < CACHE_MAX_AGE && Array.isArray(saved.coins)) showAll(saved.coins);
  } catch (e) {}
  function update() {
    fetch(API)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(feed => {
        if (!feed.coins || !feed.coins.length) return Promise.reject("empty");
        misses = 0;
        try { localStorage.setItem(CACHE, JSON.stringify({ t: feed.t, coins: feed.coins })); } catch (e) {}
        showAll(feed.coins);
      })
      // Didn't come through: try again soon (3s, 10s, 30s) instead of waiting for the next refresh
      .catch(() => { if (misses < 3) setTimeout(update, [3000, 10000, 30000][misses++]); });
  }
  update();
  setInterval(update, REFRESH);
})();
