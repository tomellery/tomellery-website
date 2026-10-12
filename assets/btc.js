// Live Bitcoin price for any element with data-btc-price, e.g. "BTC $84,142 ▲1.3%"
// (data-btc-price="short" leaves off the "BTC " prefix).
// Main source: CoinGecko (free). Backup: Coinbase (price only, no 24h change). Refreshes every minute.
// If both are unreachable, the element keeps whatever text it already had.
(function () {
  const els = () => document.querySelectorAll("[data-btc-price]");
  const usd = n => "$" + Math.round(n).toLocaleString("en-US");

  function show(price, change) {
    let text = usd(price);
    let dir = "";
    if (typeof change === "number") {
      dir = change >= 0 ? "up" : "down";
      text += ` ${change >= 0 ? "▲" : "▼"}${Math.abs(change).toFixed(1)}%`;
    }
    els().forEach(el => { el.textContent = (el.dataset.btcPrice === "short" ? "" : "BTC ") + text; el.dataset.dir = dir; });
  }

  function update() {
    fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true")
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => show(d.bitcoin.usd, d.bitcoin.usd_24h_change))
      .catch(() => fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot")
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(d => show(parseFloat(d.data.amount)))
        .catch(() => {}));
  }

  update();
  setInterval(update, 60000);
})();
