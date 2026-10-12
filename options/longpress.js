// Second secret: press and hold the TE badge for about a second to open the runner (dino-style) game.
// The quick 5-tap secret on the same badge still opens the flapper game.
(function () {
  const HOLD_MS = 1000;
  const avatar = document.getElementById("avatar");
  const egg = document.getElementById("egg");
  const eggText = document.getElementById("eggText");
  if (!avatar || !egg || !eggText) return;

  const game = (location.pathname.includes("/options/") ? "" : "options/") + "7-terminal-runner.html";

  // Glow that builds while holding, so people know something is happening
  const style = document.createElement("style");
  style.textContent = `
    #avatar { -webkit-touch-callout: none; touch-action: manipulation; }
    #avatar.charging { animation: lpCharge ${HOLD_MS}ms linear forwards; }
    @keyframes lpCharge {
      from { box-shadow: 0 0 0 0 rgba(57, 255, 122, 0); }
      to   { box-shadow: 0 0 0 6px rgba(57, 255, 122, .9), 0 0 30px 6px rgba(57, 255, 122, .6); }
    }`;
  document.head.appendChild(style);

  let timer = null;
  function cancel() {
    clearTimeout(timer); timer = null;
    avatar.classList.remove("charging");
  }
  function launch() {
    cancel();
    if (egg.classList.contains("on")) return;
    egg.classList.add("on");
    eggText.style.whiteSpace = "pre";
    const msg = "> hold detected.\n> SECRET LEVEL 2 UNLOCKED\n> loading runner...";
    let i = 0;
    (function type() {
      if (i < msg.length) { eggText.textContent += msg[i++]; setTimeout(type, 35); }
      else setTimeout(() => { location.href = game; }, 600);
    })();
  }

  avatar.addEventListener("pointerdown", e => {
    if (e.button > 0) return;
    cancel();
    avatar.classList.add("charging");
    timer = setTimeout(launch, HOLD_MS);
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach(t => avatar.addEventListener(t, cancel));
  avatar.addEventListener("contextmenu", e => e.preventDefault());
})();
