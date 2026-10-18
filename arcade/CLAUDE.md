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
| One game | `arcade/games/<id>/index.html` + `<id>.js` (copy `snake/` as the pattern) |
| Construction crews on coming-soon cabinets | `arcade/shared/crew-sites.js`, `crew-sites.css` |
| The 20 crew sprites (shared with the menu sign) | `assets/crew.js` |
| NEON ARCADE sign in the site menu (hover glow, letter burnout, repairman) | `index.html` (menu + `.neon-item` CSS), `assets/neon-egg.js` |
| High score server (Cloudflare Worker) | `worker/scores.js` - see `worker/CLAUDE.md` |
| The two secret games (not part of the arcade, same score server) | `games/flapper.html`, `games/runner.html`, `assets/scores.js` |

## Adding or finishing a game

1. Build `arcade/games/<id>/` like the others. `<id>` is 3-12 lowercase letters; it is also the high score board's
   name. Load `../../shared/arcade.js?v=N` (same `N` as the other pages).
2. Scores: `Arcade.scores.qualifies/add/best/list/onChange` with your `GAME_ID`. The shared board works for any new
   id with **no Worker change**. Optionally add the id to `SEED_SCALE` in `arcade.js` so its made-up starting table
   fits how the game scores.
3. On `arcade/index.html`, turn the cabinet from `<div class="game-card soon">` into
   `<a class="game-card" href="games/<id>/index.html">` with `HI <span data-hi="<id>">` and `PLAY`. The construction
   crew leaves on its own (it only works on cards with the `soon` class) and the READY counter updates itself.
4. Changed `arcade.js`, `arcade.css` or a shared script? Bump its `?v=` on every page that loads it, or phones keep
   the old copy for a while.

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
- Score code bench (real Worker code against a fake database and a clock that can jump ahead):
  `drafts/worker-test.html` and `drafts/client-test.html` (local only).

## Working alongside other sessions

Other Claude sessions often build games in here at the same time. Before editing shared files (`arcade/index.html`,
`arcade.js`, `arcade.css`), check `git status` for someone else's uncommitted work; commit only your own files.
