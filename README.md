# Spotter

An offline-first workout app for two. No accounts, no servers, no internet needed
after install — each phone keeps its own profile and history.

**What it does**

- Pick muscle groups (e.g. *Back + Legs*) and a duration (30/45/60 min) → get a
  balanced plan with specific sets, reps, rest times, a form cue, and start/end
  demo photos per exercise.
- Plans are built from a ~60-exercise database filtered by your gym's equipment
  (toggle what your gym has in **Profile → Gym equipment**).
- Beginner vs. experienced modes gate out technical lifts; goal (fitness /
  muscle / strength) sets the rep ranges and rest periods.
- Log weight and reps per set with a rest timer; the app remembers and suggests
  **+5 lb** the next time you hit every rep target, shows warm-up ramp sets,
  detects personal records, and suggests today's split from what you trained last.
- Add exercises mid-workout (search the database or create custom ones — leg
  press, 5-min HIIT blocks, anything), or start a blank freestyle session.
- History, weekly streaks, JSON backup export/import. Screen stays awake during
  a session.

Demo photos are from the public-domain
[free-exercise-db](https://github.com/yuhonas/free-exercise-db) (Unlicense).

## Run it locally (Mac)

```sh
cd gym_app
python3 -m http.server 8642
# open http://localhost:8642
```

## Put it on your phones

The app needs to be served over **HTTPS** once for offline mode to activate
(a service worker caches everything, images included). Via GitHub Pages:

1. On each phone, open the GitHub Pages URL in Safari/Chrome.
2. Share button → **Add to Home Screen**. Done — it now works with zero signal.

Each phone that installs it gets its own independent profile and history
(set up during onboarding on that phone).

## Updating the app

1. Edit the files (or ask Claude to).
2. **Bump `VERSION` in `sw.js`** — this is what tells installed phones a new
   version exists.
3. Push. Next time a phone opens the app *with internet*, it shows an
   "Update ready → Reload" toast. No internet = keeps working on the old version.

## Files

| File | What it is |
|---|---|
| `index.html` | Shell — loads everything |
| `styles.css` | All styling (paper/ink editorial, dark mode auto) |
| `db.js` | Exercise database + goal parameters |
| `app.js` | Generator, workout flow, progression, storage |
| `sw.js` | Offline cache (bump `VERSION` on deploy!) |
| `precache-manifest.js` | Generated list of demo images (don't edit) |
| `manifest.webmanifest` | Home-screen install metadata |
| `img/` | Exercise demo photos (public domain) |
| `tools/make_icons.py` | Regenerates `icons/` (pure Python, no deps) |
| `tools/fetch_images.py` | Re-downloads/re-maps demo photos |

Data lives in `localStorage` under the key `spotter-v1`.
