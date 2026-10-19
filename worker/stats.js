// Cloudflare Worker for tomellery.com: private visitor stats.
// Needs a D1 database bound as DB, and a secret named STATS_PASSCODE (Settings → Bindings / Variables and secrets).
//
//   POST /hit    {type,path,ref,vid,sid,name,w}   → 204   the tracking script (assets/stats.js) sends one per view/click/event
//   POST /login  {passcode}                        → { token }   a login good for 60 days, kept by the stats page
//   GET  /data?days=7&tz=-420                      → every number the dashboard shows (needs "Authorization: Bearer <token>")
//   GET  /raw?days=7&type=view&q=text&limit=100&offset=0   → the saved rows themselves, newest first (same login)
//
// Nothing here identifies a person: a visitor is a random id the browser makes up, and location comes from
// Cloudflare's own country/city guess. The tables are made automatically the first time anything arrives.

const VERSION = 2;  // bump when the code changes, so it's easy to tell which copy Cloudflare is running
const ORIGINS = ["https://tomellery.com", "https://www.tomellery.com", "http://localhost:8000", "http://127.0.0.1:8000", "http://localhost:8080", "http://127.0.0.1:8080"];
const TOKEN_DAYS = 60;
const MAX_FAILS = 8, FAIL_WINDOW = 10 * 60 * 1000;   // wrong passcodes allowed per visitor address, per 10 minutes
const BOTS = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|curl|wget|python|go-http|axios|node-fetch|monitor|uptime/i;

const enc = new TextEncoder();
let ready = false;

async function setup(env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS hits (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, type TEXT NOT NULL, path TEXT, ref TEXT, vid TEXT, sid TEXT, country TEXT, city TEXT, device TEXT, browser TEXT, os TEXT, name TEXT)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS hits_ts ON hits (ts)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS fails (ts INTEGER NOT NULL, ip TEXT NOT NULL)"),
  ]);
  ready = true;
}

function cors(req) {
  const o = req.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}
const json = (req, data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" } });

// ===== Login =====
async function hmac(env, text) {
  const key = await crypto.subtle.importKey("raw", enc.encode("tomellery stats:" + env.STATS_PASSCODE), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const buf = await crypto.subtle.sign("HMAC", key, enc.encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const same = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
async function makeToken(env) {
  const exp = String(Date.now() + TOKEN_DAYS * 86400000);
  return exp + "." + await hmac(env, exp);
}
async function checkToken(env, req) {
  if (!env.STATS_PASSCODE) return false;
  const t = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
  const [exp, sig] = t.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return same(sig, await hmac(env, exp));
}

// ===== What kind of device =====
function agent(ua) {
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : "Other";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox|FxiOS/.test(ua) ? "Firefox" : /SamsungBrowser/.test(ua) ? "Samsung" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Other";
  const device = /iPad|Tablet/.test(ua) ? "Tablet" : /Mobi|iPhone|Android/.test(ua) ? "Phone" : "Desktop";
  return { os, browser, device };
}

const clean = (s, n) => String(s == null ? "" : s).slice(0, n);

async function hit(req, env) {
  const ua = req.headers.get("User-Agent") || "";
  if (BOTS.test(ua)) return new Response(null, { status: 204, headers: cors(req) });
  let b;
  try { b = JSON.parse(await req.text()); } catch (e) { return new Response(null, { status: 400, headers: cors(req) }); }
  const type = b.type === "click" || b.type === "event" ? b.type : "view";
  const path = clean(b.path, 120).replace(/[?#].*$/, "").replace(/index\.html$/, "") || "/";
  const a = agent(ua);
  const cf = req.cf || {};
  await setup(env);
  await env.DB.prepare("INSERT INTO hits (ts,type,path,ref,vid,sid,country,city,device,browser,os,name) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(Date.now(), type, path, clean(b.ref, 80), clean(b.vid, 40), clean(b.sid, 40), clean(cf.country, 2), clean(cf.city, 60), a.device, a.browser, a.os, clean(b.name, 120))
    .run();
  return new Response(null, { status: 204, headers: cors(req) });
}

async function login(req, env) {
  if (!env.STATS_PASSCODE) return json(req, { error: "Set the STATS_PASSCODE secret on the Worker first." }, 500);
  await setup(env);
  const ip = req.headers.get("CF-Connecting-IP") || "?";
  const since = Date.now() - FAIL_WINDOW;
  await env.DB.prepare("DELETE FROM fails WHERE ts < ?").bind(since).run();
  const n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM fails WHERE ip = ? AND ts >= ?").bind(ip, since).first()).n;
  if (n >= MAX_FAILS) return json(req, { error: "Too many tries. Wait a few minutes." }, 429);
  let b = {};
  try { b = JSON.parse(await req.text()); } catch (e) {}
  const given = await hmac(env, "login:" + clean(b.passcode, 200));
  const real = await hmac(env, "login:" + env.STATS_PASSCODE);
  if (!same(given, real)) {
    await env.DB.prepare("INSERT INTO fails (ts, ip) VALUES (?, ?)").bind(Date.now(), ip).run();
    return json(req, { error: "Wrong passcode." }, 401);
  }
  return json(req, { token: await makeToken(env) });
}

// ===== The numbers =====
async function data(req, env, url) {
  if (!(await checkToken(env, req))) return json(req, { error: "login" }, 401);
  await setup(env);
  const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get("days"), 10) || 7));
  const tz = Math.max(-840, Math.min(840, parseInt(url.searchParams.get("tz"), 10) || 0));   // minutes ahead of UTC
  const now = Date.now(), since = now - days * 86400000;
  const shift = tz * 60;   // seconds, so day/hour buckets follow the viewer's clock
  const q = (sql, ...args) => env.DB.prepare(sql).bind(...args);
  const top = (col, type, n = 10) => q(`SELECT ${col} AS k, COUNT(*) AS n, COUNT(DISTINCT vid) AS u FROM hits WHERE type = ? AND ts >= ? AND ${col} != '' GROUP BY ${col} ORDER BY n DESC LIMIT ${n}`, type, since);

  const r = await env.DB.batch([
    /* 0 totals */  q("SELECT COUNT(*) AS views, COUNT(DISTINCT vid) AS uniques, COUNT(DISTINCT sid) AS visits FROM hits WHERE type = 'view' AND ts >= ?", since),
    /* 1 all-time */ q("SELECT COUNT(*) AS views, COUNT(DISTINCT vid) AS uniques, MIN(ts) AS first FROM hits WHERE type = 'view'"),
    /* 2 live */    q("SELECT COUNT(DISTINCT vid) AS n FROM hits WHERE ts >= ?", now - 5 * 60000),
    /* 3 daily */   q("SELECT strftime('%Y-%m-%d', ts / 1000 + ?, 'unixepoch') AS k, COUNT(*) AS views, COUNT(DISTINCT vid) AS uniques FROM hits WHERE type = 'view' AND ts >= ? GROUP BY k ORDER BY k", shift, since),
    /* 4 hourly */  q("SELECT strftime('%Y-%m-%d %H', ts / 1000 + ?, 'unixepoch') AS k, COUNT(*) AS views FROM hits WHERE type = 'view' AND ts >= ? GROUP BY k ORDER BY k", shift, now - 24 * 3600000),
    /* 5 pages */   top("path", "view", 12),
    /* 6 refs */    top("ref", "view"),
    /* 7 countries */ top("country", "view", 12),
    /* 8 cities */  top("city", "view"),
    /* 9 devices */ top("device", "view"),
    /* 10 browsers */ top("browser", "view"),
    /* 11 os */     top("os", "view"),
    /* 12 clicks */ top("name", "click", 12),
    /* 13 events */ top("name", "event", 12),
    /* 14 feed */   q("SELECT ts, type, path, name, country, city, device FROM hits ORDER BY id DESC LIMIT 14"),
    /* 15 returning */ q("SELECT COUNT(*) AS n FROM (SELECT vid FROM hits WHERE type = 'view' AND ts >= ? GROUP BY vid HAVING COUNT(DISTINCT strftime('%Y-%m-%d', ts / 1000, 'unixepoch')) > 1)", since),
  ]);
  const rows = i => r[i].results;
  return json(req, {
    version: VERSION, days, now,
    totals: rows(0)[0], allTime: rows(1)[0], live: rows(2)[0].n, returning: rows(15)[0].n,
    daily: rows(3), hourly: rows(4),
    pages: rows(5), refs: rows(6), countries: rows(7), cities: rows(8),
    devices: rows(9), browsers: rows(10), os: rows(11), clicks: rows(12), events: rows(13), feed: rows(14),
  });
}

// Every saved row, newest first, for the dashboard's Raw data tab (filter by kind, search text, page through, export).
async function raw(req, env, url) {
  if (!(await checkToken(env, req))) return json(req, { error: "login" }, 401);
  await setup(env);
  const p = url.searchParams;
  const days = Math.min(3650, Math.max(1, parseInt(p.get("days"), 10) || 7));
  const limit = Math.min(5000, Math.max(1, parseInt(p.get("limit"), 10) || 100));
  const offset = Math.max(0, parseInt(p.get("offset"), 10) || 0);
  const type = ["view", "click", "event"].includes(p.get("type")) ? p.get("type") : "";
  const text = clean(p.get("q"), 60).replace(/[\\%_]/g, m => "\\" + m);
  let where = "ts >= ?";
  const args = [Date.now() - days * 86400000];
  if (type) { where += " AND type = ?"; args.push(type); }
  if (text) {
    where += " AND (" + ["path", "ref", "name", "country", "city", "device", "browser", "os", "vid"].map(c => c + " LIKE ? ESCAPE '\\'").join(" OR ") + ")";
    for (let i = 0; i < 9; i++) args.push("%" + text + "%");
  }
  const r = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS n FROM hits WHERE " + where).bind(...args),
    env.DB.prepare("SELECT id, ts, type, path, ref, name, vid, sid, country, city, device, browser, os FROM hits WHERE " + where + " ORDER BY id DESC LIMIT ? OFFSET ?").bind(...args, limit, offset),
  ]);
  return json(req, { total: r[0].results[0].n, rows: r[1].results });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
    try {
      if (url.pathname === "/version") return json(req, { version: VERSION });
      if (url.pathname === "/hit" && req.method === "POST") return await hit(req, env);
      if (url.pathname === "/login" && req.method === "POST") return await login(req, env);
      if (url.pathname === "/data" && req.method === "GET") return await data(req, env, url);
      if (url.pathname === "/raw" && req.method === "GET") return await raw(req, env, url);
    } catch (e) {
      return json(req, { error: "Something went wrong: " + e.message }, 500);
    }
    return json(req, { error: "Not found" }, 404);
  },
};
