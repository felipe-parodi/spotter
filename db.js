'use strict';
/* ============================================================
   SwoleMates — exercise database
   Every exercise: id, name, m (primary muscles), m2 (secondary),
   eq (equipment tags), lvl (1 easy → 3 technical), cmp (compound),
   mode ('reps' | 'time'), uni (per-side), incr (weight step, lb),
   cue (one-line form tip for beginners)
   ============================================================ */

const EQUIPMENT = [
  { id: 'dumbbell',   label: 'Dumbbells' },
  { id: 'bench',      label: 'Adjustable bench' },
  { id: 'cable',      label: 'Cable machine' },
  { id: 'barbell',    label: 'Barbell' },
  { id: 'rack',       label: 'Squat rack / pull-up bar' },
  { id: 'smith',      label: 'Smith machine' },
  { id: 'kettlebell', label: 'Kettlebells' },
  { id: 'treadmill',  label: 'Treadmill' },
  { id: 'bike',       label: 'Stationary bike' },
  { id: 'rower',      label: 'Rowing machine' },
  { id: 'elliptical', label: 'Elliptical' },
  { id: 'stairs',     label: 'Stair climber' },
];

const EQ_LABEL = {
  dumbbell: 'Dumbbells', bench: 'Bench', cable: 'Cable', barbell: 'Barbell',
  rack: 'Rack', smith: 'Smith machine', kettlebell: 'Kettlebell', bodyweight: 'Bodyweight',
  treadmill: 'Treadmill', bike: 'Bike', rower: 'Rower', elliptical: 'Elliptical', stairs: 'Stairs',
};

const UI_GROUPS = [
  { id: 'chest',     label: 'Chest',     muscles: ['chest'] },
  { id: 'back',      label: 'Back',      muscles: ['back'] },
  { id: 'shoulders', label: 'Shoulders', muscles: ['shoulders'] },
  { id: 'arms',      label: 'Arms',      muscles: ['biceps', 'triceps'] },
  { id: 'legs',      label: 'Legs',      muscles: ['quads', 'hamstrings', 'quads', 'hamstrings', 'calves'] },
  { id: 'glutes',    label: 'Glutes',    muscles: ['glutes'] },
  { id: 'core',      label: 'Core',      muscles: ['core'] },
  { id: 'cardio',    label: 'Cardio',    muscles: ['cardio'] },
  { id: 'full',      label: 'Full body', muscles: ['quads', 'chest', 'back', 'shoulders', 'hamstrings', 'glutes', 'core'] },
];

/* sets / rep-range / rest(sec) by goal and exercise type.
   Lifting rests are a flat 1½ min whatever the goal; timed holds and cardio
   keep their own shorter breaks. */
const GOAL_PARAMS = {
  fitness:  { label: 'General fitness',
              cmp:  { sets: 3, reps: [12, 15], rest: 90 },
              iso:  { sets: 3, reps: [12, 15], rest: 90 },
              time: { sets: 3, reps: [30, 45], rest: 45 },
              cardio: { sets: 1, reps: [12, 20], rest: 60 } },
  muscle:   { label: 'Build muscle',
              cmp:  { sets: 4, reps: [8, 12],  rest: 90 },
              iso:  { sets: 3, reps: [10, 15], rest: 90 },
              time: { sets: 3, reps: [30, 60], rest: 60 },
              cardio: { sets: 1, reps: [10, 15], rest: 60 } },
  strength: { label: 'Get stronger',
              cmp:  { sets: 4, reps: [5, 8],   rest: 90 },
              iso:  { sets: 3, reps: [8, 10],  rest: 90 },
              time: { sets: 3, reps: [30, 60], rest: 60 },
              cardio: { sets: 1, reps: [10, 15], rest: 60 } },
};

const EXERCISES = [
  /* ---------------- chest ---------------- */
  { id: 'db-bench', name: 'Dumbbell Bench Press', m: ['chest'], m2: ['triceps', 'shoulders'],
    eq: ['dumbbell', 'bench'], lvl: 1, cmp: true, incr: 5,
    cue: 'Lower slowly until dumbbells reach chest level, elbows about 45° from your body, then press up and slightly together.' },
  { id: 'db-incline', name: 'Incline Dumbbell Press', m: ['chest'], m2: ['shoulders', 'triceps'],
    eq: ['dumbbell', 'bench'], lvl: 1, cmp: true, incr: 5,
    cue: 'Set the bench to 30–45°. Press up over your upper chest, not your face.' },
  { id: 'pushup', name: 'Push-Up', m: ['chest'], m2: ['triceps', 'core'],
    eq: ['bodyweight'], lvl: 1, cmp: true, incr: 0,
    cue: 'Body in one straight line, hands under shoulders, chest to an inch off the floor. Knees down is a fine start.' },
  { id: 'cable-fly', name: 'Cable Chest Fly', m: ['chest'], m2: [],
    eq: ['cable'], lvl: 1, cmp: false, incr: 5,
    cue: 'Slight bend in the elbows, sweep the handles together like hugging a barrel, squeeze in the middle.' },
  { id: 'db-fly', name: 'Dumbbell Fly', m: ['chest'], m2: [],
    eq: ['dumbbell', 'bench'], lvl: 2, cmp: false, incr: 5,
    cue: 'Go lighter than you think. Wide arc, slight elbow bend, stop when you feel a stretch across your chest.' },
  { id: 'bb-bench', name: 'Barbell Bench Press', m: ['chest'], m2: ['triceps', 'shoulders'],
    eq: ['barbell', 'bench', 'rack'], lvl: 2, cmp: true, incr: 5,
    cue: 'Feet planted, slight arch, bar touches mid-chest. Use a spotter or safeties when going heavy.' },

  /* ---------------- back ---------------- */
  { id: 'lat-pulldown', name: 'Lat Pulldown', m: ['back'], m2: ['biceps'],
    eq: ['cable'], lvl: 1, cmp: true, incr: 5,
    cue: 'Pull the bar to your collarbone by driving your elbows down. Lean back only slightly — no swinging.' },
  { id: 'cable-row', name: 'Seated Cable Row', m: ['back'], m2: ['biceps'],
    eq: ['cable'], lvl: 1, cmp: true, incr: 5,
    cue: 'Sit tall, pull the handle to your belly button, squeeze your shoulder blades together, resist on the way back.' },
  { id: 'db-row', name: 'One-Arm Dumbbell Row', m: ['back'], m2: ['biceps'],
    eq: ['dumbbell', 'bench'], lvl: 1, cmp: true, uni: true, incr: 5,
    cue: 'Knee and hand on the bench, back flat. Pull the dumbbell to your hip, not your armpit.' },
  { id: 'chest-sup-row', name: 'Chest-Supported Dumbbell Row', m: ['back'], m2: ['biceps'],
    eq: ['dumbbell', 'bench'], lvl: 1, cmp: true, incr: 5,
    cue: 'Lie chest-down on an incline bench. Row both dumbbells to your hips — the bench keeps your form honest.' },
  { id: 'bb-row', name: 'Barbell Bent-Over Row', m: ['back'], m2: ['biceps', 'hamstrings'],
    eq: ['barbell'], lvl: 2, cmp: true, incr: 5,
    cue: 'Hinge to about 45°, back flat like a table. Pull the bar to your lower ribs, no jerking.' },
  { id: 'pullup', name: 'Pull-Up', m: ['back'], m2: ['biceps'],
    eq: ['rack'], lvl: 3, cmp: true, incr: 0,
    cue: 'Full hang to chin over the bar. Too hard? Jump up and lower yourself slowly for 3–5 seconds instead.' },
  { id: 'straight-arm', name: 'Straight-Arm Pulldown', m: ['back'], m2: [],
    eq: ['cable'], lvl: 2, cmp: false, incr: 5,
    cue: 'Arms nearly straight, sweep the bar from eye level down to your thighs. Feel it along the sides of your back.' },
  { id: 'face-pull', name: 'Cable Face Pull', m: ['shoulders'], m2: ['back'],
    eq: ['cable'], lvl: 1, cmp: false, incr: 5,
    cue: 'Set the rope at face height. Pull toward your eyes, ending like a double-biceps pose. Great for posture.' },
  { id: 'deadlift', name: 'Barbell Deadlift', m: ['hamstrings', 'back'], m2: ['glutes', 'core'],
    eq: ['barbell'], lvl: 3, cmp: true, incr: 10,
    cue: 'Bar over mid-foot, flat back, push the floor away. Hips and shoulders rise together. Never round your lower back.' },

  /* ---------------- shoulders ---------------- */
  { id: 'db-ohp', name: 'Seated Dumbbell Shoulder Press', m: ['shoulders'], m2: ['triceps'],
    eq: ['dumbbell', 'bench'], lvl: 1, cmp: true, incr: 5,
    cue: 'Bench upright, press the dumbbells overhead until arms are straight. Don’t arch your lower back.' },
  { id: 'lat-raise', name: 'Dumbbell Lateral Raise', m: ['shoulders'], m2: [],
    eq: ['dumbbell'], lvl: 1, cmp: false, incr: 5,
    cue: 'Lead with your elbows, raise to shoulder height, then lower with control. Light weight, strict form.' },
  { id: 'cable-lat-raise', name: 'Cable Lateral Raise', m: ['shoulders'], m2: [],
    eq: ['cable'], lvl: 2, cmp: false, uni: true, incr: 5,
    cue: 'Stand side-on to the low pulley, raise the handle out to shoulder height. Constant tension the whole way.' },
  { id: 'bb-ohp', name: 'Barbell Overhead Press', m: ['shoulders'], m2: ['triceps', 'core'],
    eq: ['barbell', 'rack'], lvl: 2, cmp: true, incr: 5,
    cue: 'Squeeze your glutes, brace your core, press the bar straight up past your face until arms lock out.' },
  { id: 'rear-fly', name: 'Bent-Over Rear Delt Fly', m: ['shoulders'], m2: ['back'],
    eq: ['dumbbell'], lvl: 1, cmp: false, incr: 5,
    cue: 'Hinge forward, arms hang down, raise the dumbbells out wide like spreading wings. Go light.' },
  { id: 'arnold-press', name: 'Arnold Press', m: ['shoulders'], m2: ['triceps'],
    eq: ['dumbbell', 'bench'], lvl: 2, cmp: true, incr: 5,
    cue: 'Start palms facing you, rotate outward as you press up. Smooth and controlled.' },

  /* ---------------- biceps ---------------- */
  { id: 'db-curl', name: 'Dumbbell Curl', m: ['biceps'], m2: [],
    eq: ['dumbbell'], lvl: 1, cmp: false, incr: 5,
    cue: 'Elbows pinned to your sides. Curl up without swinging, lower slowly — the way down builds muscle too.' },
  { id: 'hammer-curl', name: 'Hammer Curl', m: ['biceps'], m2: [],
    eq: ['dumbbell'], lvl: 1, cmp: false, incr: 5,
    cue: 'Palms face each other the whole time, like holding a hammer. Hits the forearms too.' },
  { id: 'cable-curl', name: 'Cable Curl', m: ['biceps'], m2: [],
    eq: ['cable'], lvl: 1, cmp: false, incr: 5,
    cue: 'Stand a step back from the low pulley. Constant tension — no resting at the bottom.' },
  { id: 'incline-curl', name: 'Incline Dumbbell Curl', m: ['biceps'], m2: [],
    eq: ['dumbbell', 'bench'], lvl: 2, cmp: false, incr: 5,
    cue: 'Lie back on an incline bench, arms hanging behind you. Deep stretch — use less weight than standing curls.' },
  { id: 'bb-curl', name: 'Barbell Curl', m: ['biceps'], m2: [],
    eq: ['barbell'], lvl: 2, cmp: false, incr: 5,
    cue: 'Shoulder-width grip, elbows still, no leaning back to heave the weight up.' },

  /* ---------------- triceps ---------------- */
  { id: 'pushdown', name: 'Cable Pushdown', m: ['triceps'], m2: [],
    eq: ['cable'], lvl: 1, cmp: false, incr: 5,
    cue: 'Elbows glued to your sides, push the bar down until arms are straight, control the way up.' },
  { id: 'oh-ext', name: 'Overhead Dumbbell Extension', m: ['triceps'], m2: [],
    eq: ['dumbbell'], lvl: 1, cmp: false, incr: 5,
    cue: 'Hold one dumbbell with both hands overhead, lower it behind your head, extend back up. Elbows point forward.' },
  { id: 'skull-crusher', name: 'Dumbbell Skull Crusher', m: ['triceps'], m2: [],
    eq: ['dumbbell', 'bench'], lvl: 2, cmp: false, incr: 5,
    cue: 'Lying down, lower the dumbbells beside your ears by bending only the elbows, then extend.' },
  { id: 'bench-dip', name: 'Bench Dip', m: ['triceps'], m2: ['chest'],
    eq: ['bench'], lvl: 1, cmp: false, incr: 0,
    cue: 'Hands on the bench behind you, lower until elbows hit 90°, press back up. Keep hips close to the bench.' },
  { id: 'cable-oh-ext', name: 'Cable Overhead Extension', m: ['triceps'], m2: [],
    eq: ['cable'], lvl: 2, cmp: false, incr: 5,
    cue: 'Face away from the low pulley, rope behind your head, extend forward and up until arms are straight.' },

  /* ---------------- quads / legs ---------------- */
  { id: 'goblet-squat', name: 'Goblet Squat', m: ['quads'], m2: ['glutes', 'core'],
    eq: ['dumbbell'], lvl: 1, cmp: true, incr: 5,
    cue: 'Hold a dumbbell at your chest, sit down between your heels, chest tall, stand back up. Depth over weight.' },
  { id: 'rev-lunge', name: 'Dumbbell Reverse Lunge', m: ['quads'], m2: ['glutes'],
    eq: ['dumbbell'], lvl: 1, cmp: true, uni: true, incr: 5,
    cue: 'Step backward, lower the back knee toward the floor, push through the front heel to stand.' },
  { id: 'split-squat', name: 'Bulgarian Split Squat', m: ['quads'], m2: ['glutes'],
    eq: ['dumbbell', 'bench'], lvl: 2, cmp: true, uni: true, incr: 5,
    cue: 'Back foot up on the bench, drop the back knee straight down. Brutal but worth it.' },
  { id: 'bb-squat', name: 'Barbell Back Squat', m: ['quads'], m2: ['glutes', 'core'],
    eq: ['barbell', 'rack'], lvl: 3, cmp: true, incr: 10,
    cue: 'Bar on upper back, brace, sit down until thighs hit parallel. Knees track over toes. Set the safeties.' },
  { id: 'smith-squat', name: 'Smith Machine Squat', m: ['quads'], m2: ['glutes'],
    eq: ['smith'], lvl: 2, cmp: true, incr: 10,
    cue: 'Feet slightly in front of the bar, control the descent to parallel. The rails guide the path for you.' },
  { id: 'step-up', name: 'Dumbbell Step-Up', m: ['quads'], m2: ['glutes'],
    eq: ['dumbbell', 'bench'], lvl: 1, cmp: true, uni: true, incr: 5,
    cue: 'Step onto the bench, drive through the top heel, stand fully tall, lower down slowly. Don’t push off the bottom foot.' },
  { id: 'wall-sit', name: 'Wall Sit', m: ['quads'], m2: [],
    eq: ['bodyweight'], lvl: 1, cmp: false, mode: 'time', incr: 0,
    cue: 'Back flat on the wall, thighs parallel to the floor, hands off your legs. Breathe and hold.' },

  /* ---------------- hamstrings ---------------- */
  { id: 'db-rdl', name: 'Dumbbell Romanian Deadlift', m: ['hamstrings'], m2: ['glutes', 'back'],
    eq: ['dumbbell'], lvl: 1, cmp: true, incr: 5,
    cue: 'Soft knees, push your hips back, slide the dumbbells down your thighs. Stop when your hamstrings pull tight.' },
  { id: 'bb-rdl', name: 'Barbell Romanian Deadlift', m: ['hamstrings'], m2: ['glutes', 'back'],
    eq: ['barbell'], lvl: 2, cmp: true, incr: 10,
    cue: 'Hips back, back flat, bar stays close to your legs. Feel the stretch, then drive hips forward to stand.' },
  { id: 'sl-rdl', name: 'Single-Leg Dumbbell RDL', m: ['hamstrings'], m2: ['glutes', 'core'],
    eq: ['dumbbell'], lvl: 2, cmp: true, uni: true, incr: 5,
    cue: 'Balance on one leg, hinge forward as the other leg floats back. Wobbling is normal — it’s the point.' },
  { id: 'kb-swing', name: 'Kettlebell Swing', m: ['hamstrings'], m2: ['glutes', 'core'],
    eq: ['kettlebell'], lvl: 2, cmp: true, incr: 5,
    cue: 'It’s a hip hinge, not a squat. Snap your hips forward to float the bell to chest height — arms stay relaxed.' },
  { id: 'pull-through', name: 'Cable Pull-Through', m: ['glutes'], m2: ['hamstrings'],
    eq: ['cable'], lvl: 2, cmp: true, incr: 5,
    cue: 'Face away from the low pulley, rope between your legs, hinge and snap your hips forward to stand tall.' },

  /* ---------------- glutes ---------------- */
  { id: 'hip-thrust', name: 'Dumbbell Hip Thrust', m: ['glutes'], m2: ['hamstrings'],
    eq: ['dumbbell', 'bench'], lvl: 1, cmp: true, incr: 10,
    cue: 'Upper back on the bench, dumbbell on your hips, drive up until your body is a flat table. Squeeze at the top.' },
  { id: 'bb-hip-thrust', name: 'Barbell Hip Thrust', m: ['glutes'], m2: ['hamstrings'],
    eq: ['barbell', 'bench'], lvl: 2, cmp: true, incr: 10,
    cue: 'Same as the dumbbell version, more loadable. Pad the bar. Chin tucked, ribs down, full squeeze at the top.' },
  { id: 'glute-bridge', name: 'Glute Bridge', m: ['glutes'], m2: ['hamstrings'],
    eq: ['bodyweight'], lvl: 1, cmp: false, incr: 0,
    cue: 'On your back, heels close to your butt, drive hips up and squeeze for a full second at the top.' },
  { id: 'cable-kickback', name: 'Cable Glute Kickback', m: ['glutes'], m2: [],
    eq: ['cable'], lvl: 1, cmp: false, uni: true, incr: 5,
    cue: 'Ankle strap on the low pulley, kick straight back with a straight leg. Squeeze, don’t swing.' },
  { id: 'sumo-goblet', name: 'Sumo Goblet Squat', m: ['glutes'], m2: ['quads'],
    eq: ['dumbbell'], lvl: 1, cmp: true, incr: 5,
    cue: 'Wide stance, toes out, dumbbell at your chest. Sit straight down and push your knees out.' },

  /* ---------------- calves ---------------- */
  { id: 'calf-raise', name: 'Standing Dumbbell Calf Raise', m: ['calves'], m2: [],
    eq: ['dumbbell'], lvl: 1, cmp: false, incr: 5,
    cue: 'Ball of your foot on a step or plate, rise as high as you can, pause, lower for a deep stretch.' },
  { id: 'sl-calf-raise', name: 'Single-Leg Calf Raise', m: ['calves'], m2: [],
    eq: ['bodyweight'], lvl: 2, cmp: false, uni: true, incr: 0,
    cue: 'One foot at a time, full range, slow on the way down. Hold something for balance, not for help.' },

  /* ---------------- core ---------------- */
  { id: 'plank', name: 'Plank', m: ['core'], m2: [],
    eq: ['bodyweight'], lvl: 1, cmp: false, mode: 'time', incr: 0,
    cue: 'Forearms down, body in one straight line, squeeze your glutes and abs. Don’t let the hips sag.' },
  { id: 'dead-bug', name: 'Dead Bug', m: ['core'], m2: [],
    eq: ['bodyweight'], lvl: 1, cmp: false, incr: 0,
    cue: 'On your back, arms up, knees at 90°. Lower opposite arm and leg while your lower back stays glued to the floor.' },
  { id: 'side-plank', name: 'Side Plank', m: ['core'], m2: [],
    eq: ['bodyweight'], lvl: 1, cmp: false, mode: 'time', uni: true, incr: 0,
    cue: 'Stack your feet, lift your hips until your body is a straight diagonal line. Switch sides each set.' },
  { id: 'russian-twist', name: 'Russian Twist', m: ['core'], m2: [],
    eq: ['dumbbell'], lvl: 1, cmp: false, incr: 5,
    cue: 'Sit back to 45°, rotate the weight side to side. Each side counts as one rep. Slower is harder.' },
  { id: 'cable-crunch', name: 'Cable Crunch', m: ['core'], m2: [],
    eq: ['cable'], lvl: 2, cmp: false, incr: 5,
    cue: 'Kneel facing the machine, rope beside your head, crunch your ribs toward your hips. Hips stay still.' },
  { id: 'woodchop', name: 'Cable Woodchopper', m: ['core'], m2: ['shoulders'],
    eq: ['cable'], lvl: 2, cmp: false, uni: true, incr: 5,
    cue: 'Pull the handle diagonally across your body, high to low, rotating through your torso. Arms stay long.' },
  { id: 'hollow-hold', name: 'Hollow Hold', m: ['core'], m2: [],
    eq: ['bodyweight'], lvl: 2, cmp: false, mode: 'time', incr: 0,
    cue: 'On your back, arms and legs hovering, lower back pressed into the floor. Shake = it’s working.' },
  { id: 'bird-dog', name: 'Bird Dog', m: ['core'], m2: ['back'],
    eq: ['bodyweight'], lvl: 1, cmp: false, uni: true, incr: 0,
    cue: 'On all fours, extend opposite arm and leg until level, pause, return. Slow and steady beats fast.' },

  /* ---------------- cardio (logged in minutes) ---------------- */
  { id: 'treadmill-run', name: 'Treadmill Run', m: ['cardio'], m2: [],
    eq: ['treadmill'], lvl: 1, cmp: false, mode: 'time', cardio: true, incr: 0,
    cue: 'A pace where full sentences are hard but short ones are fine. Ease the speed up, never jump it.' },
  { id: 'incline-walk', name: 'Incline Treadmill Walk', m: ['cardio'], m2: ['glutes', 'calves'],
    eq: ['treadmill'], lvl: 1, cmp: false, mode: 'time', cardio: true, incr: 0,
    cue: 'Set a 8–12% incline at a brisk walk. Hands off the rails — that’s where the work is.' },
  { id: 'bike-steady', name: 'Stationary Bike', m: ['cardio'], m2: ['quads'],
    eq: ['bike'], lvl: 1, cmp: false, mode: 'time', cardio: true, incr: 0,
    cue: 'Saddle at hip height, slight knee bend at the bottom of the stroke. Steady resistance you could hold for the whole ride.' },
  { id: 'rower-steady', name: 'Rowing Machine', m: ['cardio'], m2: ['back', 'hamstrings'],
    eq: ['rower'], lvl: 1, cmp: false, mode: 'time', cardio: true, incr: 0,
    cue: 'Legs, then body, then arms — reverse it on the way back. Power comes from the leg drive, not the pull.' },
  { id: 'elliptical-steady', name: 'Elliptical', m: ['cardio'], m2: [],
    eq: ['elliptical'], lvl: 1, cmp: false, mode: 'time', cardio: true, incr: 0,
    cue: 'Tall posture, push and pull the handles instead of hanging on them. Smooth, even strides.' },
  { id: 'stair-climber', name: 'Stair Climber', m: ['cardio'], m2: ['glutes', 'calves'],
    eq: ['stairs'], lvl: 1, cmp: false, mode: 'time', cardio: true, incr: 0,
    cue: 'Whole foot on each step, light fingertips on the rails only for balance. Slow down before you hang on.' },
  { id: 'jump-rope', name: 'Jump Rope', m: ['cardio'], m2: ['calves'],
    eq: ['bodyweight'], lvl: 1, cmp: false, mode: 'time', cardio: true, incr: 0,
    cue: 'Small hops on the balls of your feet, wrists doing the spinning. Trips are part of it — just keep going.' },
];

/* ---------------- cool-down stretches ----------------
   Static holds offered after Finish, matched to the muscles trained. */
const STRETCHES = [
  { id: 'st-quad', name: 'Standing Quad Stretch', m: ['quads'], secs: 30, uni: true,
    cue: 'Pull your heel toward your butt, knees together, hips pressed gently forward. Hold something for balance.' },
  { id: 'st-ham', name: 'Standing Hamstring Fold', m: ['hamstrings'], secs: 30,
    cue: 'Feet hip-width, soft knees, hinge forward and let your arms hang heavy. No bouncing.' },
  { id: 'st-figure4', name: 'Figure-4 Glute Stretch', m: ['glutes'], secs: 30, uni: true,
    cue: 'On your back, cross one ankle over the other knee, pull that thigh toward you until the outer hip lets go.' },
  { id: 'st-hipflexor', name: 'Kneeling Hip Flexor Stretch', m: ['quads', 'glutes'], secs: 30, uni: true,
    cue: 'Half-kneel, tuck your tailbone, shift your weight forward until the front of the back hip stretches.' },
  { id: 'st-calf', name: 'Wall Calf Stretch', m: ['calves', 'cardio'], secs: 30, uni: true,
    cue: 'Hands on the wall, one leg straight back with the heel down, lean in until the calf pulls.' },
  { id: 'st-chest', name: 'Doorway Chest Stretch', m: ['chest', 'shoulders'], secs: 30,
    cue: 'Forearms on the door frame, elbows at shoulder height, step through until your chest opens up.' },
  { id: 'st-lat', name: 'Overhead Lat Stretch', m: ['back'], secs: 30, uni: true,
    cue: 'Reach one arm overhead, grab that wrist with the other hand and lean sideways until the side of your back stretches.' },
  { id: 'st-tricep', name: 'Overhead Triceps Stretch', m: ['triceps', 'shoulders'], secs: 30, uni: true,
    cue: 'Reach down your spine with one hand, gently press that elbow back with the other.' },
  { id: 'st-cross', name: 'Cross-Body Shoulder Stretch', m: ['shoulders', 'biceps'], secs: 30, uni: true,
    cue: 'Pull one arm straight across your chest with the other, keeping that shoulder down away from your ear.' },
  { id: 'st-child', name: 'Child’s Pose', m: ['back', 'core', 'hamstrings', 'cardio'], secs: 45,
    cue: 'Knees wide, sit back onto your heels, arms long in front, forehead down. Slow breaths out.' },
];

/* ---------------- weekly schedule splits ----------------
   The scheduler assigns these to weekdays; groups reference UI_GROUPS ids,
   so the generator builds each day's session exactly like a manual pick. */
const SPLITS = {
  full:   { label: 'Full body',     groups: ['full'] },
  upper:  { label: 'Upper body',    groups: ['chest', 'back', 'shoulders', 'arms'] },
  lower:  { label: 'Legs & glutes', groups: ['legs', 'glutes', 'core'] },
  push:   { label: 'Push',          groups: ['chest', 'shoulders', 'arms'] },
  pull:   { label: 'Pull',          groups: ['back', 'arms', 'core'] },
  legs:   { label: 'Legs',          groups: ['legs', 'glutes'] },
  cardio: { label: 'Cardio',        groups: ['cardio'] },
};

/* strength-split template by training days per week; '3adj' is used when
   the chosen days include back-to-back pairs (full-body needs rest around it) */
const SPLIT_TEMPLATES = {
  1: ['full'],
  2: ['full', 'full'],
  3: ['full', 'full', 'full'],
  '3adj': ['upper', 'lower', 'full'],
  4: ['upper', 'lower', 'upper', 'lower'],
  5: ['upper', 'lower', 'push', 'pull', 'legs'],
  6: ['push', 'pull', 'legs', 'push', 'pull', 'legs'],
};

/* ---------------- HIIT blocks ----------------
   Guided interval sequences run by the in-app timer. hard=true intervals
   get the "push" styling; every transition beeps. */
function hiitRep(n, steps) {
  const out = [];
  for (let i = 0; i < n; i++) steps.forEach(s => out.push(s));
  return out;
}

const HIIT_TEMPLATES = [
  { id: 'tabata', name: 'Tabata', desc: '4 min · 8 × (20s all-out / 10s off)',
    hint: 'Pick one move and stick with it — bike sprint, squats, mountain climbers…',
    seq: hiitRep(8, [{ label: 'All-out', secs: 20, hard: true }, { label: 'Rest', secs: 10 }]) },
  { id: 'thirty', name: '30/30 Intervals', desc: '10 min · 10 × (30s hard / 30s easy)',
    hint: 'Any cardio machine. Hard means you’re glad when it ends; easy means you recover.',
    seq: hiitRep(10, [{ label: 'Hard', secs: 30, hard: true }, { label: 'Easy', secs: 30 }]) },
  { id: 'ot-tread', name: 'Tread Block', desc: '11½ min · 4 × (1:00 push / 1:30 base) + 30s all-out',
    hint: 'Orangetheory-style. Base = comfortable jog, push = challenging, all-out = empty the tank.',
    seq: hiitRep(4, [{ label: 'Push pace', secs: 60, hard: true }, { label: 'Base pace', secs: 90 }])
      .concat([{ label: 'ALL-OUT', secs: 30, hard: true }, { label: 'Walk it off', secs: 60 }]) },
  { id: 'bw-circuit', name: 'Bodyweight Circuit', desc: '12 min · 3 rounds · 40s on / 20s off',
    hint: 'Squats → push-ups → mountain climbers → plank. No equipment, no excuses.',
    seq: hiitRep(3, [
      { label: 'Squats', secs: 40, hard: true }, { label: 'Rest', secs: 20 },
      { label: 'Push-ups', secs: 40, hard: true }, { label: 'Rest', secs: 20 },
      { label: 'Mountain climbers', secs: 40, hard: true }, { label: 'Rest', secs: 20 },
      { label: 'Plank', secs: 40, hard: true }, { label: 'Rest', secs: 20 },
    ]) },
];
