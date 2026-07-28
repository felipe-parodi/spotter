# Spotter

An offline-first workout app for two. No accounts, no servers, no internet needed
after install — each phone keeps its own profile and history.

**What it does**

- Pick muscle groups (e.g. *Back + Legs*) and a duration (30/45/60 min) → get a
  balanced plan with specific sets, reps, rest times, a form cue, and start/end
  demo photos per exercise. Tap any photo for a fullscreen lightbox with
  pinch/double-tap zoom, pan, and alternate-angle frames.
- **Weekly schedule** (optional): pick your training days and Spotter plans the
  week from standard splits (full body, upper/lower, push/pull/legs), scored so
  no muscle group is hit two days running — rest days stay restful, an optional
  cardio day breaks up dense weeks, and any day is tap-to-override (with a
  warning, never a block). Today shows the plan with one-tap build, a mini week
  strip, and a "you missed X — swap it in?" catch-up when it's safe.
- Plans are built from a ~65-exercise database (plus ~40 Rebuild-only movements) — now including **cardio**
  (treadmill, bike, rower, elliptical, stair climber, jump rope; logged in
  minutes) — filtered by your gym's equipment (toggle what your gym has in
  **Profile → Gym equipment**). Selecting the Cardio chip appends one cardio
  finisher block to the plan.
- Beginner vs. experienced modes gate out technical lifts; goal (fitness /
  muscle / strength) sets the rep ranges and rest periods.
- **Guided HIIT blocks** — Tabata, 30/30 intervals, an Orangetheory-style
  tread block, a bodyweight circuit — run on a fullscreen interval timer with
  beeps, launched from Today or mid-session, and log themselves as minutes.
- Log weight and reps per set with a **1½-minute** rest timer; suggestions come
  from your actual history, **set for set** — hit every rep target and each set
  moves up an increment; ramp 95/115/135 and next time it prescribes the same
  ramp. Miss badly and it suggests solidifying a touch lighter; stuck at one
  weight for three sessions and it proposes a 10% deload; away 4+ weeks and it
  eases you back in at 90%. Type a weight that differs from the prescription and
  **the rest of the ramp re-scales to it** — one increment per set the first
  time you do a lift, the shape you actually log after that, re-projected
  whenever you correct a number (weights you type yourself are never
  overwritten). Warm-ups scale to the load (light weights skip the
  ceremony, heavy lifts get a third step) and barbell warm-up steps land on
  **plate-loadable weights with per-side counts**, plus a plate breakdown for
  the working weight. PRs detected, today's split suggested from what you
  trained last, and each exercise takes a **persistent note** (seat height,
  grip, straps).
- After **Finish**: an optional cool-down (3–4 stretches matched to what you
  trained, with hold timers — skippable), then a summary with a deliberately
  **conservative calorie estimate** (MET-based; only shown when a bodyweight
  is logged).
- **Rebuild** — an optional 12-week rehab track for one cranky area at a time
  (knee, lower back, shoulder, outer hip, calf/Achilles, elbow, neck). A short
  intake routes you on *what provokes it* rather than a diagnosis, behind a
  blocking red-flag screen. Then it builds 20–30 min sessions from progression
  ladders, and — the important part — **progression is gated on how it feels the
  next morning**, not on reps hit. Two good mornings in a row and the load goes
  up; one bad one and it comes back down. Tracks morning pain, your own three
  “things this is making hard”, and a four-weekly capacity test; tells you
  plainly when six weeks have passed with no change. At week 12 the exercises
  graduate into your normal generated plans. See the science note below.
- Tap **✋** on any exercise mid-session to log that something bugged you. Four
  flags for one area in three weeks and Spotter offers to run a Rebuild block —
  which is a much better front door than a menu.
- Optional **cycle-aware mode** for those who want it (see the science note below).
- Add exercises mid-workout (search the database or create custom ones — leg
  press, anything), start a blank freestyle session, or **discard** a session
  entirely if life happens.
- History with a read-only **Review** of any past session (same photo cards as
  a live workout) and one-tap **Repeat** that rebuilds it as today's plan with
  refreshed weights; weekly streak plus a **daily streak** that tolerates up to
  two rest days; **sets-per-muscle-group bars for the current week** in Trends;
  JSON backup export/import. Screen stays awake during a session.

Demo photos are from the public-domain
[free-exercise-db](https://github.com/yuhonas/free-exercise-db) (Unlicense).

## On Rebuild (rehab mode)

Rebuild is **not a diagnosis and not a substitute for seeing someone.** It's
progressive strength training, organised around the thing that hurts, with the
guardrails that actually have evidence behind them. Full design rationale and
per-track citations live in [`REHAB-SPEC.md`](REHAB-SPEC.md); the short version:

- **Progression runs on the 24-hour response.** Up to ~5/10 during loading is
  fine, it should have settled by the next morning, and it must not climb week
  over week — Silbernagel's pain-monitoring model, implemented literally in
  `classifySession()`. Two greens to step up, one red to step down, and *no
  morning check means no progression* (no data, no risk).
- **Some pain is allowed.** Smith et al. (2017, *BJSM*) found painful protocols
  slightly beat pain-free ones short term (SMD −0.27). So Rebuild never says
  "stop if it hurts" — it says "tell me about tomorrow."
- **A good self-guided program is near the ceiling.** GRASP (n=708, 20 NHS
  trusts) found six sessions of tailored physio no better than *one* advice
  session plus a band and self-progressed home exercises: SPADI difference at 12
  months −0.66 (99% CI −4.52 to 3.20). That's the whole argument for building
  this into an app — and for not over-engineering it.
- **Twelve weeks, said on day one.** Most people quit around week 3 because
  nothing has changed yet. Managing that expectation is probably worth more than
  any exercise-selection decision in the feature.
- **Safety is a gate, not a footer.** Red flags block the program before it's
  generated; cauda equina gets its own same-day-care screen. The shoulder track
  opens with a self-administered *passive* external rotation test, because
  running a loading program on a frozen shoulder is the wrong tool.
- **It tells you when it isn't working.** Three sore mornings in four sessions
  drops a phase; a rising weekly trend eases the load; six weeks without change
  says see a physio; back symptoms travelling further down the leg stop it.
- **One block at a time.** Rehab adherence dies at volume.

## On the cycle-aware feature

Cycle tracking is **opt-in** and only appears for profiles set to female. The
cycle genuinely affects energy, mood, cramps, sleep, and motivation — and all of
that is different for every person and every month. So the feature is built
around a **daily check-in** rather than fixed rules:

- Each day the home screen asks *"How are you feeling?"* — an energy level
  (low / okay / great) plus optional symptom chips (cramps, tired, low mood,
  poor sleep, headache, bloating).
- On a **rough day** the generated workout adapts: lighter suggested loads (~15%),
  one fewer set on compounds, and selection steered away from the heaviest
  spinal-loaded lifts (`HIGH_STRAIN` in `app.js`) toward gentler movements. It
  also offers a one-tap **restorative session** (mobility + core). Nothing is
  forced.
- On a **strong day** it encourages pushing / progression.
- It shows the predicted phase for context and learns patterns over cycles
  (e.g. "around this phase you've often felt low — be kind to yourself").

**Why check-in-driven rather than phase-rule-driven:** the design follows the
individualized approach the evidence actually recommends. Population-level
"don't train hard in phase X" rules aren't supported — McNulty et al. (2020),
*Sports Medicine*, a network meta-analysis of 78 studies, found only a **trivial**
average effect of cycle phase on performance with large between-person variation,
and concluded a **personalised, feel-based approach** is what's warranted
(doi:10.1007/s40279-020-01319-3). Responding to how *she* actually feels today is
that personalisation. Supportive copy lives in `PHASE_NOTE` / `CYCLE_SCIENCE` and
the adaptation logic in `todayReadiness()` — both easy to tune with her feedback.

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

Updates are cheap: the exercise photos (5+ MB) live in a persistent cache that
survives version bumps, so a deploy only re-downloads the ~60 KB app shell.
New photos are fetched in the background and stale ones pruned automatically.

## Files

| File | What it is |
|---|---|
| `index.html` | Shell — loads everything |
| `styles.css` | All styling ("Bloom": soft coral, rounded, dark mode auto) |
| `db.js` | Exercise database + goal parameters |
| `rehab.js` | Rebuild: tracks, chains, rehab exercises, progression engine |
| `app.js` | Generator, workout flow, progression, storage |
| `sw.js` | Offline cache (bump `VERSION` on deploy!) |
| `precache-manifest.js` | Generated list of demo images (don't edit) |
| `manifest.webmanifest` | Home-screen install metadata |
| `img/` | Exercise demo photos (public domain) |
| `tools/make_icons.py` | Regenerates `icons/` (pure Python, no deps) |
| `tools/fetch_images.py` | Re-downloads/re-maps demo photos (WebP; needs Pillow) |
| `tools/test/` | Logic, browser E2E, Rebuild E2E, SW-update, and perf tests — see its README |

Data lives in `localStorage` under the key `spotter-v1`.

Rebuild adds `S.rehab` — `tracks[]` (one 12-week block each) and `niggles[]`.
Old backups without it load fine; the key is created on first launch.
