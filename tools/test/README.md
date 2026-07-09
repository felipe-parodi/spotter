# Spotter tests

No frameworks — plain Node scripts that print `ok:`/`FAIL:` lines and exit
non-zero on failure.

| Script | What it covers | Needs |
|---|---|---|
| `logic.test.js` | Generator, progression, streaks, calories, HIIT catch-up, plate math, weekly volume, repeat-session, view rendering (46 asserts) | Node only |
| `e2e.test.js` | Full user flow in a real browser: onboard → plan → lightbox → session → cool-down → summary → review → repeat → HIIT → discard | server + Playwright |
| `update.test.js` | Service-worker deploy flow: image cache survives updates, old shells cleaned, no photo re-downloads. Temporarily edits `sw.js` (auto-restored) | server + Playwright |
| `perf.test.js` | Load timing, SW precache cost, render/input latency with a 150-session history | server + Playwright |

## Running

```sh
# logic only (fast, no setup):
node tools/test/logic.test.js

# browser tests:
python3 -m http.server 8642        # from repo root, in another terminal
npm i playwright                   # anywhere on NODE_PATH
node tools/test/e2e.test.js
node tools/test/update.test.js
node tools/test/perf.test.js
```

Chromium is found via `$CHROME_PATH`, then `$PLAYWRIGHT_BROWSERS_PATH` /
`/opt/pw-browsers`, else Playwright's own download. Point `SPOTTER_URL` at a
different server if not using port 8642.
