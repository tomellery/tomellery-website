# Neon Arcade (`/arcade/`)

The arcade on tomellery.com: original browser games in an '80s neon style, with shared high scores and an 8-bit
construction crew working on the games that aren't finished. Plain HTML/CSS/JS, no build step; publishing = commit
and push `main` (GitHub Pages, about a minute). Where the games come from and the naming rules: `/README.md`.

**Keeping this guide current:** when Tom changes a preference or how something works, suggest the matching edit to
this file, show him the exact wording, and only change it after he says yes.

## Map

| What | Where |
|---|---|
| Arcade home: the Top 20 cabinet grid | `arcade/index.html` |
| Shared engine every game uses (screen, loop, controls, sound, high scores, initials, drawing helpers) | `arcade/shared/arcade.js`, `arcade.css` |
| One game | `arcade/games/<id>/index.html` + `<id>.js` (copy `trails/` as the pattern) |
| Construction crews on coming-soon cabinets | `arcade/shared/crew-sites.js`, `crew-sites.css` |
| The 20 crew sprites (shared with the menu sign) | `assets/crew.js` |
| NEON ARCADE sign in the site menu (hover glow, letter burnout, repairman) | `index.html` (menu + `.neon-item` CSS), `assets/neon-egg.js` |
| High score server (Cloudflare Worker) | `worker/scores.js` - see `worker/CLAUDE.md` |
| The two secret games (not part of the arcade, same score server) | `games/flapper.html`, `games/runner.html`, `assets/scores.js` |

## Adding or finishing a game

1. Build `arcade/games/<id>/` like the others. `<id>` is 3-12 lowercase letters; it is also the high score board's
   name. Load `../../shared/arcade.js?v=N` (same `N` as the other pages). Start new games on the game shell
   (`Arcade.createShell` in `arcade.js`: title, pause, initials, game over and HUD); `trails/` and `rocks/` are the
   examples to copy. The older games predate the shell and don't need moving to it.
2. Scores: `Arcade.scores.qualifies/add/best/list/onChange` with your `GAME_ID`. The shared board works for any new
   id with **no Worker change**. Optionally add the id to `SEED_SCALE` in `arcade.js` so its made-up starting table
   fits how the game scores.
3. On `arcade/index.html`, turn the cabinet from `<div class="game-card soon">` into
   `<a class="game-card" href="games/<id>/index.html">` with `HI <span data-hi="<id>">` and `PLAY`. The construction
   crew leaves on its own (it only works on cards with the `soon` class) and the READY counter updates itself.
4. Changed `arcade.js`, `arcade.css` or a shared script? Bump its `?v=` on every page that loads it, or phones keep
   the old copy for a while.

## What every game needs (definition of done)

- States like the others: title (attract mode with a CPU player or moving background) → ready → playing ⇄ paused →
  dying / clear → entry (initials, if the score qualifies) → gameover, back to the title after 20 s idle; Esc on
  game over goes to the title.
- HUD bar on top (SCORE / level / HI-SCORE), the same overlay layouts and prompts (`PRESS ENTER` / `TAP TO START`),
  a short how-to-play panel alternating with the high score table on the title.
- Keyboard and touch: on-screen buttons via `data-action`, swipes where they make sense, auto-pause on blur.
- Sounds from the engine's `SFX` (add new ones there, synthesized, no audio files); `sfx()` stays silent in attract
  mode.
- Scripted test of a full game (start, score, die, clear, game over) on the test bench, a long attract-mode run with
  no errors, a phone check at the mobile preset, and screenshots for Tom.

## How Tom likes a new game built

1. A written plan first (the game, controls, enemies, scoring, the build steps, open questions); start only after
   he says go.
2. Build in steps and send screenshots after the first playable step, so he can redirect early.
3. When it's done, open it in the browser pane for him to play. Commit and push only when he says so: one commit per
   game, with only your own files, and a descriptive message like the existing ones.
4. After pushing, check tomellery.com serves it (about a minute) before saying it's live.

## Roadmap (Top 20)

Each game adds one reusable piece to `arcade.js`, so later games get cheaper. Build in this order:

| Game | Plays like | Adds to the engine | Status |
|---|---|---|---|
| Neon Trails | light cycles | game shell, flood fill | live |
| Rock Blaster | Asteroids | vector kit (glowing line shapes, thrust/drag/wrap physics, hit tests) | live |
| Sky Shield | Missile Command | blast rings | |
| Block Drop | falling blocks | key auto-repeat | |
| Line Grab | Qix | (reuses flood fill, vector kit) | |
| Barrel Climb | Donkey Kong | platform physics (gravity, jumps, ladders) | |
| Stack Attack | Burger Time | (reuses platform physics) | |
| Bug Burst | Centipede | (reuses Swarm Strike shooting) | |
| Blast Zone | Bomberman | chain explosions, 2-player keyboard split | |
| Robo Rush | Robotron | twin-stick touch controls | |
| Sky Knights | Joust | (reuses platform physics, 2-player split) | |
| Pixel Hero | Mario-style | scrolling camera and level format | |
| Tunnel Storm | Tempest | 3D projection | |

Engine pieces land one at a time (they all touch `arcade.js`); games that only reuse pieces can be built in parallel
sessions. Card numbers aren't fixed: live games are grouped first, so a game that ships moves right after the last
live card and the coming-soon cards behind it renumber.

## The construction crews

- Two random crew members (never the Boss) work on every `soon` card. Cards get a custom job by their `<h2>` text
  through `JOBS` in `crew-sites.js` (Cube Hopper, Barrel Climb, Blast Zone, Pixel Hero); every other soon card gets
  the `general` hammer-and-haul crew.
- **They are supposed to be bad at their jobs.** About half the work goes wrong; a hover or tap always sets off a
  mishap. Gag library: `trip`, `crash` (faceplant / flat on his back, stars), `thumb`, `nap` (the Boss walks in),
  plus each job's own disasters. Personalities in `TRAITS` and by name: the Boss only checks on nappers, Gramps is
  slow and naps most, Bones falls to pieces instead of falling over.
- Gentle cartoon slapstick only: stars, dust, `!` `?` `Z` bubbles. Comedy timing: setup, fast fall, hold, sheepish
  recovery.
- Preview a gag: `/arcade/?gag=slip&crew=Bones,Gramps` (gag names are listed at the top of `crew-sites.js`).
- Sprites: 10 x 13 pixel maps in `assets/crew.js` with one letter per color; frames walk1, walk2, stand, up, down,
  lift, flail, think, sit. Any new frame or crew member works on both the arcade and the menu sign.
- All 20 side by side: `drafts/repairmen.html` (drafts/ stays on Tom's computer, never published).

## Tom's taste (learned the hard way)

- Keep the faithful '80s look of the originals, in neon; our own names only, never trademarked names or ripped
  sprites/sounds. Don't redesign for IP reasons unless asked.
- The crew is clumsy and lazy on purpose. A constant flicker on the neon sign looked "trashy" - one short
  switch-on flicker is fine.
- Desktop and phones differ on purpose: the menu sign lights on hover on desktop, and by itself 1.5 s after the
  menu opens on phones (first burnout at 10 s); INSERT/COIN is stacked everywhere.
- Glow and blur: the Claude preview runs Chromium and can't show how iPhones draw them. A big text-shadow glow is
  blocky and blurs the letters on iPhone; the arcade title uses blurred copies of the words behind the letters
  instead (`arcade.css`), the menu sign keeps a see-through text-shadow halo (per-letter blurred copies got boxed in
  on iPhone). Push glow changes as one revertible commit and ask Tom to check on his phone.
- Show him a preview before anything visual goes live; he likes to compare options side by side
  (`drafts/neon-glow.html` was the glow comparison).

## Testing

- Preview with the "site" launch config, then open `/arcade/` (port 8123, or 8124 via "site-alt" if it's busy). Hidden-pane caveat: when Tom's window is
  closed the browser pane stops painting and runs timers late - don't trust animation timing or screenshots then.
- Phone check in the preview: resize to the mobile preset (it also acts as a touch screen, `(hover: none)`).
- Scripted tests and real screenshots even when the pane is hidden: `drafts/arcade-test.html?game=<id>` runs a game
  on a manual clock (`__pump(ms)`, `__key(code)`), with `&hook=1` for access to the game's internals
  (`__in('state')`). For pictures, point headless Edge at it (`msedge --headless=new --screenshot=...`, a fresh
  `--user-data-dir` each time); Edge returns before the file is written, so wait for it. Usage is at the top of the
  file.
- Never submit initials in a test: that posts to the real shared high score table.
- Score code bench (real Worker code against a fake database and a clock that can jump ahead):
  `drafts/worker-test.html` and `drafts/client-test.html` (local only).

## Working alongside other sessions

Other Claude sessions often build games in here at the same time. Before editing shared files (`arcade/index.html`,
`arcade.js`, `arcade.css`), check `git status` for someone else's uncommitted work; commit only your own files.
