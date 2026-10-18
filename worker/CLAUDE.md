# Cloudflare Worker (`worker/scores.js`)

One Worker, `tomellery-scores` (https://tomellery-scores.tomellery1818.workers.dev), does three jobs for the site:
game high scores (Neon Arcade + the secret games), the crypto price band, and the snow boards. Its KV namespace is
bound as `SCORES`; a Cron Trigger (every 15 min) refreshes prices and snow. Secret: `COINGECKO_KEY`.

**Keeping this guide current:** when the Worker or the deploy routine changes, suggest the matching edit to this
file, show Tom the exact wording, and only change it after he says yes.

## Deploying (by hand - Cloudflare isn't connected to this computer)

1. Bump `VERSION` near the top, so you can tell which copy Cloudflare is running.
2. Put the file on Tom's clipboard:
   `Set-Clipboard -Value (Get-Content -Raw -Encoding UTF8 worker\scores.js)` (PowerShell), and/or open it in the
   file pane.
3. Tom: dash.cloudflare.com → Compute (Workers) → Workers & Pages → **tomellery-scores** → **Edit code** → click in
   the code → Ctrl+A, Ctrl+V → **Deploy**. Walk him through it step by step if he asks.
4. Check: `curl https://tomellery-scores.tomellery1818.workers.dev/version` shows the new number, and `/crypto` and
   `/snow` still answer 200.

**Order matters when the site and the Worker change together** (for example a new rule the games have to follow):
push the site first, then deploy the Worker, so live pages never send something the Worker refuses.

## High scores

- Any 3-12 lowercase-letter game name works, for arcade boards (`/arcade`, top 5 with initials) and secret games
  (`/`, one best score) - **a new game needs no change here.**
- Every score needs a ticket from `GET /ticket`, signed by this Worker; the score must be possible in the time since
  the ticket (`LIMITS` per game, `DEFAULT_LIMIT` otherwise). Speed limit: 8 scores and 30 tickets a minute per
  visitor. At most 40 boards per kind. Give a game its own entry in `LIMITS` only if the default is too loose.
- KV keys: `arcade:tables` (all arcade boards), `secret:hi` (secret games; Flapper's and Runner's first records were
  in `hi:flapper` / `hi:runner`). Tom clears or edits scores by hand in Cloudflare → Workers KV → scores.
- The free plan allows about 1,000 KV saves a day, shared with the crypto and snow refreshes - keep anything new
  from writing on every request.
- Test bench (runs this file in the browser against a fake KV, with a clock that can jump ahead):
  `drafts/worker-test.html` (local only). Arcade-specific notes: `arcade/CLAUDE.md`.
