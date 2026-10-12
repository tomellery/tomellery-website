// Holiday decorations. Three looks, kept subtle:
//   1 = "String Lights"  a strand of twinkling bulbs across the top of the page
//   2 = "Snowcapped"     fresh snow piled on the TE badge, menu button and each link
//   3 = "Candy Cane"     striped accent bar, ornament on the TE badge, holiday NOW line
//   halloween            bold: jack-o'-lantern badge, webs, dangling spider, bats, glowing name, fog
//
// Preview any look with ?holiday=1, ?holiday=2, ?holiday=3 or ?holiday=halloween (e.g. tomellery.com/?holiday=halloween).
// To turn one on for everyone during the season, set ACTIVE below (and the dates it runs).
(function () {
  const ACTIVE = { look: 0, from: "12-01", to: "01-02" }; // look 0 = off. Dates are MM-DD.

  const param = (location.search.match(/[?&]holiday=(\w+)/) || [])[1];
  let look = param ? (isNaN(param) ? param.toLowerCase() : +param) : 0;
  if (!look && ACTIVE.look) {
    const d = new Date(), md = String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    const inSeason = ACTIVE.from <= ACTIVE.to ? md >= ACTIVE.from && md <= ACTIVE.to : md >= ACTIVE.from || md <= ACTIVE.to;
    if (inSeason) look = ACTIVE.look;
  }
  const LOOKS = { 1: () => stringLights(), 2: () => snowcapped(), 3: () => candyCane(), halloween: () => halloween() };
  if (!LOOKS[look]) return;
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

  // ---------- Halloween (bold) ----------
  function halloween() {
    css(`
      /* Jack-o'-lantern badge */
      #avatar { position: relative; background: radial-gradient(circle at 50% 60%, #ffb347, #ff7a00 55%, #c24e00) !important; color: #1a0d00 !important;
        border-radius: 46% 46% 42% 42% / 52% 52% 48% 48%; box-shadow: 0 0 18px rgba(255, 122, 0, .55); ${calm ? "" : "animation: teCandle 2.4s ease-in-out infinite;"} }
      #avatar::before { content: ""; position: absolute; top: -8px; left: 50%; width: 6px; height: 10px; margin-left: -3px;
        background: #3f7d20; border-radius: 3px 3px 1px 1px; transform: rotate(8deg); }
      @keyframes teCandle { 0%, 100% { box-shadow: 0 0 14px rgba(255, 122, 0, .45); } 45% { box-shadow: 0 0 26px rgba(255, 150, 0, .8); } 60% { box-shadow: 0 0 10px rgba(255, 122, 0, .35); } }

      /* Glowing, flickering name */
      h1 .ellery { -webkit-text-stroke-color: #ff7a00 !important; text-shadow: 0 0 10px rgba(255, 122, 0, .55), 0 0 2px rgba(255, 160, 60, .8); ${calm ? "" : "animation: draw 1s cubic-bezier(.2,.8,.2,1) .55s forwards, teFlicker 4s linear 1.6s infinite !important;"} }
      @keyframes teFlicker { 0%, 100% { opacity: 1; } 3% { opacity: .55; } 6% { opacity: 1; } 42% { opacity: 1; } 44% { opacity: .7; } 46% { opacity: 1; } }
      .rule { background: linear-gradient(90deg, #ff7a00, #8b5cf6) !important; }
      .now b::before { background: #8b5cf6 !important; }

      /* Corner webs, spider, bats, fog */
      .te-web { position: absolute; top: 0; width: 120px; height: 120px; pointer-events: none; z-index: 30; opacity: .55; }
      .te-web.left { left: 0; } .te-web.right { right: 0; transform: scaleX(-1); }
      .te-spider { position: absolute; top: 0; right: 64px; width: 24px; pointer-events: none; z-index: 31; transform-origin: top center;
        ${calm ? "height: 120px;" : "height: 90px; animation: teDangle 7s ease-in-out infinite;"} }
      .te-spider svg { position: absolute; bottom: 0; left: 0; width: 24px; height: 24px; }
      .te-spider::before { content: ""; position: absolute; top: 0; bottom: 18px; left: 11.5px; width: 1px; background: rgba(242, 239, 230, .5); }
      @keyframes teDangle { 0%, 100% { height: 90px; } 20% { height: 104px; } 45% { height: 210px; } 55% { height: 200px; } 75% { height: 120px; } }
      .te-bat { position: fixed; z-index: 35; pointer-events: none; width: 34px; height: 16px; left: -60px; }
      .te-bat svg { width: 100%; height: 100%; animation: teFlap .22s ease-in-out infinite alternate; transform-origin: center; }
      @keyframes teFlap { to { transform: scaleY(.35); } }
      .te-fog { position: fixed; left: 0; right: 0; bottom: 0; height: 120px; pointer-events: none; z-index: 34; opacity: .55;
        background: radial-gradient(60% 100% at 20% 100%, rgba(139, 92, 246, .35), transparent 70%),
                    radial-gradient(50% 90% at 80% 100%, rgba(255, 122, 0, .18), transparent 70%);
        ${calm ? "" : "animation: teFog 9s ease-in-out infinite alternate;"} }
      @keyframes teFog { to { transform: translateX(-6%); opacity: .8; } }
    `);

    const now = document.getElementById("now");
    if (now) now.textContent = "Happy Halloween · Trick or treat";

    const web = `<svg viewBox="0 0 120 120" fill="none" stroke="#f2efe6" stroke-width=".8">
      <path d="M0 0 L120 120 M0 0 L60 120 M0 0 L120 60 M0 0 L0 120 M0 0 L120 0 M0 0 L95 120 M0 0 L120 95"/>
      <path d="M0 22 Q12 18 22 0 M0 44 Q24 38 44 0 M0 68 Q38 58 68 0 M0 92 Q52 80 92 0 M0 116 Q66 102 116 0"/></svg>`;
    const spider = `<svg viewBox="0 0 24 24"><g stroke="#0a0a0a" stroke-width="1.4" fill="none">
      <path d="M12 12 L3 6 M12 12 L2 12 M12 13 L3 18 M12 14 L6 22 M12 12 L21 6 M12 12 L22 12 M12 13 L21 18 M12 14 L18 22"/></g>
      <ellipse cx="12" cy="13" rx="4" ry="5" fill="#0a0a0a" stroke="#ff7a00" stroke-width=".6"/>
      <circle cx="10.5" cy="11" r=".9" fill="#ff7a00"/><circle cx="13.5" cy="11" r=".9" fill="#ff7a00"/></svg>`;
    const bat = `<svg viewBox="0 0 34 16"><path fill="#0a0a0a" stroke="#8b5cf6" stroke-width=".5"
      d="M17 5 C15 2 13 2 12 4 C9 1 5 1 0 6 C4 5 7 7 8 11 C10 9 12 9 13 12 C14 10 16 10 17 13 C18 10 20 10 21 12 C22 9 24 9 26 11 C27 7 30 5 34 6 C29 1 25 1 22 4 C21 2 19 2 17 5Z"/></svg>`;

    ["left", "right"].forEach(side => {
      const w = document.createElement("div");
      w.className = "te-web " + side; w.setAttribute("aria-hidden", "true"); w.innerHTML = web;
      document.body.prepend(w);
    });
    const sp = document.createElement("div");
    sp.className = "te-spider"; sp.setAttribute("aria-hidden", "true"); sp.innerHTML = spider;
    document.body.prepend(sp);
    const fog = document.createElement("div");
    fog.className = "te-fog"; fog.setAttribute("aria-hidden", "true");
    document.body.appendChild(fog);

    // A few bats fly across every so often
    if (!calm) {
      function flyBat() {
        const b = document.createElement("div");
        b.className = "te-bat"; b.setAttribute("aria-hidden", "true"); b.innerHTML = bat;
        const top = 8 + Math.random() * 45, scale = .7 + Math.random() * .8, dur = 5 + Math.random() * 4;
        const toRight = Math.random() > .4;
        b.style.top = top + "vh"; b.style.width = 34 * scale + "px"; b.style.height = 16 * scale + "px";
        document.body.appendChild(b);
        const W = innerWidth + 120;
        b.animate([
          { transform: `translate(${toRight ? 0 : W}px, 0)` },
          { transform: `translate(${W * .35 + (toRight ? 0 : W * .3)}px, ${-30 - Math.random() * 40}px)` },
          { transform: `translate(${W * .7 - (toRight ? 0 : W * .4)}px, ${20 + Math.random() * 30}px)` },
          { transform: `translate(${toRight ? W : 0}px, -20px)` },
        ], { duration: dur * 1000, easing: "ease-in-out" }).onfinish = () => b.remove();
      }
      flyBat(); setTimeout(flyBat, 900);
      setInterval(() => { flyBat(); if (Math.random() > .5) setTimeout(flyBat, 600); }, 6500);
    }
  }

  function start() { LOOKS[look](); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
