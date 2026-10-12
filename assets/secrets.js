// Hidden games, triggered from the TE badge (the element with id="avatar") on any page:
//   - tap it 5 times quickly, or type "play"  -> flapper game
//   - press and hold it for about a second     -> runner game
(function () {
  const root = new URL("../", document.currentScript.src);
  const GAMES = {
    tap: { url: new URL("games/flapper.html", root).href, msg: "> secret found.\n> ACCESS GRANTED\n> loading game..." },
    hold: { url: new URL("games/runner.html", root).href, msg: "> hold detected.\n> SECRET LEVEL 2 UNLOCKED\n> loading runner..." },
  };
  const HOLD_MS = 1000;

  // Inside the carousel, games open in the whole tab, not just one slide
  function topWindow() {
    try { if (window.top.location.origin === location.origin) return window.top; } catch (e) {}
    return window;
  }

  function start() {
    const avatar = document.getElementById("avatar");
    if (!avatar) return;

    const style = document.createElement("style");
    style.textContent = `
      #avatar { cursor: default; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
        -webkit-tap-highlight-color: transparent; touch-action: manipulation; transition: transform .1s; }
      #avatar.te-tap { transform: scale(.93); }
      #avatar.te-charging { animation: teCharge ${HOLD_MS}ms linear forwards; }
      @keyframes teCharge {
        from { box-shadow: 0 0 0 0 rgba(57, 255, 122, 0); }
        to   { box-shadow: 0 0 0 6px rgba(57, 255, 122, .9), 0 0 30px 6px rgba(57, 255, 122, .6); }
      }
      .te-egg { position: fixed; inset: 0; z-index: 9999; display: none; place-items: center; padding: 16px;
        background: #0b0f0b; color: #39ff7a; text-shadow: 0 0 8px #39ff7a; white-space: pre; text-align: center;
        font: 18px/1.6 "Cascadia Code", Consolas, "Courier New", monospace; }
      .te-egg.on { display: grid; }`;
    document.head.appendChild(style);

    const egg = document.createElement("div");
    egg.className = "te-egg";
    egg.setAttribute("role", "status");
    document.body.appendChild(egg);

    function launch(kind) {
      if (egg.classList.contains("on")) return;
      egg.classList.add("on");
      const { url, msg } = GAMES[kind];
      let i = 0;
      (function type() {
        if (i < msg.length) { egg.textContent += msg[i++]; setTimeout(type, 35); }
        else setTimeout(() => { topWindow().location.href = url; }, 600);
      })();
    }

    // 5 quick taps
    let taps = 0, tapTimer;
    avatar.addEventListener("click", () => {
      avatar.classList.add("te-tap"); setTimeout(() => avatar.classList.remove("te-tap"), 100);
      taps++; clearTimeout(tapTimer); tapTimer = setTimeout(() => taps = 0, 1500);
      if (taps >= 5) { taps = 0; launch("tap"); }
    });

    // Type "play"
    let typed = "";
    addEventListener("keydown", e => {
      if (e.key.length !== 1) return;
      typed = (typed + e.key.toLowerCase()).slice(-4);
      if (typed === "play") launch("tap");
    });

    // Press and hold
    let holdTimer = null;
    const cancel = () => { clearTimeout(holdTimer); holdTimer = null; avatar.classList.remove("te-charging"); };
    avatar.addEventListener("pointerdown", e => {
      if (e.button > 0) return;
      cancel();
      avatar.classList.add("te-charging");
      holdTimer = setTimeout(() => { cancel(); launch("hold"); }, HOLD_MS);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach(t => avatar.addEventListener(t, cancel));
    avatar.addEventListener("contextmenu", e => e.preventDefault());

    // Coming back with the browser's back button: reset the overlay
    const reset = () => { egg.classList.remove("on"); egg.textContent = ""; };
    addEventListener("pageshow", reset);
    if (topWindow() !== window) topWindow().addEventListener("pageshow", reset);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
