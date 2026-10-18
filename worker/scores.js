  // Cloudflare Worker for tomellery.com: shared game high scores, plus the crypto band and snow boards.
  // Needs a KV namespace bound as SCORES (Settings → Bindings in the dashboard),
  // and a Cron Trigger of */15 * * * * (Settings → Trigger events) so prices and snow stay fresh.
  //
  //   GET  /ticket                           → { "ticket": "..." }  a game gets one when it starts, and sends it with its score
  //   GET  /?game=flapper                    → { "hi": 12 }   secret games: one best score each
  //   POST /  {"game":"flapper","score":15,"ticket":"..."}  → { "hi": 15 }  (only ever goes up)
  //   GET  /arcade                          → { "snake": [{ "name": "TOM", "score": 1200 }, ...], ... }  top 5 per game
  //   POST /arcade {"game":"snake","name":"TOM","score":1200,"ticket":"..."}  → the same, with the new score in it
  //
  // Any short lowercase game name works for both, so a new game (arcade or secret) needs no change here.
  // Keeping the boards honest:
  //   - a score has to come with a ticket this Worker signed, and be possible in the time since the ticket was issued
  //   - each visitor can send only a few scores a minute (so spam can't use up the free daily saves the snow and
  //     crypto boards need)
  //   - at most MAX_BOARDS boards of each kind, and every score has a ceiling
  //   GET  /crypto                           → prices, refreshed every 15 minutes
  //   GET  /snow                             → snow for every mountain, refreshed every 15 minutes
  //
  // The coin and mountain lists live on the site in assets/feeds.json, so they're edited in one place.
  
  const VERSION = 6;   // bump when the code changes, so it's easy to tell which copy Cloudflare is running
  const CONFIG_URL = "https://tomellery.com/assets/feeds.json";
  const FRESH = 15 * 60 * 1000;            // refresh prices and snow this often
  const SEASON_FRESH = 60 * 60 * 1000;     // snow sensors post once a day, so hourly is plenty
  
  // ===== Game scores =====
  const GAME_ID = /^[a-z]{3,12}$/, ARCADE_NAME = /^[A-Z0-9]{3}$/;
  const MAX_BOARDS = 40;            // per kind (arcade, secret): new game names past this are turned away
  // Highest believable score, and fastest believable scoring (points per second of play, plus a head start).
  // Games not listed get the defaults, which are generous.
  const LIMITS = {
    flapper: { max: 500, perSec: 2, start: 5 },        // about one point per pipe
    runner: { max: 50000, perSec: 15, start: 50 },     // 10 points a second
  };
  const DEFAULT_LIMIT = { max: 999999, perSec: 1000, start: 5000 };
  const MIN_PLAY = 2, MAX_TICKET_AGE = 7 * 24 * 3600;   // seconds: arcade scores saved offline are sent on the next visit
  const SCORES_PER_MINUTE = 8, TICKETS_PER_MINUTE = 30;  // per visitor

  // Tickets: the time they were issued, signed with a secret, so they can't be made up or backdated.
  // The secret is TICKET_SECRET if set (Settings → Variables and secrets), otherwise derived from the CoinGecko key,
  // otherwise made once and kept in KV.
  const enc = new TextEncoder();
  let signingKey = null;
  async function ticketKey(env) {
    if (signingKey) return signingKey;
    let secret = env.TICKET_SECRET || env.COINGECKO_KEY;
    if (!secret) {
      secret = await env.SCORES.get("ticket:secret");
      if (!secret) { secret = crypto.randomUUID() + crypto.randomUUID(); await env.SCORES.put("ticket:secret", secret); }
    }
    signingKey = await crypto.subtle.importKey("raw", enc.encode("tomellery tickets:" + secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return signingKey;
  }
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const sign = async (env, text) => b64(await crypto.subtle.sign("HMAC", await ticketKey(env), enc.encode(text)));
  async function newTicket(env) {
    const t = String(Date.now());
    return t + "." + await sign(env, t);
  }
  // Seconds since the ticket was issued, or -1 if it isn't one of ours
  async function ticketAge(env, ticket) {
    const [t, sig] = String(ticket || "").split(".");
    if (!/^\d{13}$/.test(t || "") || !sig || sig !== await sign(env, t)) return -1;
    return (Date.now() - Number(t)) / 1000;
  }

  // Is this score believable? Returns null if so, otherwise [status, why].
  async function checkScore(env, game, score, ticket) {
    const lim = LIMITS[game] || DEFAULT_LIMIT;
    if (!Number.isInteger(score) || score <= 0 || score > lim.max) return [400, "bad score"];
    const age = await ticketAge(env, ticket);
    if (age < 0) return [403, "no valid ticket"];
    if (age < MIN_PLAY || age > MAX_TICKET_AGE) return [422, "ticket too new or too old"];
    if (score > lim.start + lim.perSec * age) return [422, "score too high for the time played"];
    return null;
  }

  // A few requests a minute per visitor. Kept in the Worker's memory: free, no KV saves, and enough to stop a script
  // hammering the boards (each Cloudflare location keeps its own count, which is fine for this).
  const recent = new Map();
  function tooFast(req, kind, perMinute) {
    const who = kind + ":" + (req.headers.get("CF-Connecting-IP") || "unknown"), now = Date.now();
    const times = (recent.get(who) || []).filter(t => now - t < 60000);
    times.push(now);
    if (recent.size > 5000) recent.clear();
    recent.set(who, times);
    return times.length > perMinute;
  }

  // Neon Arcade (tomellery.com/arcade/): one shared top-5 table per game, all kept under one KV key.
  const ARCADE_KEY = "arcade:tables", ARCADE_SIZE = 5;

  async function arcade(req, env) {
    const tables = JSON.parse(await env.SCORES.get(ARCADE_KEY) || "{}");
    if (req.method === "GET") return reply(req, tables);
    if (tooFast(req, "score", SCORES_PER_MINUTE)) return reply(req, { error: "slow down" }, 429);
    let data;
    try { data = await req.json(); } catch (e) { return reply(req, { error: "bad json" }, 400); }
    const { game, name, score, ticket } = data || {};
    if (!GAME_ID.test(game || "")) return reply(req, { error: "unknown game" }, 400);
    if (!ARCADE_NAME.test(name || "")) return reply(req, { error: "bad name" }, 400);
    const wrong = await checkScore(env, game, score, ticket);
    if (wrong) return reply(req, { error: wrong[1] }, wrong[0]);
    if (!tables[game] && Object.keys(tables).length >= MAX_BOARDS) return reply(req, { error: "too many games" }, 400);
    const table = tables[game] || [];
    if (table.length >= ARCADE_SIZE && score <= table[table.length - 1].score) return reply(req, tables);
    tables[game] = table.concat({ name, score }).sort((a, b) => b.score - a.score).slice(0, ARCADE_SIZE);
    await env.SCORES.put(ARCADE_KEY, JSON.stringify(tables));
    return reply(req, tables);
  }

  // Secret games: one best score per game, all kept under one KV key. (Flapper's and Runner's records from before
  // this were each kept under their own "hi:<game>" key, which is still read until they set a new one.)
  const SECRET_KEY = "secret:hi";
  async function secretBest(env, game) {
    const all = JSON.parse(await env.SCORES.get(SECRET_KEY) || "{}");
    const hi = game in all ? all[game] : parseInt(await env.SCORES.get("hi:" + game), 10) || 0;
    return [all, hi];
  }

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
  
  // Workers send no User-Agent by default, and some services turn those requests away
  const HEADERS = { "User-Agent": "tomellery.com (personal site)", "Accept": "application/json" };
  // A failed request says which address, the status, and the start of the reply (to tell who turned it away)
  const getJSON = (url, extra = {}) => fetch(url, { headers: { ...HEADERS, ...extra } })
    .then(async r => r.ok ? r.json() : Promise.reject(new Error(url.split("?")[0] + " → " + r.status + " "
      + (await r.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 160))));
  const config = () => getJSON(CONFIG_URL + "?t=" + Date.now());

  // ===== Crypto: prices, 24h change and logos from CoinGecko =====
  // CoinGecko's keyless service is always "too busy" (429) for Cloudflare's shared servers, so this uses a free
  // CoinGecko Demo API key, saved in the dashboard as a secret named COINGECKO_KEY (Settings → Variables and secrets).
  // About 6,000 calls a month at one refresh every 15 minutes; the free Demo plan allows 10,000.
  async function refreshCrypto(env) {
    const { coins } = await config();
    const ids = coins.map(c => c[1]).filter(id => id !== "total").join(",");
    const old = JSON.parse(await env.SCORES.get("feed:crypto") || "null");
    // The key goes both as a header and in the address; CoinGecko accepts either
    const key = env.COINGECKO_KEY ? { "x-cg-demo-api-key": env.COINGECKO_KEY } : {};
    const q = env.COINGECKO_KEY ? "&x_cg_demo_api_key=" + encodeURIComponent(env.COINGECKO_KEY) : "";
    let why = env.COINGECKO_KEY ? "(key set) " : "(no COINGECKO_KEY secret set) ";
    const [markets, global] = await Promise.all([
      getJSON(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h${q}`, key).catch(e => { why += e.message; return null; }),
      getJSON("https://api.coingecko.com/api/v3/global?" + q.slice(1), key).catch(() => null),
    ]);
    if (!Array.isArray(markets) || !markets.length) throw new Error("CoinGecko prices didn't come through: " + why);
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
      catch (e) { return reply(req, { error: "not available yet", why: e.message, v: VERSION }, 503); }
    }
    if (Date.now() - JSON.parse(saved).t > FRESH + 5 * 60 * 1000) ctx.waitUntil(refresh(env).catch(() => {}));
    return reply(req, saved, 200, "public, max-age=60");
  }
  
  export default {
    async fetch(req, env, ctx) {
      if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
      const path = new URL(req.url).pathname;
  
      if (req.method === "GET" && path === "/version") return reply(req, { v: VERSION });
      if (req.method === "GET" && path === "/crypto") return feed(req, env, ctx, "feed:crypto", refreshCrypto);
      if (req.method === "GET" && path === "/snow") return feed(req, env, ctx, "feed:snow", refreshSnow);
      if (req.method === "GET" && path === "/ticket") {
        if (tooFast(req, "ticket", TICKETS_PER_MINUTE)) return reply(req, { error: "slow down" }, 429);
        return reply(req, { ticket: await newTicket(env) });
      }
      if (path === "/arcade") return arcade(req, env);

      if (req.method === "GET") {
        const game = new URL(req.url).searchParams.get("game");
        if (!GAME_ID.test(game || "")) return reply(req, { error: "unknown game" }, 400);
        const [, hi] = await secretBest(env, game);
        return reply(req, { hi });
      }

      if (req.method === "POST") {
        if (tooFast(req, "score", SCORES_PER_MINUTE)) return reply(req, { error: "slow down" }, 429);
        let data;
        try { data = await req.json(); } catch (e) { return reply(req, { error: "bad json" }, 400); }
        const { game, score, ticket } = data || {};
        if (!GAME_ID.test(game || "")) return reply(req, { error: "unknown game" }, 400);
        const wrong = await checkScore(env, game, score, ticket);
        if (wrong) return reply(req, { error: wrong[1] }, wrong[0]);
        const [all, hi] = await secretBest(env, game);
        if (score <= hi) return reply(req, { hi });
        if (!(game in all) && Object.keys(all).length >= MAX_BOARDS) return reply(req, { error: "too many games" }, 400);
        all[game] = score;
        await env.SCORES.put(SECRET_KEY, JSON.stringify(all));
        return reply(req, { hi: score });
      }
  
      return reply(req, { error: "method not allowed" }, 405);
    },
  
    // The timer (Cron Trigger): keep prices and snow fresh even when nobody is visiting
    async scheduled(event, env, ctx) {
      ctx.waitUntil(Promise.allSettled([refreshCrypto(env), refreshSnow(env)]));
    },
  };
