'use strict';
/* ============================================================
   Spotter — app logic
   Vanilla JS, no dependencies, everything stored in localStorage.
   ============================================================ */

/* ---------------- state & storage ---------------- */

const LS_KEY = 'spotter-v1';
const OLD_KEY = 'swolemates-v1';

function defaultState() {
  return {
    profile: null, // {name, level: 'beginner'|'experienced', goal, units: 'lb'|'kg'}
    settings: { equipment: Object.fromEntries(EQUIPMENT.map(e => [e.id, true])) },
    history: [],   // finished workouts, newest first
    custom: [],    // user-created exercises
    active: null,  // in-progress workout
    draft: null,   // generated-but-not-started plan
    sel: { groups: ['full'], minutes: 45 },
  };
}

let S = loadState();

function loadState() {
  try {
    let raw = localStorage.getItem(LS_KEY);
    if (!raw && localStorage.getItem(OLD_KEY)) {
      raw = localStorage.getItem(OLD_KEY);
      localStorage.setItem(LS_KEY, raw);
      localStorage.removeItem(OLD_KEY);
    }
    if (raw) {
      const parsed = JSON.parse(raw);
      const s = Object.assign(defaultState(), parsed);
      s.settings = parsed.settings || {};
      s.settings.equipment = Object.assign(
        Object.fromEntries(EQUIPMENT.map(e => [e.id, true])),
        s.settings.equipment || {});
      s.custom = parsed.custom || [];
      return s;
    }
  } catch (e) { /* corrupted storage falls through to a fresh state */ }
  return defaultState();
}

function save() { localStorage.setItem(LS_KEY, JSON.stringify(S)); }

/* ---------------- helpers ---------------- */

const $ = sel => document.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KG = 0.45359237;
const HAS_IMG = typeof IMG_IDS !== 'undefined' ? new Set(IMG_IDS) : new Set();

function unitLabel() { return S.profile && S.profile.units === 'kg' ? 'kg' : 'lb'; }

function allExercises() { return EXERCISES.concat(S.custom || []); }
function findEx(id) { return allExercises().find(e => e.id === id); }

function incrFor(ex) {
  if (!ex.incr) return 0;
  if (unitLabel() === 'kg') return ex.incr >= 10 ? 5 : 2.5;
  return ex.incr;
}

function fmtW(w) { return (Math.round(w * 2) / 2).toString(); }
function roundW(w) { return Math.max(2.5, Math.round(w / 2.5) * 2.5); }

function todayISO() { return new Date().toISOString(); }

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function minutesBetween(a, b) { return Math.max(1, Math.round((b - a) / 60000)); }

/* Monday-based start of the week containing `d` */
function weekStart(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x.getTime();
}

function weekStats() {
  const thisWeek = weekStart(new Date());
  const weeks = new Set(S.history.map(w => weekStart(new Date(w.date))));
  const count = S.history.filter(w => weekStart(new Date(w.date)) === thisWeek).length;
  let streak = 0;
  let cursor = weeks.has(thisWeek) ? thisWeek : thisWeek - 7 * 86400000;
  while (weeks.has(cursor)) { streak++; cursor -= 7 * 86400000; }
  return { count, streak, total: S.history.length };
}

/* ---------------- exercise filtering & progression ---------------- */

function equipOK(ex) {
  return ex.eq.every(t => t === 'bodyweight' || S.settings.equipment[t]);
}

function levelOK(ex) {
  return S.profile.level === 'experienced' ? true : ex.lvl <= 2;
}

/* Most recent logged performance for an exercise. */
function lastPerf(exId) {
  for (const w of S.history) {
    const ex = (w.exercises || []).find(e => e.id === exId && e.sets && e.sets.length);
    if (ex) {
      const weights = ex.sets.map(s => s.w).filter(x => typeof x === 'number' && x > 0);
      const topW = weights.length ? Math.max(...weights) : null;
      const allHit = ex.targetReps ? ex.sets.every(s => (s.r || 0) >= ex.targetReps[1]) : false;
      return { topW, allHit, sets: ex.sets, date: w.date };
    }
  }
  return null;
}

function suggestFor(ex) {
  const perf = lastPerf(ex.id);
  const step = incrFor(ex);
  if (!perf) {
    return { w: null, note: step ? 'First time: pick a weight that leaves 2–3 reps in the tank.' : null, up: false };
  }
  const detail = perf.sets.map(s => s.r).filter(Boolean).join(', ');
  const lastTxt = perf.topW
    ? 'Last: ' + fmtW(perf.topW) + ' ' + unitLabel() + (detail ? ' × ' + detail : '')
    : (detail ? 'Last: ' + detail + (ex.mode === 'time' ? ' sec' : ' reps') : null);
  if (perf.allHit && perf.topW && step) {
    return { w: perf.topW + step, note: lastTxt + ' — every target hit. Today: ' + fmtW(perf.topW + step) + ' ' + unitLabel() + ' ↑', up: true };
  }
  if (perf.allHit && !step) {
    return { w: null, note: lastTxt + ' — every target hit. Add ' + (ex.mode === 'time' ? '5–10 sec' : '1–2 reps') + ' ↑', up: true };
  }
  return { w: perf.topW, note: lastTxt, up: false };
}

/* ---------------- workout generator ---------------- */

function recentExerciseIds(n) {
  const ids = new Set();
  S.history.slice(0, n).forEach(w => (w.exercises || []).forEach(e => ids.add(e.id)));
  return ids;
}

function assignParams(ex, minutes) {
  const goal = GOAL_PARAMS[S.profile.goal] || GOAL_PARAMS.fitness;
  const kind = ex.mode === 'time' ? 'time' : (ex.cmp ? 'cmp' : 'iso');
  const p = goal[kind];
  let sets = p.sets, rest = p.rest;
  if (minutes <= 30) { sets = Math.min(sets, 3); rest = Math.round(rest * 0.8); }
  return { sets, reps: p.reps.slice(), rest, kind };
}

function estMinutes(a) { return a.sets * (0.75 + a.rest / 60); }

function musclesFor(groupIds) {
  const gs = UI_GROUPS.filter(g => groupIds.includes(g.id));
  const maxLen = Math.max(...gs.map(g => g.muscles.length), 1);
  const queue = [];
  for (let r = 0; r < maxLen * 4; r++) {
    for (const g of gs) queue.push(g.muscles[r % g.muscles.length]);
  }
  return queue;
}

function pickExercise(muscle, usedIds, recent, preferCompound) {
  const pool = EXERCISES.filter(e =>
    e.m.includes(muscle) && !usedIds.has(e.id) && equipOK(e) && levelOK(e));
  if (!pool.length) return null;
  let best = null, bestScore = -Infinity;
  for (const e of pool) {
    let score = Math.random() * 6;
    if (preferCompound && e.cmp) score += 12;
    if (!preferCompound && !e.cmp) score += 6;
    if (recent.has(e.id)) score -= 10;
    if ((S.profile.goal === 'muscle' || S.profile.goal === 'strength') && !e.incr) score -= 5;
    if (S.profile.level === 'beginner' && e.lvl === 2) score -= 4;
    if (S.profile.level === 'experienced' && e.lvl === 1) score -= 1;
    if (score > bestScore) { bestScore = score; best = e; }
  }
  return best;
}

function snapshot(def, params) {
  return {
    id: def.id, name: def.name, cue: def.cue || '', cmp: !!def.cmp, uni: !!def.uni,
    mode: def.mode || 'reps',
    eqLabel: def.custom ? 'Custom' : def.eq.map(t => EQ_LABEL[t]).join(' · '),
    sets: params.sets, reps: params.reps, rest: params.rest,
  };
}

function generateWorkout(groupIds, minutes) {
  const budget = minutes - 5; // reserve ~5 min for warm-up
  const queue = musclesFor(groupIds);
  const usedIds = new Set();
  const recent = recentExerciseIds(2);
  const picked = [];
  let total = 0;

  for (const muscle of queue) {
    if (picked.length >= 8) break;
    const cmpCount = picked.filter(p => p.cmp).length;
    const preferCompound = cmpCount < Math.max(3, Math.ceil((picked.length + 1) * 0.6));
    const ex = pickExercise(muscle, usedIds, recent, preferCompound && muscle !== 'core');
    if (!ex) continue;
    const params = assignParams(ex, minutes);
    const est = estMinutes(params);
    if (picked.length >= 3 && total + est > budget + 2) break;
    usedIds.add(ex.id);
    picked.push(Object.assign({}, ex, params));
    total += est;
  }

  picked.sort((a, b) => {
    const coreA = a.m.includes('core') ? 1 : 0, coreB = b.m.includes('core') ? 1 : 0;
    if (coreA !== coreB) return coreA - coreB;
    return (b.cmp ? 1 : 0) - (a.cmp ? 1 : 0);
  });

  return {
    groups: groupIds,
    minutes,
    est: Math.round(total + 5),
    ex: picked.map(p => snapshot(p, p)),
  };
}

function swapExercise(i) {
  const plan = S.draft || S.active;
  if (!plan || !plan.ex[i]) return;
  const cur = plan.ex[i];
  const orig = EXERCISES.find(e => e.id === cur.id);
  if (!orig) return;
  const muscle = orig.m[0];
  const usedIds = new Set(plan.ex.map(e => e.id));
  const next = pickExercise(muscle, usedIds, new Set(), cur.cmp);
  if (!next) { toast('No alternative for this muscle with your equipment.'); return; }
  const fresh = snapshot(next, assignParams(next, plan.minutes || 45));
  if (plan === S.active) {
    fresh.log = Array.from({ length: fresh.sets }, () => ({ w: null, r: null, done: false }));
    fresh.suggest = suggestFor(fresh);
  }
  plan.ex[i] = fresh;
  save(); render();
}

function warmupFor(groupIds) {
  const lower = groupIds.some(g => ['legs', 'glutes', 'full'].includes(g));
  const upper = groupIds.some(g => ['chest', 'back', 'shoulders', 'arms', 'full'].includes(g));
  const bits = ['2–3 min easy cardio'];
  if (lower) bits.push('leg swings + 10 bodyweight squats');
  if (upper) bits.push('arm circles + a light first set of exercise 1');
  return bits.join(' · ');
}

/* Suggest today's split from what was trained last */
function suggestSplit() {
  if (!S.history.length) return null;
  const last = S.history[0];
  const days = Math.floor((Date.now() - new Date(last.date).getTime()) / 86400000);
  const when = days <= 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago';
  const lastLabel = groupLabels(last.groups);
  if (days > 4) return { groups: ['full'], label: 'Full body', when, lastLabel };
  if (last.groups.includes('freestyle') || last.groups.includes('full')) return null;
  const lower = last.groups.some(g => ['legs', 'glutes'].includes(g));
  const upper = last.groups.some(g => ['chest', 'back', 'shoulders', 'arms'].includes(g));
  if (lower && !upper) return { groups: ['chest', 'back', 'shoulders'], label: 'Upper body', when, lastLabel };
  if (upper && !lower) return { groups: ['legs', 'glutes', 'core'], label: 'Legs, glutes & core', when, lastLabel };
  return null;
}

/* ---------------- workout lifecycle ---------------- */

function startWorkout() {
  if (!S.draft) return;
  S.active = Object.assign({}, S.draft, {
    startedAt: Date.now(),
    ex: S.draft.ex.map(e => Object.assign({}, e, {
      log: Array.from({ length: e.sets }, () => ({ w: null, r: null, done: false })),
      suggest: suggestFor(e),
    })),
  });
  S.draft = null;
  save(); acquireWakeLock(); go('workout');
}

function startFreestyle() {
  S.active = {
    startedAt: Date.now(), groups: ['freestyle'], minutes: 45, est: 0,
    ex: [],
  };
  S._picker = { q: '' };
  save(); acquireWakeLock(); go('workout');
}

function addToActive(def, opts) {
  const params = assignParams(def, S.active.minutes || 45);
  if (opts && opts.sets) params.sets = opts.sets;
  if (opts && def.mode === 'time' && opts.secs) params.reps = [opts.secs, opts.secs];
  const entry = snapshot(def, params);
  entry.log = Array.from({ length: entry.sets }, () => ({ w: null, r: null, done: false }));
  entry.suggest = suggestFor(entry);
  S.active.ex.push(entry);
  S._picker = null;
  save(); render();
}

function setDone(i, j) {
  const ex = S.active.ex[i];
  const s = ex.log[j];
  s.done = !s.done;
  if (s.done) {
    if (s.w == null && ex.suggest && ex.suggest.w) s.w = ex.suggest.w;
    if (s.r == null) s.r = ex.reps[1];
    const isLastSet = i === S.active.ex.length - 1 && j === ex.log.length - 1;
    if (!isLastSet) startRest(ex.rest, ex.name);
  }
  save();
  updateWorkoutDOM(i, j);
}

function computePRs(entry) {
  const prs = [];
  for (const e of entry.exercises) {
    let bestW = 0, bestR = 0, seen = false;
    for (const h of S.history) {
      const he = (h.exercises || []).find(x => x.id === e.id);
      if (!he) continue;
      seen = true;
      for (const s of he.sets) {
        if ((s.w || 0) > bestW) bestW = s.w;
        if ((s.r || 0) > bestR) bestR = s.r;
      }
    }
    if (!seen) continue; // first time doing it — everything is a "PR", not interesting
    const curW = Math.max(...e.sets.map(s => s.w || 0), 0);
    const curR = Math.max(...e.sets.map(s => s.r || 0), 0);
    if (bestW && curW > bestW) prs.push(e.name + ' · ' + fmtW(curW) + ' ' + unitLabel());
    else if (!bestW && curR > bestR) prs.push(e.name + ' · ' + curR + (e.mode === 'time' ? ' sec' : ' reps'));
  }
  return prs;
}

function finishWorkout(force) {
  const a = S.active;
  const doneSets = a.ex.reduce((n, e) => n + e.log.filter(s => s.done).length, 0);
  const totalSets = a.ex.reduce((n, e) => n + e.log.length, 0);
  if (!force && doneSets < totalSets) {
    if (!confirm('Done ' + doneSets + ' of ' + totalSets + ' sets. Finish anyway?')) return;
  }
  if (doneSets === 0) {
    if (!confirm('No sets logged — discard this session?')) return;
    S.active = null; stopRest(); releaseWakeLock(); save(); go('today'); return;
  }
  const entry = {
    date: todayISO(),
    groups: a.groups,
    goal: S.profile.goal,
    minutes: minutesBetween(a.startedAt, Date.now()),
    exercises: a.ex.map(e => ({
      id: e.id, name: e.name, mode: e.mode, uni: e.uni,
      targetReps: e.reps,
      sets: e.log.filter(s => s.done).map(s => ({ w: s.w, r: s.r })),
    })).filter(e => e.sets.length),
  };
  entry.volume = entry.exercises.reduce((v, e) =>
    v + e.sets.reduce((x, s) => x + (s.w || 0) * (s.r || 0), 0), 0);
  entry.setCount = entry.exercises.reduce((n, e) => n + e.sets.length, 0);
  entry.prs = computePRs(entry);
  S.history.unshift(entry);
  S.active = null;
  S.lastSummary = entry;
  stopRest(); releaseWakeLock(); save(); go('summary');
}

/* ---------------- wake lock (screen stays on mid-workout) ---------------- */

let wakeLock = null;

async function acquireWakeLock() {
  try {
    if ('wakeLock' in navigator && S.active) {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (e) { /* low battery or unsupported — not critical */ }
}

function releaseWakeLock() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.active) acquireWakeLock();
});

/* ---------------- rest timer ---------------- */

let rest = null; // {end, total, label}
let audioCtx = null;

function startRest(sec, label) {
  rest = { end: Date.now() + sec * 1000, total: sec, label };
  renderRestBar();
}

function stopRest() {
  rest = null;
  const bar = $('#restbar');
  if (bar) bar.classList.remove('show');
}

function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    [0, 0.18].forEach((off, k) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = k ? 1046 : 880; o.type = 'sine';
      g.gain.setValueAtTime(0.001, t + off);
      g.gain.exponentialRampToValueAtTime(0.2, t + off + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.15);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t + off); o.stop(t + off + 0.2);
    });
  } catch (e) { /* audio unavailable — visual cue still shows */ }
  if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
}

setInterval(() => {
  if (route === 'workout' && S.active) {
    const el = $('#elapsed');
    if (el) el.textContent = minutesBetween(S.active.startedAt, Date.now()) + ' min';
  }
  if (!rest) return;
  const left = Math.ceil((rest.end - Date.now()) / 1000);
  if (left <= 0) {
    beep(); toast('Rest over.'); stopRest();
    return;
  }
  renderRestBar(left);
}, 250);

function renderRestBar(left) {
  const bar = $('#restbar');
  if (!bar || !rest) return;
  if (left == null) left = Math.ceil((rest.end - Date.now()) / 1000);
  const pct = Math.max(0, Math.min(1, left / rest.total));
  bar.classList.add('show');
  bar.querySelector('.rest-time').textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
  bar.querySelector('.rest-fill').style.width = (pct * 100) + '%';
}

/* ---------------- toast ---------------- */

let toastTimer = null;
function toast(msg, action, onAction) {
  const t = $('#toast');
  t.innerHTML = esc(msg) + (action ? ' <button class="toast-btn" data-a="toast-action">' + esc(action) + '</button>' : '');
  t._onAction = onAction || null;
  t.classList.add('show');
  clearTimeout(toastTimer);
  if (!action) toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ---------------- views ---------------- */

let route = 'today';

function go(r) { route = r; render(); window.scrollTo(0, 0); }

function render() {
  if (!S.profile) route = 'onboard';
  const app = $('#app');
  const views = {
    onboard: viewOnboard, today: viewToday, preview: viewPreview,
    workout: viewWorkout, summary: viewSummary, history: viewHistory, profile: viewProfile,
  };
  app.innerHTML = (views[route] || viewToday)();
}

function tabbar(current) {
  const tabs = [
    ['today', 'Today', '<svg viewBox="0 0 24 24"><path d="M4 10h3v7H4zM17 10h3v7h-3zM8.5 8h2v11h-2zM13.5 8h2v11h-2zM11 12.5h2v2h-2z"/></svg>'],
    ['history', 'Log', '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 1-8.5 6h2.2A7 7 0 1 0 12 5v3L7 4.5 12 1z"/><path d="M11 8h2v5h4v2h-6z"/></svg>'],
    ['profile', 'Profile', '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5z"/></svg>'],
  ];
  return '<nav class="tabbar">' + tabs.map(([id, label, icon]) =>
    '<button class="tab' + (current === id ? ' on' : '') + '" data-a="nav" data-r="' + id + '">' + icon + '<span>' + label + '</span></button>'
  ).join('') + '</nav>';
}

function demoHTML(id, name) {
  if (!HAS_IMG.has(id)) return '';
  return '<div class="demo">' +
    '<img src="img/' + id + '-0.jpg" alt="' + esc(name) + ' — start" loading="lazy">' +
    '<img src="img/' + id + '-1.jpg" alt="' + esc(name) + ' — end" loading="lazy">' +
    '</div>';
}

/* ----- onboarding ----- */

function viewOnboard() {
  return `
  <div class="screen onboard">
    <div class="ob-hero">
      <div class="logo-mark">${dumbbellSVG()}</div>
      <h1>Spotter</h1>
      <p class="sub">Plans the session. Remembers the numbers.<br>Works with no signal.</p>
    </div>
    <div class="card">
      <label class="field"><span>Name</span>
        <input id="ob-name" type="text" placeholder="Your name" autocomplete="off">
      </label>
      <label class="field"><span>Experience</span>
        <div class="seg" id="ob-level">
          <button data-v="beginner" class="on">New to lifting</button>
          <button data-v="experienced">Experienced</button>
        </div>
      </label>
      <label class="field"><span>Main goal</span>
        <div class="seg seg3" id="ob-goal">
          <button data-v="fitness" class="on">Fitness</button>
          <button data-v="muscle">Muscle</button>
          <button data-v="strength">Strength</button>
        </div>
      </label>
      <label class="field"><span>Units</span>
        <div class="seg" id="ob-units">
          <button data-v="lb" class="on">lb</button>
          <button data-v="kg">kg</button>
        </div>
      </label>
      <button class="btn-primary" data-a="ob-start">Start</button>
    </div>
    <p class="fine">Two of you? Open this page on each phone and Add to Home Screen — each keeps its own log.</p>
  </div>`;
}

/* ----- today ----- */

function viewToday() {
  const p = S.profile;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const st = weekStats();
  const dateLine = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const resume = S.active ? `
    <button class="card resume" data-a="nav" data-r="workout">
      <div><strong>Session in progress</strong>
      <span class="muted">${esc(groupLabels(S.active.groups))} · started ${minutesBetween(S.active.startedAt, Date.now())} min ago</span></div>
      <span class="chev">›</span>
    </button>` : '';
  const chips = UI_GROUPS.map(g =>
    '<button class="chip' + (S.sel.groups.includes(g.id) ? ' on' : '') + '" data-a="chip" data-g="' + g.id + '">' + g.label + '</button>'
  ).join('');
  const mins = [30, 45, 60].map(m =>
    '<button data-v="' + m + '"' + (S.sel.minutes === m ? ' class="on"' : '') + '>' + m + ' min</button>'
  ).join('');
  const sug = suggestSplit();
  const sugLine = (sug && !S.active) ? `
    <div class="hint">Last session: ${esc(sug.lastLabel)}, ${sug.when}.
    Today could be <button data-a="use-split" data-g="${sug.groups.join(',')}">${esc(sug.label)}</button>.</div>` : '';
  return `
  <div class="screen">
    <header class="top">
      <div><div class="kicker">${esc(dateLine)}</div>
      <h1>${greet}${p.name ? ', ' + esc(p.name) : ''}</h1>
      <p class="muted small">${st.count} session${st.count === 1 ? '' : 's'} this week${st.streak > 1 ? ' · ' + st.streak + '-week streak' : ''}</p></div>
    </header>
    ${resume}
    <section class="card">
      <h2>Muscle groups</h2>
      <div class="chips">${chips}</div>
      ${sugLine}
      <h2 class="mt">Time</h2>
      <div class="seg seg3" id="min-seg">${mins}</div>
      <button class="btn-primary mt" data-a="generate" ${S.sel.groups.length ? '' : 'disabled'}>
        ${dumbbellSVG()} Build workout
      </button>
    </section>
    <button class="btn-ghost" data-a="freestyle">Blank session — add exercises as you go</button>
    ${st.total ? '' : '<p class="fine">Pick muscle groups and a time. Spotter builds the plan from what your gym has.</p>'}
  </div>
  ${tabbar('today')}`;
}

function groupLabels(ids) {
  if (ids.includes('freestyle')) return 'Freestyle';
  const labels = UI_GROUPS.filter(g => ids.includes(g.id)).map(g => g.label);
  return labels.length ? labels.join(' + ') : 'Session';
}

/* ----- preview ----- */

function viewPreview() {
  const d = S.draft;
  if (!d) { route = 'today'; return viewToday(); }
  const goal = GOAL_PARAMS[S.profile.goal] || GOAL_PARAMS.fitness;
  const rows = d.ex.map((e, i) => `
    <div class="ex-row">
      ${HAS_IMG.has(e.id) ? '<img class="thumb" src="img/' + e.id + '-0.jpg" alt="" loading="lazy">' : ''}
      <div class="ex-row-main">
        <strong>${esc(e.name)}</strong>
        <span class="muted">${e.sets} × ${repText(e)} · rest ${restText(e.rest)} · ${esc(e.eqLabel)}</span>
      </div>
      <button class="icon-btn" data-a="swap" data-i="${i}" title="Swap exercise">⇄</button>
    </div>`).join('');
  return `
  <div class="screen">
    <header class="top">
      <button class="back" data-a="nav" data-r="today">‹</button>
      <div><h1>${esc(groupLabels(d.groups))}</h1>
      <p class="muted small">${goal.label} · about ${d.est} min · ${d.ex.length} exercises</p></div>
    </header>
    <div class="card warm"><strong>Warm-up · 5 min</strong><span class="muted">${esc(warmupFor(d.groups))}</span></div>
    <div class="card list">${rows}</div>
    <div class="row-btns">
      <button class="btn-ghost" data-a="regen">Reshuffle</button>
      <button class="btn-primary" data-a="start">Start</button>
    </div>
  </div>`;
}

function repText(e) {
  const r = e.reps[0] === e.reps[1] ? e.reps[0] : e.reps[0] + '–' + e.reps[1];
  return e.mode === 'time' ? r + ' sec' : r + (e.uni ? ' / side' : '');
}

function restText(sec) { return sec >= 60 ? (sec / 60).toFixed(sec % 60 ? 1 : 0).replace('.5', '½') + ' min' : sec + 's'; }

/* ----- workout ----- */

function viewWorkout() {
  const a = S.active;
  if (!a) { route = 'today'; return viewToday(); }
  const doneSets = a.ex.reduce((n, e) => n + e.log.filter(s => s.done).length, 0);
  const totalSets = a.ex.reduce((n, e) => n + e.log.length, 0);
  const cards = a.ex.map((e, i) => exerciseCard(e, i)).join('');
  const freestyle = a.groups.includes('freestyle');
  return `
  <div class="screen workout-screen">
    <header class="top sticky">
      <button class="back" data-a="quit">‹</button>
      <div class="grow"><h1>${esc(groupLabels(a.groups))}</h1>
        <p class="muted small"><span id="elapsed">${minutesBetween(a.startedAt, Date.now())} min</span> · ${doneSets}/${totalSets} sets</p></div>
      <div class="ring" id="ring" style="--p:${totalSets ? doneSets / totalSets : 0}"><span id="ring-txt">${Math.round(100 * doneSets / Math.max(1, totalSets))}%</span></div>
    </header>
    <div class="progress"><div class="progress-fill" id="pbar" style="width:${100 * doneSets / Math.max(1, totalSets)}%"></div></div>
    ${freestyle && !a.ex.length ? '' : '<div class="card warm"><strong>Warm-up first</strong><span class="muted">' + esc(warmupFor(a.groups)) + '</span></div>'}
    ${cards}
    <button class="add-ex" data-a="open-picker">＋ Add exercise</button>
    ${a.ex.length ? '<button class="btn-primary big" data-a="finish">Finish session</button>' : ''}
    <div style="height:90px"></div>
  </div>
  ${S._picker ? pickerHTML() : ''}
  <div id="restbar" class="restbar">
    <div class="rest-fill"></div>
    <div class="rest-inner">
      <span class="rest-label">Rest</span>
      <span class="rest-time">0:00</span>
      <button class="rest-btn" data-a="rest-add">+30s</button>
      <button class="rest-btn" data-a="rest-skip">Skip</button>
    </div>
  </div>`;
}

function firstWeightedIndex() {
  return S.active.ex.findIndex(e => e.mode !== 'time' && weightApplies(e));
}

function warmupSetsHTML(e, i) {
  if (i !== firstWeightedIndex()) return '';
  const w = e.suggest && e.suggest.w;
  if (w) {
    return '<div class="warmup-line"><strong>Warm-up sets</strong> · 8 × ' + fmtW(roundW(w * 0.5)) +
      ' · 5 × ' + fmtW(roundW(w * 0.75)) + ' ' + unitLabel() + ', then working sets below</div>';
  }
  return '<div class="warmup-line"><strong>Warm-up sets</strong> · two light ramp-up sets of 8 before the working sets</div>';
}

function exerciseCard(e, i) {
  const done = e.log.every(s => s.done) && e.log.length;
  const sugg = e.suggest || {};
  const rows = e.log.map((s, j) => setRow(e, i, s, j)).join('');
  const canSwap = !!EXERCISES.find(x => x.id === e.id);
  return `
  <section class="card ex-card${done ? ' done' : ''}" id="ex-${i}">
    <div class="ex-head">
      <div>
        <div class="ex-num">${i + 1} of ${S.active.ex.length}${e.cmp ? ' · compound' : ''}</div>
        <h2>${esc(e.name)}</h2>
        <div class="muted small">${e.sets} × ${repText(e)} · rest ${restText(e.rest)} · ${esc(e.eqLabel)}</div>
      </div>
      ${canSwap ? '<button class="icon-btn" data-a="swap" data-i="' + i + '" title="Swap">⇄</button>' : ''}
      <button class="icon-btn" data-a="rm-ex" data-i="${i}" title="Remove">✕</button>
    </div>
    ${demoHTML(e.id, e.name)}
    ${sugg.note ? '<div class="sugg' + (sugg.up ? ' up' : '') + '">' + esc(sugg.note) + '</div>' : ''}
    ${e.cue ? '<p class="cue">' + esc(e.cue) + '</p>' : ''}
    ${warmupSetsHTML(e, i)}
    <div class="set-grid">
      <div class="set-head"><span>Set</span><span>${e.mode === 'time' || !weightApplies(e) ? '' : 'Weight (' + unitLabel() + ')'}</span><span>${e.mode === 'time' ? 'Seconds' : 'Reps'}</span><span></span></div>
      ${rows}
    </div>
    <button class="add-set" data-a="add-set" data-i="${i}">＋ add set</button>
  </section>`;
}

function setRow(e, i, s, j) {
  const showWeight = e.mode !== 'time' && weightApplies(e);
  const wVal = s.w != null ? ' value="' + s.w + '"' : (e.suggest && e.suggest.w ? ' value="' + e.suggest.w + '"' : '');
  const rVal = s.r != null ? ' value="' + s.r + '"' : '';
  return `
  <div class="set-row${s.done ? ' done' : ''}" id="set-${i}-${j}">
    <span class="set-n">${j + 1}</span>
    ${showWeight
      ? '<input type="number" inputmode="decimal" step="0.5" min="0" data-f="w" data-i="' + i + '" data-j="' + j + '"' + wVal + ' placeholder="—">'
      : '<span class="bw">' + (e.mode === 'time' ? '' : 'BW') + '</span>'}
    <input type="number" inputmode="numeric" min="0" data-f="r" data-i="${i}" data-j="${j}"${rVal} placeholder="${e.reps[0]}–${e.reps[1]}">
    <button class="check" data-a="set-done" data-i="${i}" data-j="${j}" aria-label="Mark set done">
      <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </div>`;
}

function weightApplies(e) {
  const orig = findEx(e.id);
  return orig ? orig.incr > 0 : true;
}

/* Update just the touched row + header, so inputs elsewhere keep focus/state */
function updateWorkoutDOM(i, j) {
  const a = S.active; if (!a || route !== 'workout') return;
  const s = a.ex[i].log[j];
  const row = $('#set-' + i + '-' + j);
  if (row) {
    row.classList.toggle('done', s.done);
    const wIn = row.querySelector('[data-f="w"]');
    const rIn = row.querySelector('[data-f="r"]');
    if (wIn && s.w != null) wIn.value = s.w;
    if (rIn && s.r != null) rIn.value = s.r;
  }
  const card = $('#ex-' + i);
  if (card) card.classList.toggle('done', a.ex[i].log.every(x => x.done));
  const doneSets = a.ex.reduce((n, e) => n + e.log.filter(x => x.done).length, 0);
  const totalSets = a.ex.reduce((n, e) => n + e.log.length, 0);
  const pbar = $('#pbar'); if (pbar) pbar.style.width = (100 * doneSets / Math.max(1, totalSets)) + '%';
  const ring = $('#ring'); if (ring) ring.style.setProperty('--p', doneSets / Math.max(1, totalSets));
  const ringTxt = $('#ring-txt'); if (ringTxt) ringTxt.textContent = Math.round(100 * doneSets / Math.max(1, totalSets)) + '%';
  const head = document.querySelector('.top .muted');
  if (head) head.innerHTML = '<span id="elapsed">' + minutesBetween(a.startedAt, Date.now()) + ' min</span> · ' + doneSets + '/' + totalSets + ' sets';
}

/* ----- exercise picker (sheet) ----- */

function pickerHTML() {
  const p = S._picker;
  const q = (p.q || '').trim().toLowerCase();
  let body;
  if (p.creating) {
    body = `
    <label class="field"><span>Name</span>
      <input type="text" id="cx-name" value="${esc(p.q || '')}" placeholder="e.g. Leg press, 5 min HIIT" autocomplete="off">
    </label>
    <label class="field"><span>Track</span>
      <div class="seg" id="cx-mode">
        <button data-v="reps" class="on">Weight &amp; reps</button>
        <button data-v="time">Time (seconds)</button>
      </div>
    </label>
    <label class="field"><span>Sets</span>
      <div class="seg" id="cx-sets">
        ${[1, 2, 3, 4, 5].map(n => '<button data-v="' + n + '"' + (n === 3 ? ' class="on"' : '') + '>' + n + '</button>').join('')}
      </div>
    </label>
    <label class="field"><span>If timed: seconds per set</span>
      <input type="number" id="cx-secs" inputmode="numeric" value="60" min="5">
    </label>
    <div class="row-btns">
      <button class="btn-ghost" data-a="picker-back">Back</button>
      <button class="btn-primary" data-a="create-custom">Add it</button>
    </div>`;
  } else {
    const list = allExercises()
      .filter(e => !q || e.name.toLowerCase().includes(q))
      .slice(0, 40);
    const rows = list.map(e => `
      <button class="pick-row" data-a="pick-add" data-id="${e.id}">
        ${HAS_IMG.has(e.id) ? '<img class="thumb" src="img/' + e.id + '-0.jpg" alt="" loading="lazy">' : ''}
        <span><strong>${esc(e.name)}</strong><em>${e.custom ? 'custom' : esc(e.m.join(', '))}</em></span>
      </button>`).join('');
    body = `
    <input type="text" id="picker-q" placeholder="Search exercises…" value="${esc(p.q || '')}" autocomplete="off">
    <div class="pick-list">
      ${rows || '<p class="fine">Nothing matches.</p>'}
      <button class="pick-row pick-create" data-a="picker-create">
        <span><strong>＋ Create ${q ? '“' + esc(p.q.trim()) + '”' : 'a custom exercise'}</strong><em>anything — machines, HIIT blocks, stretches</em></span>
      </button>
    </div>`;
  }
  return `
  <div class="overlay" data-a="picker-close">
    <div class="sheet" data-stop>
      <div class="sheet-head"><h2>${p.creating ? 'Custom exercise' : 'Add exercise'}</h2>
      <button class="icon-btn" data-a="picker-close">✕</button></div>
      ${body}
    </div>
  </div>`;
}

function createCustom() {
  const name = ($('#cx-name').value || '').trim();
  if (!name) { toast('Give it a name.'); return; }
  const mode = $('#cx-mode .on').dataset.v;
  const sets = +$('#cx-sets .on').dataset.v;
  const secs = Math.max(5, +$('#cx-secs').value || 60);
  const id = 'c-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) + '-' + Date.now().toString(36).slice(-4);
  const def = {
    id, name, m: ['custom'], m2: [], eq: [], lvl: 1, cmp: false, custom: true,
    mode: mode === 'time' ? 'time' : 'reps',
    incr: mode === 'time' ? 0 : 5, cue: '',
  };
  S.custom.push(def);
  addToActive(def, { sets, secs });
}

/* ----- summary ----- */

function viewSummary() {
  const w = S.lastSummary;
  if (!w) { route = 'today'; return viewToday(); }
  const ups = w.exercises.filter(e => {
    const t = e.targetReps;
    return t && e.sets.length && e.sets.every(s => (s.r || 0) >= t[1]);
  });
  return `
  <div class="screen center">
    <div class="kicker">${esc(fmtDate(w.date))}</div>
    <h1>Session logged.</h1>
    <p class="muted">${esc(groupLabels(w.groups))}</p>
    <div class="stats-row">
      <div class="stat"><strong>${w.minutes}</strong><span>minutes</span></div>
      <div class="stat"><strong>${w.setCount}</strong><span>sets</span></div>
      <div class="stat"><strong>${w.volume ? (w.volume >= 10000 ? (w.volume / 1000).toFixed(1) + 'k' : Math.round(w.volume)) : '—'}</strong><span>${unitLabel()} lifted</span></div>
    </div>
    ${w.prs && w.prs.length ? '<div class="pr-note"><strong>Personal record' + (w.prs.length > 1 ? 's' : '') + ':</strong> ' + esc(w.prs.join(' · ')) + '</div>' : ''}
    ${ups.length ? '<div class="pr-note" style="border-color:var(--line);background:var(--sunken)">Every rep target hit on ' + esc(ups.map(e => e.name).join(', ')) + ' — next session moves up.</div>' : ''}
    <button class="btn-primary big" data-a="nav" data-r="today">Done</button>
  </div>`;
}

/* ----- history ----- */

function viewHistory() {
  const st = weekStats();
  const items = S.history.map((w, i) => {
    const open = S._openHist === i;
    const detail = !open ? '' : '<div class="hist-detail">' + w.exercises.map(e =>
      '<div class="hist-ex"><span>' + esc(e.name) + '</span><span class="muted">' +
      e.sets.map(s => (s.w ? fmtW(s.w) + '×' : '') + (s.r || '?')).join('  ') + '</span></div>'
    ).join('') + '</div>';
    return `
    <div class="card hist${open ? ' open' : ''}" data-a="hist-toggle" data-i="${i}">
      <div class="hist-row">
        <div><strong>${esc(groupLabels(w.groups))}${w.prs && w.prs.length ? '<span class="pr-badge">PR</span>' : ''}</strong>
        <span class="muted">${fmtDate(w.date)} · ${w.minutes} min · ${w.setCount} sets${w.volume ? ' · ' + (w.volume >= 10000 ? (w.volume / 1000).toFixed(1) + 'k' : Math.round(w.volume)) + ' ' + unitLabel() : ''}</span></div>
        <span class="chev">${open ? '⌄' : '›'}</span>
      </div>
      ${detail}
    </div>`;
  }).join('');
  return `
  <div class="screen">
    <header class="top"><div><div class="kicker">Training log</div><h1>Log</h1></div></header>
    <div class="stats-row">
      <div class="stat"><strong>${st.count}</strong><span>this week</span></div>
      <div class="stat"><strong>${st.streak}</strong><span>week streak</span></div>
      <div class="stat"><strong>${st.total}</strong><span>total</span></div>
    </div>
    ${items || '<p class="fine">No sessions yet. Finished workouts land here and drive the weight suggestions.</p>'}
  </div>
  ${tabbar('history')}`;
}

/* ----- profile ----- */

function viewProfile() {
  const p = S.profile;
  const eqRows = EQUIPMENT.map(e => `
    <label class="switch-row"><span>${esc(e.label)}</span>
      <input type="checkbox" data-f="eq" data-id="${e.id}" ${S.settings.equipment[e.id] ? 'checked' : ''}><i></i>
    </label>`).join('');
  return `
  <div class="screen">
    <header class="top"><div><div class="kicker">Settings</div><h1>Profile</h1></div></header>
    <section class="card">
      <label class="field"><span>Name</span>
        <input type="text" data-f="name" value="${esc(p.name || '')}" autocomplete="off">
      </label>
      <label class="field"><span>Experience</span>
        <div class="seg" data-set="level">
          <button data-v="beginner" class="${p.level === 'beginner' ? 'on' : ''}">New to lifting</button>
          <button data-v="experienced" class="${p.level === 'experienced' ? 'on' : ''}">Experienced</button>
        </div>
      </label>
      <label class="field"><span>Main goal</span>
        <div class="seg seg3" data-set="goal">
          <button data-v="fitness" class="${p.goal === 'fitness' ? 'on' : ''}">Fitness</button>
          <button data-v="muscle" class="${p.goal === 'muscle' ? 'on' : ''}">Muscle</button>
          <button data-v="strength" class="${p.goal === 'strength' ? 'on' : ''}">Strength</button>
        </div>
      </label>
      <label class="field"><span>Units</span>
        <div class="seg" data-set="units">
          <button data-v="lb" class="${p.units === 'lb' ? 'on' : ''}">lb</button>
          <button data-v="kg" class="${p.units === 'kg' ? 'on' : ''}">kg</button>
        </div>
      </label>
    </section>
    <section class="card">
      <h2>Gym equipment</h2>
      <p class="muted small">Turn off anything your gym doesn't have and plans will route around it.</p>
      ${eqRows}
    </section>
    <section class="card">
      <h2>Data</h2>
      <p class="muted small">Everything lives on this phone. Export a backup now and then.</p>
      <div class="row-btns">
        <button class="btn-ghost" data-a="export">Export</button>
        <button class="btn-ghost" data-a="import">Import</button>
      </div>
      <input type="file" id="import-file" accept=".json,application/json" hidden>
      <button class="btn-danger" data-a="reset">Erase everything</button>
    </section>
    <p class="fine">Spotter · works offline · demo photos from the public-domain free-exercise-db</p>
  </div>
  ${tabbar('profile')}`;
}

function dumbbellSVG() {
  return '<svg class="db" viewBox="0 0 24 24"><path d="M1.5 10h2v4h-2zM20.5 10h2v4h-2zM4.5 8h2.5v8H4.5zM17 8h2.5v8H17zM7.5 11h9v2h-9z"/></svg>';
}

/* ---------------- events ---------------- */

document.addEventListener('click', ev => {
  const segBtn = ev.target.closest('.seg button');
  if (segBtn) {
    const seg = segBtn.parentElement;
    seg.querySelectorAll('button').forEach(b => b.classList.remove('on'));
    segBtn.classList.add('on');
    if (seg.id === 'min-seg') { S.sel.minutes = +segBtn.dataset.v; save(); }
    if (seg.dataset.set) {
      const key = seg.dataset.set, val = segBtn.dataset.v;
      if (key === 'units' && S.profile.units !== val) convertUnits(val);
      S.profile[key] = val; save();
    }
    return;
  }

  const el = ev.target.closest('[data-a]');
  if (!el) return;
  const a = el.dataset.a;

  if (a === 'nav') go(el.dataset.r);

  else if (a === 'chip') {
    const g = el.dataset.g;
    if (g === 'full') S.sel.groups = S.sel.groups.includes('full') ? [] : ['full'];
    else {
      S.sel.groups = S.sel.groups.filter(x => x !== 'full');
      S.sel.groups = S.sel.groups.includes(g) ? S.sel.groups.filter(x => x !== g) : S.sel.groups.concat(g);
    }
    save(); render();
  }

  else if (a === 'use-split') {
    S.sel.groups = el.dataset.g.split(',');
    save(); render();
  }

  else if (a === 'generate' || a === 'regen') {
    if (!S.sel.groups.length) return;
    S.draft = generateWorkout(S.sel.groups, S.sel.minutes);
    if (!S.draft.ex.length) { toast('Nothing matches — check equipment settings in Profile.'); return; }
    save(); go('preview');
  }

  else if (a === 'freestyle') startFreestyle();
  else if (a === 'swap') swapExercise(+el.dataset.i);
  else if (a === 'start') startWorkout();
  else if (a === 'set-done') setDone(+el.dataset.i, +el.dataset.j);
  else if (a === 'finish') finishWorkout(false);

  else if (a === 'add-set') {
    const ex = S.active.ex[+el.dataset.i];
    ex.log.push({ w: null, r: null, done: false });
    ex.sets = ex.log.length;
    save(); render();
  }

  else if (a === 'rm-ex') {
    const i = +el.dataset.i;
    const ex = S.active.ex[i];
    if (ex.log.some(s => s.done) && !confirm('Remove ' + ex.name + '? Its logged sets will be lost.')) return;
    S.active.ex.splice(i, 1);
    save(); render();
  }

  else if (a === 'open-picker') { S._picker = { q: '' }; render(); const q = $('#picker-q'); if (q) q.focus(); }
  else if (a === 'picker-close') { if (ev.target.closest('[data-stop]') && !ev.target.closest('[data-a="picker-close"]')) return; S._picker = null; render(); }
  else if (a === 'picker-create') { S._picker.creating = true; render(); }
  else if (a === 'picker-back') { S._picker.creating = false; render(); }
  else if (a === 'create-custom') createCustom();
  else if (a === 'pick-add') {
    const def = findEx(el.dataset.id);
    if (def) addToActive(def);
  }

  else if (a === 'quit') {
    const any = S.active.ex.some(e => e.log.some(s => s.done));
    if (!any && !S.active.ex.length) {
      S.active = null; stopRest(); releaseWakeLock(); save(); go('today');
    } else if (!any) {
      if (confirm('Leave and discard this session?')) { S.active = null; stopRest(); releaseWakeLock(); save(); go('today'); }
    } else go('today'); // stays in progress, resumable from Today
  }

  else if (a === 'rest-skip') stopRest();
  else if (a === 'rest-add') { if (rest) { rest.end += 30000; rest.total += 30; renderRestBar(); } }

  else if (a === 'hist-toggle') {
    if (ev.target.closest('input')) return;
    S._openHist = S._openHist === +el.dataset.i ? -1 : +el.dataset.i;
    render();
  }

  else if (a === 'ob-start') {
    const name = $('#ob-name').value.trim();
    S.profile = {
      name,
      level: $('#ob-level .on').dataset.v,
      goal: $('#ob-goal .on').dataset.v,
      units: $('#ob-units .on').dataset.v,
    };
    save(); go('today');
  }

  else if (a === 'export') exportData();
  else if (a === 'import') $('#import-file').click();

  else if (a === 'reset') {
    if (confirm('Erase your profile and ALL history on this phone? This cannot be undone.')) {
      localStorage.removeItem(LS_KEY);
      S = defaultState();
      go('onboard');
    }
  }

  else if (a === 'toast-action') {
    const t = $('#toast');
    t.classList.remove('show');
    if (t._onAction) t._onAction();
  }
});

document.addEventListener('input', ev => {
  const el = ev.target;
  if (el.id === 'picker-q') {
    S._picker.q = el.value;
    const sheet = el.closest('.sheet');
    const listEl = sheet && sheet.querySelector('.pick-list');
    if (listEl) {
      const tmp = document.createElement('div');
      tmp.innerHTML = pickerHTML();
      listEl.innerHTML = tmp.querySelector('.pick-list').innerHTML;
    }
    return;
  }
  const f = el.dataset.f;
  if (!f) return;
  if (f === 'w' || f === 'r') {
    const s = S.active && S.active.ex[+el.dataset.i] && S.active.ex[+el.dataset.i].log[+el.dataset.j];
    if (s) { s[f] = el.value === '' ? null : +el.value; save(); }
  } else if (f === 'name') {
    S.profile.name = el.value.trim(); save();
  } else if (f === 'eq') {
    S.settings.equipment[el.dataset.id] = el.checked; save();
  }
});

/* ---------------- units, export/import ---------------- */

function convertUnits(to) {
  const factor = to === 'kg' ? KG : 1 / KG;
  const conv = w => (typeof w === 'number' && w > 0) ? Math.round(w * factor * 2) / 2 : w;
  S.history.forEach(wk => (wk.exercises || []).forEach(e => (e.sets || []).forEach(s => { s.w = conv(s.w); })));
  if (S.active) S.active.ex.forEach(e => {
    (e.log || []).forEach(s => { s.w = conv(s.w); });
    if (e.suggest && typeof e.suggest.w === 'number') e.suggest.w = conv(e.suggest.w);
  });
  toast('Weights converted to ' + to + '.');
}

function exportData() {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const aEl = document.createElement('a');
  aEl.href = url;
  aEl.download = 'spotter-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(aEl); aEl.click(); aEl.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

document.addEventListener('change', ev => {
  if (ev.target.id !== 'import-file') return;
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || typeof data !== 'object' || !('history' in data)) throw new Error('bad');
      if (!confirm('Replace everything on this phone with the backup (' + (data.history || []).length + ' sessions)?')) return;
      localStorage.setItem(LS_KEY, JSON.stringify(data));
      S = loadState();
      toast('Backup restored.');
      go(S.profile ? 'today' : 'onboard');
    } catch (e) { toast('That file doesn’t look like a Spotter backup.'); }
  };
  reader.readAsText(file);
  ev.target.value = '';
});

/* ---------------- service worker & updates ---------------- */

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Update ready', 'Reload', () => {
            nw.postMessage({ type: 'SKIP_WAITING' });
          });
        }
      });
    });
  }).catch(() => { /* e.g. plain-HTTP LAN preview — app still works, just no offline cache */ });
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return; reloaded = true; location.reload();
  });
}

/* ---------------- boot ---------------- */

route = S.profile ? (S.active ? 'workout' : 'today') : 'onboard';
render();
if (S.active) acquireWakeLock();
