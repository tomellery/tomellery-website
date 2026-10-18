// The 8-bit repair crew: 20 pixel characters shared by the Neon Arcade sign in the menu (assets/neon-egg.js)
// and the construction sites on the arcade's coming-soon cabinets (arcade/shared/crew-sites.js).
// All 20 are laid out side by side in drafts/repairmen.html (kept offline).
// Part of the Neon Arcade: how it all fits together, and Tom's style notes, are in arcade/CLAUDE.md.
//   Crew.list        the 20 crew members
//   Crew.sprites(m)  their frames (walk1, walk2, stand, up, down, lift, flail, think, sit) as ready-to-use SVG strings
(() => {
  // Every sprite is 10 x 13 pixels, facing right. Rows 10-12 are legs (swapped for walking).
  // Arms: A at columns 0 and 7 on rows 7-8; the hammer frames move the right arm and add the wrench (Z).
  // Shared keys: E eye, A arm, L legs, X boots (K unless legsK says otherwise). Everything else is per character.
  const FACE = ["..SSSS....", "..SSES....", "..SSSS...."];
  const LEGS = {
    stand: ["..LL.LL...", "..LL.LL...", ".XXX.XXX.."],
    walk1: ["..LL.LL...", ".LL...LL..", ".XX...XX.."],
    walk2: ["...LLL....", "...LLL....", "...XXX...."],
  };
  const SKIN = "#f1c27d", SKIN2 = "#c68642", EYE = "#0a0a0a", WRENCH = "#c3cad4";

  const CREW = [
    { name: "The Classic",
      c: { Y: "#ffd23f", S: SKIN, O: "#ff5a1f", B: "#2f6fdf", L: "#2f6fdf", K: "#4a3220", A: SKIN },
      rows: ["..YYYY....", ".YYYYYY...", "YYYYYYYY..", ...FACE, ".OOOOOO...", "AOBBBBOA..", "A.BBBB.A..", "..BBBB...."] },
    { name: "Hi-Vis",
      c: { W: "#f4f4f4", S: SKIN, V: "#c6ff2e", R: "#d9d9d9", D: "#3a3a3a", N: "#1d2b4f", L: "#1d2b4f", K: "#111", A: "#3a3a3a" },
      rows: ["..WWWW....", ".WWWWWW...", "WWWWWWWW..", ...FACE, ".VVDDVV...", "AVRRRRVA..", "A.VDDV.A..", "..NNNN...."] },
    { name: "Shredder",
      c: { O: "#ff5a1f", S: SKIN, K: "#111", C: "#29f0ff", T: "#14a39a", P: "#222", L: "#222", A: "#14a39a" },
      rows: ["...OO.....", "..OOOO....", ".OOOOOO...", "..SSSS....", ".KCCCC....", "..SSSS....", ".TTTTTT...", "ATTTTTTA..", "A.TTTT.A..", "..PPPP...."] },
    { name: "Sparky",
      c: { W: "#f4f4f4", S: SKIN2, B: "#3d7bd9", Y: "#ffd23f", J: "#33507a", L: "#33507a", K: "#3a2a1a", A: "#3d7bd9" },
      rows: ["..WWWW....", ".WWWWWW...", "WWWWWWWW..", ...FACE, ".BBBBBB...", "ABBBBBBA..", "A.YYYY.A..", "..JJJJ...."] },
    { name: "Bolt-Bot",
      c: { R: "#ff3b3b", M: "#9aa3ad", C: "#29f0ff", D: "#4b5560", L: "#9aa3ad", K: "#4b5560", A: "#9aa3ad" },
      rows: ["....R.....", "....M.....", "..MMMM....", "..MCCM....", "..MMMM....", "...MM.....", ".MMMMMM...", "AMMRMMMA..", "A.MDDM.A..", "..MMMM...."] },
    { name: "Night Ninja",
      c: { D: "#34344a", R: "#ff3b3b", S: SKIN, L: "#34344a", K: "#34344a", A: "#34344a" },
      rows: ["..DDDD....", ".DDDDDD...", "RRRRRRR...", "..DDDD....", "..SSES....", "..DDDD....", ".DDDDDD...", "ADDDDDDA..", "A.RRRR.A..", "..DDDD...."] },
    { name: "Gramps",
      c: { C: "#7a5634", S: SKIN, G: "#222", W: "#eeeeee", F: "#3f7d4a", P: "#6b6457", L: "#6b6457", K: "#2a2a2a", A: "#3f7d4a" },
      rows: ["..........", "..CCCC....", ".CCCCCCC..", "..SSSS....", "..SGEG....", "..WWWW....", ".FFFFFF...", "AFFFFFFA..", "A.FFFF.A..", "..PPPP...."] },
    { name: "The Welder",
      c: { D: "#3a3d42", V: "#3dff7a", R: "#8a5a32", B: "#1d2b4f", L: "#1d2b4f", K: "#111", A: "#8a5a32" },
      rows: ["..DDDD....", ".DDDDDD...", ".DDDDDD...", "..DDVV....", "..DDVV....", "..DDDD....", ".RRRRRR...", "ARRRRRRA..", "A.RRRR.A..", "..BBBB...."] },
    { name: "Ski Patrol",
      c: { K: "#3a3a3a", S: SKIN, R: "#e02424", W: "#ffffff", L: "#3a3a3a", A: "#e02424" },
      rows: ["..KKKK....", ".KKKKKK...", ".KKKKKK...", ...FACE, ".RRWRRR...", "ARWWWRRA..", "A.RWRR.A..", "..KKKK...."], legsK: "#777" },
    { name: "Zorp",
      c: { G: "#6dff6d", K: "#0a0a0a", P: "#8b3dff", L: "#8b3dff", A: "#6dff6d" },
      rows: ["..G..G....", "..GGGG....", ".GGGGGG...", ".GGKKGK...", ".GGGGGG...", "..GGGG....", ".PPPPPP...", "APPPPPPA..", "A.PPPP.A..", "..PPPP...."], legsK: "#6dff6d" },
    { name: "Bones",
      c: { W: "#ecebe4", K: "#0a0a0a", A: "#ecebe4", L: "#ecebe4" },
      rows: ["..........", "..WWWW....", ".WWWWWW...", ".WWKWK....", ".WWWWWW...", "..WKWK....", "...WW.....", "AWWWWWWA..", "A.W.WW.A..", "..WWWW...."],
      legs: { stand: ["..W..W....", "..W..W....", ".WW.WW...."], walk1: ["..W..W....", ".W....W...", "WW....WW.."], walk2: ["...WW.....", "...WW.....", "..WWW....."] } },
    { name: "Holly the Elf",
      c: { W: "#ffffff", G: "#1fae4b", S: SKIN, R: "#e02424", D: "#151515", Y: "#ffd23f", L: "#1fae4b", K: "#e02424", A: "#e02424" },
      rows: ["......WW..", "...GGGG...", "..GGGG....", "..SSSS....", ".SSSES....", "..SSSS....", ".RRRRRR...", "ARRRRRRA..", "A.DYYD.A..", "..GGGG...."] },
    { name: "Foreman Cat",
      c: { Y: "#ffd23f", F: "#f08a24", E: EYE, W: "#fff3e0", L: "#f08a24", K: "#fff3e0", A: "#f08a24" },
      rows: [".FYYYYF...", ".YYYYYY...", "YYYYYYYY..", ".FFFFFF...", "..FFEFE...", "..FWWWF...", ".FFFFFF...", "AFFWWFFA..", "A.FWWF.A..", "F.FFFF...."] },
    { name: "Space Tech",
      c: { W: "#eef1f5", Y: "#ffc93c", R: "#e02424", B: "#3d7bd9", L: "#eef1f5", K: "#8b939c", A: "#eef1f5" },
      rows: ["..WWWW....", ".WWWWWW...", ".WWYYYY...", ".WWYYYY...", ".WWWWWW...", "..WWWW....", ".WWWWWW...", "AWWRBWWA..", "A.WWWW.A..", "..WWWW...."] },
    { name: "Bubbles",
      c: { P: "#c58aff", W: "#ffffff", B: "#1a1a2e", A: "#c58aff", L: "#c58aff", K: "#c58aff" },
      rows: ["..........", "..PPP.....", ".PPPPP....", "PPPPPPP...", "PPPWWPW...", "PPPWBPB...", "PPPPPPP...", "APPPPPPA..", "PPPPPPP...", "PPPPPPP..."],
      legs: { stand: ["PPPPPPP...", "PPPPPPP...", "P.PP.PP..."], walk1: ["PPPPPPP...", "PPPPPPP...", ".PP.PP.P.."], walk2: ["PPPPPPP...", "PPPPPPP...", "P.PP.PP..."] } },
    { name: "Punk",
      c: { P: "#ff2e88", S: SKIN, K: "#3a3a3a", W: "#c3cad4", B: "#33507a", L: "#33507a", A: "#3a3a3a" },
      rows: ["...PP.....", "...PP.....", "..SPPS....", ...FACE, ".KKKKKK...", "AKWKKWKA..", "A.KKKK.A..", "..BBBB...."] },
    { name: "Night Shift",
      c: { Y: "#ffd23f", W: "#ffffff", Q: "#fff7b0", S: SKIN2, N: "#1d2b4f", R: "#c9ced6", L: "#1d2b4f", K: "#111", A: "#1d2b4f" },
      rows: ["..YYYY....", ".YYYYYWQQ.", "YYYYYYYY..", ...FACE, ".NNNNNN...", "ANRRRRNA..", "A.NNNN.A..", "..NNNN...."] },
    { name: "Frosty",
      c: { K: "#151515", W: "#f6f8ff", O: "#ff8a1f", R: "#e02424", A: "#7a5634", L: "#f6f8ff" },
      rows: ["..KKKK....", "..KKKK....", ".KKKKKK...", "..WWWW....", "..WWKWOO..", "..WWWW....", ".RRRRRR...", "AWWWWWWA..", "A.WWKW.A..", ".WWWWWW..."],
      legs: { stand: ["WWWWWWWW..", "WWWWKWWW..", ".WWWWWW..."], walk1: ["WWWWWWWW..", "WWWWKWWW..", ".WWWWWW..."], walk2: [".WWWWWWW..", "WWWWKWWW..", "..WWWWW..."] } },
    { name: "The Boss",
      c: { G: "#ffcf3f", S: SKIN, K: "#0a0a0a", D: "#2c2f36", W: "#ffffff", R: "#e02424", L: "#2c2f36", A: "#2c2f36" },
      rows: ["..GGGG....", ".GGGGGG...", "GGGGGGGG..", "..SSSS....", "..SKKK....", "..SSSS....", ".DDWWDD...", "ADDDRDDA..", "A.DDRD.A..", "..DDDD...."] },
    { name: "Off-Duty",
      c: { O: "#ff5a1f", S: SKIN, K: "#3a3a3a", W: "#f2efe6", J: "#33507a", L: "#33507a", A: "#3a3a3a" },
      rows: ["..OOOO....", ".OOOOOO...", ".OOOOOO...", ...FACE, ".KKKKKK...", "AKKWWKKA..", "A.KWWK.A..", "..JJJJ...."], legsK: "#f2efe6" },
  ];

  const set = (rows, list) => {
    const g = rows.map(r => r.split(""));
    list.forEach(([x, y, v]) => { g[y][x] = v; });
    return g.map(r => r.join(""));
  };
  const svg = (rows, colors) => '<svg viewBox="0 0 10 13" shape-rendering="crispEdges" aria-hidden="true">'
    + rows.map((row, y) => [...row].map((c, x) => colors[c] ? `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${colors[c]}"/>` : "").join("")).join("")
    + "</svg>";

  // Every frame for one crew member, as ready-to-use SVG
  function sprites(m) {
    const legs = m.legs || LEGS;
    const stand = m.rows.concat(legs.stand);
    const rows = {
      walk1: m.rows.concat(legs.walk1),
      walk2: m.rows.concat(legs.walk2),
      stand,
      up: set(stand, [[7, 7, "."], [7, 8, "."], [7, 6, "A"], [7, 5, "A"], [8, 4, "Z"], [8, 3, "Z"], [8, 2, "Z"], [9, 2, "Z"]]),
      down: set(stand, [[7, 8, "."], [7, 7, "A"], [8, 7, "A"], [9, 7, "Z"], [9, 6, "Z"], [9, 8, "Z"]]),
      // both arms up, no wrench: carrying, catching, tossing, climbing
      lift: set(stand, [[0, 7, "."], [0, 8, "."], [7, 7, "."], [7, 8, "."], [0, 6, "A"], [0, 5, "A"], [7, 6, "A"], [7, 5, "A"]]),
      // arms up and legs apart: falling, tripping, panicking
      flail: set(m.rows.concat(legs.walk1), [[0, 7, "."], [0, 8, "."], [7, 7, "."], [7, 8, "."], [0, 6, "A"], [0, 5, "A"], [7, 6, "A"], [7, 5, "A"]]),
      // scratching his head
      think: set(stand, [[7, 7, "."], [7, 8, "."], [7, 6, "A"], [7, 5, "A"], [7, 4, "A"], [6, 3, "A"]]),
      // sitting on the ground, legs out front: naps and breaks
      sit: ["..........", "..........", ...m.rows, m.legs ? m.legs.stand[2] : "..LLLLLLXX"],
    };
    const colors = { E: EYE, ...m.c, Z: WRENCH, X: m.legsK || m.c.K };
    return Object.fromEntries(Object.entries(rows).map(([name, r]) => [name, svg(r, colors)]));
  }

  window.Crew = { list: CREW, sprites };
})();
