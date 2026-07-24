/* Assertions evaluated inside the app's scope by logic.test.js — do not run
   directly. Everything from app.js/db.js is in scope (S, generateWorkout, …). */
const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exitCode = 1; } else console.log('ok: ' + msg); };

// --- generator: cardio joins as single finisher ---
S.sel = { groups: ['legs', 'cardio'], minutes: 45 };
let plan = generateWorkout(['legs', 'cardio'], 45);
assert(plan.ex.length >= 4, 'mixed plan has exercises (' + plan.ex.length + ')');
assert(plan.ex.filter(e => e.cardio).length === 1, 'exactly one cardio block in mixed plan');
assert(plan.ex[plan.ex.length - 1].cardio, 'cardio sorted last');

plan = generateWorkout(['cardio'], 30);
const cardioCount = plan.ex.filter(e => e.cardio).length;
assert(cardioCount >= 1 && cardioCount <= 3, 'cardio-only plan 1-3 blocks (' + cardioCount + ')');
assert(plan.est <= 45, 'cardio-only est sane (' + plan.est + ')');

// --- simulate a full session: strength + cardio + hiit entry ---
S.draft = generateWorkout(['legs', 'cardio'], 45);
startWorkout();
assert(S.active && S.active.ex.length, 'workout started');
S.active.ex.forEach(e => e.log.forEach(s => { s.done = true; s.r = e.reps[1]; if (!e.cardio && e.mode !== 'time') s.w = 50; }));
S.active.ex.push({ id: 'hiit-tabata', name: 'Tabata', cue: '', cmp: false, uni: false, mode: 'time', hiit: true, eqLabel: 'HIIT block', sets: 1, reps: [4, 4], rest: 0, log: [{ w: null, r: 4, done: true }] });
S.active.startedAt = Date.now() - 45 * 60000;
finishWorkout(true);
assert(route === 'cooldown', 'finish routes to cooldown (' + route + ')');
const entry = S.history[0];
assert(entry.exercises.some(e => e.cardio), 'history entry keeps cardio flag');
assert(entry.exercises.some(e => e.hiit), 'history entry keeps hiit flag');
assert(lastFinished === entry, 'lastFinished set (no persisted copy)');
assert(!('lastSummary' in S) || S.lastSummary == null, 'lastSummary not stored in state');

// --- calories ---
const kcal = sessionKcal(entry);
assert(kcal > 100 && kcal < 350, 'kcal conservative and sane (' + kcal + ')');
const savedBw = S.bodyLog;
S.bodyLog = []; S.profile.bodyweight = null;
assert(sessionKcal(entry) === null, 'kcal hidden without bodyweight');
S.profile.bodyweight = 150; S.bodyLog = savedBw;

// --- day streak ---
const day = n => new Date(Date.now() - n * 864e5).toISOString();
S.history = [{ date: day(0), exercises: [], groups: ['full'], minutes: 30, setCount: 1 },
             { date: day(2), exercises: [], groups: ['full'], minutes: 30, setCount: 1 },
             { date: day(5), exercises: [], groups: ['full'], minutes: 30, setCount: 1 }];
assert(dayStreak() === 6, 'streak spans chain w/ tolerated rests (got ' + dayStreak() + ')');
S.history = [{ date: day(4), exercises: [], groups: ['full'], minutes: 30, setCount: 1 }];
assert(dayStreak() === 0, 'streak dead after 4 idle days');
S.history = [{ date: day(0), exercises: [], groups: ['full'], minutes: 30, setCount: 1 },
             { date: day(6), exercises: [], groups: ['full'], minutes: 30, setCount: 1 }];
assert(dayStreak() === 1, 'gap >3 days resets chain to latest day');

// --- cooldown matching ---
S.history = [];
const cd = cooldownFor({ exercises: [{ id: 'bb-squat', sets: [{}] }, { id: 'db-bench', sets: [{}] }] });
assert(cd.length === 4, 'cooldown picks 4 stretches');
assert(cd.some(s => s.m.includes('quads')) && cd.some(s => s.m.includes('chest')), 'stretches match trained muscles');

// --- HIIT catch-up after background throttling ---
hiitRun = { tpl: HIIT_TEMPLATES.find(t => t.id === 'tabata'), idx: 0, end: Date.now(), paused: false, started: Date.now() };
S.active = { startedAt: Date.now(), groups: ['hiit'], minutes: 30, est: 0, ex: [] };
hiitAdvance(35); // 35s behind: skips 10s rest + 20s work, lands 5s into next rest
assert(hiitRun.idx === 3, 'catch-up fast-forwards intervals (idx ' + hiitRun.idx + ')');
const leftMs = hiitRun.end - Date.now();
assert(leftMs > 4000 && leftMs <= 5100, 'catch-up keeps schedule remainder (' + leftMs + 'ms)');
hiitRun = null; S.active = null;

// --- plate calculator ---
assert(plateText(45) === 'Empty bar', 'plateText empty bar');
assert(plateText(135) === 'Plates: 45 per side', 'plateText 135 → ' + plateText(135));
assert(plateText(190) === 'Plates: 45 + 25 + 2.5 per side', 'plateText 190 → ' + plateText(190));
assert(plateText(40) === null, 'plateText below bar → null');

// --- weekly muscle volume ---
S.history = [{ date: day(0), groups: ['legs'], minutes: 40, setCount: 7, volume: 0, exercises: [
  { id: 'bb-squat', name: 'Squat', mode: 'reps', sets: [{ w: 95, r: 8 }, { w: 95, r: 8 }, { w: 95, r: 8 }] },
  { id: 'db-bench', name: 'Bench', mode: 'reps', sets: [{ w: 40, r: 10 }] },
  { id: 'treadmill-run', name: 'Run', mode: 'time', cardio: true, sets: [{ w: null, r: 18 }] },
]}];
const wv = weeklyMuscleSets();
assert(wv.counts.get('Legs') === 3, 'weekly sets: Legs 3 (' + wv.counts.get('Legs') + ')');
assert(wv.counts.get('Chest') === 1, 'weekly sets: Chest 1');
assert(wv.cardioMin === 18, 'weekly cardio minutes 18 (' + wv.cardioMin + ')');

// --- repeat session ---
S.notes = {};
repeatSession(0);
assert(route === 'preview' && S.draft && S.draft.repeatOf, 'repeat builds a draft');
assert(S.draft.ex.length === 3, 'repeat mirrors exercises (' + S.draft.ex.length + ')');
assert(S.draft.ex.find(e => e.id === 'bb-squat').sets === 3, 'repeat mirrors set counts');
S.draft = null;

// --- views render without crashing ---
S.history = [entry];
lastFinished = entry;
S._reviewHist = 0;
for (const [name, fn] of Object.entries({ viewToday, viewHistory, viewTrends, viewProfile, viewSummary, viewCooldown, viewReview })) {
  const html = fn();
  assert(typeof html === 'string' && html.length > 100, name + ' renders');
}
hiitRun = { tpl: HIIT_TEMPLATES[0], idx: 0, end: Date.now() + 20000, paused: false, started: Date.now() };
route = 'hiit';
assert(viewHiit().includes('All-out'), 'viewHiit renders interval');
assert(viewHiit().includes('left in block'), 'viewHiit shows total remaining');
hiitTick();
hiitRun = null;

// --- cardio trends ---
S.history = [{ date: day(0), groups: ['cardio'], minutes: 20, setCount: 1, volume: 0,
  exercises: [{ id: 'treadmill-run', name: 'Treadmill Run', mode: 'time', cardio: true, targetReps: [12, 20], sets: [{ w: null, r: 18 }] }] }];
const series = exerciseSeries('treadmill-run');
assert(series[0].sub === '18 min', 'cardio trend sub in minutes (' + series[0].sub + ')');
S._trendEx = 'treadmill-run';
assert(viewTrend().includes('Longest session'), 'cardio trend caption reads "Longest session"');

// --- picker ---
S._picker = { q: '' };
assert(pickerHTML().includes('Tabata'), 'picker lists HIIT blocks');
S._picker = { q: 'tread' };
assert(pickerHTML().includes('Treadmill Run'), 'picker finds cardio');
S._picker = null;

// --- progression pulls incr from the db ---
S.history = [{ date: day(2), groups: ['chest'], minutes: 30, setCount: 3, volume: 0,
  exercises: [{ id: 'db-bench', name: 'Dumbbell Bench Press', mode: 'reps', targetReps: [8, 12], sets: [{ w: 40, r: 12 }, { w: 40, r: 12 }, { w: 40, r: 12 }] }] }];
const sug = suggestFor({ id: 'db-bench', name: 'Dumbbell Bench Press', mode: 'reps', reps: [8, 12] });
assert(sug.w === 45, 'progression suggests +5 lb (got ' + sug.w + ')');

// --- notes round-trip ---
S.notes['db-bench'] = 'seat at 3';
assert(noteHTML('db-bench').includes('seat at 3'), 'note surfaces in card');
assert(exerciseCardSafe(), 'exerciseCard renders with note+plates');
function exerciseCardSafe() {
  S.active = { startedAt: Date.now(), groups: ['chest'], minutes: 45, est: 0, ex: [] };
  const def = findEx('bb-bench');
  const entry = snapshot(def, assignParams(def, 45));
  entry.log = [{ w: 135, r: null, done: false }];
  entry.suggest = { w: 135, note: '' };
  S.active.ex = [entry];
  const html = exerciseCard(entry, 0);
  S.active = null;
  return html.includes('Plates: 45 per side') && html.includes('Add a note');
}

// --- weight ramp: default, learned, and what it refuses to overwrite ---
function activeDbBench(logRows) {
  const def = findEx('db-bench');
  const entry = snapshot(def, assignParams(def, 45));
  entry.log = logRows;
  entry.sets = logRows.length;
  entry.suggest = suggestFor(entry);
  S.active = { startedAt: Date.now(), groups: ['chest'], minutes: 45, est: 0, ex: [entry] };
  return entry;
}
const blank = n => Array.from({ length: n }, () => ({ w: null, r: null, done: false }));

S.history = [];
let ex = activeDbBench(blank(4));
assert(setShape('db-bench', 4) === null, 'no history → no learned shape');
assert(rampWeights(ex, 0, 30, 4).join() === '30,35,40,45', 'default ramp is one increment per set (' + rampWeights(ex, 0, 30, 4).join() + ')');
assert(rampWeights(ex, 0, 32.5, 3).join() === '32.5,37.5,42.5', 'odd base keeps its offset');

ex.log[0].w = 30;
autofillWeight(0, 0);
assert(ex.log.map(s => s.w).join() === '30,35,40,45', 'autofill projects the ramp (' + ex.log.map(s => s.w).join() + ')');
ex.log[2].w = 50; ex.log[2].auto = false; // typed by hand
ex.log[0].w = 40; autofillWeight(0, 0);
assert(ex.log.map(s => s.w).join() === '40,45,50,55', 'a typed weight survives re-projection (' + ex.log.map(s => s.w).join() + ')');

// straight sets in history → learned shape overrides the default ramp
S.history = [{ date: day(2), groups: ['chest'], minutes: 40, setCount: 3, volume: 0,
  exercises: [{ id: 'db-bench', name: 'Dumbbell Bench Press', mode: 'reps', targetReps: [8, 12],
    sets: [{ w: 40, r: 10 }, { w: 40, r: 10 }, { w: 40, r: 10 }] }] }];
ex = activeDbBench(blank(4));
assert(rampWeights(ex, 0, 30, 4).join() === '30,30,30,30', 'learned straight sets stay flat (' + rampWeights(ex, 0, 30, 4).join() + ')');

// an ascending session teaches the ascending shape, from the very first session
S.history[0].exercises[0].sets = [{ w: 30, r: 12 }, { w: 40, r: 10 }, { w: 50, r: 8 }];
ex = activeDbBench(blank(4));
assert(setShape('db-bench', 3).map(r => Math.round(r * 10) / 10).join() === '1,1.3,1.7', 'shape learned from one session');
// 30/40/50 → ×1, ×1.33, ×1.67, and a 4th set carries the same step on to ×2
assert(rampWeights(ex, 0, 40, 4).join() === '40,55,65,80', 'learned ramp scales to a new base (' + rampWeights(ex, 0, 40, 4).join() + ')');
const wplan = weightPlan(ex);
assert(wplan && Math.max.apply(null, wplan) === ex.suggest.w, "plan peaks at today's suggested weight (" + wplan + " vs " + ex.suggest.w + ")");
assert(setRow(ex, 0, ex.log[0], 0, wplan).includes('value="' + wplan[0] + '"'), 'set row pre-fills its planned weight');
S.active = null;

// --- rest is 1½ min for lifting, on every goal and session length ---
['fitness', 'muscle', 'strength'].forEach(g => {
  S.profile.goal = g;
  assert(assignParams(findEx('bb-squat'), 45).rest === 90, g + ': compound rests 90s');
  assert(assignParams(findEx('db-curl'), 45).rest === 90, g + ': isolation rests 90s');
  assert(assignParams(findEx('bb-squat'), 30).rest === 90, g + ': short session keeps 90s');
});
S.profile.goal = 'muscle';
assert(restText(90) === '1½ min', 'rest reads as 1½ min (' + restText(90) + ')');

console.log(process.exitCode ? '--- FAILURES ---' : '--- ALL PASSED ---');
