// Holiday decorations. Three looks, kept subtle:
//   1 = "String Lights"  a strand of twinkling bulbs across the top of the page
//   2 = "Snowcapped"     fresh snow piled on the TE badge, menu button and each link
//   3 = "Candy Cane"     striped accent bar, ornament on the TE badge, holiday NOW line
//
// Preview any look with ?holiday=1, ?holiday=2 or ?holiday=3 (e.g. tomellery.com/?holiday=1).
// To turn one on for everyone during the season, set ACTIVE below (and the dates it runs).
(function () {
  const ACTIVE = { look: 0, from: "12-01", to: "01-02" }; // look 0 = off. Dates are MM-DD.

  const param = (location.search.match(/[?&]holiday=(\d)/) || [])[1];
  let look = param ? +param : 0;
  if (!look && ACTIVE.look) {
    const d = new Date(), md = String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    const inSeason = ACTIVE.from <= ACTIVE.to ? md >= ACTIVE.from && md <= ACTIVE.to : md >= ACTIVE.from || md <= ACTIVE.to;
    if (inSeason) look = ACTIVE.look;
  }
  if (![1, 2, 3].includes(look)) return;
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function css(text) { const s = document.createElement("style"); s.textContent = text; document.head.appendChild(s); }

  // ---------- 1. String Lights ----------
  function stringLights() {
    css(`
      body.te-lights { padding-top: 48px; }
      .te-lights-strand { position: absolute; top: 0; left: 0; width: 100%; height: 46px; pointer-events: none; z-index: 30; overflow: hidden; }
      .te-lights-strand svg { display: block; width: 100%; height: 100%; }
      .te-bulb { animation: teTwinkle 2.6s ease-in-out infinite; }
      @keyframes teTwinkle { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
      ${calm ? ".te-bulb { animation: none; }" : ""}`);
    document.body.classList.add("te-lights");
    const wrap = document.createElement("div");
    wrap.className = "te-lights-strand";
    wrap.setAttribute("aria-hidden", "true");
    document.body.prepend(wrap);

    const COLORS = ["#ffd88a", "#ff5a1f", "#ff4d4d", "#3ddc84", "#ffd88a", "#7ab8ff"];
    function draw() {
      const W = document.documentElement.clientWidth, SWAG = 130, GAP = 32;
      const y = x => 6 + 15 * Math.sin(Math.PI * ((x % SWAG) / SWAG)); // the wire sags between hooks
      let wire = "M0 6";
      for (let x = 2; x <= W; x += 2) wire += ` L${x} ${y(x).toFixed(1)}`;
      let bulbs = "";
      for (let x = GAP / 2, i = 0; x < W; x += GAP, i++) {
        const c = COLORS[i % COLORS.length], yy = y(x) + 2;
        bulbs += `<g class="te-bulb" style="animation-delay:${(-Math.random() * 2.6).toFixed(2)}s">
          <rect x="${x - 2.5}" y="${yy - 1}" width="5" height="4" rx="1" fill="#3a3a3a"/>
          <ellipse cx="${x}" cy="${yy + 9}" rx="4.5" ry="7" fill="${c}" filter="url(#teGlow)"/></g>`;
      }
      wrap.innerHTML = `<svg viewBox="0 0 ${W} 46" preserveAspectRatio="none">
        <defs><filter id="teGlow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
        <path d="${wire}" stroke="#2c2c2c" stroke-width="1.6" fill="none"/>${bulbs}</svg>`;
    }
    draw();
    addEventListener("resize", draw);
  }

  // ---------- 2. Snowcapped ----------
  function snowcapped() {
    css(`
      #avatar, .menu-btn { position: relative; }
      #avatar::before, .menu-btn::before {
        content: ""; position: absolute; left: -3px; right: -3px; top: -5px; height: 8px; pointer-events: none;
        background: #fbfbf8; border-radius: 50% 50% 4px 4px / 100% 100% 4px 4px; box-shadow: 0 1px 0 rgba(0,0,0,.3);
      }
      #links li { position: relative; }
      /* a thin layer of snow along each row, plus a small drift piled up somewhere on it */
      #links li::before, #links li::after { content: ""; position: absolute; pointer-events: none; z-index: 1; background: #fbfbf8; }
      #links li::before { top: -3px; height: 3px; border-radius: 3px 3px 0 0; opacity: .85; }
      #links li::after { top: -8px; height: 8px; width: 46px; border-radius: 50% 50% 0 0 / 100% 100% 0 0; }
      #links li:nth-child(odd)::before { left: 4%; right: 34%; }
      #links li:nth-child(odd)::after { left: 18%; }
      #links li:nth-child(even)::before { left: 28%; right: 6%; }
      #links li:nth-child(even)::after { left: 62%; width: 58px; }
      #links li:nth-child(3n)::before { left: 44%; right: 3%; }
      #links li:nth-child(3n)::after { left: 70%; width: 36px; }
      .te-snowbank { height: 26px; margin-top: 10px; pointer-events: none;
        background: radial-gradient(60% 120% at 20% 100%, #fbfbf8 60%, transparent 61%),
                    radial-gradient(50% 140% at 65% 100%, #f1f1ec 60%, transparent 61%),
                    radial-gradient(40% 110% at 95% 100%, #fbfbf8 60%, transparent 61%); opacity: .9; }`);
    const bank = document.createElement("div");
    bank.className = "te-snowbank";
    bank.setAttribute("aria-hidden", "true");
    (document.querySelector("footer") || document.body.lastElementChild).after(bank);
  }

  // ---------- 3. Candy Cane ----------
  function candyCane() {
    css(`
      .rule { background: repeating-linear-gradient(-45deg, #e8322b 0 7px, #f2efe6 7px 14px) !important; background-size: 40px 100% !important;
        height: 6px !important; width: 96px !important; ${calm ? "" : "animation: grow .6s cubic-bezier(.2,.8,.2,1) 1.4s both, teCane 1.6s linear 2s infinite !important;"} }
      @keyframes teCane { to { background-position: 40px 0; } }
      #avatar { position: relative; overflow: visible; }
      #avatar::after {
        content: ""; position: absolute; right: -9px; bottom: -15px; width: 14px; height: 14px; border-radius: 50%; pointer-events: none;
        background: radial-gradient(circle at 35% 35%, #ff8a80, #e8322b 55%, #8f1410); box-shadow: 0 2px 6px rgba(232, 50, 43, .5);
        ${calm ? "" : "animation: teSwing 3s ease-in-out infinite; transform-origin: 50% -10px;"}
      }
      #avatar::before { content: ""; position: absolute; right: -2px; bottom: -3px; width: 1px; height: 6px; background: #c9c3b2; transform: rotate(-35deg); }
      @keyframes teSwing { 0%, 100% { transform: rotate(-8deg); } 50% { transform: rotate(8deg); } }
      .now b::before { background: #e8322b !important; }`);
    const now = document.getElementById("now");
    if (now) now.textContent = "Happy holidays from Salt Lake City";
  }

  function start() { [, stringLights, snowcapped, candyCane][look](); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
