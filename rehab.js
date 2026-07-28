'use strict';
/* ============================================================
   Spotter — Rebuild (rehab mode)

   Data tables + the progression engine. Views, state and event
   handling live in app.js; everything here is pure enough to test
   headlessly (tools/test/logic.assertions.js).

   The model, briefly:
   - A *track* is one 12-week block for one area (S.rehab.tracks[]).
   - Intake routes region + provocation answers to a *pattern* key.
     Patterns are internal — the user never sees a diagnosis.
   - A pattern owns *chains*: ordered ladders of exercises. Your
     position in a chain is a *rung*; within a rung you progress by
     reps → load → sets before the rung advances.
   - Progression is gated on the 24-hour response, not on reps hit:
     ≤5/10 during, settled by morning, not rising week to week
     (Silbernagel's pain-monitoring model). Two greens to move up,
     one red to move down.
   - Four phases. Phases gate the top of each chain, so advancing a
     phase is what unlocks harder rungs.

   See REHAB-SPEC.md for the evidence behind each track.
   ============================================================ */

/* ---------------- regions ---------------- */

const REHAB_REGIONS = [
  { id: 'knee',     label: 'Knee',            sided: true },
  { id: 'back',     label: 'Lower back',      sided: false },
  { id: 'shoulder', label: 'Shoulder',        sided: true },
  { id: 'hip',      label: 'Hip (outer)',     sided: true },
  { id: 'calf',     label: 'Calf / Achilles', sided: true },
  { id: 'elbow',    label: 'Elbow',           sided: true },
  { id: 'neck',     label: 'Neck',            sided: false },
];

/* ---------------- red flags ----------------
   Answering yes to any of these blocks the program. The back list is
   split out because cauda equina is same-day care, not a physio
   appointment next week. */

const RED_FLAGS = {
  universal: [
    'A fall, collision or twist that you couldn’t put weight on afterwards',
    'The joint is hot, red and swollen',
    'Fever, night sweats, or weight loss you can’t explain, alongside the pain',
    'Pain that wakes you every night and doesn’t ease when you change position',
    'New, obvious weakness — things dropping, foot slapping, a leg giving way',
    'A history of cancer, or you’re on long-term steroids',
  ],
  back: [
    'Numbness in the saddle area — inner thighs, groin, or buttocks',
    'New trouble starting or controlling peeing, or bowel accidents',
    'Numbness or weakness spreading down BOTH legs',
    'Recent loss of sexual sensation',
  ],
  shoulder: [
    'After an injury, you can’t lift the arm out to the side at all',
    'The shoulder looks visibly out of shape compared to the other one',
  ],
  neck: [
    'It started after a car accident, fall or blow to the head',
    'Dizziness, double vision, slurred speech, or drop attacks',
    'Weakness, numbness or pins and needles in an arm or hand',
  ],
};

const RED_FLAG_URGENT = {
  back: 'These need same-day care — not a physio appointment next week. ' +
        'Please go to an emergency department.',
};

/* ---------------- education / load-modification cards ---------------- */

const REHAB_EDU = {
  'time': {
    title: 'This takes about twelve weeks',
    body: 'Not two. Most people feel very little change for the first three weeks, ' +
      'and that’s normal — it’s not a sign it isn’t working. The change happens ' +
      'between weeks 4 and 12. Knowing that up front is the single best thing you ' +
      'can do for your odds of finishing.',
  },
  'pain-rules': {
    title: 'How much pain is okay',
    body: 'Up to about 5 out of 10 while you’re loading is fine — it doesn’t mean ' +
      'you’re doing damage. What matters is the next morning: it should have ' +
      'settled back to where it was. Rebuild asks you every morning after a ' +
      'session, and that answer is what decides whether the load goes up, holds, ' +
      'or comes back down.',
  },
  'load-is-good': {
    title: 'Loading it is the treatment',
    body: 'Resting a cranky joint feels right and mostly makes it worse. Tissue ' +
      'gets stronger by being asked to do progressively more. The whole job here ' +
      'is to ask for a bit more than last time, often enough, for long enough.',
  },
  'oa-load': {
    title: 'Loading is good for the joint',
    body: 'Cartilage responds to load — it isn’t a tyre tread that wears out. ' +
      'Programs built on education plus progressive exercise improve pain, ' +
      'walking speed and sit-to-stand across tens of thousands of people. ' +
      'Stiffness that eases within half an hour of getting going is the joint ' +
      'behaving normally, not a warning.',
  },
  'back-robust': {
    title: 'Hurting isn’t harming',
    body: 'Backs are robust. Every major guideline in the world says the same ' +
      'thing: stay active, don’t go to bed, don’t wait for it to stop hurting ' +
      'before you move. Bending and lifting aren’t dangerous — being still is ' +
      'what makes it drag on.',
  },
  'back-scan': {
    title: 'You probably don’t need a scan',
    body: 'Disc bulges and “degeneration” show up on scans of people with no pain ' +
      'at all, at roughly the rate you’d expect for their age. A scan usually ' +
      'adds worry without changing what helps. The red-flag questions at the ' +
      'start are what actually matter.',
  },
  'hip-compression': {
    title: 'Stop squashing the tendon',
    body: 'This is half the treatment, and it happens outside the gym:\n\n' +
      '• Don’t cross your legs, sitting or standing.\n' +
      '• Don’t stand hanging on one hip — weight through both feet.\n' +
      '• Sleep with a pillow between your knees. Don’t sleep on the sore side.\n' +
      '• Avoid low, deep chairs and sitting with your knees pressed together.\n' +
      '• Walking is fine. Walking with a big hip sway is what to avoid.\n\n' +
      'In the trial this came from, education plus exercise beat a steroid ' +
      'injection at eight weeks. A lot of that was this list.',
  },
  'tendon-warmup': {
    title: 'Warming up is a clue, not a trick',
    body: 'Tendons characteristically hurt at the start, ease once you’re warm, ' +
      'then complain the next morning. That pattern is why the morning check ' +
      'matters more than how the session felt.',
  },
  'tendon-slow': {
    title: 'Slow is the point',
    body: 'Three seconds down, three seconds up. Slow, heavy loading is what ' +
      'changes a tendon — going fast lets you cheat with bounce and takes the ' +
      'load off the tissue you’re trying to build.',
  },
  'shoulder-often': {
    title: 'Little and often beats hard and rare',
    body: 'The biggest trial in this area found that a single advice session with ' +
      'a band and a home program did as well as six sessions of tailored physio. ' +
      'What the successful group had in common was frequency — most days, low ' +
      'load, self-progressed. That’s exactly what this is.',
  },
  'neck-low-load': {
    title: 'Very light is correct here',
    body: 'The deep neck muscles respond to gentle, precise, low-load work — not ' +
      'to cranking. If your jaw clenches or the front of your neck bulges, ' +
      'you’re using the wrong muscles. Less effort, not more.',
  },
  'elbow-grip': {
    title: 'Grip is the tell',
    body: 'Gripping loads the same tendon. If shaking hands or carrying a kettle ' +
      'is the worst part, that’s consistent — and it means grip work belongs in ' +
      'the program, at the end rather than the start.',
  },
  'calf-insertional': {
    title: 'Keep the heel above flat',
    body: 'Pain right at the heel bone gets squashed when the ankle bends up. So ' +
      'these heel raises stay on flat ground — never hanging off a step — until ' +
      'much later. If a rep drops the heel below level, shorten the range.',
  },
};

/* ---------------- capacity tests ---------------- */

const CAPACITY_TESTS = {
  'heel-raise': { label: 'Single-leg heel raises', unit: 'reps', sided: true,
    how: 'One leg, hand on a wall for balance only. Full height every rep, no bouncing. Count until you can’t reach full height.' },
  'sit-to-stand-30': { label: '30-second sit-to-stand', unit: 'reps', sided: false,
    how: 'Standard chair, arms crossed over your chest. Stand fully and sit fully. Count how many in 30 seconds.' },
  'wall-sit-hold': { label: 'Wall sit', unit: 'sec', sided: true,
    how: 'Thighs parallel, one leg at a time if you can. Time until you have to come out of it.' },
  'side-plank-hold': { label: 'Side plank', unit: 'sec', sided: true,
    how: 'From the feet if you can, knees if not. Time until your hip drops.' },
  'wall-slide-reps': { label: 'Pain-free wall slides', unit: 'reps', sided: true,
    how: 'Forearms on the wall, slide up as far as it stays comfortable. Count reps before the arc gets painful.' },
  'abd-hold': { label: 'Side-lying abduction hold', unit: 'sec', sided: true,
    how: 'Top leg lifted a hand’s width, in line with your body. Time until it drops.' },
  'grip-holds': { label: 'Grip squeeze holds', unit: 'sec', sided: true,
    how: 'Squeeze a rolled towel hard. Time until the ache makes you stop.' },
  'chin-nod-hold': { label: 'Chin-nod hold', unit: 'sec', sided: false,
    how: 'On your back, gentle nod, head still touching the floor. Time until it shakes or the front of your neck bulges.' },
};

/* ---------------- exercises ----------------
   Appended to EXERCISES so search, notes, images and the lightbox all
   work unchanged; pickExercise() filters `rehab` out of normal plans.

   Rehab fields:
     rehab      true — excluded from normal generation until graduated
     region     which tracks may select it
     chain/rung position in a progression ladder
     baseSets / repRange / setCap / loadable  — the dose ladder
     tempo      {ecc, con} seconds — heavy slow resistance needs this
     provokes   exclusion tags (see PROVOKE_TAGS)
     phases     which phases it's eligible in
   Time-mode entries use repRange as seconds. */

const REHAB_EXERCISES = [
  /* ===== knee — quad chain ===== */
  { id: 'rh-quad-iso', name: 'Isometric Knee Extension Hold', m: ['quads'], m2: [],
    eq: ['bodyweight'], lvl: 1, cmp: false, incr: 0, mode: 'time', uni: true,
    rehab: true, region: ['knee'], chain: 'knee-quad', rung: 0,
    baseSets: 5, repRange: [20, 45], setCap: 5, loadable: false, phases: [1, 2],
    cue: 'Sit tall on a chair, straighten the knee out in front of you and hold it there, squeezing the thigh hard. Breathe.' },
  { id: 'rh-spanish-squat', name: 'Spanish Squat', m: ['quads'], m2: ['glutes'],
    eq: ['band'], lvl: 1, cmp: true, incr: 0, mode: 'time',
    rehab: true, region: ['knee'], chain: 'knee-quad', rung: 1,
    baseSets: 4, repRange: [20, 45], setCap: 5, loadable: false, phases: [1, 2],
    cue: 'Loop a band behind both knees, anchored in front at knee height. Sit back against it, shins vertical, and hold. Great for a cranky kneecap because the shin stays upright.' },
  { id: 'rh-box-squat', name: 'Box Squat', m: ['quads'], m2: ['glutes'],
    eq: ['bodyweight'], lvl: 1, cmp: true, incr: 5,
    rehab: true, region: ['knee'], chain: 'knee-quad', rung: 2,
    baseSets: 3, repRange: [8, 12], setCap: 3, loadable: true, phases: [1, 2, 3],
    cue: 'Sit back to a box or chair that’s high enough to feel easy, touch it lightly, stand back up. Lower the box as it gets comfortable.' },
  { id: 'rh-step-down', name: 'Step-Down', m: ['quads'], m2: ['glutes'],
    eq: ['bodyweight'], lvl: 2, cmp: true, incr: 5, uni: true,
    rehab: true, region: ['knee'], chain: 'knee-quad', rung: 5,
    baseSets: 3, repRange: [6, 10], setCap: 3, loadable: true, phases: [3, 4],
    tempo: { ecc: 3, con: 1 }, provokes: ['deep-knee-flexion'],
    cue: 'Stand on a step on the working leg. Lower the other heel slowly toward the floor, tap, come back up. Knee tracks over the middle toes.' },
  { id: 'rh-decline-squat', name: 'Single-Leg Decline Squat', m: ['quads'], m2: [],
    eq: ['bodyweight'], lvl: 3, cmp: true, incr: 5, uni: true,
    rehab: true, region: ['knee'], chain: 'knee-tendon', rung: 3,
    baseSets: 3, repRange: [6, 8], setCap: 3, loadable: true, phases: [2, 3, 4],
    tempo: { ecc: 3, con: 3 }, provokes: ['deep-knee-flexion'],
    cue: 'Stand on a slope (a loaded barbell plate or a wedge), heels high, toes low. One leg, three seconds down, three seconds up. This is the heavy one — it’s meant to be hard.' },

  /* ===== knee — hip chain ===== */
  { id: 'rh-side-lying-abd', name: 'Side-Lying Hip Abduction', m: ['glutes'], m2: [],
    eq: ['bodyweight'], lvl: 1, cmp: false, incr: 2.5, uni: true,
    rehab: true, region: ['knee', 'hip'], chain: 'knee-hip', rung: 0,
    baseSets: 3, repRange: [10, 15], setCap: 3, loadable: true, phases: [1, 2, 3],
    cue: 'On your side, body in a straight line, top leg slightly behind you and turned in a touch. Lift a hand’s width — no higher — and lower slowly.' },
  { id: 'rh-standing-abd', name: 'Standing Banded Hip Abduction', m: ['glutes'], m2: [],
    eq: ['band'], lvl: 1, cmp: false, incr: 0, uni: true,
    rehab: true, region: ['knee', 'hip'], chain: 'knee-hip', rung: 1,
    baseSets: 3, repRange: [12, 20], setCap: 3, loadable: false, phases: [1, 2, 3],
    cue: 'Band around the ankles, hand on a wall. Push one leg out to the side and back, keeping both hips level. Don’t lean.' },
  { id: 'rh-sl-glute-bridge', name: 'Single-Leg Glute Bridge', m: ['glutes'], m2: ['hamstrings'],
    eq: ['bodyweight'], lvl: 2, cmp: false, incr: 5, uni: true,
    rehab: true, region: ['knee', 'hip', 'back'], chain: 'knee-hip', rung: 3,
    baseSets: 3, repRange: [8, 12], setCap: 3, loadable: true, phases: [2, 3, 4],
    tempo: { ecc: 2, con: 1 },
    cue: 'One foot planted, other knee hugged in. Drive through the heel, hips level at the top — don’t let the free side drop.' },

  /* ===== knee — OA / neuromuscular ===== */
  { id: 'rh-sit-to-stand', name: 'Sit-to-Stand', m: ['quads'], m2: ['glutes'],
    eq: ['bodyweight'], lvl: 1, cmp: true, incr: 5,
    rehab: true, region: ['knee'], chain: 'knee-oa', rung: 1,
    baseSets: 3, repRange: [8, 15], setCap: 3, loadable: true, phases: [1, 2, 3, 4],
    cue: 'From a normal chair, arms crossed. Stand all the way up, sit all the way down under control. Use a cushion to raise the seat if you need to start easier.' },
  { id: 'rh-single-leg-stand', name: 'Single-Leg Balance', m: ['glutes'], m2: ['calves'],
    eq: ['bodyweight'], lvl: 1, cmp: false, incr: 0, mode: 'time', uni: true,
    rehab: true, region: ['knee', 'hip'], chain: 'knee-oa', rung: 0,
    baseSets: 3, repRange: [20, 45], setCap: 3, loadable: false, phases: [1, 2],
    cue: 'Stand on one leg near a wall, hips level, knee soft. Progress by looking away, then closing your eyes.' },

  /* ===== calf / achilles ===== */
  { id: 'rh-calf-iso', name: 'Heel Raise Hold', m: ['calves'], m2: [],
    eq: ['bodyweight'], lvl: 1, cmp: false, incr: 0, mode: 'time', uni: true,
    rehab: true, region: ['calf'], chain: 'calf', rung: 0,
    baseSets: 5, repRange: [20, 45], setCap: 5, loadable: false, phases: [1, 2],
    cue: 'Up on the toes, both feet, and hold at the top. Fingertips on a wall for balance only.' },
  { id: 'rh-calf-raise-flat', name: 'Heel Raise (Both Legs)', m: ['calves'], m2: [],
    eq: ['bodyweight'], lvl: 1, cmp: false, incr: 5,
    rehab: true, region: ['calf'], chain: 'calf', rung: 1,
    baseSets: 3, repRange: [12, 15], setCap: 3, loadable: true, phases: [1, 2, 3],
    tempo: { ecc: 3, con: 2 },
    cue: 'Both feet flat on the floor. All the way up, all the way down, slowly. Full height every rep.' },
  { id: 'rh-calf-raise-sl-flat', name: 'Single-Leg Heel Raise', m: ['calves'], m2: [],
    eq: ['bodyweight'], lvl: 2, cmp: false, incr: 5, uni: true,
    rehab: true, region: ['calf'], chain: 'calf', rung: 2,
    baseSets: 3, repRange: [12, 15], setCap: 3, loadable: true, phases: [1, 2, 3, 4],
    tempo: { ecc: 3, con: 2 },
    cue: 'One leg, flat ground. Up to full height, down slowly under control. Add weight in a backpack once fifteen is easy.' },
  { id: 'rh-calf-raise-step', name: 'Heel Raise Off a Step', m: ['calves'], m2: [],
    eq: ['bodyweight'], lvl: 2, cmp: false, incr: 5, uni: true,
    rehab: true, region: ['calf'], chain: 'calf', rung: 3,
    baseSets: 3, repRange: [12, 15], setCap: 3, loadable: true, phases: [2, 3, 4],
    tempo: { ecc: 3, con: 2 }, provokes: ['ankle-dorsiflexion-load'],
    cue: 'Forefoot on the edge of a step. Lower the heel below the step slowly, then press all the way up. Full range.' },
  { id: 'rh-calf-seated', name: 'Seated Heel Raise', m: ['calves'], m2: [],
    eq: ['bodyweight'], lvl: 1, cmp: false, incr: 5,
    rehab: true, region: ['calf'], chain: 'calf-soleus', rung: 0,
    baseSets: 3, repRange: [12, 20], setCap: 3, loadable: true, phases: [1, 2, 3, 4],
    tempo: { ecc: 3, con: 2 },
    cue: 'Sitting, knees bent 90°, weight on the thighs. Bent knee shifts the work to the deeper calf muscle, which most programs forget.' },
  { id: 'rh-calf-hop', name: 'Pogo Hops', m: ['calves'], m2: [],
    eq: ['bodyweight'], lvl: 2, cmp: false, incr: 0,
    rehab: true, region: ['calf'], chain: 'calf', rung: 4,
    baseSets: 3, repRange: [15, 25], setCap: 3, loadable: false, phases: [3, 4],
    cue: 'Small, fast, springy hops on the spot — stiff ankles, minimal knee bend. Quiet landings.' },

  /* ===== low back ===== */
  { id: 'rh-cat-cow', name: 'Cat-Cow', m: ['back'], m2: ['core'],
    eq: ['bodyweight'], lvl: 1, cmp: false, incr: 0,
    rehab: true, region: ['back', 'neck'], chain: 'back-mob', rung: 0,
    baseSets: 2, repRange: [8, 12], setCap: 2, loadable: false, phases: [1, 2],
    cue: 'On all fours. Round the back up slowly, then let it sag down slowly. Move through the whole spine, don’t force the ends.' },
  { id: 'rh-prone-press-up', name: 'Prone Press-Up', m: ['back'], m2: [],
    eq: ['bodyweight'], lvl: 1, cmp: false, incr: 0,
    rehab: true, region: ['back'], chain: 'back-direction', rung: 0,
    baseSets: 3, repRange: [8, 10], setCap: 3, loadable: false, phases: [1, 2],
    provokes: ['spinal-extension-loaded'],
    cue: 'Lie face down, hands under your shoulders, press the chest up and let the hips stay heavy on the floor. Go only as far as stays comfortable.' },
  { id: 'rh-knee-to-chest', name: 'Supine Knee-to-Chest', m: ['back'], m2: [],
    eq: ['bodyweight'], lvl: 1, cmp: false, incr: 0, mode: 'time',
    rehab: true, region: ['back'], chain: 'back-direction', rung: 0,
    baseSets: 3, repRange: [20, 30], setCap: 3, loadable: false, phases: [1, 2],
    provokes: ['spinal-flexion-loaded'],
    cue: 'On your back, pull both knees gently toward your chest and hold. Should feel like relief, not a stretch you’re fighting.' },
  { id: 'rh-side-plank-knees', name: 'Side Plank from Knees', m: ['core'], m2: ['glutes'],
    eq: ['bodyweight'], lvl: 1, cmp: false, incr: 0, mode: 'time', uni: true,
    rehab: true, region: ['back'], chain: 'back-core', rung: 0,
    baseSets: 3, repRange: [15, 40], setCap: 3, loadable: false, phases: [1, 2],
    provokes: ['hip-adduction'],
    cue: 'On your side, elbow under your shoulder, knees bent. Lift the hips into a straight line from knee to head and hold.' },
  { id: 'rh-hinge-dowel', name: 'Dowel Hip Hinge', m: ['hamstrings'], m2: ['back', 'glutes'],
    eq: ['bodyweight'], lvl: 1, cmp: true, incr: 0,
    rehab: true, region: ['back'], chain: 'back-hinge', rung: 0,
    baseSets: 3, repRange: [8, 12], setCap: 3, loadable: false, phases: [1, 2],
    cue: 'Hold a broomstick along your spine — touching the back of your head, upper back and tailbone. Push the hips back keeping all three points in contact.' },
  { id: 'rh-back-ext', name: 'Prone Back Extension', m: ['back'], m2: ['glutes'],
    eq: ['bodyweight'], lvl: 1, cmp: false, incr: 5,
    rehab: true, region: ['back'], chain: 'back-core', rung: 2,
    baseSets: 3, repRange: [8, 15], setCap: 3, loadable: true, phases: [2, 3, 4],
    tempo: { ecc: 2, con: 1 }, provokes: ['spinal-extension-loaded'],
    cue: 'Face down, hands by your temples. Lift the chest a few inches, pause, lower slowly. Small range — this isn’t a backbend.' },
  { id: 'rh-suitcase-carry', name: 'Suitcase Carry', m: ['core'], m2: ['back', 'shoulders'],
    eq: ['dumbbell'], lvl: 1, cmp: true, incr: 5, mode: 'time', uni: true,
    rehab: true, region: ['back', 'neck'], chain: 'back-carry', rung: 0,
    baseSets: 3, repRange: [20, 45], setCap: 3, loadable: true, phases: [2, 3, 4],
    cue: 'One heavy dumbbell in one hand. Walk tall and level — don’t lean away from it. The work is refusing to bend sideways.' },
  { id: 'rh-farmer-carry', name: 'Farmer Carry', m: ['core'], m2: ['back', 'shoulders'],
    eq: ['dumbbell'], lvl: 1, cmp: true, incr: 5, mode: 'time',
    rehab: true, region: ['back', 'neck'], chain: 'back-carry', rung: 1,
    baseSets: 3, repRange: [30, 60], setCap: 3, loadable: true, phases: [2, 3, 4],
    cue: 'A dumbbell in each hand, shoulders back, ribs down. Walk. Simple and brutally effective for a back that needs to trust load again.' },
  { id: 'rh-pallof', name: 'Pallof Press', m: ['core'], m2: [],
    eq: ['band'], lvl: 2, cmp: false, incr: 0, uni: true,
    rehab: true, region: ['back'], chain: 'back-core', rung: 3,
    baseSets: 3, repRange: [8, 12], setCap: 3, loadable: false, phases: [2, 3, 4],
    tempo: { ecc: 2, con: 2 },
    cue: 'Band anchored at chest height to your side. Press it straight out from your sternum and resist the twist. Slow out, slow back.' },

  /* ===== shoulder ===== */
  { id: 'rh-er-iso', name: 'Isometric External Rotation', m: ['shoulders'], m2: [],
    eq: ['bodyweight'], lvl: 1, cmp: false, incr: 0, mode: 'time', uni: true,
    rehab: true, region: ['shoulder'], chain: 'sh-cuff', rung: 0,
    baseSets: 5, repRange: [20, 45], setCap: 5, loadable: false, phases: [1, 2],
    cue: 'Elbow tucked in at your side, bent 90°. Press the back of your wrist into a door frame as if turning outward — nothing moves. About 70% effort.' },
  { id: 'rh-band-er', name: 'Banded External Rotation', m: ['shoulders'], m2: [],
    eq: ['band'], lvl: 1, cmp: false, incr: 0, uni: true,
    rehab: true, region: ['shoulder'], chain: 'sh-cuff', rung: 1,
    baseSets: 3, repRange: [12, 20], setCap: 3, loadable: false, phases: [1, 2, 3],
    tempo: { ecc: 3, con: 1 }, provokes: ['end-range-shoulder'],
    cue: 'Elbow tucked at your side (a rolled towel under it helps), forearm across your belly. Rotate out, slow back. Elbow never leaves your ribs.' },
  { id: 'rh-band-ir', name: 'Banded Internal Rotation', m: ['shoulders'], m2: [],
    eq: ['band'], lvl: 1, cmp: false, incr: 0, uni: true,
    rehab: true, region: ['shoulder'], chain: 'sh-cuff', rung: 2,
    baseSets: 3, repRange: [12, 20], setCap: 3, loadable: false, phases: [1, 2, 3],
    tempo: { ecc: 3, con: 1 },
    cue: 'Same setup, pulling the other way — forearm across the belly against the band. Elbow stays pinned to your side.' },
  { id: 'rh-er-45', name: 'External Rotation at 45°', m: ['shoulders'], m2: [],
    eq: ['dumbbell'], lvl: 2, cmp: false, incr: 2.5, uni: true,
    rehab: true, region: ['shoulder'], chain: 'sh-cuff', rung: 3,
    baseSets: 3, repRange: [8, 12], setCap: 3, loadable: true, phases: [2, 3, 4],
    tempo: { ecc: 3, con: 1 }, provokes: ['end-range-shoulder'],
    cue: 'Lie on your side, working arm on top, elbow bent 90° resting on your ribs. Rotate the dumbbell up to about 45°, lower slowly. Go light — this muscle is small.' },
  { id: 'rh-full-can', name: 'Full Can Raise', m: ['shoulders'], m2: [],
    eq: ['dumbbell'], lvl: 1, cmp: false, incr: 2.5, uni: true,
    rehab: true, region: ['shoulder'], chain: 'sh-scap', rung: 2,
    baseSets: 3, repRange: [10, 15], setCap: 3, loadable: true, phases: [2, 3],
    tempo: { ecc: 3, con: 1 }, provokes: ['overhead'],
    cue: 'Thumb up, raise the arm out at about 30° from straight ahead — the plane your shoulder blade sits in. Only as high as stays comfortable.' },
  { id: 'rh-prone-y', name: 'Prone Y Raise', m: ['shoulders'], m2: ['back'],
    eq: ['bench'], lvl: 1, cmp: false, incr: 2.5,
    rehab: true, region: ['shoulder', 'neck'], chain: 'sh-scap', rung: 1,
    baseSets: 3, repRange: [10, 15], setCap: 3, loadable: true, phases: [1, 2, 3, 4],
    tempo: { ecc: 2, con: 1 },
    cue: 'Face down on an incline bench, arms hanging. Lift them into a Y overhead, thumbs up, squeezing the shoulder blades down and back. Tiny weights.' },
  { id: 'rh-scap-pushup', name: 'Scapular Push-Up', m: ['chest'], m2: ['shoulders'],
    eq: ['bodyweight'], lvl: 1, cmp: false, incr: 0,
    rehab: true, region: ['shoulder'], chain: 'sh-scap', rung: 0,
    baseSets: 3, repRange: [10, 15], setCap: 3, loadable: false, phases: [1, 2],
    cue: 'Push-up position (knees fine), arms locked straight the whole time. Let the chest sink between the shoulder blades, then push the upper back to the ceiling.' },
  { id: 'rh-wall-slide', name: 'Wall Slide', m: ['shoulders'], m2: ['back'],
    eq: ['bodyweight'], lvl: 1, cmp: false, incr: 0,
    rehab: true, region: ['shoulder'], chain: 'sh-scap', rung: 3,
    baseSets: 3, repRange: [8, 12], setCap: 3, loadable: false, phases: [2, 3],
    tempo: { ecc: 2, con: 2 }, provokes: ['overhead'],
    cue: 'Forearms on the wall, elbows at shoulder height. Slide up as far as it stays comfortable, then back down. Stop at the first hint of a pinch.' },
  { id: 'rh-landmine-press', name: 'Landmine Press', m: ['shoulders'], m2: ['chest', 'triceps'],
    eq: ['barbell'], lvl: 2, cmp: true, incr: 5, uni: true,
    rehab: true, region: ['shoulder'], chain: 'sh-scap', rung: 4,
    baseSets: 3, repRange: [8, 12], setCap: 3, loadable: true, phases: [3, 4],
    tempo: { ecc: 2, con: 1 }, provokes: ['overhead'],
    cue: 'One end of a barbell in a corner, press the other end up and away at an angle. Gets you pressing again without going fully overhead.' },

  /* ===== hip — lateral / gluteal tendinopathy ===== */
  { id: 'rh-abd-iso', name: 'Isometric Hip Abduction', m: ['glutes'], m2: [],
    eq: ['band'], lvl: 1, cmp: false, incr: 0, mode: 'time',
    rehab: true, region: ['hip'], chain: 'hip-abd', rung: 0,
    baseSets: 5, repRange: [20, 45], setCap: 5, loadable: false, phases: [1, 2],
    cue: 'Lie on your back, knees bent, band around the thighs just above the knees. Push out against the band and hold. Both hips work at once — nothing crosses the midline.' },
  { id: 'rh-abd-neutral', name: 'Side-Lying Abduction (Neutral)', m: ['glutes'], m2: [],
    eq: ['bodyweight'], lvl: 1, cmp: false, incr: 2.5, uni: true,
    rehab: true, region: ['hip'], chain: 'hip-abd', rung: 1,
    baseSets: 3, repRange: [10, 15], setCap: 3, loadable: true, phases: [1, 2, 3],
    tempo: { ecc: 3, con: 1 },
    cue: 'Lie on the good side with a pillow between your knees. Lift the top leg only to horizontal — never let it drop below your body line on the way down.' },
  { id: 'rh-hip-airplane', name: 'Standing Hip Hitch', m: ['glutes'], m2: ['core'],
    eq: ['bodyweight'], lvl: 2, cmp: false, incr: 0, uni: true,
    rehab: true, region: ['hip'], chain: 'hip-abd', rung: 3,
    baseSets: 3, repRange: [8, 15], setCap: 3, loadable: false, phases: [2, 3, 4],
    cue: 'Stand on the sore side on a step, other foot hanging free. Lift the free hip up using the standing side’s glute, then lower it just to level. Never let it drop below.' },

  /* ===== elbow ===== */
  { id: 'rh-wrist-ext-iso', name: 'Isometric Wrist Extension', m: ['biceps'], m2: [],
    eq: ['bodyweight'], lvl: 1, cmp: false, incr: 0, mode: 'time', uni: true,
    rehab: true, region: ['elbow'], chain: 'elbow', rung: 0,
    baseSets: 5, repRange: [20, 45], setCap: 5, loadable: false, phases: [1, 2],
    cue: 'Forearm on a table, palm down, hand off the edge. Press the back of your hand up into your other hand and hold — nothing moves.' },
  { id: 'rh-wrist-ext', name: 'Wrist Extension', m: ['biceps'], m2: [],
    eq: ['dumbbell'], lvl: 1, cmp: false, incr: 1, uni: true,
    rehab: true, region: ['elbow'], chain: 'elbow', rung: 1,
    baseSets: 3, repRange: [10, 15], setCap: 3, loadable: true, phases: [1, 2, 3, 4],
    tempo: { ecc: 3, con: 3 },
    cue: 'Forearm on a thigh or table, palm down, very light dumbbell. Curl the wrist up slowly, lower slowly. Start at 1–2 lb — genuinely.' },
  { id: 'rh-wrist-ext-ecc', name: 'Eccentric Wrist Extension', m: ['biceps'], m2: [],
    eq: ['dumbbell'], lvl: 2, cmp: false, incr: 1, uni: true,
    rehab: true, region: ['elbow'], chain: 'elbow', rung: 2,
    baseSets: 3, repRange: [10, 15], setCap: 3, loadable: true, phases: [2, 3, 4],
    tempo: { ecc: 4, con: 0 },
    cue: 'Lift the weight with your other hand, then lower it slowly with the sore side over four seconds. Only the lowering.' },
  { id: 'rh-supination', name: 'Forearm Supination', m: ['biceps'], m2: [],
    eq: ['dumbbell'], lvl: 1, cmp: false, incr: 1, uni: true,
    rehab: true, region: ['elbow'], chain: 'elbow', rung: 3,
    baseSets: 3, repRange: [10, 15], setCap: 3, loadable: true, phases: [2, 3, 4],
    tempo: { ecc: 3, con: 1 },
    cue: 'Hold a dumbbell by one end like a hammer, elbow at your side. Rotate the palm up, then slowly back down.' },
  { id: 'rh-grip', name: 'Grip Squeeze', m: ['biceps'], m2: [],
    eq: ['bodyweight'], lvl: 1, cmp: false, incr: 0, mode: 'time', uni: true,
    rehab: true, region: ['elbow'], chain: 'elbow-grip', rung: 0,
    baseSets: 3, repRange: [15, 45], setCap: 3, loadable: false, phases: [2, 3, 4],
    cue: 'Squeeze a rolled-up towel or a soft ball, hard, and hold. Grip loads the same tendon — that’s why it belongs here.' },

  /* ===== neck ===== */
  { id: 'rh-chin-nod', name: 'Chin Nod', m: ['core'], m2: [],
    eq: ['bodyweight'], lvl: 1, cmp: false, incr: 0, mode: 'time',
    rehab: true, region: ['neck'], chain: 'neck-deep', rung: 0,
    baseSets: 5, repRange: [5, 15], setCap: 5, loadable: false, phases: [1, 2],
    cue: 'On your back, head resting on the floor. Nod gently as if saying a small yes — the head barely moves. Hold. If the front of your neck bulges or your jaw clenches, ease off.' },
  { id: 'rh-chin-nod-hold', name: 'Chin Nod Endurance Hold', m: ['core'], m2: [],
    eq: ['bodyweight'], lvl: 1, cmp: false, incr: 0, mode: 'time',
    rehab: true, region: ['neck'], chain: 'neck-deep', rung: 1,
    baseSets: 4, repRange: [10, 30], setCap: 5, loadable: false, phases: [2, 3, 4],
    cue: 'Same gentle nod, held longer. Very light effort — this is endurance for the deep muscles, not a strength test.' },
  { id: 'rh-neck-iso', name: 'Isometric Neck Holds', m: ['core'], m2: ['shoulders'],
    eq: ['bodyweight'], lvl: 1, cmp: false, incr: 0, mode: 'time',
    rehab: true, region: ['neck'], chain: 'neck-deep', rung: 2,
    baseSets: 4, repRange: [10, 30], setCap: 4, loadable: false, phases: [2, 3, 4],
    cue: 'Hand on your forehead, press gently and resist — head doesn’t move. Repeat on each side and the back. About 30% effort, never maximal.' },
  { id: 'rh-scap-retract', name: 'Scapular Retraction', m: ['back'], m2: ['shoulders'],
    eq: ['band'], lvl: 1, cmp: false, incr: 0,
    rehab: true, region: ['neck', 'shoulder'], chain: 'neck-scap', rung: 0,
    baseSets: 3, repRange: [12, 20], setCap: 3, loadable: false, phases: [1, 2, 3],
    tempo: { ecc: 2, con: 1 },
    cue: 'Band in both hands, arms straight ahead. Pull the shoulder blades together and down, hold a beat, release slowly. Arms stay fairly straight.' },
];

/* Exclusion tags, for reference — patterns list which they exclude per phase. */
const PROVOKE_TAGS = [
  'deep-knee-flexion', 'hip-adduction', 'ankle-dorsiflexion-load',
  'spinal-flexion-loaded', 'spinal-extension-loaded', 'overhead', 'end-range-shoulder',
];

/* ---------------- chains ----------------
   Ordered ladders. Position = rung. Mixes rehab-specific exercises with
   ones already in the main database (which have demo photos). */

const REHAB_CHAINS = {
  'knee-quad':     ['rh-quad-iso', 'rh-spanish-squat', 'rh-box-squat', 'rev-lunge', 'split-squat', 'rh-step-down'],
  'knee-hip':      ['rh-side-lying-abd', 'rh-standing-abd', 'glute-bridge', 'rh-sl-glute-bridge', 'hip-thrust', 'sl-rdl'],
  'knee-tendon':   ['rh-quad-iso', 'rh-spanish-squat', 'split-squat', 'rh-decline-squat'],
  'knee-oa':       ['rh-single-leg-stand', 'rh-sit-to-stand', 'step-up', 'goblet-squat'],
  'calf':          ['rh-calf-iso', 'rh-calf-raise-flat', 'rh-calf-raise-sl-flat', 'rh-calf-raise-step', 'rh-calf-hop'],
  'calf-soleus':   ['rh-calf-seated'],
  'back-core':     ['rh-side-plank-knees', 'dead-bug', 'rh-back-ext', 'rh-pallof', 'side-plank'],
  'back-hinge':    ['rh-hinge-dowel', 'glute-bridge', 'pull-through', 'db-rdl'],
  'back-carry':    ['rh-suitcase-carry', 'rh-farmer-carry'],
  'back-mob':      ['rh-cat-cow'],
  'back-direction': ['rh-prone-press-up', 'rh-knee-to-chest'],
  'sh-cuff':       ['rh-er-iso', 'rh-band-er', 'rh-band-ir', 'rh-er-45'],
  'sh-scap':       ['rh-scap-pushup', 'rh-prone-y', 'rh-full-can', 'rh-wall-slide', 'rh-landmine-press'],
  'sh-pull':       ['face-pull', 'chest-sup-row', 'db-row', 'lat-pulldown'],
  'hip-abd':       ['rh-abd-iso', 'rh-abd-neutral', 'glute-bridge', 'rh-hip-airplane', 'hip-thrust'],
  'hip-post':      ['rh-sl-glute-bridge', 'step-up', 'sl-rdl'],
  'elbow':         ['rh-wrist-ext-iso', 'rh-wrist-ext', 'rh-wrist-ext-ecc', 'rh-supination'],
  'elbow-grip':    ['rh-grip'],
  'neck-deep':     ['rh-chin-nod', 'rh-chin-nod-hold', 'rh-neck-iso'],
  'neck-scap':     ['rh-scap-retract', 'rh-prone-y', 'chest-sup-row', 'rh-farmer-carry'],
};

/* ---------------- dose metadata for reused exercises ----------------
   Chains mix in exercises from the main database (they have demo photos,
   which the rehab-specific ones mostly don't). Those entries don't carry
   rehab fields, so their dose ladders live here and get merged in by
   rehabEx(). Time-mode entries use repRange as seconds. */

const REHAB_DOSE = {
  'rev-lunge':     { baseSets: 3, repRange: [8, 12], setCap: 3, loadable: true, phases: [2, 3, 4], tempo: { ecc: 3, con: 1 }, provokes: ['deep-knee-flexion'] },
  'split-squat':   { baseSets: 3, repRange: [6, 10], setCap: 3, loadable: true, phases: [2, 3, 4], tempo: { ecc: 3, con: 1 }, provokes: ['deep-knee-flexion'] },
  'goblet-squat':  { baseSets: 3, repRange: [8, 12], setCap: 3, loadable: true, phases: [2, 3, 4], tempo: { ecc: 3, con: 1 }, provokes: ['deep-knee-flexion'] },
  'step-up':       { baseSets: 3, repRange: [8, 12], setCap: 3, loadable: true, phases: [2, 3, 4], tempo: { ecc: 2, con: 1 } },
  'wall-sit':      { baseSets: 4, repRange: [20, 60], setCap: 5, loadable: false, phases: [1, 2] },
  'glute-bridge':  { baseSets: 3, repRange: [10, 15], setCap: 3, loadable: false, phases: [1, 2, 3] },
  'hip-thrust':    { baseSets: 3, repRange: [8, 12], setCap: 3, loadable: true, phases: [2, 3, 4], tempo: { ecc: 2, con: 1 } },
  'sl-rdl':        { baseSets: 3, repRange: [6, 10], setCap: 3, loadable: true, phases: [3, 4], tempo: { ecc: 3, con: 1 } },
  'db-rdl':        { baseSets: 3, repRange: [8, 12], setCap: 3, loadable: true, phases: [2, 3, 4], tempo: { ecc: 3, con: 1 } },
  'pull-through':  { baseSets: 3, repRange: [10, 15], setCap: 3, loadable: true, phases: [2, 3, 4] },
  'dead-bug':      { baseSets: 3, repRange: [8, 12], setCap: 3, loadable: false, phases: [1, 2, 3] },
  'side-plank':    { baseSets: 3, repRange: [20, 60], setCap: 3, loadable: false, phases: [2, 3, 4], provokes: ['hip-adduction'] },
  'calf-raise':    { baseSets: 3, repRange: [12, 15], setCap: 3, loadable: true, phases: [2, 3, 4], tempo: { ecc: 3, con: 2 }, provokes: ['ankle-dorsiflexion-load'] },
  'sl-calf-raise': { baseSets: 3, repRange: [12, 15], setCap: 3, loadable: false, phases: [2, 3, 4], tempo: { ecc: 3, con: 2 } },
  'face-pull':     { baseSets: 3, repRange: [12, 20], setCap: 3, loadable: true, phases: [1, 2, 3, 4], tempo: { ecc: 2, con: 1 } },
  'chest-sup-row': { baseSets: 3, repRange: [8, 12], setCap: 3, loadable: true, phases: [2, 3, 4], tempo: { ecc: 2, con: 1 } },
  'db-row':        { baseSets: 3, repRange: [8, 12], setCap: 3, loadable: true, phases: [2, 3, 4], tempo: { ecc: 2, con: 1 } },
  'lat-pulldown':  { baseSets: 3, repRange: [8, 12], setCap: 3, loadable: true, phases: [3, 4], tempo: { ecc: 2, con: 1 }, provokes: ['overhead'] },
};

/* ---------------- phases ---------------- */

const PHASE_META = [
  { n: 1, name: 'Settle',   weeks: '1–3',  blurb: 'Low load, often. Proving it tolerates being asked to work.' },
  { n: 2, name: 'Build',    weeks: '3–8',  blurb: 'Heavier, slower, full range as it allows. This is where the change happens.' },
  { n: 3, name: 'Capacity', weeks: '8–12', blurb: 'Heavy, then springy. Building back past where you need it.' },
  { n: 4, name: 'Merge',    weeks: '12+',  blurb: 'It’s just training now. These exercises join your normal sessions.' },
];

/* Sessions/greens needed *within* the phase, plus a typical-pain ceiling. */
const PHASE_ADVANCE = {
  1: { sessions: 6,  greens: 4, typical: 3 },
  2: { sessions: 12, greens: 8, typical: 2 },
  3: { sessions: 8,  greens: 6, typical: 2 },
};

/* ---------------- patterns ----------------
   Internal keys. `label` is what the user sees — plain description of
   what they told us, never a diagnosis. */

const REHAB_PATTERNS = {
  pfp: {
    region: 'knee',
    label: 'Front of the knee — stairs and sitting',
    summary: 'Diffuse ache around the kneecap, worse going down stairs, squatting, and after sitting a while.',
    chains: ['knee-quad', 'knee-hip'],
    isoPrimer: 'rh-quad-iso', freq: 3, exCount: 3, skipPhase3: false,
    excludes: { 1: ['deep-knee-flexion'], 2: [], 3: [], 4: [] },
    edu: ['time', 'pain-rules', 'load-is-good'],
    capacity: ['sit-to-stand-30', 'wall-sit-hold'],
    note: 'Hip work matters as much as quad work here — the evidence is strongest for doing both, which is why every session has one of each.',
  },
  'knee-tendon': {
    region: 'knee',
    label: 'Just below the kneecap — jumping and landing',
    summary: 'Point-tender below the kneecap, worse with jumping, landing and decelerating, and it warms up as you go.',
    chains: ['knee-tendon', 'knee-hip'],
    isoPrimer: 'rh-quad-iso', freq: 3, exCount: 3, skipPhase3: false,
    excludes: { 1: ['deep-knee-flexion'], 2: [], 3: [], 4: [] },
    edu: ['time', 'pain-rules', 'tendon-warmup', 'tendon-slow'],
    capacity: ['sit-to-stand-30', 'wall-sit-hold'],
    note: 'Tendons want heavy and slow. Three seconds down, three seconds up — and up to 5/10 during is fine here.',
  },
  'knee-oa': {
    region: 'knee',
    label: 'Knee that’s stiff in the morning and eases with movement',
    summary: 'Gradual onset, stiff for a bit in the morning, better once you get going, sometimes creaky.',
    chains: ['knee-oa', 'knee-hip'],
    isoPrimer: null, freq: 3, exCount: 4, skipPhase3: true,
    excludes: { 1: [], 2: [], 3: [], 4: [] },
    edu: ['time', 'oa-load', 'pain-rules'],
    capacity: ['sit-to-stand-30', 'wall-sit-hold'],
    note: 'Loading is the treatment here, not the risk. Stiffness that eases within half an hour is the joint behaving normally.',
  },

  'back-general': {
    region: 'back',
    label: 'Lower back — no leg symptoms',
    summary: 'Mechanical low back pain that stays in your back.',
    chains: ['back-core', 'back-hinge', 'back-carry'],
    isoPrimer: null, freq: 4, exCount: 4, skipPhase3: true,
    excludes: { 1: [], 2: [], 3: [], 4: [] },
    edu: ['back-robust', 'time', 'back-scan', 'pain-rules'],
    capacity: ['side-plank-hold'],
    note: 'No single exercise wins for backs. Doing something, most days, for three months is what wins.',
  },
  'back-leg': {
    region: 'back',
    label: 'Lower back with symptoms into the leg',
    summary: 'Back pain that also refers down the leg.',
    chains: ['back-core', 'back-hinge'],
    isoPrimer: null, freq: 4, exCount: 3, skipPhase3: true,
    excludes: { 1: ['spinal-flexion-loaded'], 2: [], 3: [], 4: [] },
    edu: ['back-robust', 'time', 'pain-rules'],
    capacity: ['side-plank-hold'],
    watchCentralisation: true,
    note: 'Watch which way symptoms travel. Moving up toward your back is good. Spreading further down the leg over a couple of weeks means get it looked at.',
  },

  rcrsp: {
    region: 'shoulder',
    label: 'Shoulder — painful overhead, fine at rest',
    summary: 'Painful arc raising the arm, worse overhead and lying on it, weakness that’s clearly pain-limited.',
    chains: ['sh-cuff', 'sh-scap', 'sh-pull'],
    isoPrimer: 'rh-er-iso', freq: 5, exCount: 3, skipPhase3: false,
    excludes: { 1: ['overhead', 'end-range-shoulder'], 2: ['overhead'], 3: [], 4: [] },
    edu: ['shoulder-often', 'time', 'pain-rules'],
    capacity: ['wall-slide-reps'],
    note: 'Little and often. Five short sessions a week beats two heroic ones — that’s what the big trial’s successful group actually did.',
  },

  'hip-lateral': {
    region: 'hip',
    label: 'Outside of the hip — worse lying on it',
    summary: 'Pain over the bony point on the outside of the hip, worse lying on that side and crossing your legs.',
    chains: ['hip-abd', 'hip-post'],
    isoPrimer: 'rh-abd-iso', freq: 3, exCount: 3, skipPhase3: true,
    excludes: { 1: ['hip-adduction'], 2: ['hip-adduction'], 3: ['hip-adduction'], 4: ['hip-adduction'] },
    edu: ['hip-compression', 'time', 'pain-rules', 'load-is-good'],
    capacity: ['abd-hold'],
    note: 'The daily-life list matters as much as the exercises — squashing the tendon between sessions undoes the work.',
  },

  'calf-mid': {
    region: 'calf',
    label: 'Achilles — a few centimetres above the heel',
    summary: 'Tender in the middle of the tendon, stiff first thing, warms up as you go.',
    chains: ['calf', 'calf-soleus'],
    isoPrimer: 'rh-calf-iso', freq: 4, exCount: 2, skipPhase3: false,
    excludes: { 1: [], 2: [], 3: [], 4: [] },
    edu: ['time', 'pain-rules', 'tendon-warmup', 'tendon-slow'],
    capacity: ['heel-raise'],
    note: 'Once a day, three sets of fifteen, progressing steadily. Equivalent results to the brutal twice-daily protocols, at a third of the work.',
  },
  'calf-insert': {
    region: 'calf',
    label: 'Achilles — right at the heel bone',
    summary: 'Tender where the tendon meets the heel, worse with steep hills and shoes with a hard heel counter.',
    chains: ['calf', 'calf-soleus'],
    isoPrimer: 'rh-calf-iso', freq: 4, exCount: 2, skipPhase3: false,
    excludes: { 1: ['ankle-dorsiflexion-load'], 2: ['ankle-dorsiflexion-load'], 3: ['ankle-dorsiflexion-load'], 4: [] },
    edu: ['calf-insertional', 'time', 'pain-rules', 'tendon-slow'],
    capacity: ['heel-raise'],
    note: 'Everything stays on flat ground. Dropping the heel below level squashes exactly the bit that hurts.',
  },

  'elbow-lateral': {
    region: 'elbow',
    label: 'Outside of the elbow — gripping and lifting',
    summary: 'Tender on the bony point outside the elbow, worse gripping, carrying and turning door handles.',
    chains: ['elbow', 'elbow-grip'],
    isoPrimer: 'rh-wrist-ext-iso', freq: 4, exCount: 2, skipPhase3: true,
    excludes: { 1: [], 2: [], 3: [], 4: [] },
    edu: ['time', 'pain-rules', 'elbow-grip', 'tendon-slow'],
    capacity: ['grip-holds'],
    note: 'Start absurdly light — one or two pounds. Almost everyone starts too heavy here and stalls for months.',
  },

  'neck-general': {
    region: 'neck',
    label: 'Neck and upper shoulders — desk and stress',
    summary: 'Aching neck and upper traps, worse through the day and with screen time.',
    chains: ['neck-deep', 'neck-scap'],
    isoPrimer: null, freq: 4, exCount: 3, skipPhase3: true,
    excludes: { 1: [], 2: [], 3: [], 4: [] },
    edu: ['neck-low-load', 'time', 'pain-rules'],
    capacity: ['chin-nod-hold'],
    note: 'Gentle and precise beats hard here. If your jaw clenches, you’ve gone too heavy.',
  },
};

/* ---------------- intake ----------------
   Each region: red flags, a few provocation questions, an optional
   self-test, and a router. `route` gets an answers object keyed by
   step id (arrays for multi-select) and returns a pattern key. */

const REHAB_INTAKE = {
  knee: {
    steps: [
      { id: 'where', q: 'Where is it, mostly?', opts: [
        { v: 'diffuse', label: 'Around or behind the kneecap', sub: 'Hard to point to with one finger' },
        { v: 'point',   label: 'Just below the kneecap',       sub: 'You can point right at it' },
        { v: 'deep',    label: 'Deep in the joint, or the inside edge', sub: '' },
      ] },
      { id: 'worse', q: 'What makes it worse?', multi: true, opts: [
        { v: 'stairs',  label: 'Going down stairs' },
        { v: 'sitting', label: 'Sitting a long time, then standing up' },
        { v: 'squat',   label: 'Squatting or kneeling' },
        { v: 'jump',    label: 'Jumping, landing, or slowing down fast' },
        { v: 'walk',    label: 'Walking distances' },
      ] },
      { id: 'morning', q: 'How is it first thing in the morning?', opts: [
        { v: 'stiff',   label: 'Stiff for a while, then it eases off', sub: 'Under about half an hour' },
        { v: 'warms',   label: 'Sore to start, warms up as I go, sore again after' },
        { v: 'fine',    label: 'Much the same as the rest of the day' },
      ] },
    ],
    route(a) {
      const w = a.worse || [];
      if (a.where === 'point' || (a.morning === 'warms' && w.includes('jump'))) return 'knee-tendon';
      if (a.morning === 'stiff' && (a.where === 'deep' || w.includes('walk'))) return 'knee-oa';
      return 'pfp';
    },
  },

  back: {
    steps: [
      { id: 'leg', q: 'Does it go down your leg?', opts: [
        { v: 'no',    label: 'No — it stays in my back' },
        { v: 'above', label: 'Into my buttock or upper thigh' },
        { v: 'below', label: 'Past my knee, down the calf or into the foot' },
      ] },
      { id: 'worse', q: 'What makes it worse?', multi: true, opts: [
        { v: 'bend',  label: 'Bending forward, sitting' },
        { v: 'arch',  label: 'Standing a long time, arching back' },
        { v: 'lift',  label: 'Lifting things' },
        { v: 'first', label: 'First thing in the morning' },
      ] },
    ],
    selfTest: {
      title: 'Two-minute direction check',
      body: 'Optional, but it shapes the first few weeks.\n\n' +
        '1. Lie face down and prop up on your elbows for 60 seconds.\n' +
        '2. Stand up, then bend forward gently 5 times.\n\n' +
        'Which one left your back feeling better afterwards?',
      q: 'Which felt better?',
      opts: [
        { v: 'ext',  label: 'Lying propped up (arching)' },
        { v: 'flex', label: 'Bending forward' },
        { v: 'none', label: 'No real difference / not sure' },
      ],
    },
    route(a) { return a.leg === 'below' ? 'back-leg' : 'back-general'; },
  },

  shoulder: {
    selfTestFirst: true,
    selfTest: {
      title: 'Stiffness check — do this first',
      body: 'This one question changes everything, and it’s quick.\n\n' +
        'Stand with the sore elbow tucked into your side, bent to 90°, holding a broomstick ' +
        'across your body with both hands. Use your GOOD arm to push the sore arm’s forearm ' +
        'outward, away from your belly. Don’t resist — let it be pushed.\n\n' +
        'Compare it to the other side.',
      q: 'What happens?',
      opts: [
        { v: 'moves', label: 'It goes about as far as the good side', sub: 'Might hurt, but it moves' },
        { v: 'blocked', label: 'It stops much earlier, and feels blocked', sub: 'A hard stop rather than a painful one' },
      ],
      blockOn: 'blocked',
      blockTitle: 'This looks like a stiffness pattern',
      blockBody: 'When the shoulder won’t rotate outward even when someone else moves it, that ' +
        'points to the joint capsule rather than the tendons — and a progressive loading program ' +
        'is the wrong tool for it. It’s very treatable, but what helps is different, and it’s ' +
        'worth getting someone to confirm it.\n\nIn the meantime: keep moving it gently within ' +
        'what’s comfortable. Don’t force range, and don’t load it hard.',
    },
    steps: [
      { id: 'worse', q: 'What makes it worse?', multi: true, opts: [
        { v: 'overhead', label: 'Reaching overhead' },
        { v: 'lying',    label: 'Lying on that side at night' },
        { v: 'arc',      label: 'A painful patch partway up, that eases higher' },
        { v: 'behind',   label: 'Reaching behind my back' },
      ] },
    ],
    route() { return 'rcrsp'; },
  },

  hip: {
    steps: [
      { id: 'where', q: 'Where is it?', opts: [
        { v: 'outer', label: 'The bony point on the outside of the hip', sub: 'Tender to press on' },
        { v: 'groin', label: 'Deep in the groin or front of the hip', sub: '' },
      ] },
      { id: 'worse', q: 'What makes it worse?', multi: true, opts: [
        { v: 'lying',  label: 'Lying on that side' },
        { v: 'cross',  label: 'Crossing my legs, or sitting low' },
        { v: 'stairs', label: 'Stairs and hills' },
        { v: 'stand',  label: 'Standing on one leg' },
      ] },
    ],
    route(a) { return a.where === 'groin' ? null : 'hip-lateral'; },
    noRouteMsg: 'Deep groin and front-of-hip pain has a wider range of causes than Rebuild can safely ' +
      'sort out from a few questions — some of which need imaging. Worth getting it looked at rather ' +
      'than guessing.',
  },

  calf: {
    steps: [
      { id: 'where', q: 'Where is the tenderness?', opts: [
        { v: 'mid',    label: 'In the cord itself, a few centimetres above the heel' },
        { v: 'insert', label: 'Right where it meets the heel bone' },
        { v: 'belly',  label: 'Up in the muscle of the calf' },
      ] },
      { id: 'worse', q: 'What’s it like?', multi: true, opts: [
        { v: 'morning', label: 'Stiff and sore for the first few steps in the morning' },
        { v: 'warms',   label: 'Eases once I’m warm, sore again afterwards' },
        { v: 'hills',   label: 'Worse on hills or stairs' },
      ] },
    ],
    route(a) { return a.where === 'insert' ? 'calf-insert' : 'calf-mid'; },
  },

  elbow: {
    steps: [
      { id: 'where', q: 'Which side of the elbow?', opts: [
        { v: 'lat', label: 'Outside', sub: 'The side your thumb is on when your palm faces forward' },
        { v: 'med', label: 'Inside', sub: 'The side your little finger is on' },
      ] },
      { id: 'worse', q: 'What makes it worse?', multi: true, opts: [
        { v: 'grip',   label: 'Gripping, shaking hands, carrying a kettle' },
        { v: 'handle', label: 'Turning door handles or a screwdriver' },
        { v: 'lift',   label: 'Lifting with the palm down' },
      ] },
    ],
    route(a) { return a.where === 'lat' ? 'elbow-lateral' : null; },
    noRouteMsg: 'Inner-elbow pain loads differently and can involve the nerve that runs behind the ' +
      'joint. Rebuild only has a track for the outer side. Worth getting the inside looked at.',
  },

  neck: {
    steps: [
      { id: 'worse', q: 'What’s the pattern?', multi: true, opts: [
        { v: 'desk',   label: 'Builds through the day, worse at a screen' },
        { v: 'morning', label: 'Worst when I wake up' },
        { v: 'traps',  label: 'Aches across the top of my shoulders' },
        { v: 'turn',   label: 'Sore turning my head to one side' },
      ] },
    ],
    route() { return 'neck-general'; },
  },
};

/* ============================================================
   ENGINE
   ============================================================ */

const REHAB_DAY = 86400000;

/* An exercise with its rehab dose metadata merged in. Rehab-specific
   entries carry their own; main-database ones get theirs from REHAB_DOSE. */
function rehabEx(id) {
  const base = (typeof EXERCISES !== 'undefined' ? EXERCISES : []).find(e => e.id === id);
  if (!base) return null;
  const extra = REHAB_DOSE[id];
  return extra ? Object.assign({}, base, extra) : base;
}

function patternOf(track) { return REHAB_PATTERNS[track.pattern] || null; }

/* Phase list for a pattern — some skip the plyometric phase entirely. */
function phasesFor(pat) {
  return PHASE_META.filter(p => !(pat.skipPhase3 && p.n === 3));
}

/* The phase a track is actually in, as a PHASE_META entry. */
function phaseMeta(track) {
  return PHASE_META.find(p => p.n === track.phase) || PHASE_META[0];
}

/* Is this exercise allowed for the track right now? Equipment, phase
   eligibility, and the pattern's exclusion tags all have to pass. */
function rehabExOK(ex, track, phase) {
  if (!ex) return false;
  if (typeof equipOK === 'function' && !equipOK(ex)) return false;
  const phases = ex.phases || [1, 2, 3, 4];
  if (!phases.includes(phase)) return false;
  const pat = patternOf(track);
  const banned = (pat && pat.excludes && pat.excludes[phase]) || [];
  if ((ex.provokes || []).some(t => banned.includes(t))) return false;
  if (track.dirBias === 'ext' && (ex.provokes || []).includes('spinal-flexion-loaded')) return false;
  if (track.dirBias === 'flex' && (ex.provokes || []).includes('spinal-extension-loaded')) return false;
  return true;
}

/* Highest rung in a chain that's usable in this phase. Phases gate the top
   of the ladder — advancing a phase is what unlocks the harder rungs. */
function maxRung(chainId, track, phase) {
  const ids = REHAB_CHAINS[chainId] || [];
  let top = -1;
  for (let i = 0; i < ids.length; i++) if (rehabExOK(rehabEx(ids[i]), track, phase)) top = i;
  return top;
}

/* The exercise a track is currently on for a chain, clamped to what the
   phase and equipment allow. Walks down if the stored rung isn't usable. */
function currentRung(track, chainId) {
  const ids = REHAB_CHAINS[chainId] || [];
  if (!ids.length) return -1;
  const cap = maxRung(chainId, track, track.phase);
  if (cap < 0) return -1;
  let r = Math.min(track.rung[chainId] == null ? 0 : track.rung[chainId], cap);
  while (r >= 0 && !rehabExOK(rehabEx(ids[r]), track, track.phase)) r--;
  if (r < 0) { // nothing at or below — take the lowest usable
    for (let i = 0; i < ids.length; i++) if (rehabExOK(rehabEx(ids[i]), track, track.phase)) return i;
    return -1;
  }
  return r;
}

/* ---------------- dose ladder ----------------
   Within a rung: reps → load → sets. Off the top, the chain advances. */

function repStep(ex) { return (ex.mode === 'time') ? 5 : (ex.repRange[1] - ex.repRange[0] > 6 ? 2 : 1); }

function baseDose(ex) {
  return { sets: ex.baseSets || 3, reps: ex.repRange ? ex.repRange[0] : 10, load: 0 };
}

function topDose(ex) {
  return { sets: ex.setCap || ex.baseSets || 3, reps: ex.repRange[1], load: 0 };
}

function loadStep(ex) {
  if (!ex.loadable) return 0;
  return typeof incrFor === 'function' ? incrFor(ex) : (ex.incr || 5);
}

/* Next dose up, or null if this rung is maxed out. */
function nextDose(dose, ex) {
  const d = { sets: dose.sets, reps: dose.reps, load: dose.load };
  if (d.reps < ex.repRange[1]) {
    d.reps = Math.min(ex.repRange[1], d.reps + repStep(ex));
    return d;
  }
  if (ex.loadable) { d.load = d.load + loadStep(ex); d.reps = ex.repRange[0]; return d; }
  if (d.sets < (ex.setCap || d.sets)) { d.sets += 1; d.reps = ex.repRange[0]; return d; }
  return null;
}

/* Next dose down, or null if this rung is already at its easiest. */
function prevDose(dose, ex) {
  const d = { sets: dose.sets, reps: dose.reps, load: dose.load };
  if (d.reps > ex.repRange[0]) {
    d.reps = Math.max(ex.repRange[0], d.reps - repStep(ex));
    return d;
  }
  if (ex.loadable && d.load > 0) {
    d.load = Math.max(0, d.load - loadStep(ex));
    d.reps = ex.repRange[1];
    return d;
  }
  if (d.sets > 2) { d.sets -= 1; d.reps = ex.repRange[1]; return d; }
  return null;
}

/* ---------------- the 24-hour rule ---------------- */

/* Mean morning pain over a window of days ending `daysAgo` days back. */
function meanAmPain(track, fromDaysAgo, toDaysAgo) {
  const now = Date.now();
  const vals = (track.checks || []).filter(c => {
    if (typeof c.amPain !== 'number') return false;
    const age = (now - new Date(c.date).getTime()) / REHAB_DAY;
    return age >= toDaysAgo && age < fromDaysAgo;
  }).map(c => c.amPain);
  return vals.length ? { n: vals.length, mean: vals.reduce((a, b) => a + b, 0) / vals.length } : null;
}

/* Week-over-week escalation — the third leg of the pain-monitoring model. */
function weeklyTrendRising(track) {
  const thisWk = meanAmPain(track, 7, 0);
  const lastWk = meanAmPain(track, 14, 7);
  if (!thisWk || !lastWk || thisWk.n < 3 || lastWk.n < 3) return false;
  return thisWk.mean > lastWk.mean + 1;
}

/* green  — tolerated it, and the morning agreed
   amber  — sore after but settled; hold here
   red    — over 5/10 during, still sore next day, or trending up
   unknown— no morning check logged; hold, never progress on no data */
function classifySession(session, check, track) {
  if (!session) return 'unknown';
  if (typeof session.duringPain === 'number' && session.duringPain > 5) return 'red';
  if (weeklyTrendRising(track)) return 'red';
  if (!check || !check.nextDay) return 'unknown';
  if (check.nextDay === 'still-sore') return 'red';
  if (check.nextDay === 'sore-settled') return 'amber';
  return 'green';
}

/* The check logged for a given session. Checks carry an explicit `for`
   pointing at the session they answer — matching purely on a time window
   let one check get claimed by two sessions when they fell close together.
   The window is kept as a fallback for checks written before the link. */
function checkForSession(track, session) {
  if (!session) return null;
  const checks = track.checks || [];
  const linked = checks.find(c => c.for === session.date);
  if (linked) return linked;
  const t = new Date(session.date).getTime();
  return checks.find(c => {
    if (c.for) return false; // already answers a different session
    const d = new Date(c.date).getTime();
    return d > t && d < t + 2 * REHAB_DAY;
  }) || null;
}

function lastSession(track) {
  const s = track.sessions || [];
  return s.length ? s[s.length - 1] : null;
}

/* What the engine intends to do to the dose at the next session. Pure —
   applyVerdict() is what actually mutates the track. */
function pendingVerdict(track) {
  const sess = lastSession(track);
  if (!sess) return { kind: 'start', note: 'First session — starting easy on purpose.' };
  if (sess.applied) return { kind: 'hold', note: 'Holding here until the next morning check.' };
  const cls = classifySession(sess, checkForSession(track, sess), track);
  if (cls === 'green') {
    const streak = (track.greenStreak || 0) + 1;
    if (streak >= 2) return { kind: 'up', cls, note: 'Two good days in a row — stepping it up.' };
    return { kind: 'hold', cls, note: 'Good response. One more like that and it goes up.' };
  }
  if (cls === 'amber') return { kind: 'hold', cls, note: 'Sore after but settled — holding here rather than adding.' };
  if (cls === 'red') return { kind: 'down', cls, note: 'That was too much — easing back a step.' };
  return { kind: 'hold', cls, note: 'No morning check logged, so we’ll repeat rather than guess.' };
}

/* Apply a verdict to every chain the track is running. Mutates `track`. */
function applyVerdict(track, verdict) {
  const pat = patternOf(track);
  if (!pat) return;
  const sess = lastSession(track);
  if (sess) sess.applied = true;

  if (verdict.cls === 'green') track.greenStreak = (track.greenStreak || 0) + 1;
  else if (verdict.cls === 'red') track.greenStreak = 0;

  if (verdict.kind === 'up') track.greenStreak = 0;
  if (verdict.kind !== 'up' && verdict.kind !== 'down') return;

  for (const chainId of pat.chains) {
    const ids = REHAB_CHAINS[chainId] || [];
    let r = currentRung(track, chainId);
    if (r < 0) continue;
    const ex = rehabEx(ids[r]);
    if (!ex) continue;
    const cur = track.dose[ex.id] || baseDose(ex);

    if (verdict.kind === 'up') {
      const nd = nextDose(cur, ex);
      if (nd) { track.dose[ex.id] = nd; continue; }
      const cap = maxRung(chainId, track, track.phase);
      let nr = r + 1;
      while (nr <= cap && !rehabExOK(rehabEx(ids[nr]), track, track.phase)) nr++;
      if (nr <= cap) {
        track.rung[chainId] = nr;
        const nex = rehabEx(ids[nr]);
        if (nex && !track.dose[nex.id]) track.dose[nex.id] = baseDose(nex);
      } // already at the top for this phase — stay put until the phase advances
    } else {
      const pd = prevDose(cur, ex);
      if (pd) { track.dose[ex.id] = pd; continue; }
      let nr = r - 1;
      while (nr >= 0 && !rehabExOK(rehabEx(ids[nr]), track, track.phase)) nr--;
      if (nr >= 0) {
        track.rung[chainId] = nr;
        const nex = rehabEx(ids[nr]);
        track.dose[nex.id] = topDose(nex); // step down to the hardest version of an easier move
        track.dose[nex.id].load = 0;
      }
    }
  }
}

/* ---------------- phases ---------------- */

function sessionsInPhase(track) {
  const since = track.phaseStartedAt ? new Date(track.phaseStartedAt).getTime() : 0;
  return (track.sessions || []).filter(s => new Date(s.date).getTime() >= since);
}

function typicalPain(track, n) {
  const recent = (track.sessions || []).slice(-(n || 4)).map(s => s.duringPain).filter(v => typeof v === 'number');
  if (!recent.length) return null;
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

/* Criteria-based, not calendar-based. Returns true if the track has
   earned the next phase. */
function canAdvancePhase(track) {
  const pat = patternOf(track);
  if (!pat || track.phase >= 4) return false;
  const need = PHASE_ADVANCE[track.phase];
  if (!need) return false;
  const inPhase = sessionsInPhase(track);
  if (inPhase.length < need.sessions) return false;
  const greens = inPhase.filter(s => s.cls === 'green').length;
  if (greens < need.greens) return false;
  const tp = typicalPain(track, 4);
  if (tp != null && tp > need.typical) return false;
  return true;
}

function nextPhaseNumber(track) {
  const pat = patternOf(track);
  let n = track.phase + 1;
  if (pat && pat.skipPhase3 && n === 3) n = 4;
  return Math.min(4, n);
}

function advancePhase(track) {
  track.phase = nextPhaseNumber(track);
  track.phaseStartedAt = new Date().toISOString();
  track.greenStreak = 0;
  if (track.phase === 4) track.status = 'graduated';
  return track;
}

/* ---------------- bail-outs ----------------
   Returns a card to show, or null. Order matters — most urgent first. */

function rehabAlert(track) {
  const sess = (track.sessions || []).slice(-4);
  const reds = sess.filter(s => s.cls === 'red').length;
  const wk = trackWeek(track);

  if (reds >= 3 && sess.length >= 4) {
    return { kind: 'stalling', title: 'This isn’t settling',
      body: 'Three of your last four sessions have come back sore the next day. That usually means ' +
        'the starting point is too high — but it can also mean there’s something here that needs ' +
        'a proper look. Rebuild has dropped you back a phase. If the next two weeks don’t change ' +
        'that pattern, get someone to have a look.' };
  }
  if (weeklyTrendRising(track)) {
    return { kind: 'rising', title: 'It’s creeping up week to week',
      body: 'Your morning scores are higher than last week. That’s the one trend the whole system ' +
        'watches for. Loads are coming back down — and if it keeps climbing, that’s worth an ' +
        'appointment rather than another block.' };
  }
  if (wk >= 6 && track.phase < 3 && !improvedMeaningfully(track)) {
    return { kind: 'six-weeks', title: 'Six weeks in',
      body: 'Six weeks is long enough that you should be noticing something. You’re not, and that ' +
        'is genuinely useful information — it means this probably isn’t a pure loading problem. ' +
        'Worth seeing a physio, who can do the bits an app can’t.' };
  }
  if (wk >= 12 && track.phase < 4) {
    return { kind: 'twelve-weeks', title: 'Twelve weeks',
      body: 'This is about as far as Rebuild can take it on its own. You can keep going — plenty of ' +
        'people need longer — but this is the point where a second opinion earns its keep.' };
  }
  const pat = patternOf(track);
  if (pat && pat.watchCentralisation && peripheralising(track)) {
    return { kind: 'peripheralising', title: 'Symptoms are spreading further down',
      body: 'You’ve logged symptoms travelling further down the leg over the last couple of weeks. ' +
        'That’s the direction we don’t want. Pause the loading and get it looked at.' };
  }
  return null;
}

/* Rough "has anything changed" check: NPRS down ≥2 or PSFS up ≥2. */
function improvedMeaningfully(track) {
  const b = track.baseline || {};
  const recent = meanAmPain(track, 10, 0);
  if (recent && typeof b.typical === 'number' && b.typical - recent.mean >= 2) return true;
  const logs = track.psfsLog || [];
  if (logs.length && b.psfs && b.psfs.length) {
    const first = b.psfs.reduce((a, p) => a + p.score, 0) / b.psfs.length;
    const last = logs[logs.length - 1];
    const now = last.scores.reduce((a, v) => a + v, 0) / last.scores.length;
    if (now - first >= 2) return true;
  }
  return false;
}

function peripheralising(track) {
  const legs = (track.checks || []).filter(c => c.leg).slice(-6);
  if (legs.length < 3) return false;
  const rank = { back: 0, thigh: 1, calf: 2, foot: 3 };
  const first = rank[legs[0].leg], last = rank[legs[legs.length - 1].leg];
  return first != null && last != null && last > first;
}

/* ---------------- misc helpers ---------------- */

function trackWeek(track) {
  const ms = Date.now() - new Date(track.startedAt).getTime();
  return Math.max(1, Math.floor(ms / (7 * REHAB_DAY)) + 1);
}

/* Sessions per week the pattern asks for, and how many are logged this week. */
function weekSessions(track) {
  const start = Date.now() - 7 * REHAB_DAY;
  return (track.sessions || []).filter(s => new Date(s.date).getTime() >= start).length;
}

/* Every exercise id a graduated track hands back to normal training:
   the top rung reached in each chain. */
function graduatedIds(track) {
  const pat = patternOf(track);
  if (!pat) return [];
  const out = [];
  for (const chainId of pat.chains) {
    const ids = REHAB_CHAINS[chainId] || [];
    const r = Math.min(track.rung[chainId] == null ? 0 : track.rung[chainId], ids.length - 1);
    if (r >= 0 && ids[r]) out.push(ids[r]);
  }
  return out;
}

/* ---------------- register the exercises ----------------
   Pushed into the main database so findEx/search/notes/photos all work;
   pickExercise() filters `rehab` back out of normal plans. */
if (typeof EXERCISES !== 'undefined') {
  for (const e of REHAB_EXERCISES) if (!EXERCISES.some(x => x.id === e.id)) EXERCISES.push(e);
}
