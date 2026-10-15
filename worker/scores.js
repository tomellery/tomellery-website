// Cloudflare Worker for tomellery.com: shared game high scores, plus the crypto band and snow boards.
// Needs a KV namespace bound as SCORES (Settings → Bindings in the dashboard),
// and a Cron Trigger of */15 * * * * (Settings → Trigger events) so prices and snow stay fresh.
//
//   GET  /?game=flapper                    → { "hi": 12 }
//   POST /  {"game":"flapper","score":15}  → { "hi": 15 }  (only ever goes up)
//   GET  /crypto                           → prices, refreshed every 15 minutes
//   GET  /snow                             → snow for every mountain, refreshed every 15 minutes
//
// The coin and mountain lists live on the site in assets/feeds.json, so they're edited in one place.

const CONFIG_URL = "https://tomellery.com/assets/feeds.json";
const FRESH = 15 * 60 * 1000;            // refresh prices and snow this often
const SEASON_FRESH = 60 * 60 * 1000;     // snow sensors post once a day, so hourly is plenty

// Highest believable score per game; anything above is ignored.
const GAMES = { flapper: 500, runner: 50000 };

const ORIGINS = ["https://tomellery.com", "https://www.tomellery.com"];

function cors(req) {
  const o = req.headers.get("Origin") || "";
  const ok = ORIGINS.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
  return {
    "Access-Control-Allow-Origin": ok ? o : ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function reply(req, body, status = 200, cache = "no-store") {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": cache, ...cors(req) },
  });
}

const getJSON = (url, init) => fetch(url, init).then(r => r.ok ? r.json() : Promise.reject(new Error(url + " → " + r.status)));
const config = () => getJSON(CONFIG_URL + "?t=" + Date.now());

// ===== Crypto: prices, 24h change and logos from CoinGecko (free, no key) =====
async function refreshCrypto(env) {
  const { coins } = await config();
  const ids = coins.map(c => c[1]).filter(id => id !== "total").join(",");
  const old = JSON.parse(await env.SCORES.get("feed:crypto") || "null");
  const [markets, global] = await Promise.all([
    getJSON(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h`).catch(() => null),
    getJSON("https://api.coingecko.com/api/v3/global").catch(() => null),
  ]);
  if (!Array.isArray(markets) || !markets.length) throw new Error("CoinGecko prices didn't come through");
  const byId = Object.fromEntries(markets.map(m => [m.id, { price: m.current_price, change: m.price_change_percentage_24h, image: m.image }]));
  if (global && global.data) byId.total = { price: global.data.total_market_cap.usd, change: global.data.market_cap_change_percentage_24h_usd };
  else if (old) { const t = old.coins.find(c => c.id === "total"); if (t) byId.total = t; }   // keep the last TOTAL if it was missed
  const feed = { t: Date.now(), coins: coins.filter(([, id]) => byId[id]).map(([sym, id]) => ({ sym, id, ...byId[id] })) };
  await env.SCORES.put("feed:crypto", JSON.stringify(feed));
  return feed;
}

// ===== Snow: 24h / 7-day snow and temperature from the open-meteo weather model (free, no key) =====
// New snow over the last 24 hours and the last 7 days, up to the current hour (in each mountain's local time)
function summarize(d) {
  const hour = d.current.time.slice(0, 13);
  let end = d.hourly.time.findIndex(t => t.slice(0, 13) === hour);
  if (end === -1) end = d.hourly.time.length - 1;
  const sum = hours => Math.round(d.hourly.snowfall.slice(Math.max(0, end - hours + 1), end + 1).reduce((a, b) => a + (b || 0), 0));
  return { inches: sum(24), week: sum(24 * 7), temp: Math.round(d.current.temperature_2m) + "°F" };
}

// ===== Season totals (estimated) from SNOTEL, the government snow sensors at the mountains =====
// Weather models badly undercount mountain snow over a season, so SEASON adds up the new snow each sensor actually
// measured since Oct 1: for each day it got cold enough to snow (low <= 34°F), whichever is bigger of
//   - how much the snow depth went up, or
//   - how much water the snowpack gained, times a 12:1 snow ratio (fresh snow settles fast, so depth alone undercounts).
// Rain landing on old snow can add water too, which the cold-day rule mostly filters out. Mountains without a sensor show "—".
const SNOW_RATIO = 12, COLD_F = 34, MIN_DEPTH = 1, MIN_WATER = 0.1;
async function refreshSeason(env, triplets) {
  const today = new Date(), y = today.getUTCFullYear();
  const startYear = today.getUTCMonth() >= 9 ? y : y - 1;                // season starts Oct 1
  const iso = d => d.toISOString().slice(0, 10);
  const begin = iso(new Date(Date.UTC(startYear, 8, 30)));               // Sep 30, so Oct 1's gain counts
  const stations = await getJSON("https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data?stationTriplets=" + triplets.join(",")
    + `&elements=SNWD,WTEQ,TMIN&duration=DAILY&beginDate=${begin}&endDate=${iso(today)}`);
  const total = {};
  stations.forEach(st => {
    const el = {};
    st.data.forEach(e => { el[e.stationElement.elementCode] = Object.fromEntries(e.values.map(v => [v.date, v.value])); });
    const D = el.SNWD || {}, W = el.WTEQ || {}, T = el.TMIN || {};
    const days = [...new Set([...Object.keys(D), ...Object.keys(W)])].sort();
    let snow = 0;
    for (let i = 1; i < days.length; i++) {
      const a = days[i - 1], b = days[i];
      if (T[b] != null && T[b] > COLD_F) continue;
      const depth = D[a] != null && D[b] != null ? D[b] - D[a] : 0;
      const water = W[a] != null && W[b] != null ? W[b] - W[a] : 0;
      snow += Math.max(0, depth >= MIN_DEPTH ? depth : 0, water >= MIN_WATER ? water * SNOW_RATIO : 0);
    }
    total[st.stationTriplet] = Math.round(snow);
  });
  const season = { t: Date.now(), total };
  await env.SCORES.put("feed:season", JSON.stringify(season));
  return season;
}

const SNOW_CODES = [71, 73, 75, 77, 85, 86]; // weather codes for snow and snow showers
async function refreshSnow(env) {
  const { mountains } = await config();
  const col = i => mountains.map(m => m[i]).join(",");
  const weather = await getJSON("https://api.open-meteo.com/v1/forecast"
    + `?latitude=${col(4)}&longitude=${col(5)}&elevation=${col(6)}`
    + "&current=temperature_2m,snowfall,weather_code&hourly=snowfall&past_days=7&forecast_days=1"
    + "&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=auto");
  const list = Array.isArray(weather) ? weather : [weather];

  let season = JSON.parse(await env.SCORES.get("feed:season") || "null");
  if (!season || Date.now() - season.t > SEASON_FRESH) {
    const triplets = [...new Set(mountains.map(m => m[7]).filter(Boolean))];
    season = await refreshSeason(env, triplets).catch(() => season);   // sensors down: keep the last numbers
  }

  const now = list[0].current;
  const feed = {
    t: Date.now(),
    snowingAtHome: (now.snowfall || 0) > 0 || SNOW_CODES.includes(now.weather_code),   // first mountain (Brighton)
    mountains: mountains.map(([board, name, short, state, , , , sensor], i) => ({
      board, name, short, state, ...summarize(list[i]),
      season: sensor && season && sensor in season.total ? season.total[sensor] : null,
    })),
  };
  await env.SCORES.put("feed:snow", JSON.stringify(feed));
  return feed;
}

// Serve the saved feed. Too old (the timer missed a run): refresh in the background, still answer right away.
// Nothing saved yet: fetch it now.
async function feed(req, env, ctx, key, refresh) {
  const saved = await env.SCORES.get(key);
  if (!saved) {
    try { return reply(req, await refresh(env), 200, "public, max-age=60"); }
    catch (e) { return reply(req, { error: "not available yet" }, 503); }
  }
  if (Date.now() - JSON.parse(saved).t > FRESH + 5 * 60 * 1000) ctx.waitUntil(refresh(env).catch(() => {}));
  return reply(req, saved, 200, "public, max-age=60");
}

export default {
  async fetch(req, env, ctx) {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
    const path = new URL(req.url).pathname;

    if (req.method === "GET" && path === "/crypto") return feed(req, env, ctx, "feed:crypto", refreshCrypto);
    if (req.method === "GET" && path === "/snow") return feed(req, env, ctx, "feed:snow", refreshSnow);

    if (req.method === "GET") {
      const game = new URL(req.url).searchParams.get("game");
      if (!(game in GAMES)) return reply(req, { error: "unknown game" }, 400);
      const hi = parseInt(await env.SCORES.get("hi:" + game), 10) || 0;
      return reply(req, { hi });
    }

    if (req.method === "POST") {
      let data;
      try { data = await req.json(); } catch (e) { return reply(req, { error: "bad json" }, 400); }
      const { game, score } = data || {};
      if (!(game in GAMES)) return reply(req, { error: "unknown game" }, 400);
      if (!Number.isInteger(score) || score < 0 || score > GAMES[game]) return reply(req, { error: "bad score" }, 400);
      const hi = parseInt(await env.SCORES.get("hi:" + game), 10) || 0;
      if (score <= hi) return reply(req, { hi });
      await env.SCORES.put("hi:" + game, String(score));
      return reply(req, { hi: score });
    }

    return reply(req, { error: "method not allowed" }, 405);
  },

  // The timer (Cron Trigger): keep prices and snow fresh even when nobody is visiting
  async scheduled(event, env, ctx) {
    ctx.waitUntil(Promise.allSettled([refreshCrypto(env), refreshSnow(env)]));
  },
};
