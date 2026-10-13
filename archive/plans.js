// ============================================================
//  Plans (DRAFT): computers only. The page shown as a technical drawing of itself.
//  - Notes in the margins point at the real parts of the page, measured live
//  - A title block (bottom right) with the revision number and date from GitHub
//  - Type "plans" (or use the button in the title block) to switch to the wireframe view
//  Phones get nothing.
// ============================================================
(function () {
  if (!matchMedia("(min-width: 1100px) and (hover: hover)").matches) return;
  const root = document.documentElement;
  root.classList.add("plans");
  const REPO = "tomellery/tomellery-website";

  // What gets a note: element, which margin, and the label (can use the element's live size)
  const NOTES = [
    [".badge", "left", r => `BADGE · ${r.width} × ${r.height}`],
    ["h1 .tom", "left", (r, el) => `ANTON · ${Math.round(parseFloat(getComputedStyle(el).fontSize))}PX · LINE-HEIGHT .82`],
    ["h1 .ellery", "left", () => "1.5PX OUTLINE · DRAWN ON LOAD"],
    [".rule", "left", r => `${r.width} × ${r.height} · #FF5A1F · THE ONLY COLOR`],
    ["#clock", "right", () => "LIVE CLOCK · AMERICA/DENVER"],
    [".now", "right", () => "NOW · ONE LINE, EDITED BY HAND"],
    ["#links", "right", (r, el) => `${el.children.length} CONNECTIONS · ${r.height}PX`],
    ["#snow", "right", () => "SNOW · OPEN-METEO + SNOTEL · LIVE"],
  ];

  // ---------- Layers ----------
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("plans-lines");
  svg.setAttribute("aria-hidden", "true");
  const layer = document.createElement("div");
  layer.className = "plans-notes";
  layer.setAttribute("aria-hidden", "true");
  document.body.append(svg, layer);

  // ---------- Title block ----------
  const block = document.createElement("aside");
  block.className = "plans-block";
  block.innerHTML = `
    <div><span>PROJECT</span><b>TOMELLERY.COM</b></div>
    <div><span>DRAWN BY</span><b>T. ELLERY</b></div>
    <div><span>LOCATION</span><b>SALT LAKE CITY, UT</b></div>
    <div><span>REV</span><b data-rev>—</b></div>
    <div><span>SHEET</span><b>1 OF 1</b></div>
    <button type="button" aria-pressed="false">VIEW · FINISHED</button>`;
  document.body.appendChild(block);

  // Revision = number of commits on GitHub, plus the date of the latest one
  fetch(`https://api.github.com/repos/${REPO}/commits?per_page=1`)
    .then(r => r.ok ? r : Promise.reject(r.status))
    .then(async r => {
      const last = (r.headers.get("link") || "").match(/page=(\d+)>;\s*rel="last"/);
      const [c] = await r.json();
      const date = new Date(c.commit.committer.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase();
      block.querySelector("[data-rev]").textContent = `${last ? last[1] : 1} · ${date}`;
    })
    .catch(() => {});

  // ---------- Wireframe view ----------
  const btn = block.querySelector("button");
  function setView(on) {
    root.classList.toggle("plans-wire", on);
    btn.setAttribute("aria-pressed", on);
    btn.textContent = "VIEW · " + (on ? "PLANS" : "FINISHED");
    requestAnimationFrame(draw);
  }
  btn.addEventListener("click", () => setView(!root.classList.contains("plans-wire")));
  let typed = "";
  addEventListener("keydown", e => {
    if (e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-5);
    if (typed === "plans") { typed = ""; setView(!root.classList.contains("plans-wire")); }
  });

  if (new URLSearchParams(location.search).get("view") === "plans") setView(true); // link straight to the plans view

  // ---------- Draw the notes and leader lines ----------
  const NS = "http://www.w3.org/2000/svg";
  const line = (attrs, cls) => { const l = document.createElementNS(NS, "path"); l.setAttribute("class", cls || ""); for (const k in attrs) l.setAttribute(k, attrs[k]); svg.appendChild(l); return l; };
  let items = [];

  function draw() {
    const docH = document.documentElement.scrollHeight, W = document.documentElement.clientWidth;
    svg.setAttribute("width", W); svg.setAttribute("height", docH);
    svg.style.height = docH + "px";
    svg.innerHTML = ""; layer.innerHTML = "";
    const col = document.querySelector(".bar").getBoundingClientRect();
    const colL = col.left + scrollX, colR = col.right + scrollX;

    // Column width dimension across the top
    const dy = document.querySelector(".bar").getBoundingClientRect().top + scrollY - 8;
    line({ d: `M${colL} ${dy}H${colR}M${colL} ${dy - 5}V${dy + 5}M${colR} ${dy - 5}V${dy + 5}` }, "dim");
    const dim = document.createElement("span");
    dim.className = "plans-dim"; dim.textContent = Math.round(col.width);
    dim.style.cssText = `left:${(colL + colR) / 2}px;top:${dy}px`;
    layer.appendChild(dim);

    // Notes, stacked so they never overlap on either side
    items = [];
    const placed = { left: -Infinity, right: -Infinity };
    NOTES.map(([sel, side, label]) => {
      const el = document.querySelector(sel);
      if (!el || el.closest("[hidden]") || el.hidden) return null;
      const r = el.getBoundingClientRect();
      if (!r.width) return null;
      const rr = { width: Math.round(r.width), height: Math.round(r.height) };
      return { el, side, text: label(rr, el), ax: (side === "left" ? r.left : r.right) + scrollX, ay: r.top + scrollY + Math.min(r.height / 2, 40) };
    }).filter(Boolean).sort((a, b) => a.ay - b.ay).forEach(n => {
      const y = Math.max(n.ay, placed[n.side] + 40);
      placed[n.side] = y;
      const note = document.createElement("span");
      note.className = "plans-note " + n.side;
      note.textContent = n.text;
      const edge = n.side === "left" ? colL - 76 : colR + 76;
      note.style.top = y + "px";
      note.style.left = edge + "px"; // left-side notes are shifted back by their own width in CSS
      layer.appendChild(note);
      const knee = n.side === "left" ? colL - 24 : colR + 24;
      const tip = n.side === "left" ? Math.min(n.ax - 6, colL - 6) : Math.max(n.ax + 6, colR + 6);
      const ln = line({ d: `M${edge + (n.side === "left" ? 12 : -12)} ${y}H${knee}L${tip} ${n.ay}` });
      const dot = line({ d: `M${tip} ${n.ay}m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0` }, "dot");
      items.push({ ...n, note, ln, dot });
    });
  }

  // Hover a part of the page (or its note) and its note lights up
  function light(item) {
    items.forEach(i => { const on = i === item; i.note.classList.toggle("on", on); i.ln.classList.toggle("on", on); i.dot.classList.toggle("on", on); i.el.classList.toggle("plans-hl", on); });
    root.classList.toggle("plans-focus", !!item);
  }
  document.addEventListener("mouseover", e => e.target.closest(".plans-notes") || light(items.find(i => i.el.contains(e.target)) || null));
  layer.addEventListener("mouseover", e => light(items.find(i => i.note === e.target) || null));

  // Redraw when the layout settles (fonts, the name animation, live data arriving) and on resize
  draw();
  document.fonts && document.fonts.ready.then(draw);
  [1200, 2600, 5000].forEach(t => setTimeout(draw, t));
  let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(draw, 120); });
})();
