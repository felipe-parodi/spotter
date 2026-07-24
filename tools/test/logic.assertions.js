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

// --- weekly scheduler ---
let wk = buildWeek([1, 3, 5], false, 0); // Mon/Wed/Fri
assert(Object.values(wk.assign).every(s => s === 'full'), 'MWF → full body ×3');
assert(wk.score === 0, 'MWF has zero conflict (' + wk.score + ')');

wk = buildWeek([1, 2, 4, 5], false, 0); // Mon/Tue + Thu/Fri
assert(wk.score === 0, '4-day upper/lower alternation avoids all overlap (' + wk.score + ')');
const four = [wk.assign[1], wk.assign[2], wk.assign[4], wk.assign[5]];
assert(four.filter(s => s === 'upper').length === 2 && four.filter(s => s === 'lower').length === 2, '4-day uses upper/lower ×2');
assert(wk.assign[1] !== wk.assign[2] && wk.assign[4] !== wk.assign[5], 'adjacent days differ');

wk = buildWeek([1, 2, 3, 4, 5, 6], false, 0); // six straight days → PPL×2
assert(splitConflict(wk.assign[1], wk.assign[2]) < 3, '6-day: no heavy back-to-back overlap');
assert(wk.score <= 8, '6-day PPL score acceptable (' + wk.score + ')');

wk = buildWeek([1, 2, 3, 4, 5], true, 0);
assert(Object.values(wk.assign).filter(s => s === 'cardio').length === 1, 'cardio day placed when requested');

wk = buildWeek([0, 1, 2, 3, 4, 5, 6], false, 0);
assert(Object.values(wk.assign).includes('cardio'), '7 lifting days forces a recovery/cardio day');

assert(splitConflict('upper', 'upper') >= 9, 'same split adjacent scores high');
assert(splitConflict('upper', 'lower') === 0, 'upper/lower do not conflict');
assert(splitConflict('push', 'pull') <= 2, 'push/pull share only arms');

S.schedule = { enabled: true, minutes: 45, cardioDay: false, variant: 0, days: { 1: { split: 'upper', minutes: null }, 2: { split: 'upper', minutes: null } } };
assert(schedWarning(2).includes('Overlap') || schedWarning(2).includes('overlap'), 'manual back-to-back upper warns');

// today's plan + banner render
const todayIdx = new Date().getDay();
S.schedule.days = {}; S.schedule.days[todayIdx] = { split: 'lower', minutes: null };
S.history = [];
const tp = scheduleToday();
assert(tp && tp.label === 'Legs & glutes' && tp.minutes === 45, 'scheduleToday resolves plan');
assert(scheduleBanner().includes('On today’s plan'), 'banner shows today’s plan');
assert(viewProfile().includes('Weekly schedule'), 'profile shows schedule card');

// missed-day catch-up: scheduled 2 days ago, nothing trained since
const twoAgo = (todayIdx + 5) % 7;
S.schedule.days = {}; S.schedule.days[twoAgo] = { split: 'pull', minutes: null };
assert(missedSplit() && missedSplit().split === 'pull', 'missed day surfaces catch-up');
// ...but not if yesterday's ad-hoc training already hit those muscles
S.history = [{ date: day(1), groups: ['back'], minutes: 30, setCount: 3, volume: 0,
  exercises: [{ id: 'bb-row', name: 'Row', mode: 'reps', sets: [{ w: 95, r: 8 }] }] }];
assert(missedSplit() === null, 'catch-up suppressed after clashing session');
S.schedule = defaultState().schedule;

// --- suggestion engine ---
const perfEntry = (daysAgo, sets, target) => ({
  date: day(daysAgo), groups: ['chest'], minutes: 30, setCount: sets.length, volume: 0,
  exercises: [{ id: 'db-bench', name: 'Dumbbell Bench Press', mode: 'reps', targetReps: target || [8, 12], sets }],
});
const sugFor = () => suggestFor({ id: 'db-bench', name: 'Dumbbell Bench Press', mode: 'reps', reps: [8, 12] });

// staleness: 5 weeks away → 90%
S.history = [perfEntry(36, [{ w: 100, r: 12 }, { w: 100, r: 12 }])];
let sg = sugFor();
assert(sg.w === 90 && /weeks ago/.test(sg.note), 'stale history eases back to 90% (' + sg.w + ')');

// plateau: 3 sessions stuck → deload
S.history = [perfEntry(2, [{ w: 100, r: 10 }]), perfEntry(5, [{ w: 100, r: 9 }]), perfEntry(8, [{ w: 100, r: 10 }])];
sg = sugFor();
assert(sg.w === 90 && /deload/i.test(sg.note), 'plateau triggers deload (' + sg.note + ')');

// hard miss: solidify at 92.5%
S.history = [perfEntry(2, [{ w: 100, r: 10 }, { w: 100, r: 5 }])];
sg = sugFor();
assert(sg.w === 92.5 && /Solidify/.test(sg.note), 'hard miss backs off to 92.5 (' + sg.w + ')');

// per-set mirror of a ramp
S.history = [perfEntry(2, [{ w: 95, r: 10 }, { w: 105, r: 10 }, { w: 115, r: 9 }])];
sg = sugFor();
assert(sg.w === 115 && sg.setW && sg.setW.join(',') === '95,105,115', 'per-set ramp mirrored (' + (sg.setW || []).join(',') + ')');

// per-set progression when every target hit
S.history = [perfEntry(2, [{ w: 95, r: 12 }, { w: 105, r: 12 }, { w: 115, r: 12 }])];
sg = sugFor();
assert(sg.w === 120 && sg.setW.join(',') === '100,110,120', 'progression applies +step per set (' + sg.setW.join(',') + ')');

// warm-up ramp shapes
assert(warmupInner(185, true).split('·').length >= 4 && /\/side/.test(warmupInner(185, true)), 'heavy barbell gets 3 plate-aware steps');
assert(/\(bar\)/.test(warmupInner(85, true)), 'barbell ramp starts from the empty bar when 50% rounds to it');
assert(/light enough/.test(warmupInner(30, false)), 'light dumbbell work skips the ramp');
assert(plateRound(93) === 95, 'plateRound lands on loadable weight (' + plateRound(93) + ')');

// --- weight ramp: what autofill projects onto the sets after the one you typed ---
const blank = n => Array.from({ length: n }, () => ({ w: null, r: null, done: false }));
function activeDbBench(rows) {
  const def = findEx('db-bench');
  const e = snapshot(def, assignParams(def, 45));
  e.log = rows; e.sets = rows.length;
  e.suggest = suggestFor(e);
  S.active = { startedAt: Date.now(), groups: ['chest'], minutes: 45, est: 0, ex: [e] };
  return e;
}

S.history = [];
let rex = activeDbBench(blank(4));
assert(setShape('db-bench', 4) === null, 'no history → no learned shape');
assert(rampWeights(rex, 0, 30, 4).join() === '30,35,40,45', 'first time: one increment per set (' + rampWeights(rex, 0, 30, 4).join() + ')');
assert(rampWeights(rex, 0, 32.5, 3).join() === '32.5,37.5,42.5', 'odd base keeps its offset');

rex.log[0].w = 30;
autofillWeight(0, 0);
assert(rex.log.map(s => s.w).join() === '30,35,40,45', 'autofill projects the ramp (' + rex.log.map(s => s.w).join() + ')');
rex.log[2].w = 50; rex.log[2].auto = false; // typed by hand
rex.log[0].w = 40; autofillWeight(0, 0);
assert(rex.log.map(s => s.w).join() === '40,45,50,55', 'a typed weight survives re-projection (' + rex.log.map(s => s.w).join() + ')');

// today's per-set prescription is the shape to keep: typing a heavier set 1
// scales the whole ramp instead of flattening it or filling nothing
S.history = [perfEntry(2, [{ w: 95, r: 10 }, { w: 105, r: 10 }, { w: 115, r: 9 }])];
rex = activeDbBench(blank(3));
assert(rex.suggest.setW.join() === '95,105,115', 'prescription mirrors the logged ramp');
assert(suggestedW(rex, 1) === 105, 'set rows pre-fill from the prescription');
rex.log[0].w = 100;
autofillWeight(0, 0);
assert(rex.log.map(s => s.w).join() === '100,110,120', 'a heavier set 1 scales the prescribed ramp (' + rex.log.map(s => s.w).join() + ')');

// with no prescription in hand, the averaged history supplies the shape
S.history = [{ date: day(2), groups: ['chest'], minutes: 40, setCount: 3, volume: 0,
  exercises: [{ id: 'db-bench', name: 'Dumbbell Bench Press', mode: 'reps', targetReps: [8, 12],
    sets: [{ w: 30, r: 12 }, { w: 40, r: 10 }, { w: 50, r: 8 }] }] }];
assert(setShape('db-bench', 3).map(r => Math.round(r * 10) / 10).join() === '1,1.3,1.7', 'shape learned from one session');
const bare = { id: 'db-bench', log: blank(4), sets: 4, suggest: null };
// ×1, ×1.33, ×1.67, and a 4th set carries the same step on to ×2
assert(rampWeights(bare, 0, 40, 4).join() === '40,55,65,80', 'learned ramp scales to a new base (' + rampWeights(bare, 0, 40, 4).join() + ')');
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
