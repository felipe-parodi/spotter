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


/* ============================================================
   Rebuild (rehab mode)
   ============================================================ */

// --- data integrity: every cross-reference resolves ---
{
  let bad = [];
  for (const [key, pat] of Object.entries(REHAB_PATTERNS)) {
    if (!REHAB_REGIONS.some(r => r.id === pat.region)) bad.push(key + ': region ' + pat.region);
    for (const c of pat.chains) if (!REHAB_CHAINS[c]) bad.push(key + ': chain ' + c);
    for (const e of (pat.edu || [])) if (!REHAB_EDU[e]) bad.push(key + ': edu ' + e);
    for (const c of (pat.capacity || [])) if (!CAPACITY_TESTS[c]) bad.push(key + ': capacity ' + c);
    if (pat.isoPrimer && !rehabEx(pat.isoPrimer)) bad.push(key + ': isoPrimer ' + pat.isoPrimer);
    for (const ph of [1, 2, 3, 4]) {
      for (const t of (pat.excludes[ph] || [])) if (!PROVOKE_TAGS.includes(t)) bad.push(key + ': tag ' + t);
    }
  }
  assert(!bad.length, 'every pattern cross-reference resolves' + (bad.length ? ' — ' + bad.join('; ') : ''));
}

{
  let bad = [];
  for (const [cid, ids] of Object.entries(REHAB_CHAINS)) {
    for (const id of ids) {
      const ex = rehabEx(id);
      if (!ex) { bad.push(cid + '/' + id + ' missing'); continue; }
      if (!ex.repRange || !ex.baseSets) bad.push(cid + '/' + id + ' has no dose ladder');
      if (ex.repRange && ex.repRange[1] <= ex.repRange[0]) bad.push(cid + '/' + id + ' bad repRange');
    }
  }
  assert(!bad.length, 'every chain exercise resolves and has a dose ladder' + (bad.length ? ' — ' + bad.join('; ') : ''));
}

{
  let bad = [];
  for (const r of REHAB_REGIONS) if (!REHAB_INTAKE[r.id]) bad.push('no intake for ' + r.id);
  for (const k of Object.keys(REHAB_INTAKE)) if (!REHAB_REGIONS.some(r => r.id === k)) bad.push('orphan intake ' + k);
  assert(!bad.length, 'every region has intake questions' + (bad.length ? ' — ' + bad.join('; ') : ''));
}

// every routable combination of answers lands on a real pattern (or an
// explicit null with a message explaining why)
{
  let bad = [];
  for (const [region, intake] of Object.entries(REHAB_INTAKE)) {
    const steps = intake.steps || [];
    const combos = [{}];
    for (const s of steps) {
      const out = [];
      for (const c of combos) {
        for (const o of s.opts) {
          const n = Object.assign({}, c);
          n[s.id] = s.multi ? [o.v] : o.v;
          out.push(n);
        }
      }
      combos.length = 0; combos.push(...out);
    }
    for (const c of combos) {
      const p = intake.route(c);
      if (p === null) { if (!intake.noRouteMsg) bad.push(region + ': null route with no message'); continue; }
      if (!REHAB_PATTERNS[p]) bad.push(region + ': routed to unknown pattern ' + p);
    }
  }
  assert(!bad.length, 'every intake answer combination routes somewhere valid' + (bad.length ? ' — ' + bad.join('; ') : ''));
}

// --- rehab exercises stay out of normal plans ---
{
  let leaked = [];
  for (let i = 0; i < 25; i++) {
    const p = generateWorkout(['full'], 60);
    p.ex.forEach(e => { const d = findEx(e.id); if (d && d.rehab) leaked.push(e.id); });
  }
  assert(!leaked.length, 'rehab-only exercises never appear in normal plans' + (leaked.length ? ' — ' + leaked.join(',') : ''));
}

// --- a track can be created for every pattern, and builds a session ---
{
  let bad = [];
  for (const key of Object.keys(REHAB_PATTERNS)) {
    const pat = REHAB_PATTERNS[key];
    const t = createTrack(pat.region, 'left', key, {}, { worst: 6, typical: 4, psfs: [] }, null);
    const plan = buildRehabSession(t);
    if (!plan || !plan.ex.length) { bad.push(key + ': empty session'); continue; }
    if (plan.ex.some(e => !e.sets || !e.reps || e.reps[0] <= 0)) bad.push(key + ': bad dose');
  }
  assert(!bad.length, 'every pattern builds a first session' + (bad.length ? ' — ' + bad.join('; ') : ''));
}

// --- the 24-hour rule drives progression ---
let rbClock = Date.now() - 40 * 864e5;
function rbSession(t, pain, nextDay, amPain) {
  const plan = buildRehabSession(t);
  rbClock += 864e5;
  t.sessions.push({ date: new Date(rbClock).toISOString(), phase: t.phase,
    exIds: plan ? plan.ex.map(e => e.id) : [], duringPain: pain, cls: null });
  if (nextDay) {
    rbClock += 12 * 3600e3;
    t.checks.push({ date: new Date(rbClock).toISOString(), for: t.sessions[t.sessions.length - 1].date, nextDay, amPain });
    const s = lastSession(t);
    s.cls = classifySession(s, checkForSession(t, s), t);
  }
  return plan;
}
function rbTrack(pattern, region) {
  const t = createTrack(region, 'left', pattern, {}, { worst: 6, typical: 4, psfs: [] }, null);
  t.startedAt = new Date(rbClock).toISOString();
  t.phaseStartedAt = t.startedAt;
  return t;
}

{
  const t = rbTrack('pfp', 'knee');
  const primary = REHAB_CHAINS['knee-quad'][0];
  const start = t.dose[primary].reps;
  rbSession(t, 3, 'same', 2);                       // green #1
  assert(pendingVerdict(t).kind === 'hold', 'one green holds — a single good day is noise');
  rbSession(t, 3, 'better', 1);                     // green #2
  assert(pendingVerdict(t).kind === 'up', 'two greens in a row earn a step up');
  buildRehabSession(t);
  assert(t.dose[primary].reps > start, 'progressing raises the dose (' + start + ' → ' + t.dose[primary].reps + ')');
}

{
  const t = rbTrack('pfp', 'knee');
  rbSession(t, 3, 'same', 2);
  rbSession(t, 3, 'better', 1);
  buildRehabSession(t);                              // now one step up
  const raised = t.dose[REHAB_CHAINS['knee-quad'][0]].reps;
  rbSession(t, 8, 'still-sore', 7);                  // red
  assert(pendingVerdict(t).kind === 'down', 'a red session steps back down');
  buildRehabSession(t);
  assert(t.dose[REHAB_CHAINS['knee-quad'][0]].reps < raised, 'regression actually lowers the dose');
  assert(t.greenStreak === 0, 'a red resets the green streak');
}

{
  const t = rbTrack('pfp', 'knee');
  const primary = REHAB_CHAINS['knee-quad'][0];
  const start = t.dose[primary].reps;
  rbSession(t, 4, 'sore-settled', 3);
  assert(pendingVerdict(t).kind === 'hold', 'sore-but-settled holds rather than adding');
  buildRehabSession(t);
  assert(t.dose[primary].reps === start, 'amber leaves the dose alone');
}

{
  const t = rbTrack('pfp', 'knee');
  const primary = REHAB_CHAINS['knee-quad'][0];
  const start = t.dose[primary].reps;
  rbSession(t, 2, null);                             // no morning check logged
  assert(pendingVerdict(t).kind === 'hold', 'no morning check means no progression');
  buildRehabSession(t);
  assert(t.dose[primary].reps === start, 'unknown response leaves the dose alone');
}

{
  const t = rbTrack('knee-tendon', 'knee');
  rbSession(t, 5, 'same', 3);
  assert(lastSession(t).cls === 'green', 'pain of exactly 5 during is still green');
  rbSession(t, 6, 'same', 3);
  assert(lastSession(t).cls === 'red', 'pain above 5 during is red even if the morning is fine');
}

// --- dose ladder walks reps → load → sets, then advances the rung ---
{
  const ex = rehabEx('rh-calf-raise-flat');   // reps 12–15, loadable
  let d = baseDose(ex);
  assert(d.reps === 12 && d.sets === 3, 'base dose starts at the bottom of the range');
  d = nextDose(d, ex);
  assert(d.reps > 12 && d.load === 0, 'reps rise before load');
  while (d.reps < ex.repRange[1]) d = nextDose(d, ex);
  d = nextDose(d, ex);
  assert(d.load > 0 && d.reps === ex.repRange[0], 'topping out the reps adds load and resets reps');
  const back = prevDose(d, ex);
  assert(back.load === 0, 'prevDose is the inverse');

  const iso = rehabEx('rh-quad-iso');          // not loadable, setCap === baseSets
  let e = { sets: iso.setCap, reps: iso.repRange[1], load: 0 };
  assert(nextDose(e, iso) === null, 'a maxed-out non-loadable rung reports it is done');
}

{
  const t = rbTrack('calf-mid', 'calf');
  const cid = 'calf';
  const before = currentRung(t, cid);
  const ex = rehabEx(REHAB_CHAINS[cid][before]);
  t.dose[ex.id] = { sets: ex.setCap, reps: ex.repRange[1], load: 0 };  // maxed
  applyVerdict(t, { kind: 'up', cls: 'green' });
  assert(currentRung(t, cid) > before, 'maxing a rung advances the chain (' + before + ' → ' + currentRung(t, cid) + ')');
}

// --- phases gate the top of the chain ---
{
  const t = rbTrack('pfp', 'knee');
  const cap1 = maxRung('knee-quad', t, 1);
  t.phase = 2;
  const cap2 = maxRung('knee-quad', t, 2);
  assert(cap2 > cap1, 'phase 2 unlocks harder rungs than phase 1 (' + cap1 + ' → ' + cap2 + ')');
}

{
  const t = rbTrack('pfp', 'knee');
  for (let i = 0; i < 6; i++) rbSession(t, 2, 'better', 1);
  assert(canAdvancePhase(t), 'six green sessions at low pain earns phase 2');
  const plan = buildRehabSession(t);
  assert(t.phase === 2, 'building the next session advances the phase');
  assert(plan.advanced === 2, 'the plan reports the phase change so the UI can say so');
}

{
  const t = rbTrack('pfp', 'knee');
  for (let i = 0; i < 6; i++) rbSession(t, 2, 'better', 1);
  t.sessions.forEach(s => { s.cls = 'red'; });
  assert(!canAdvancePhase(t), 'sessions that came back sore do not count toward a phase');
}

{
  const t = rbTrack('knee-oa', 'knee');
  assert(nextPhaseNumber(Object.assign({}, t, { phase: 2 })) === 4, 'OA and back tracks skip the plyometric phase');
  assert(phasesFor(REHAB_PATTERNS['knee-oa']).length === 3, 'skipPhase3 patterns show three phases');
}

// --- exclusion tags actually exclude ---
{
  const t = rbTrack('hip-lateral', 'hip');
  const all = [];
  for (const cid of REHAB_PATTERNS['hip-lateral'].chains) {
    for (const id of REHAB_CHAINS[cid]) {
      for (const ph of [1, 2, 3, 4]) if (rehabExOK(rehabEx(id), t, ph)) all.push(id);
    }
  }
  const offenders = all.filter(id => (rehabEx(id).provokes || []).includes('hip-adduction'));
  assert(!offenders.length, 'the hip track never selects a compressive (adduction) exercise' + (offenders.length ? ' — ' + offenders.join(',') : ''));
}

{
  const t = rbTrack('calf-insert', 'calf');
  const bad = [];
  for (const ph of [1, 2, 3]) {
    for (const id of REHAB_CHAINS['calf']) {
      if (rehabExOK(rehabEx(id), t, ph) && (rehabEx(id).provokes || []).includes('ankle-dorsiflexion-load')) bad.push(id + '@' + ph);
    }
  }
  assert(!bad.length, 'insertional achilles stays off the step until the final phase' + (bad.length ? ' — ' + bad.join(',') : ''));
}

{
  const t = rbTrack('back-general', 'back');
  t.dirBias = 'ext';
  const flexOK = REHAB_CHAINS['back-direction'].filter(id =>
    rehabExOK(rehabEx(id), t, 1) && (rehabEx(id).provokes || []).includes('spinal-flexion-loaded'));
  assert(!flexOK.length, 'an extension direction preference biases flexion work out of phase 1');
}

// --- week-over-week escalation is a red ---
{
  const t = rbTrack('pfp', 'knee');
  const mk = (daysAgo, v) => ({ date: new Date(Date.now() - daysAgo * 864e5).toISOString(), nextDay: 'same', amPain: v });
  t.checks = [mk(13, 2), mk(11, 2), mk(9, 2), mk(5, 5), mk(3, 5), mk(1, 6)];
  assert(weeklyTrendRising(t), 'morning pain climbing week over week is detected');
  t.sessions.push({ date: new Date(Date.now() - 864e5).toISOString(), duringPain: 3, phase: 1, cls: null });
  assert(classifySession(lastSession(t), checkForSession(t, lastSession(t)), t) === 'red',
    'a rising weekly trend is red even when the single session looked fine');
}

{
  const t = rbTrack('pfp', 'knee');
  const mk = (daysAgo, v) => ({ date: new Date(Date.now() - daysAgo * 864e5).toISOString(), nextDay: 'same', amPain: v });
  t.checks = [mk(13, 3), mk(11, 3), mk(9, 3), mk(5, 3), mk(3, 2), mk(1, 2)];
  assert(!weeklyTrendRising(t), 'a flat or falling trend is not flagged');
  t.checks = [mk(5, 2), mk(3, 6)];
  assert(!weeklyTrendRising(t), 'two data points is not enough to call a trend');
}

// --- bail-outs ---
{
  const t = rbTrack('pfp', 'knee');
  t.sessions = [1, 2, 3, 4].map((n, i) => ({ date: new Date(Date.now() - (4 - i) * 864e5).toISOString(),
    duringPain: 7, phase: 1, cls: i === 0 ? 'green' : 'red' }));
  const al = rehabAlert(t);
  assert(al && al.kind === 'stalling', 'three reds in four sessions raises the "not settling" card');
}

{
  const t = rbTrack('pfp', 'knee');
  t.startedAt = new Date(Date.now() - 45 * 864e5).toISOString();   // ~week 7
  t.baseline = { worst: 6, typical: 6, psfs: [] };
  const al = rehabAlert(t);
  assert(al && al.kind === 'six-weeks', 'six weeks with no change tells you to see someone (' + (al && al.kind) + ')');
}

{
  const t = rbTrack('pfp', 'knee');
  t.startedAt = new Date(Date.now() - 45 * 864e5).toISOString();
  t.baseline = { worst: 6, typical: 6, psfs: [] };
  t.checks = [0, 1, 2].map(n => ({ date: new Date(Date.now() - n * 864e5).toISOString(), nextDay: 'better', amPain: 2 }));
  assert(improvedMeaningfully(t), 'a 4-point drop in morning pain counts as improvement');
  assert(!rehabAlert(t) || rehabAlert(t).kind !== 'six-weeks', 'no six-week nag when it is clearly working');
}

{
  const t = rbTrack('back-leg', 'back');
  t.checks = [
    { date: new Date(Date.now() - 12 * 864e5).toISOString(), nextDay: 'same', amPain: 4, leg: 'thigh' },
    { date: new Date(Date.now() - 8 * 864e5).toISOString(), nextDay: 'same', amPain: 4, leg: 'calf' },
    { date: new Date(Date.now() - 2 * 864e5).toISOString(), nextDay: 'same', amPain: 4, leg: 'foot' },
  ];
  const al = rehabAlert(t);
  assert(al && al.kind === 'peripheralising', 'symptoms travelling further down the leg stops the loading');
}

// --- graduation hands exercises back to normal training ---
{
  S.rehab = { tracks: [], niggles: [], dismissed: null };
  const t = rbTrack('pfp', 'knee');
  t.rung['knee-quad'] = REHAB_CHAINS['knee-quad'].length - 1;
  t.status = 'graduated';
  S.rehab.tracks.push(t);
  const ids = graduatedIds(t);
  assert(ids.includes('rh-step-down'), 'graduating hands back the top rung reached');
  assert(graduatedIdSet().has('rh-step-down'), 'graduated ids are collected across tracks');
  let seen = false;
  for (let i = 0; i < 120 && !seen; i++) {
    if (generateWorkout(['legs'], 60).ex.some(e => e.id === 'rh-step-down')) seen = true;
  }
  assert(seen, 'a graduated exercise can now appear in a normal plan');
  S.rehab = { tracks: [], niggles: [], dismissed: null };
}

// --- one active track at a time ---
{
  S.rehab = { tracks: [], niggles: [], dismissed: null };
  S.rehab.tracks.push(rbTrack('pfp', 'knee'));
  S.rehab.tracks.push(Object.assign(rbTrack('rcrsp', 'shoulder'), { status: 'paused' }));
  assert(activeTrack().region === 'knee', 'only the active track is returned');
  assert(S.rehab.tracks.filter(x => x.status === 'active').length === 1, 'exactly one block runs at a time');
}

// --- niggles ---
{
  S.rehab = { tracks: [], niggles: [], dismissed: null };
  assert(!niggleSuggestion(), 'no suggestion with no niggles');
  for (let i = 0; i < 3; i++) logNiggle('bb-squat', 'knee', 'left');
  assert(!niggleSuggestion(), 'three flags is not enough to offer a block');
  logNiggle('bb-squat', 'knee', 'left');
  const s = niggleSuggestion();
  assert(s && s.region === 'knee' && s.side === 'left' && s.n === 4, 'four flags in three weeks earns the offer');
  S.rehab.dismissed = s.key;
  assert(!niggleSuggestion(), 'dismissing the offer keeps it dismissed');
  S.rehab.dismissed = null;
  S.rehab.niggles.forEach(n => { n.date = new Date(Date.now() - 40 * 864e5).toISOString(); });
  assert(!niggleSuggestion(), 'old niggles age out of the three-week window');
  S.rehab = { tracks: [], niggles: [], dismissed: null };
}

// --- outcome measures ---
{
  const t = rbTrack('pfp', 'knee');
  t.baseline = { worst: 7, typical: 5, psfs: [{ task: 'stairs', score: 3 }, { task: 'sitting', score: 4 }] };
  assert(psfsDue(t) === false || psfsDue(t) === true, 'psfsDue returns a boolean');
  t.startedAt = new Date(Date.now() - 20 * 864e5).toISOString();
  assert(psfsDue(t), 'PSFS comes back round after two weeks');
  t.psfsLog = [{ date: todayISO(), scores: [7, 8] }];
  assert(!psfsDue(t), 'and not again straight away');
  const d = psfsDelta(t);
  assert(d && Math.abs(d.delta - 4) < 0.001, 'PSFS delta measured against intake (' + (d && d.delta) + ')');
}

// --- a full Rebuild session runs through the normal workout machinery ---
{
  S.rehab = { tracks: [], niggles: [], dismissed: null };
  const t = createTrack('knee', 'left', 'pfp', {}, { worst: 6, typical: 4, psfs: [] }, null);
  S.rehab.tracks.push(t);
  S.draft = buildRehabSession(t);
  assert(S.draft.rehab === t.id, 'the draft carries its track id');
  const histBefore = S.history.length;
  startWorkout();
  assert(S.active && S.active.rehab === t.id, 'the active session knows it is a Rebuild session');
  assert(S.active.ex.every(e => e.suggest), 'rehab exercises get a prescription, not suggestFor()');
  S.active.ex.forEach(e => e.log.forEach(s => { s.done = true; s.r = e.reps[1]; }));
  S.active.duringPain = 3;
  S.active.startedAt = Date.now() - 25 * 60000;
  finishWorkout(true);
  assert(S.history.length === histBefore + 1, 'a Rebuild session lands in history');
  assert(S.history[0].rehab === t.id, 'the history entry is tagged with the track');
  assert(t.sessions.length === 1, 'and is recorded on the track');
  assert(t.sessions[0].duringPain === 3, 'with the during-session pain score');
  S.active = null;
}

// --- views render for every pattern ---
{
  let bad = [];
  for (const key of Object.keys(REHAB_PATTERNS)) {
    const pat = REHAB_PATTERNS[key];
    S.rehab = { tracks: [], niggles: [], dismissed: null };
    const t = rbTrack(key, pat.region);
    S.rehab.tracks.push(t);
    try {
      const h = viewRehab();
      if (!h || h.indexOf('Rebuild') < 0) bad.push(key + ': hub');
      if (!viewToday()) bad.push(key + ': today');
      rbSession(t, 3, null);
      t.sessions[0].date = new Date(Date.now() - 12 * 3600e3).toISOString();
      if (!rehabCheckCard()) bad.push(key + ': morning check card');
      S._rehabCheck = { nextDay: 'same' };
      if (!rehabCheckCard()) bad.push(key + ': morning check stage 2');
      S._rehabCheck = null;
    } catch (e) { bad.push(key + ': threw ' + e.message); }
  }
  assert(!bad.length, 'every pattern renders its screens' + (bad.length ? ' — ' + bad.join('; ') : ''));
  S.rehab = { tracks: [], niggles: [], dismissed: null };
}

{
  let bad = [];
  for (const r of REHAB_REGIONS) {
    S._rehabWiz = { i: 0, region: r.id, side: 'left', flags: [], flagsSeen: true, answers: {}, selfTest: null,
      baseline: { worst: 5, typical: 3, psfs: [{ task: '', score: null }, { task: '', score: null }, { task: '', score: null }] } };
    const steps = wizSteps();
    for (let i = 0; i < steps.length; i++) {
      S._rehabWiz.i = i;
      try { if (!viewRehabSetup()) bad.push(r.id + ' step ' + i + ': empty'); }
      catch (e) { bad.push(r.id + ' step ' + i + ': ' + e.message); }
    }
  }
  assert(!bad.length, 'the intake wizard renders every step for every region' + (bad.length ? ' — ' + bad.join('; ') : ''));
  S._rehabWiz = null;
}


// --- preview / workout / profile render for a Rebuild session ---
{
  S.rehab = { tracks: [], niggles: [], dismissed: null };
  const t = createTrack('shoulder', 'right', 'rcrsp', {}, { worst: 5, typical: 3, psfs: [{ task: 'reaching a shelf', score: 4 }] }, null);
  S.rehab.tracks.push(t);
  S.draft = buildRehabSession(t);
  const prev = viewPreview();
  assert(prev.indexOf('Right shoulder') >= 0, 'the preview names the track, not the muscle groups');
  assert(prev.indexOf('data-a="regen"') < 0, 'the preview hides Reshuffle for a Rebuild session');
  assert(prev.indexOf('data-a="swap"') < 0, 'the preview hides per-exercise swap for a Rebuild session');
  startWorkout();
  const w = viewWorkout();
  assert(w.indexOf('Rebuild · week') >= 0, 'the session screen says it is a Rebuild session');
  assert(w.indexOf('data-a="open-picker"') < 0, 'you cannot bolt extra exercises onto a Rebuild session');
  assert(w.indexOf('data-a="niggle"') >= 0, 'the niggle button is on every exercise card');
  S._rehabPain = true;
  assert(viewWorkout().indexOf('data-a="rehab-pain"') >= 0, 'finishing asks for a during-session pain score');
  S._rehabPain = null;
  S._niggle = { exId: 'rh-band-er', region: null };
  assert(viewWorkout().indexOf('data-a="niggle-region"') >= 0, 'the niggle sheet opens');
  S._niggle = null;
  assert(viewProfile().indexOf('Rebuild') >= 0, 'Profile lists Rebuild blocks');
  S.active = null; S.draft = null;
  S.rehab = { tracks: [], niggles: [], dismissed: null };
}

// --- a paused track stops suggesting, and Today stays clean without one ---
{
  S.rehab = { tracks: [], niggles: [], dismissed: null };
  assert(rehabCard() === '', 'no Rebuild card on Today without an active block');
  assert(rehabCheckCard() === '', 'no morning check without a block');
  const t = createTrack('knee', 'left', 'pfp', {}, { worst: 5, typical: 3, psfs: [] }, null);
  S.rehab.tracks.push(t);
  assert(rehabCard() !== '', 'an active block shows its card');
  t.status = 'paused';
  assert(rehabCard() === '', 'a paused block goes quiet');
  S.rehab = { tracks: [], niggles: [], dismissed: null };
}

console.log(process.exitCode ? '--- FAILURES ---' : '--- ALL PASSED ---');
