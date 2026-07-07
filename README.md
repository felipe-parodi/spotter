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
  **+5 lb** the next time you hit every rep target, auto-fills your working
  weight across sets, shows warm-up ramp sets computed from the weight you
  actually enter, detects personal records, and suggests today's split from
  what you trained last.
- Optional **cycle-aware mode** for those who want it (see the science note below).
- Add exercises mid-workout (search the database or create custom ones — leg
  press, 5-min HIIT blocks, anything), or start a blank freestyle session.
- History, weekly streaks, JSON backup export/import. Screen stays awake during
  a session.

Demo photos are from the public-domain
[free-exercise-db](https://github.com/yuhonas/free-exercise-db) (Unlicense).

## On the cycle-aware feature (and the science)

Cycle tracking is **opt-in** and only appears for profiles set to female. When
on, it predicts your cycle phase from logged period-start dates and shows it on
the Today screen with a short, honest note. It also offers an **optional**
"ease loads 10% during your period" toggle.

Crucially, it **never blocks, hides, or forbids exercises by phase.** That's a
deliberate, evidence-based choice. The popular idea that women shouldn't do
strenuous training in a given phase isn't supported by the current literature:

> McNulty et al. (2020), *Sports Medicine* — systematic review + network
> meta-analysis of 78 studies — found menstrual cycle phase has only a **trivial**
> average effect on strength/endurance performance (effect size ≈ −0.06), with
> large between-person variation, and concluded that **general phase-based
> guidelines can't be formed; a personalised, feel-based approach is
> recommended.** (doi:10.1007/s40279-020-01319-3)

A 2023 meta-analysis similarly found hormonal contraceptives don't meaningfully
change strength/hypertrophy adaptations (doi:10.1007/s40279-023-01911-3). So the
feature is built for **awareness and self-regulation** (training by feel, which
is legitimate RPE-based practice), not rigid rules. If future evidence shifts,
the phase notes in `app.js` (`PHASE_NOTE`, `CYCLE_SCIENCE`) are where to update.

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
