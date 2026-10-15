// Cloudflare Worker: one shared high score per secret game.
// Needs a KV namespace bound as SCORES (Settings → Bindings in the dashboard).
//   GET  /?game=flapper            → { "hi": 12 }
//   POST /  {"game":"flapper","score":15} → { "hi": 15 }  (only ever goes up)

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

function reply(req, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors(req) },
  });
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });

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
};
