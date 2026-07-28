# Rebuild — rehab mode for Spotter

**Status:** built and shipped (SW `v3.7.0`). This is the design document the
implementation was written from — kept for the rationale and the citations.
Code lives in `rehab.js` (data + engine) and `app.js` (state, screens,
handlers); tests in `tools/test/logic.assertions.js` and
`tools/test/rehab.test.js`.

Decisions taken during the build that differ from the plan below are noted
inline as **[built]**.

A second way to use Spotter: instead of "pick muscle groups → get a workout," you
pick **the thing that's bugging you** and get a 12-week progressive loading
program that adapts to how the tissue responds — and that ends by merging back
into normal training.

---

## 0. The one-paragraph version

Musculoskeletal rehab works through one mechanism: **progressive loading,
sustained for months.** Not a magic exercise, not a modality. Spotter already
delivers progressive loading with history, suggestion, and adherence machinery.
So Rebuild is not a second app — it's **a constraint layer** (which exercises,
what range, what tempo) plus **a feedback layer** (progression gated on how you
feel the next morning, not just on reps hit) plus **a safety layer** (red flags
and time-based bail-outs) on top of the generator that already exists.

The genuinely new architectural piece: Spotter today is **stateless per session**
(`generateWorkout()` builds from scratch each time). Rehab is **longitudinal** —
a program with phases, week numbers, and a memory of how you responded. That's
the real build cost and it's worth paying.

---

## 1. Naming and positioning

**UI label: "Rebuild."** **[built]** Not "Rehab," not "PT," not "Recovery."

- "Rehab" and "PT" imply a clinical service being delivered. Once this is on a
  public URL with testers, that framing is both a claim we can't support and a
  regulatory smell (software that claims to *treat a diagnosed condition* is a
  different category from software that helps you train around a sore knee).
- "Recovery" is already overloaded in fitness apps (sleep, HRV, cold plunge).
- "Rebuild" matches the gym-journal voice, describes what actually happens
  (you're building capacity back), and stays honest.

Entry copy, verbatim proposal:

> **Rebuild**
> Something cranky? Rebuild gives you a structured 12-week loading program for
> one area at a time, and adjusts based on how it feels the next morning.
> It isn't a diagnosis and it isn't a substitute for seeing someone. It's
> strength training, organised around the thing that hurts.

The word "rehab" can stay in the README and internal identifiers. It's the
user-facing label that matters.

---

## 2. Design principles

1. **Never diagnose.** Route on *region + what provokes it*, never on a named
   condition. The user is never told "you have patellofemoral pain syndrome."
   Internally the pattern key is `pfp`; externally it's "the stairs-and-sitting
   pattern."
2. **Pain is a dial, not a switch.** ≤5/10 during, settled by the next morning,
   not rising week over week. Never "no pain allowed"; never "push through."
3. **The next morning is the signal.** Progression gates on the 24-hour
   response, not on today's rep count.
4. **Expect 12 weeks and say so on day one.** Most abandonment happens around
   week 3 because nothing has changed yet. Managing that expectation is probably
   worth more than any exercise-selection decision in this document.
5. **The endgame is a merge, not a graduation certificate.** Rebuild exercises
   are tagged to graduate into the normal database. Week 12 reads: *"your knee
   work is now just leg day."*
6. **No structural scare language, ever.** No "your patella tracks badly," no
   "degenerative," no imaging talk. It's nocebo, and it's mostly not true.
7. **Safety is a gate, not a footer.** Red flags block entry to the program.
   They are not a disclaimer at the bottom of a screen.

---

## 3. Safety architecture

### 3.1 Red-flag gate (blocking, before any program is generated)

Shown once per track at intake, re-asked if the user reports worsening. Any
`true` → **no program is offered**, full stop, with a plain-language "please get
this looked at" screen and a "I've been checked, continue anyway" escape that
requires an explicit second tap and is logged to `track.flags.redAcked`.

**Universal**

- Injury from a fall/collision/twist that you couldn't weight-bear on afterwards
- Joint that is hot, red, and swollen
- Fever, night sweats, or unexplained weight loss alongside the pain
- Pain that wakes you every night and doesn't ease with position change
- New, obvious weakness (things dropping, foot slapping, leg giving way)

**Back — cauda equina, urgent, separate screen with its own emphasis**

- Numbness in the saddle area (inner thighs, groin, buttocks)
- New difficulty starting or controlling urination, or bowel accidents
- Numbness or weakness spreading down **both** legs
- Recent loss of sexual sensation

Copy: *"These are the ones that need same-day care — not a physio appointment
next week. Go to an emergency department."* No hedging, no "consider."

**Shoulder — the frozen-shoulder differentiator**

This is the single highest-value screening question in the whole spec, and it's
answerable at home. Loss of *passive* external rotation is the finding that
separates a stiff capsule from a cuff problem — the cuff doesn't restrict
passive range. Self-test in the app:

> Stand with your elbow tucked into your side, bent 90°, holding a broomstick
> across your body with both hands. Use your **good** arm to push the sore arm's
> forearm outward. Don't resist — let it be pushed.
> Does the sore side stop much earlier than the good side, with a hard, blocked
> feeling rather than a painful one?

If yes → route **out** of the loading program to a "this looks like a stiffness
pattern, not a loading pattern; a clinician can confirm and it changes what
helps" screen, with gentle ROM only. A progressive loading program is the wrong
tool for a frozen shoulder and running one will make the tester's experience
bad.

### 3.2 Time-based bail-outs (non-blocking, but insistent)

Evaluated on every rehab session start:

| Trigger | Response |
|---|---|
| 3 red sessions in the last 4 | "This isn't settling" card, offer to drop a phase |
| Weekly mean AM pain rising 2 weeks running | Same card, plus "worth getting eyes on it" |
| Week 6 with <2 points NPRS improvement and no PSFS change | "Six weeks is long enough to expect a change. Time to see a physio." Persistent, dismissible per-week, never permanently silenced |
| Week 12 reached without meeting graduation criteria | "Rebuild has taken this as far as it can" + referral card |
| Any red flag newly answered yes | Immediate program pause |

### 3.3 Copy discipline

A short internal style rule enforced in review, not in code:

- ✅ "this pattern," "the tissue," "what tends to help," "for a lot of people"
- ❌ "your injury," "damaged," "degenerative," "misaligned," "you have X"
- ✅ "It's normal for this to be uncomfortable while you load it."
- ❌ "No pain, no gain" / "Stop immediately if you feel anything."

---

## 4. Routing model: region → self-test → pattern

Intake is a short wizard, never more than 6 taps.

```
Which area?          knee · low back · shoulder · hip (outer) · calf/achilles
                     · elbow · neck
Which side?          left · right · both
Red-flag screen      (region-specific, blocking)
What provokes it?    2–4 region-specific taps
Optional self-test   (shoulder passive ER; back directional probe)
Baseline             worst pain last 24h · typical pain · 3 activities (PSFS)
→ pattern key
```

Patterns are **internal**. The user sees a summary in their own words:
*"Front of the knee, worse going down stairs and after sitting. Twelve weeks,
three sessions a week, starting easy."*

If the answers don't cleanly match a pattern, fall through to the region's
**general** pattern — a broad, safe, mid-load program. Never force a match.

---

## 5. The program model

### 5.1 Phases

Every track has four phases. Advancement is on **criteria, not calendar** —
weeks are indicative only.

| Phase | Name | Typical weeks | Purpose | Advance when |
|---|---|---|---|---|
| 1 | **Settle** | 1–3 | Prove it tolerates load at all. Low load, mid-range, high frequency, optional isometrics. | ≥6 sessions logged, ≥4 green, typical pain ≤3 |
| 2 | **Build** | 3–8 | Heavy slow resistance, full range as tolerated, 2–3×/wk. This is where the actual adaptation happens. | ≥12 sessions, ≥8 green, reached top of the chain's mid rungs, PSFS +2 |
| 3 | **Capacity** | 8–12 | Heavier, then faster/reactive where it's relevant (tendon and lower-limb tracks only). | Capacity test target met (§9.3), pain ≤2 typical |
| 4 | **Merge** | 12+ | Exercises graduate into the normal database and normal generation. Track marked `graduated`. | — |

Phase 3 is **skipped entirely** for back, neck, and OA-pattern knee. Plyometrics
there buy nothing and add risk.

### 5.2 Session shape

A Rebuild session is 20–30 minutes. That number isn't arbitrary — the
dose-response meta-regression for chronic low back pain found 20–30 min,
3–5×/week produced the largest effects on pain and disability, and it's
consistent with tendon protocols.

```
[optional] Isometric primer     5 × 45s hold, ~70% effort, 2 min rest
                                Framed as: "some people find this takes the
                                edge off before loading. Skip it if it doesn't."
Main loading                    2–4 exercises, tempo-controlled
[optional] Load-modification    daily-life advice card (hip track especially)
Close                           during-session pain: 0–10 chip row
```

The isometric primer is **optional and honestly framed**. Rio's original work
showed a striking immediate analgesic effect (pain 6.8/10 → post-isometric vs
2.6/10 post-isotonic), but the 2020 meta-analysis of 10 RCTs found isometrics
**not superior** to isotonic at ≤12 weeks on any outcome. So: offer it as a
tool, never build the program around it.

### 5.3 Tempo is a first-class parameter

New for Spotter. Heavy slow resistance — roughly 3 s down, 3 s up, in the 3–5RM
zone, 3×/week — matches or beats eccentric-only protocols on pain and function,
with better 6-month satisfaction and the only protocol showing collagen/glycation
changes. You can't deliver HSR without controlling tempo.

Implementation: reuse the HIIT interval engine. `blip()` on each phase
transition, a thin progress ring on the set row. Tempo is `{ecc, iso, con}` in
seconds on the exercise definition. A set of 8 at 3-0-3 is 48 s of work — the
timer knows this and the rest timer starts automatically.

---

## 6. The progression engine (the heart of it)

Spotter's `suggestFor()` progresses on *"did you hit your reps."* Rebuild
progresses on *"did you hit your reps **and** was the next morning okay."*

### 6.1 Inputs

Per session:

- `duringPain` — 0–10, one tap at session close ("worst it felt during").
- `nextDay` — collected on the next app open ≥8 h later, on the Today screen,
  in the same card slot that `checkinCard()` already occupies:
  *"How's the left knee this morning?"* → **better · same · was sore, settled ·
  still sore now**
- `amPain` — optional 0–10 alongside it, used for the trend chart.

If `nextDay` is never answered, the session is treated as `same` **but cannot
produce a progression.** No data, no risk.

### 6.2 Classification

```js
function classify(session, check, track) {
  if (!check)                              return 'unknown';   // → hold
  if (session.duringPain > 5)              return 'red';
  if (check.nextDay === 'still-sore')      return 'red';
  if (weeklyTrendRising(track))            return 'red';
  if (check.nextDay === 'sore-settled')    return 'amber';
  return 'green';                                              // better | same
}

// mean AM pain this week > mean AM pain last week + 1, ≥3 data points each side
function weeklyTrendRising(track) { … }
```

This is the Silbernagel pain-monitoring model, implemented literally: pain up to
5/10 during loading is acceptable, it must have settled by the following
morning, and it must not escalate week to week.

### 6.3 Decision

Evaluated at the **start** of the next session for that track:

| Class | Streak | Action |
|---|---|---|
| green | 2nd consecutive | **Progress** one dose step |
| green | 1st | Repeat, bank the green |
| amber | — | Repeat same dose, note "holding here" |
| unknown | — | Repeat same dose |
| red | — | **Regress** one dose step, reset green streak |
| red | 2nd consecutive | Drop to previous phase + surface the "not settling" card |

Requiring **two** greens before progressing is deliberately conservative. A
single good day is noise; two in a row is a signal. It also roughly halves the
rate of climb, which matches how these protocols actually run in practice.

### 6.4 Dose steps (one uniform mechanism)

Rather than authoring an explicit ladder per exercise, one function walks a
generic progression, which is just double progression with a rung jump at the
top — the same mental model Spotter's users already have:

```js
// order of operations, ascending:
//   reps ↑ within range  →  load ↑ (reps reset to bottom)  →  sets ↑ (to cap)
//   →  next rung in the chain (reset to that rung's base dose)
function nextDose(cur, ex) { … }
function prevDose(cur, ex) { … }   // exact inverse
```

Each rehab exercise carries: `baseSets`, `repRange`, `setCap`, `loadable`
(reuses `incrFor()`), `chain`, `rung`. Bodyweight rungs progress by reps and
leverage only; the rung jump *is* the load increase.

**Regression must be able to leave the exercise.** Dropping below a rung's base
dose moves down the chain — that's the point of chains. Example, the knee quad
chain:

```
rung 1  wall sit (isometric)              →  time
rung 2  box squat to a high box           →  reps, then depth
rung 3  split squat, rear foot on floor   →  reps → load
rung 4  rear-foot-elevated split squat    →  reps → load
rung 5  loaded step-down / full squat     →  load  → merges to normal db
```

### 6.5 Interaction with existing machinery

- `todayReadiness()` applies: a rough check-in day **holds** the dose rather
  than scaling it. Never progress on a low-energy day.
- The 4-weeks-away rule from `suggestFor()` becomes 2 weeks for rehab: away 2+
  weeks → drop one dose step and rebuild. Tendons detrain faster than patience.
- `readinessLoad()` still scales absolute weight downward on rough days.

---

## 7. Data model

### 7.1 New state (`app.js`, `defaultState()`)

```js
rehab: {
  enabled: false,
  tracks: [],    // active, paused, graduated — newest first
  niggles: [],   // {date, exId, region, side} from normal sessions (§11)
}
```

A track:

```js
{
  id: 'knee-left-1753574400000',
  region: 'knee',
  side: 'left',              // 'left' | 'right' | 'both'
  pattern: 'pfp',            // internal; never shown
  startedAt: '2026-07-27T…',
  status: 'active',          // active | paused | graduated | stopped
  phase: 1,                  // 1–4
  dose: {                    // exId → current dose
    'wall-sit':      { sets: 3, reps: 30, load: 0 },
    'split-squat':   { sets: 3, reps: 8,  load: 20 },
  },
  rung: { 'knee-quad': 3, 'knee-hip': 2 },   // chain → current rung
  greenStreak: 1,
  baseline: {
    worst: 6, typical: 4,
    psfs: [ { task: 'going down stairs', score: 3 }, … ],  // 0–10, ×3
  },
  sessions: [ { date, exIds: [...], duringPain: 4, dose: {...} } ],
  checks:   [ { date, nextDay: 'same', amPain: 3 } ],
  psfsLog:  [ { date, scores: [3,4,5] } ],   // re-rated every 2 weeks
  capacity: [ { date, test: 'heel-raise-l', value: 12 } ],
  flags: { redAcked: null, referralShownWeek: null },
}
```

### 7.2 Exercise definitions (`db.js`)

Rehab exercises live in the **same** `EXERCISES` array with `rehab: true`, so
that mid-session search, custom notes, images, and the lightbox all work
unchanged. One-line change keeps them out of normal generation:

```js
// app.js pickExercise(), pool filter — add:
&& !e.rehab
```

New fields:

```js
{ id: 'split-squat-rfe', name: 'Rear-Foot-Elevated Split Squat',
  m: ['quads'], m2: ['glutes'], eq: ['dumbbell','bench'], lvl: 2,
  cmp: true, incr: 5, uni: true,
  cue: '…',

  // --- rehab additions ---
  rehab: true,
  region: ['knee'],              // which tracks may select it
  chain: 'knee-quad', rung: 4,   // position in the progression ladder
  baseSets: 3, repRange: [6,10], setCap: 3, loadable: true,
  tempo: { ecc: 3, iso: 0, con: 1 },
  provokes: ['deep-knee-flexion'],   // exclusion tags
  phases: [2,3],                  // which phases it's eligible in
}
```

Isometric entries add `iso: true` and use `repRange` as a seconds range.

`provokes` tags drive exclusion, and they're what let one exercise library serve
patterns with opposite needs:

| Tag | Excluded by |
|---|---|
| `deep-knee-flexion` | PFP phase 1, patellar tendon phase 1 |
| `hip-adduction` | gluteal tendinopathy — **all phases** |
| `ankle-dorsiflexion-load` | insertional achilles — all phases |
| `spinal-flexion-loaded` | back phase 1, flexion-intolerant pattern |
| `spinal-extension-loaded` | extension-intolerant back pattern |
| `overhead` | shoulder phases 1–2 |
| `end-range-shoulder` | shoulder phase 1 |

### 7.3 New tables (`db.js`)

```js
const REHAB_REGIONS  = [ { id:'knee', label:'Knee', … }, … ];
const REHAB_PATTERNS = { pfp: { … }, 'patellar-tendon': { … }, … };
const REHAB_CHAINS   = { 'knee-quad': ['wall-sit','box-squat', …], … };
const RED_FLAGS      = { universal: [...], back: [...], shoulder: [...] };
const REHAB_EDU      = { … };   // education + load-modification cards
const CAPACITY_TESTS = { 'heel-raise': { … }, 'sit-to-stand-30': { … } };
```

---

## 8. The tracks

Evidence strength is graded honestly: **A** = multiple RCTs / meta-analyses,
**B** = RCT evidence with caveats, **C** = conventional practice, thin evidence.

### 8.1 Knee

Three patterns. This is the best-evidenced region and the right one to build
first.

**Pattern `pfp`** — diffuse pain around/behind the kneecap, worse going *down*
stairs, squatting, and after prolonged sitting. **Evidence: A.** Combined
proximal (hip) and quadriceps loading has the best evidence for pain and
function — better than quads alone. Head-to-head hip-first vs quad-first trials
find both work, with hip-first possibly reducing pain sooner; both reduce
dynamic knee valgus on step-downs.

- Chains: `knee-quad` (wall sit → box squat → split squat → RFE split squat →
  step-down/loaded squat) **and** `knee-hip` (side-lying abduction → banded
  standing abduction → hip thrust → single-leg hip thrust → loaded hinge).
  Both run every session. This is the non-negotiable part.
- Range: phase 1 avoids deep flexion; phases 2–3 progressively restore it.
  No dogma about "knees over toes" in either direction.
- 3×/week.

**Pattern `patellar-tendon`** — point-tender just below the kneecap, worse with
jumping/landing/decelerating, characteristically **warms up** with activity.
**Evidence: A for progressive loading, B for HSR specifically.**

- Heavy slow resistance: 3 s down / 3 s up, working toward the 3–5RM zone,
  3×/week. Matches eccentric-only on outcomes with better satisfaction.
- Isometric primer offered (see §5.2 caveat).
- Explicitly permitted to hurt up to 5/10 during. This pattern is where the
  pain-monitoring model matters most, and where a "stop if it hurts" app would
  actively fail the user.
- Phase 3 adds reactive work (drop squats → hops) if they play a sport.

**Pattern `knee-oa`** — age 45+, gradual onset, morning stiffness under 30 min,
crepitus, better with movement than rest. **Evidence: A.**

- GLA:D-style: education + neuromuscular exercise. The international dataset of
  28,370 patients shows 26–33% mean pain improvement, 8–12% walking speed,
  18–30% chair-stand improvement, and 110–120% increases in physical activity —
  from 2–3 education sessions plus 12 exercise sessions over 8 weeks.
- The education content is not optional garnish; it's half the intervention.
  Key message: **loading is good for the joint.** Cartilage responds to load.
  Resting an osteoarthritic knee makes it worse.
- No phase 3. Merge target is normal leg day, permanently.

**Route out:** true locking, giving way, or a knee that swelled within hours of
a twist → clinician.

### 8.2 Low back (and core)

**Decision: core is folded into back, not made its own region.** There is no
"core injury" presentation. A standalone core-rehab track would be a solution
without a problem, and it would compete with the back track for the same
exercises.

**Pattern `back-general`** — non-specific mechanical low back pain, no leg
symptoms. **Evidence: A for "exercise beats nothing," C for any specific
modality being best.** Network meta-analyses converge on combined stabilisation
+ strengthening being modestly favoured, but no modality clearly wins. That's
freeing: don't over-engineer the exercise selection, over-engineer the
adherence.

- Content: anti-flexion and anti-extension core (dead bug, bird dog, side plank
  — all already in the database), plus graded hinge and loaded carries.
- Dose: 20–30 min, 3–5×/week, per the dose-response meta-regression.
- **Education is the primary intervention here.** Staying active beats bed rest;
  this is one of the most consistent findings across every international
  guideline. Card on day one: *"Hurting doesn't mean harming. Backs are robust.
  The worst thing you can do is stop moving."*

**Optional directional probe** (2 minutes, at intake) — **Evidence: B, short
term.** Centralisation occurs in roughly 58–91% of people with LBP, and of
those, 67–85% prefer extension. Where a preference exists, biasing early
exercise toward it improves short-term pain and disability; long-term benefit
is unproven.

> Lie on your front, prop up on your elbows for 60 s. Then stand and bend
> forward gently 5 times. Which one left your back feeling better, and did any
> leg symptoms move *toward* your back?

Result biases phase 1 selection (`spinal-flexion-loaded` vs
`spinal-extension-loaded` exclusion tag) and nothing more. It does not change
phases 2–4.

**Pattern `back-leg`** — pain referring below the knee. Still exercise, gentler
progression, and the app watches for centralisation vs peripheralisation across
weeks. Symptoms moving *down* the leg over two weeks, or any new weakness →
clinician card, not a "not settling" card.

### 8.3 Shoulder

**Pattern `rcrsp`** — painful arc, worse overhead, worse lying on that side,
weakness that's clearly pain-limited, **passive range preserved**.
**Evidence: A for exercise; A for "supervision adds nothing."**

GRASP is the anchor and the humbling result: 708 patients, 20 NHS trusts. Up to
six sessions of individually tailored progressive exercise with a physio vs
*one* 60-minute best-practice-advice session with a booklet, a band, and
self-progressed home exercises. SPADI at 12 months: adjusted mean difference
**−0.66 (99% CI −4.52 to 3.20)**. Nothing.

Two things follow. First, a well-built self-guided app is at or near the
practical ceiling for this condition — this is the strongest argument in the
whole spec for building Rebuild at all. Second, don't over-engineer: GRASP's
comparator progressed *5×/week, self-selected*, and matched the tailored arm.

- Chains: `sh-cuff` (isometric ER/IR at 0° → banded ER/IR → loaded ER/IR at 45°
  → loaded at 90°) and `sh-scap` (prone Y/T → row → landmine press → overhead
  press). Overhead is excluded until phase 3.
- 5×/week at low load in phase 1, dropping to 3×/week as load rises.

**Pattern `frozen`** → **routed out** (§3.1). Not a loading problem.

### 8.4 Hip — lateral (gluteal tendinopathy)

**Evidence: A.** The LEAP trial (BMJ 2018, n=204) compared education + exercise
vs corticosteroid injection vs wait-and-see. Education + exercise beat injection
on global improvement and pain at 8 weeks, and the economic evaluation found it
cost-effective on quality of life long-term.

This track introduces a **content type Spotter doesn't have: load-modification
advice.** A large share of LEAP's effect came from teaching people to avoid
compressive hip adduction in daily life, not from the exercises. So the track
ships daily-life cards:

- Don't cross your legs; don't stand hanging on one hip
- Sleep with a pillow between your knees; don't sleep on the sore side
- Avoid low, deep chairs and sitting with knees together
- Walking is fine; walking with a hip-swaying gait is what to avoid

Exercise: isometric abduction → abduction in **neutral** (never crossing
midline) → weight-bearing. Every exercise tagged `hip-adduction` is excluded in
all four phases — including the clamshells that half the internet prescribes for
this.

### 8.5 Calf / Achilles

**Sub-route on location, because it changes the exercise:** midportion (2–6 cm
above the heel bone) vs insertional (right at the heel bone). Insertional
excludes `ankle-dorsiflexion-load` — heel raises off flat ground, never off a
step, because the dorsiflexed position compresses the insertion.

**Protocol: Silbernagel, not Alfredson. Evidence: A, and they're equivalent.**
The head-to-head RCT found no difference in clinical effect between Alfredson's
isolated eccentrics and Silbernagel's combined concentric-eccentric loading.
Given equivalence, pick the one that's actually adherable:

- Alfredson: 180 reps/day, twice daily, 12 weeks.
- Silbernagel: 3×15, **once** daily, progressing bipedal → unipedal →
  concentric-eccentric → eccentric-only → weighted (5 kg steps, only when pain
  stays ≤5/10) → fast-rebounding → plyometric.

Silbernagel is a third of the daily burden, has the progression ladder and the
pain-monitoring rule built into it, and maps perfectly onto the chain/rung model
above. It is the natural reference implementation for the whole engine.

### 8.6 Elbow (lateral)

**Evidence: B for loading generally, C for the specific progression rule.**
Progressive loading is first-line. Sequence: isometric wrist extension holds →
slow eccentric/HSR wrist extension → grip and functional work. Under-loading the
late stage is the conventional explanation for high recurrence.

The commonly-cited rule — progress once you can do 30 reps pain-free on two
consecutive days — is clinical convention, **not** trial-derived. Implement it,
but the code comment should say so, and the pain-gated engine (§6) supersedes it
anyway.

### 8.7 Neck

**Evidence: B.** Eight of nine studies in a systematic review support low-load
deep cervical flexor training, and there's moderate evidence for
cervicoscapular and upper-extremity strengthening on pain immediately
post-treatment. One RCT found deep neck flexor work superior to isometric,
stretching, and scapulothoracic exercise on pain, disability, and ROM.

- Chain: craniocervical flexion (chin nod, supine, very low load) → endurance
  holds → cervicoscapular strengthening (rows, prone Y/T) → loaded carries.
- Additional red flags: onset after trauma, dizziness/visual disturbance/drop
  attacks, arm weakness or numbness → clinician.
- No phase 3.

---

## 9. Measuring whether it works

You want testers, which means you want data that distinguishes "they liked it"
from "it helped."

### 9.1 NPRS — every session

`duringPain` and `amPain` are already being collected by the engine. Free.
Chart both. Roughly 2 points on 0–10 is the threshold where people notice a
difference.

### 9.2 PSFS — every 2 weeks

The Patient-Specific Functional Scale is ideal for an app: the *user* names 3
activities that are currently hard ("going down stairs," "sleeping on my left
side," "picking up my kid"), rates each 0–10 for ability, and re-rates the same
three every 2 weeks. It's short, it's meaningful to the person, and ~2 points of
change is clinically meaningful.

This is worth more than any other metric in the app, because it's the thing that
makes someone feel the program worked.

### 9.3 Capacity tests — every 4 weeks

Objective, no equipment, repeatable. Also serve as phase-3 entry criteria.

| Region | Test | Phase 3 target |
|---|---|---|
| Knee, calf | Single-leg heel raises to failure | Within 20% of the good side |
| Knee | 30-second sit-to-stand count | Within 20% of the good side |
| Knee | Wall-sit hold, both sides separately | Symmetric |
| Shoulder | Wall-slide reps, pain-free range | Full range, no arc |
| Hip | Side-lying abduction hold, seconds | Within 20% of the good side |
| Back | Side-plank hold, both sides | Symmetric, ≥45 s |

Rendered with the existing `bigChartSVG()` in Trends.

---

## 10. UI surfaces

| Screen | Route | Notes |
|---|---|---|
| Rebuild card on Today | — | Sits alongside `checkinCard()`. Shows "Left knee · week 3 of 12 · next session today" + a one-tap build. Absent unless a track is active. |
| Next-morning check | — | Occupies the `checkinCard()` slot on first open ≥8 h after a rehab session. 4 taps, ~3 seconds. **This is the most important interaction in the feature** — if it isn't effortless, the whole engine starves. |
| Intake wizard | `rehab-setup` | Region → side → red flags → provocation → self-test → baseline/PSFS. |
| Track hub | `rehab` | Phase rail (1–4), week N of 12, pain trendline, PSFS deltas, capacity tests, education cards, pause/stop. |
| Rehab session | `workout` | **Reuses `viewWorkout()`** with a rehab banner, tempo rings on set rows, and a pain chip row at close. Do not build a second workout screen. |
| Trends | `trend` | Pain over time + capacity tests, per track. |
| Profile | `profile` | Rebuild on/off, archived tracks. |

Existing infrastructure that gets reused rather than rebuilt: the interval timer
(tempo), `blip()`/`beep()`, `sparkSVG()`/`bigChartSVG()`, `demoHTML()` and the
lightbox, notes, the rest bar, wake lock, `toast()`.

---

## 11. Niggle tracking — the on-ramp

Ship this **first**, before any of the above. It's cheap and it earns the
feature its entry point.

A small "this bugged me" tap on any exercise card during a normal session.
One tap → region + side sheet → stored to `S.rehab.niggles`. No program, no
prompt, no judgement.

After 4+ flags for one region within 3 weeks, the Today screen offers:

> Your left knee has come up 6 times in the last three weeks.
> Want to run a Rebuild block for it?

That's a far better entry point than a mode selector on the home screen,
because it arrives at the moment the user has already noticed the problem.
It also produces the body-map data that makes Trends interesting.

---

## 12. Graduation and merge

At phase 4, for each chain, the top rung is retagged so it enters normal
generation:

```js
// track.graduated = ['split-squat-rfe', 'hip-thrust-sl', …]
// pickExercise() pool filter becomes:
&& (!e.rehab || graduatedIds.has(e.id))
```

The track's status goes to `graduated`, the Today card disappears, and the
history entry reads:

> **Left knee — rebuilt.** Twelve weeks, 34 sessions. Stairs went from 3/10 to
> 9/10. Your split squats and hip thrusts are just part of leg day now.

Graduated tracks stay in Profile and can be restarted at phase 2 if things flare
— restarting at phase 1 after a successful block is demoralising and
unnecessary.

---

## 13. Build order

**Stage 0 — niggle tracking** (§11). Small. Ships alone, useful alone.

**Stage 1 — foundation.** `S.rehab` state + migration, `REHAB_REGIONS` /
`REHAB_PATTERNS` / `RED_FLAGS` tables, intake wizard, red-flag gate, track hub,
Today card. Program is *fixed* at this stage — no adaptation. One region (knee)
with hand-written phases. This is enough to test whether people will actually
run a 12-week block.

**Stage 2 — the engine.** `classify()`, `nextDose()`/`prevDose()`, chains and
rungs, next-morning check card, phase advancement criteria, bail-out cards.
Convert knee to engine-driven. This is the technically interesting stage and the
one that needs tests.

**Stage 3 — tempo.** Tempo field, interval-driven set timing, HSR doses.
Required before the tendon patterns are honest.

**Stage 4 — regions.** Calf/Achilles first (Silbernagel is the cleanest fit for
the engine and validates it), then back, shoulder, hip, elbow, neck. Each is
mostly exercise authoring, not code.

**Stage 5 — outcomes.** PSFS, capacity tests, pain trend charts, the Trends
integration.

**Stage 6 — merge/graduation** (§12).

Realistic content estimate: **~70 new exercise entries** across seven tracks.
That's the bulk of the work and it's authoring, not engineering.

---

## 14. Known problems

**Photos.** The free-exercise-db won't have images for Spanish squats,
Copenhagen planks, craniocervical flexion, or banded ER at 45°. `demoHTML()`
already returns `''` gracefully when `HAS_IMG` misses, so nothing breaks — but a
rehab exercise with no picture and a one-line cue is a weak instruction. Options,
in order of preference: (a) re-run `tools/fetch_images.py` and take what exists,
(b) shoot them yourselves on a phone against a blank wall — it's ~40 exercises
and would take an afternoon, (c) accept text-only with a longer `HOWTO` entry.
Recommend (b); it also makes the feature feel handmade, which suits the app.

**Bilateral tracks.** "Both sides" doubles unilateral session length. Either cap
at 3 exercises for bilateral tracks or accept 40-minute sessions. Needs a
decision.

**Two active tracks at once.** A knee and a shoulder track simultaneously is
plausible and would produce 50 minutes of rehab a day. Recommend hard-capping at
**one active track**, with a "park this one first" prompt. Rehab adherence dies
at volume.

**`weekStats()` pollution.** Rehab sets would flood the sets-per-muscle-group
bars. Tag rehab sets and render them as a separate stacked segment.

**PRs.** `computePRs()` should keep working for rehab exercises — a heavier
split squat *is* worth celebrating and it's motivating in exactly the right way.
No change needed; noting it because it looks like a bug when first seen.

**The disclaimer.** Once testers who aren't you are using this, it needs an
explicit, dismissible-once, not-medical-advice screen at first Rebuild launch.
Not a footer.

---

## 15. Open decisions

1. **Label:** "Rebuild" (recommended) or keep "Rehab"?
2. **Bilateral session length** — cap exercises or accept longer sessions?
3. **One active track max** — agree?
4. **Photos** — shoot them, or ship text-only for the missing ones?
5. **Stage 0 alone first?** Shipping niggle tracking this week gives you real
   data on which regions actually matter to you two before ~70 exercises get
   authored for regions nobody flags.

---

## Evidence appendix

**Patellofemoral / knee**
- [Hip strengthening vs quadriceps vs stretching for PFP (RCT)](https://pubmed.ncbi.nlm.nih.gov/29661570/)
- [Differential effects of quadriceps and hip exercises for PFP — JOSPT 2024](https://www.jospt.org/doi/10.2519/jospt.2024.12503)
- [Long-term hip vs quad vs free activity for anterior knee pain (protocol)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4342827/)
- [GLA:D outcomes, 28,370 patients, Denmark/Canada/Australia](https://pubmed.ncbi.nlm.nih.gov/33561542/)

**Pain during exercise**
- [Should exercises be painful in chronic MSK pain? Smith et al., BJSM 2017](https://pubmed.ncbi.nlm.nih.gov/28596288/) — SMD −0.27 (−0.54 to −0.05) favouring painful exercise, short term only
- [Updated review — JOSPT 2025](https://www.jospt.org/doi/10.2519/jospt.2025.13253)

**Tendon loading and the pain-monitoring model**
- [Silbernagel — continued sports activity using a pain-monitoring model, Achilles (RCT)](https://journals.sagepub.com/doi/abs/10.1177/0363546506298279)
- [Alfredson vs Silbernagel, midportion Achilles — no difference (RCT)](https://journals.sagepub.com/doi/10.1177/23259671211031254)
- [Alfredson vs Silbernagel protocol detail](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5504829/)
- [Isometric vs eccentric vs HSR for patellar tendinopathy — network meta-analysis](https://www.sciencedirect.com/science/article/pii/S2405844024152024)
- [Isometric exercise in tendinopathy — systematic review & meta-analysis (not superior)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7406028/)
- [Load management in tendinopathy — clinical progression](https://www.apunts.org/en-load-management-in-tendinopathy-clinical-articulo-S1886658117300580)
- [Lateral elbow tendinopathy — exercise prescription toolkit](https://www.physio-pedia.com/Lateral_Epicondyle_Tendinopathy_Toolkit:_Section_E_-_Exercise_Prescription)

**Shoulder**
- [GRASP trial — progressive exercise vs best practice advice, n=708](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8343092/)
- [Adhesive capsulitis: diagnosis and management — AFP](https://www.aafp.org/afp/2019/0301/p297)
- [Adhesive capsulitis — StatPearls](https://www.ncbi.nlm.nih.gov/books/NBK532955/)

**Hip**
- [LEAP trial — education + exercise vs corticosteroid vs wait-and-see, BMJ 2018](https://www.researchgate.net/publication/324960083_Education_plus_exercise_versus_corticosteroid_injection_use_versus_a_wait_and_see_approach_on_global_outcome_and_pain_from_gluteal_tendinopathy_Prospective_single_blinded_randomised_clinical_trial)
- [LEAP economic evaluation](https://pubmed.ncbi.nlm.nih.gov/36526564/)

**Low back**
- [Best exercise options for chronic LBP — JOSPT network meta-analysis](https://www.jospt.org/doi/10.2519/jospt.2022.10671)
- [Motor control stabilisation exercise — prospective meta-analysis](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7564352/)
- [Dose-response of stabilisation exercises — meta-regression (20–30 min, 3–5×/wk)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7547082/)
- [McKenzie vs motor control in people with a directional preference — JOSPT](https://www.jospt.org/doi/10.2519/jospt.2016.6379)
- [Bed rest vs staying active for acute LBP — Cochrane](https://pubmed.ncbi.nlm.nih.gov/20556780/)
- [Recent clinical practice guidelines for LBP — global comparison](https://pmc.ncbi.nlm.nih.gov/articles/PMC11061926/)

**Neck**
- [Deep cervical flexor training — systematic review of RCTs](https://pubmed.ncbi.nlm.nih.gov/28225440/)
- [Effects of DCF training on impaired function in chronic neck pain](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6263552/)

**Red flags**
- [International Framework for Red Flags for Potential Serious Spinal Pathologies — JOSPT](https://www.jospt.org/doi/10.2519/jospt.2020.9971)
- [Remote screening for lumbar spine red flags](https://www.physio-pedia.com/Remote_Screening_for_Lumbar_Spine_Red_Flags)

**Digital delivery**
- [Digital health interventions for MSK pain — systematic review & meta-analysis](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9490534/)
- [Digital therapeutics app for patellofemoral pain — RCT 2025](https://mhealth.jmir.org/2025/1/e69627)
