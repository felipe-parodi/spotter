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
    // profile: {name, level, goal, units, sex:'female'|'male'|'na', theme,
    //           bodyweight:number|null, bodyfat:number|null}
    profile: null,
    settings: { equipment: Object.fromEntries(EQUIPMENT.map(e => [e.id, true])) },
    history: [],   // finished workouts, newest first
    custom: [],    // user-created exercises
    bodyLog: [],   // bodyweight entries: {date: ISO, w: number}
    active: null,  // in-progress workout
    draft: null,   // generated-but-not-started plan
    sel: { groups: ['full'], minutes: 45 },
    // optional cycle-aware mode (female profiles) — see cycle notes in README
    cycle: { enabled: false, avgLen: 28, periodLen: 5, starts: [], checkins: [] },
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
      s.cycle = Object.assign(defaultState().cycle, parsed.cycle || {});
      s.bodyLog = parsed.bodyLog || [];
      // seed the log from an existing single bodyweight so the trend has a start point
      if (!s.bodyLog.length && s.profile && s.profile.bodyweight > 0) {
        s.bodyLog = [{ date: new Date().toISOString(), w: s.profile.bodyweight }];
      }
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
const HOWTO = typeof INSTRUCTIONS !== 'undefined' ? INSTRUCTIONS : {};

/* ---------------- theme ---------------- */
/* Single "Bloom" aesthetic — the palette lives entirely in styles.css.
   This just keeps the browser chrome (status bar tint) in sync. */

function applyTheme() {
  document.documentElement.removeAttribute('data-theme');
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
    const media = m.getAttribute('media') || '';
    m.setAttribute('content', media.includes('dark') ? '#211613' : '#fbeee7');
  });
}

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

/* ---------------- per-exercise trends ---------------- */

function epley1rm(w, r) { return w * (1 + Math.min(r, 12) / 30); }

/* One data point per session that included the exercise, oldest → newest. */
function exerciseSeries(id) {
  const pts = [];
  for (let k = S.history.length - 1; k >= 0; k--) {
    const w = S.history[k];
    const e = (w.exercises || []).find(x => x.id === id && x.sets && x.sets.length);
    if (!e) continue;
    const weighted = e.sets.some(s => typeof s.w === 'number' && s.w > 0);
    let val, sub, est = 0;
    if (weighted) {
      const top = Math.max(...e.sets.map(s => s.w || 0));
      const topSet = e.sets.filter(s => (s.w || 0) === top).sort((a, b) => (b.r || 0) - (a.r || 0))[0];
      val = top; sub = fmtW(top) + ' × ' + (topSet.r || '?');
      est = Math.max(...e.sets.map(s => epley1rm(s.w || 0, s.r || 0)));
    } else {
      val = Math.max(...e.sets.map(s => s.r || 0));
      sub = val + (e.mode === 'time' ? ' sec' : ' reps');
    }
    const vol = e.sets.reduce((x, s) => x + (s.w || 0) * (s.r || 0), 0);
    pts.push({ t: new Date(w.date).getTime(), date: w.date, val, sub, est, vol, weighted, mode: e.mode });
  }
  return pts;
}

/* Exercises you've logged, most-recent first, each with its series. */
function loggedExercises() {
  const seen = new Map();
  for (const w of S.history) {
    for (const e of (w.exercises || [])) {
      if (!e.sets || !e.sets.length) continue;
      if (!seen.has(e.id)) seen.set(e.id, { id: e.id, name: e.name, mode: e.mode, sessions: 0, last: 0 });
      const rec = seen.get(e.id);
      rec.sessions++;
      rec.last = Math.max(rec.last, new Date(w.date).getTime());
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.last - a.last);
}

/* ---------------- bodyweight log ---------------- */

/* Upsert today's bodyweight entry and keep profile.bodyweight in sync. */
function logBodyweight(w) {
  if (!(w > 0)) return;
  if (!S.bodyLog) S.bodyLog = [];
  const d = new Date().toISOString().slice(0, 10);
  const existing = S.bodyLog.find(e => e.date.slice(0, 10) === d);
  if (existing) existing.w = w;
  else S.bodyLog.push({ date: new Date().toISOString(), w });
  S.bodyLog.sort((a, b) => new Date(a.date) - new Date(b.date));
  if (S.profile) S.profile.bodyweight = w;
  save();
}

/* Chart-ready series, oldest → newest. */
function bodySeries() {
  return (S.bodyLog || []).slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map(e => ({ t: new Date(e.date).getTime(), date: e.date, val: e.w, sub: fmtW(e.w) + ' ' + unitLabel(), weighted: true }));
}

/* Build an SVG path + points for a series of numeric values (equal x-spacing). */
function chartGeom(vals, w, h, pad) {
  const n = vals.length;
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
  const x = i => n === 1 ? pad.l + innerW / 2 : pad.l + (i / (n - 1)) * innerW;
  const y = v => pad.t + innerH - ((v - min) / span) * innerH;
  const pts = vals.map((v, i) => ({ x: x(i), y: y(v) }));
  return { pts, min, max, x, y, innerH, pad, w, h };
}

function smoothPath(pts) {
  if (pts.length < 2) return pts.length ? `M${pts[0].x} ${pts[0].y}` : '';
  let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1], p1 = pts[i];
    const cx = (p0.x + p1.x) / 2;
    d += ` C${cx.toFixed(1)} ${p0.y.toFixed(1)}, ${cx.toFixed(1)} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }
  return d;
}

function sparkSVG(vals) {
  if (vals.length < 2) return '';
  const W = 96, H = 34, pad = { l: 2, r: 2, t: 4, b: 4 };
  const g = chartGeom(vals, W, H, pad);
  const line = smoothPath(g.pts);
  const last = g.pts[g.pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="2.5" fill="var(--accent)"/>
  </svg>`;
}

function bigChartSVG(series) {
  const vals = series.map(p => p.val);
  if (vals.length < 2) return '<div class="chart-empty">One session so far — log this exercise again to see the trend line.</div>';
  const W = 320, H = 168, pad = { l: 8, r: 8, t: 16, b: 26 };
  const g = chartGeom(vals, W, H, pad);
  const line = smoothPath(g.pts);
  const area = line + ` L${g.pts[g.pts.length - 1].x.toFixed(1)} ${(H - pad.b).toFixed(1)} L${g.pts[0].x.toFixed(1)} ${(H - pad.b).toFixed(1)} Z`;
  const dots = g.pts.map((p, i) =>
    `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${i === g.pts.length - 1 ? 4 : 2.5}" fill="var(--accent)"/>`).join('');
  const maxI = vals.indexOf(g.max), minI = vals.indexOf(g.min);
  const label = (i, v, cls) => {
    const p = g.pts[i];
    const above = p.y > pad.t + 18;
    return `<text class="c-lbl ${cls}" x="${p.x.toFixed(1)}" y="${(above ? p.y - 7 : p.y + 14).toFixed(1)}" text-anchor="middle">${fmtW(v)}</text>`;
  };
  const d0 = new Date(series[0].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const d1 = new Date(series[series.length - 1].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `<svg class="bigchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img">
    <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#cg)"/>
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}
    ${maxI !== minI ? label(maxI, g.max, 'hi') : ''}
    ${label(g.pts.length - 1, vals[vals.length - 1], 'last')}
    <text class="c-ax" x="${pad.l}" y="${H - 8}" text-anchor="start">${d0}</text>
    <text class="c-ax" x="${W - pad.r}" y="${H - 8}" text-anchor="end">${d1}</text>
  </svg>`;
}

/* ---------------- menstrual cycle (optional, evidence-based) ----------------
   Grounded in McNulty et al. 2020 (Sports Med, network meta-analysis, 78 studies,
   doi:10.1007/s40279-020-01319-3): cycle phase has only a TRIVIAL average effect
   on strength/endurance performance, with large individual variation. So this
   feature never restricts or hides exercises. It surfaces the phase for awareness
   and offers OPTIONAL autoregulation (ease load when a session feels hard), which
   is legitimate RPE-based practice. Luteal phase is anchored at ~14 days. */

const DAY_MS = 86400000;

function cycleOn() {
  return S.profile && S.profile.sex === 'female' && S.cycle && S.cycle.enabled && S.cycle.starts.length;
}

function lastPeriodStart() {
  if (!S.cycle.starts.length) return null;
  return S.cycle.starts.slice().sort().pop();
}

/* day within the current predicted cycle (0 = first day of last logged period) */
function cycleDay() {
  const last = lastPeriodStart();
  if (!last) return null;
  const days = Math.floor((Date.now() - new Date(last + 'T00:00').getTime()) / DAY_MS);
  if (days < 0) return null;
  const len = Math.max(21, Math.min(40, S.cycle.avgLen || 28));
  return days % len;
}

function cyclePhase() {
  const d = cycleDay();
  if (d == null) return null;
  const len = Math.max(21, Math.min(40, S.cycle.avgLen || 28));
  const pLen = Math.max(2, Math.min(10, S.cycle.periodLen || 5));
  const ovul = Math.max(pLen + 1, len - 14); // luteal phase ~14 days
  if (d < pLen) return { key: 'menstruation', label: 'Menstruation', day: d + 1 };
  if (d < ovul - 1) return { key: 'follicular', label: 'Follicular phase', day: d + 1 };
  if (d <= ovul + 1) return { key: 'ovulation', label: 'Ovulatory phase', day: d + 1 };
  return { key: 'luteal', label: 'Luteal phase', day: d + 1 };
}

const PHASE_NOTE = {
  menstruation: 'You may feel tired or crampy now — or totally fine. Movement often helps cramps, so train if you’re up for it, and lean on the check-in for a gentler day when you need one.',
  follicular: 'Energy and strength often climb through here. If you’re feeling it, this is a lovely stretch to chase a little progress.',
  ovulation: 'Many feel at their strongest around now. A good window to push — as always, go by how your body feels today.',
  luteal: 'Energy can dip and effort can feel higher premenstrually, and that’s normal. Be kind to yourself and let the check-in lighten things when it helps.',
};

const CYCLE_SCIENCE = 'Your cycle shapes energy, mood, and how training feels — and that’s different for everyone, and every month. So Spotter asks how you’re doing and adapts to that, instead of assuming a fixed rule. Push on the days you feel strong; ease off on the days you don’t.';

/* Exercises worth steering away from on a rough day: heavy spinal-loaded or
   high-effort lifts that tend to be least comfortable with cramps/fatigue. */
const HIGH_STRAIN = new Set(['deadlift', 'bb-squat', 'bb-rdl', 'bb-row', 'bb-ohp', 'kb-swing', 'smith-squat']);

const NEG_SYMPTOMS = ['cramps', 'tired', 'low mood', 'poor sleep', 'headache', 'bloating'];

function todayKey() { return new Date().toISOString().slice(0, 10); }

function todayCheckin() {
  if (!cycleOn()) return null;
  return (S.cycle.checkins || []).find(c => c.date === todayKey()) || null;
}

function setCheckin(patch) {
  if (!S.cycle.checkins) S.cycle.checkins = [];
  let c = S.cycle.checkins.find(x => x.date === todayKey());
  if (!c) {
    c = { date: todayKey(), energy: 'ok', symptoms: [], phase: (cyclePhase() || {}).key || null };
    S.cycle.checkins.push(c);
  }
  Object.assign(c, patch);
  // keep the log from growing without bound
  if (S.cycle.checkins.length > 400) S.cycle.checkins = S.cycle.checkins.slice(-400);
  save();
}

/* How today's session should adapt, derived from the daily check-in.
   Neutral when no check-in is logged — nothing changes unless she tells us. */
function todayReadiness() {
  const c = todayCheckin();
  const base = { load: 1, dropSet: false, gentle: false, hype: false, avoidStrain: false };
  if (!c) return base;
  const syms = c.symptoms || [];
  const rough = c.energy === 'low' || syms.includes('cramps') || syms.includes('tired') || syms.length >= 2;
  if (rough) return { load: 0.85, dropSet: true, gentle: true, hype: false, avoidStrain: true };
  if (c.energy === 'great' && syms.length === 0) return { load: 1, dropSet: false, gentle: false, hype: true, avoidStrain: false };
  return base;
}

function readinessLoad() { return todayReadiness().load; }

/* Gentle multi-cycle pattern insight for the current phase. */
function phaseTendency() {
  const p = cyclePhase();
  if (!p) return '';
  const past = (S.cycle.checkins || []).filter(c => c.date !== todayKey() && c.phase === p.key);
  if (past.length < 2) return '';
  const low = past.filter(c => c.energy === 'low' || (c.symptoms || []).includes('cramps') || (c.symptoms || []).includes('tired'));
  if (low.length >= 2) return 'Around this phase you’ve often felt low — no pressure today, be kind to yourself.';
  const great = past.filter(c => c.energy === 'great');
  if (great.length >= 2) return 'You tend to feel strong around now.';
  return '';
}

function logPeriodStart(iso) {
  const day = (iso || new Date().toISOString()).slice(0, 10);
  if (!S.cycle.starts.includes(day)) {
    S.cycle.starts.push(day);
    S.cycle.starts.sort();
    // refine average cycle length from the last few gaps
    const st = S.cycle.starts;
    if (st.length >= 2) {
      const gaps = [];
      for (let i = Math.max(1, st.length - 4); i < st.length; i++) {
        gaps.push(Math.round((new Date(st[i]) - new Date(st[i - 1])) / DAY_MS));
      }
      const valid = gaps.filter(g => g >= 21 && g <= 40);
      if (valid.length) S.cycle.avgLen = Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
    }
  }
  save();
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
  const ease = readinessLoad();
  const easeNote = ease < 1 ? ' · lighter today' : '';
  if (!perf) {
    return { w: null, note: step ? 'First time: pick a weight that leaves 2–3 reps in the tank.' : null, up: false };
  }
  const detail = perf.sets.map(s => s.r).filter(Boolean).join(', ');
  const lastTxt = perf.topW
    ? 'Last: ' + fmtW(perf.topW) + ' ' + unitLabel() + (detail ? ' × ' + detail : '')
    : (detail ? 'Last: ' + detail + (ex.mode === 'time' ? ' sec' : ' reps') : null);
  if (perf.allHit && perf.topW && step) {
    const target = ease < 1 ? roundW((perf.topW + step) * ease) : perf.topW + step;
    return { w: target, note: lastTxt + ' — every target hit. Today: ' + fmtW(target) + ' ' + unitLabel() + (ease < 1 ? easeNote : ' ↑'), up: ease >= 1 };
  }
  if (perf.allHit && !step) {
    return { w: null, note: lastTxt + ' — every target hit. Add ' + (ex.mode === 'time' ? '5–10 sec' : '1–2 reps') + ' ↑', up: true };
  }
  const w = ease < 1 && perf.topW ? roundW(perf.topW * ease) : perf.topW;
  return { w, note: lastTxt + easeNote, up: false };
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
  if (todayReadiness().dropSet && sets > 2) sets -= 1; // gentler day
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
  const avoidStrain = todayReadiness().avoidStrain;
  let best = null, bestScore = -Infinity;
  for (const e of pool) {
    let score = Math.random() * 6;
    if (preferCompound && e.cmp) score += 12;
    if (!preferCompound && !e.cmp) score += 6;
    if (recent.has(e.id)) score -= 10;
    if ((S.profile.goal === 'muscle' || S.profile.goal === 'strength') && !e.incr) score -= 5;
    if (S.profile.level === 'beginner' && e.lvl === 2) score -= 4;
    if (S.profile.level === 'experienced' && e.lvl === 1) score -= 1;
    if (avoidStrain && HIGH_STRAIN.has(e.id)) score -= 15; // gentler day: steer away from heaviest lifts
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

/* A gentle, low-strain session for rough days — mobility, core, light glute work. */
function restorativePlan() {
  const ids = ['glute-bridge', 'bird-dog', 'dead-bug', 'side-plank', 'plank'];
  const ex = ids.map(id => findEx(id)).filter(Boolean).map(def => {
    const params = assignParams(def, 20);
    params.sets = Math.min(params.sets, 2);
    return snapshot(def, params);
  });
  return { groups: ['restorative'], minutes: 20, est: 20, restorative: true, ex };
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

/* Recompute a history entry's derived totals after an edit. Drops the PR badge,
   since a corrected past session shouldn't retroactively claim a record. */
function recomputeEntry(i) {
  const w = S.history[i];
  if (!w) return;
  w.exercises = (w.exercises || []).filter(e => e.sets && e.sets.length);
  if (!w.exercises.length) { S.history.splice(i, 1); save(); return; }
  w.volume = w.exercises.reduce((v, e) => v + e.sets.reduce((x, s) => x + (s.w || 0) * (s.r || 0), 0), 0);
  w.setCount = w.exercises.reduce((n, e) => n + e.sets.length, 0);
  w.prs = [];
  save();
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
    workout: viewWorkout, summary: viewSummary, history: viewHistory,
    trends: viewTrends, trend: viewTrend, bw: viewBodyweight, profile: viewProfile,
  };
  app.innerHTML = (views[route] || viewToday)();
}

function tabbar(current) {
  const tabs = [
    ['today', 'Today', '<svg viewBox="0 0 24 24"><path d="M4 10h3v7H4zM17 10h3v7h-3zM8.5 8h2v11h-2zM13.5 8h2v11h-2zM11 12.5h2v2h-2z"/></svg>'],
    ['history', 'Log', '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 1-8.5 6h2.2A7 7 0 1 0 12 5v3L7 4.5 12 1z"/><path d="M11 8h2v5h4v2h-6z"/></svg>'],
    ['trends', 'Trends', '<svg viewBox="0 0 24 24"><path d="M3 17l5-5 4 4 8-8v4h2V4h-8v2h4l-6.5 6.5-4-4L2 15.5z"/></svg>'],
    ['profile', 'Profile', '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5z"/></svg>'],
  ];
  const map = { trend: 'trends', bw: 'trends' };
  const cur = map[current] || current;
  return '<nav class="tabbar">' + tabs.map(([id, label, icon]) =>
    '<button class="tab' + (cur === id ? ' on' : '') + '" data-a="nav" data-r="' + id + '">' + icon + '<span>' + label + '</span></button>'
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
        <div class="seg" id="ob-goal">
          <button data-v="fitness" class="on">Fitness</button>
          <button data-v="muscle">Muscle</button>
          <button data-v="strength">Strength</button>
        </div>
      </label>
      <label class="field"><span>Sex</span>
        <div class="seg" id="ob-sex">
          <button data-v="female">Female</button>
          <button data-v="male">Male</button>
          <button data-v="na" class="on">Prefer not to say</button>
        </div>
      </label>
      <label class="field"><span>Units</span>
        <div class="seg" id="ob-units">
          <button data-v="lb" class="on">lb</button>
          <button data-v="kg">kg</button>
        </div>
      </label>
      <label class="field"><span>Bodyweight — optional</span>
        <input id="ob-bw" type="number" inputmode="decimal" placeholder="e.g. 150" min="0" autocomplete="off">
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
    ${backupBanner()}
    ${cycleBanner()}
    ${checkinCard()}
    <section class="card">
      <h2>Muscle groups</h2>
      <div class="chips">${chips}</div>
      ${sugLine}
      <h2 class="mt">Time</h2>
      <div class="seg" id="min-seg">${mins}</div>
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
  if (ids.includes('restorative')) return 'Restorative';
  const labels = UI_GROUPS.filter(g => ids.includes(g.id)).map(g => g.label);
  return labels.length ? labels.join(' + ') : 'Session';
}

function cycleBanner() {
  if (!cycleOn()) return '';
  const p = cyclePhase();
  if (!p) return '';
  return `
    <section class="card cycle" data-phase="${p.key}">
      <div class="cycle-head">
        <span class="cycle-dot"></span>
        <strong>${p.label}</strong>
        <span class="muted small">day ${p.day}</span>
      </div>
      <p class="muted small">${esc(PHASE_NOTE[p.key])}</p>
      <details class="howto"><summary>How this works</summary><p class="muted small" style="margin-top:8px">${esc(CYCLE_SCIENCE)}</p></details>
    </section>`;
}

function backupBanner() {
  const n = backupDue();
  if (!n) return '';
  return `
    <section class="card backup">
      <div class="backup-txt">
        <strong>Back up your log</strong>
        <span class="muted small">${n} session${n === 1 ? '' : 's'} saved only on this phone. On iPhone, tap Back up → Save to Files (iCloud).</span>
      </div>
      <div class="row-btns">
        <button class="btn-ghost" data-a="snooze-backup">Later</button>
        <button class="btn-primary" data-a="backup-now">Back up</button>
      </div>
    </section>`;
}

function checkinCard() {
  if (!cycleOn()) return '';
  const c = todayCheckin();
  const energy = c ? c.energy : null;
  const syms = c ? (c.symptoms || []) : [];
  const r = todayReadiness();
  const energySeg = [['low', 'Low'], ['ok', 'Okay'], ['great', 'Great']].map(([v, label]) =>
    '<button data-v="' + v + '"' + (energy === v ? ' class="on"' : '') + '>' + label + '</button>').join('');
  const chips = NEG_SYMPTOMS.map(s =>
    '<button class="chip' + (syms.includes(s) ? ' on' : '') + '" data-a="symptom" data-v="' + s + '">' + s + '</button>').join('');
  let note = '';
  if (c && r.gentle) {
    note = '<div class="cycle-ease">Let’s keep today kind to you — your plan will lean lighter and gentler. ' +
      '<button class="linkbtn" data-a="restorative">Rather do a restorative session?</button></div>';
  } else if (c && r.hype) {
    note = '<div class="cycle-ease up">You’re feeling great — a good day to push a little if you want it.</div>';
  }
  const tend = phaseTendency();
  return `
    <section class="card">
      <h2>How are you feeling today?</h2>
      ${tend ? '<p class="muted small">' + esc(tend) + '</p>' : ''}
      <div class="seg" data-checkin="energy">${energySeg}</div>
      <p class="field-label">Anything going on? <span class="muted">tap any that apply</span></p>
      <div class="chips">${chips}</div>
      ${note}
    </section>`;
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
      <p class="muted small">${d.restorative ? 'Gentle & low-impact' : goal.label} · about ${d.est} min · ${d.ex.length} exercises</p></div>
    </header>
    ${d.restorative ? '<div class="card warm"><strong>Restorative session</strong><span class="muted">Easy movement to keep the blood flowing without taxing you. Move slowly, skip anything that doesn’t feel good, and add a gentle walk if you like.</span></div>' : '<div class="card warm"><strong>Warm-up · 5 min</strong><span class="muted">' + esc(warmupFor(d.groups)) + '</span></div>'}
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

function warmupInner(w) {
  if (w) {
    return '<strong>Warm-up sets</strong> · 8 × ' + fmtW(roundW(w * 0.5)) +
      ' · 5 × ' + fmtW(roundW(w * 0.75)) + ' ' + unitLabel() + ', then working sets below';
  }
  return '<strong>Warm-up sets</strong> · two light ramp-up sets of 8 before the working sets';
}

function warmupSetsHTML(e, i) {
  if (i !== firstWeightedIndex()) return '';
  return '<div class="warmup-line">' + warmupInner(e.suggest && e.suggest.w) + '</div>';
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
    ${howtoHTML(e.id)}
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

function howtoHTML(id) {
  const steps = HOWTO[id];
  if (!steps || !steps.length) return '';
  return '<details class="howto"><summary>How to do it</summary><ol>' +
    steps.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol></details>';
}

function weightApplies(e) {
  const orig = findEx(e.id);
  return orig ? orig.incr > 0 : true;
}

/* When you set a weight, carry it forward to later sets you haven't filled yet. */
function autofillWeight(i, j) {
  const ex = S.active.ex[i];
  const w = ex.log[j].w;
  for (let k = j + 1; k < ex.log.length; k++) {
    const later = ex.log[k];
    if (!later.done && (later.w == null || later.w === '')) {
      later.w = w;
      const input = document.querySelector('#set-' + i + '-' + k + ' [data-f="w"]');
      if (input && document.activeElement !== input) input.value = w;
    }
  }
}

/* Recompute the warm-up ramp from the working weight the user actually entered. */
function refreshWarmup(i) {
  const line = document.querySelector('#ex-' + i + ' .warmup-line');
  if (!line) return;
  const ex = S.active.ex[i];
  const entered = ex.log.map(s => s.w).filter(w => typeof w === 'number' && w > 0);
  const work = entered.length ? Math.max(...entered) : (ex.suggest && ex.suggest.w);
  line.innerHTML = warmupInner(work);
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
  if (card) {
    const wasDone = card.classList.contains('done');
    const nowDone = a.ex[i].log.every(x => x.done);
    card.classList.toggle('done', nowDone);
    if (nowDone && !wasDone && i < a.ex.length - 1) {
      const next = $('#ex-' + (i + 1));
      if (next && next.scrollIntoView) setTimeout(() => next.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
    }
  }
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

function volTxt(v) { return v >= 10000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v); }

function viewHistory() {
  const st = weekStats();
  const items = S.history.map((w, i) => {
    const open = S._openHist === i;
    const editing = S._editHist === i;
    let detail = '';
    if (open && !editing) {
      detail = '<div class="hist-detail">' + w.exercises.map(e =>
        '<div class="hist-ex"><span>' + esc(e.name) + '</span><span class="muted">' +
        e.sets.map(s => (s.w ? fmtW(s.w) + '×' : '') + (s.r || '?')).join('  ') + '</span></div>'
      ).join('') +
      '<div class="hist-actions"><button class="linkbtn" data-a="hist-edit" data-i="' + i + '">Edit</button>' +
      '<button class="linkbtn danger" data-a="hist-del" data-i="' + i + '">Delete session</button></div></div>';
    } else if (editing) {
      detail = '<div class="hist-detail" data-stop>' + w.exercises.map((e, ei) =>
        '<div class="edit-ex"><strong>' + esc(e.name) + '</strong>' +
        e.sets.map((s, si) =>
          '<div class="edit-set"><span class="set-n">' + (si + 1) + '</span>' +
          (typeof s.w === 'number' ? '<input type="number" inputmode="decimal" step="0.5" data-f="hw" data-i="' + i + '" data-e="' + ei + '" data-s="' + si + '" value="' + s.w + '"><span class="times">×</span>' : '<span class="bw">BW ×</span>') +
          '<input type="number" inputmode="numeric" data-f="hr" data-i="' + i + '" data-e="' + ei + '" data-s="' + si + '" value="' + (s.r != null ? s.r : '') + '">' +
          '<button class="icon-btn sm" data-a="hist-rmset" data-i="' + i + '" data-e="' + ei + '" data-s="' + si + '">✕</button></div>'
        ).join('') + '</div>'
      ).join('') +
      '<div class="hist-actions"><button class="linkbtn danger" data-a="hist-del" data-i="' + i + '">Delete session</button>' +
      '<button class="btn-primary sm" data-a="hist-done" data-i="' + i + '">Done</button></div></div>';
    }
    return `
    <div class="card hist${open ? ' open' : ''}"${editing ? '' : ' data-a="hist-toggle" data-i="' + i + '"'}>
      <div class="hist-row"${editing ? ' data-a="hist-toggle" data-i="' + i + '"' : ''}>
        <div><strong>${esc(groupLabels(w.groups))}${w.prs && w.prs.length ? '<span class="pr-badge">PR</span>' : ''}</strong>
        <span class="muted">${fmtDate(w.date)} · ${w.minutes} min · ${w.setCount} sets${w.volume ? ' · ' + volTxt(w.volume) + ' ' + unitLabel() : ''}</span></div>
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

/* ----- trends ----- */

function viewTrends() {
  const list = loggedExercises();
  const rows = list.map(x => {
    const series = exerciseSeries(x.id);
    const latest = series[series.length - 1];
    const first = series[0];
    let delta = '';
    if (series.length >= 2 && latest.weighted) {
      const d = latest.val - first.val;
      delta = '<span class="trend-delta ' + (d > 0 ? 'up' : d < 0 ? 'down' : '') + '">' +
        (d > 0 ? '↑ ' : d < 0 ? '↓ ' : '') + (d === 0 ? 'steady' : fmtW(Math.abs(d)) + ' ' + unitLabel()) + '</span>';
    }
    return `
    <button class="card trend-row" data-a="open-trend" data-id="${esc(x.id)}">
      <div class="trend-main">
        <strong>${esc(x.name)}</strong>
        <span class="muted small">${latest ? esc(latest.sub) : ''} · ${x.sessions} session${x.sessions === 1 ? '' : 's'} ${delta}</span>
      </div>
      ${sparkSVG(series.map(p => p.val)) || '<span class="chev">›</span>'}
    </button>`;
  }).join('');
  return `
  <div class="screen">
    <header class="top"><div><div class="kicker">Your progress</div><h1>Trends</h1></div></header>
    ${bodyweightRow()}
    ${rows || (S.bodyLog && S.bodyLog.length ? '' : '<p class="fine">Log a few sessions and your per-exercise progress lines will appear here.</p>')}
  </div>
  ${tabbar('trends')}`;
}

function bodyweightRow() {
  const s = bodySeries();
  const latest = s[s.length - 1];
  let right = '<span class="chev">›</span>';
  let sub = 'Tap to log your weight';
  if (latest) {
    sub = fmtW(latest.val) + ' ' + unitLabel();
    if (s.length >= 2) {
      const d = latest.val - s[0].val;
      sub += ' · ' + (d === 0 ? 'steady' : (d > 0 ? '+' : '−') + fmtW(Math.abs(d)) + ' ' + unitLabel() + ' overall');
      right = sparkSVG(s.map(p => p.val));
    }
  }
  return `
    <button class="card trend-row bw-row" data-a="open-bw">
      <div class="trend-main">
        <strong>Bodyweight</strong>
        <span class="muted small">${sub}</span>
      </div>
      ${right}
    </button>`;
}

function viewTrend() {
  const id = S._trendEx;
  const def = findEx(id);
  const series = exerciseSeries(id);
  if (!series.length) { route = 'trends'; return viewTrends(); }
  const latest = series[series.length - 1];
  const best = series.reduce((m, p) => p.val > m.val ? p : m, series[0]);
  const bestEst = Math.max(...series.map(p => p.est || 0));
  const first = series[0];
  const change = latest.weighted && series.length >= 2 ? latest.val - first.val : null;
  const name = def ? def.name : (latest && latest.name) || 'Exercise';
  const unit = latest.weighted ? unitLabel() : (latest.mode === 'time' ? 'sec' : 'reps');
  const recent = series.slice(-8).reverse().map(p =>
    '<div class="hist-ex"><span class="muted">' + fmtDate(p.date) + '</span><span>' + esc(p.sub) + '</span></div>').join('');
  return `
  <div class="screen">
    <header class="top">
      <button class="back" data-a="nav" data-r="trends">‹</button>
      <div><div class="kicker">Trend</div><h1>${esc(name)}</h1></div>
    </header>
    <section class="card chart-card">
      <div class="chart-cap"><span class="muted small">Heaviest set per session (${esc(unit)})</span></div>
      ${bigChartSVG(series)}
    </section>
    <div class="stats-row">
      <div class="stat"><strong>${fmtW(best.val)}</strong><span>best ${esc(unit)}</span></div>
      <div class="stat"><strong>${fmtW(latest.val)}</strong><span>latest</span></div>
      <div class="stat"><strong>${change == null ? '—' : (change > 0 ? '+' : '') + fmtW(change)}</strong><span>change</span></div>
    </div>
    ${latest.weighted && bestEst ? '<p class="fine">Estimated best 1-rep max: ' + fmtW(bestEst) + ' ' + unitLabel() + '</p>' : ''}
    <section class="card">
      <h2>Recent sessions</h2>
      <div class="hist-detail" style="border:none;padding-top:2px">${recent}</div>
    </section>
  </div>
  ${tabbar('trends')}`;
}

function viewBodyweight() {
  const s = bodySeries();
  const latest = s[s.length - 1];
  const change = s.length >= 2 ? latest.val - s[0].val : null;
  const recent = s.slice(-8).reverse().map(p =>
    '<div class="hist-ex"><span class="muted">' + fmtDate(p.date) + '</span>' +
    '<span>' + fmtW(p.val) + ' ' + unitLabel() +
    '<button class="icon-btn sm bw-x" data-a="bw-del" data-date="' + esc(p.date) + '" title="Remove">✕</button></span></div>').join('');
  const prefill = latest ? fmtW(latest.val) : '';
  return `
  <div class="screen">
    <header class="top">
      <button class="back" data-a="nav" data-r="trends">‹</button>
      <div><div class="kicker">Trend</div><h1>Bodyweight</h1></div>
    </header>
    ${s.length ? `
      <section class="card chart-card">
        <div class="chart-cap"><span class="muted small">Bodyweight (${unitLabel()})</span></div>
        ${bigChartSVG(s)}
      </section>
      <div class="stats-row">
        <div class="stat"><strong>${latest ? fmtW(latest.val) : '—'}</strong><span>current</span></div>
        <div class="stat"><strong>${change == null ? '—' : (change > 0 ? '+' : change < 0 ? '−' : '') + fmtW(Math.abs(change))}</strong><span>change</span></div>
        <div class="stat"><strong>${s.length}</strong><span>entries</span></div>
      </div>` : '<p class="fine">Log your weight to start a trend. Weigh in at a consistent time — mornings are most reliable.</p>'}
    <section class="card">
      <h2>Log today</h2>
      <div class="bw-entry">
        <input type="number" inputmode="decimal" step="0.1" min="0" id="bw-input" value="${prefill}" placeholder="—">
        <span class="bw-unit">${unitLabel()}</span>
        <button class="btn-primary" data-a="bw-log">Save</button>
      </div>
      <p class="muted small">Updating today just replaces today's entry — weigh in as often as you like.</p>
    </section>
    ${recent ? '<section class="card"><h2>Recent</h2><div class="hist-detail" style="border:none;padding-top:2px">' + recent + '</div></section>' : ''}
  </div>
  ${tabbar('trends')}`;
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
        <div class="seg" data-set="goal">
          <button data-v="fitness" class="${p.goal === 'fitness' ? 'on' : ''}">Fitness</button>
          <button data-v="muscle" class="${p.goal === 'muscle' ? 'on' : ''}">Muscle</button>
          <button data-v="strength" class="${p.goal === 'strength' ? 'on' : ''}">Strength</button>
        </div>
      </label>
      <label class="field"><span>Sex</span>
        <div class="seg" data-set="sex">
          <button data-v="female" class="${p.sex === 'female' ? 'on' : ''}">Female</button>
          <button data-v="male" class="${p.sex === 'male' ? 'on' : ''}">Male</button>
          <button data-v="na" class="${(!p.sex || p.sex === 'na') ? 'on' : ''}">N/A</button>
        </div>
      </label>
      <label class="field"><span>Units</span>
        <div class="seg" data-set="units">
          <button data-v="lb" class="${p.units === 'lb' ? 'on' : ''}">lb</button>
          <button data-v="kg" class="${p.units === 'kg' ? 'on' : ''}">kg</button>
        </div>
      </label>
      <div class="two-col">
        <label class="field"><span>Bodyweight (${unitLabel()})</span>
          <input type="number" inputmode="decimal" data-f="bodyweight" value="${p.bodyweight != null ? p.bodyweight : ''}" placeholder="—" min="0">
        </label>
        <label class="field"><span>Body fat % — optional</span>
          <input type="number" inputmode="decimal" data-f="bodyfat" value="${p.bodyfat != null ? p.bodyfat : ''}" placeholder="—" min="0" max="70">
        </label>
      </div>
    </section>
    ${cycleSettings()}
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

function cycleSettings() {
  const p = S.profile;
  if (p.sex !== 'female') return '';
  const c = S.cycle;
  const phase = cycleOn() ? cyclePhase() : null;
  const last = lastPeriodStart();
  const today = new Date().toISOString().slice(0, 10);
  return `
  <section class="card">
    <h2>Cycle-aware training</h2>
    <p class="muted small">Optional, and yours alone. When it’s on, the home screen asks how you’re feeling each day and shapes your workout to match — lighter and gentler on rough days, encouraging on strong ones. It never locks you out of anything; you’re always in charge.</p>
    <label class="switch-row"><span>Enable cycle tracking</span>
      <input type="checkbox" data-f="cycle-enabled" ${c.enabled ? 'checked' : ''}><i></i>
    </label>
    ${c.enabled ? `
      <div class="two-col mt">
        <label class="field"><span>Avg cycle length</span>
          <input type="number" inputmode="numeric" data-f="cycle-avg" value="${c.avgLen}" min="21" max="40">
        </label>
        <label class="field"><span>Period length</span>
          <input type="number" inputmode="numeric" data-f="cycle-period" value="${c.periodLen}" min="2" max="10">
        </label>
      </div>
      <label class="field mt"><span>Log a period start date</span>
        <input type="date" data-f="cycle-date" max="${today}" value="${today}">
      </label>
      <button class="btn-ghost" data-a="log-period">Log period start</button>
      ${last ? '<p class="muted small">Last logged: ' + esc(fmtDate(last + 'T00:00')) + (phase ? ' · currently <strong>' + esc(phase.label.toLowerCase()) + '</strong>, day ' + phase.day : '') + ' · ' + c.starts.length + ' logged</p>' : '<p class="muted small">No periods logged yet — add one to start predictions.</p>'}
    ` : ''}
  </section>`;
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
      if (key === 'sex') render(); // reveal/hide the cycle section
    }
    if (seg.dataset.checkin === 'energy') {
      setCheckin({ energy: segBtn.dataset.v });
      render(); // refresh the supportive note + downstream suggestions
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

  else if (a === 'log-period') {
    const input = document.querySelector('[data-f="cycle-date"]');
    logPeriodStart(input ? input.value + 'T00:00:00.000Z' : null);
    toast('Period start logged.');
    render();
  }

  else if (a === 'symptom') {
    const c = todayCheckin() || {};
    const syms = (c.symptoms || []).slice();
    const v = el.dataset.v;
    const idx = syms.indexOf(v);
    if (idx >= 0) syms.splice(idx, 1); else syms.push(v);
    setCheckin({ symptoms: syms });
    render();
  }

  else if (a === 'restorative') {
    S.draft = restorativePlan();
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
    const i = +el.dataset.i;
    if (S._editHist === i) { S._editHist = -1; render(); return; }
    S._editHist = -1;
    S._openHist = S._openHist === i ? -1 : i;
    render();
  }

  else if (a === 'hist-edit') { S._editHist = +el.dataset.i; render(); }

  else if (a === 'hist-done') { S._editHist = -1; recomputeEntry(+el.dataset.i); render(); }

  else if (a === 'hist-del') {
    const i = +el.dataset.i;
    if (confirm('Delete this whole session? This can’t be undone.')) {
      S.history.splice(i, 1);
      S._editHist = -1; S._openHist = -1;
      save(); toast('Session deleted.'); render();
    }
  }

  else if (a === 'hist-rmset') {
    const w = S.history[+el.dataset.i];
    const e = w.exercises[+el.dataset.e];
    e.sets.splice(+el.dataset.s, 1);
    if (!e.sets.length) w.exercises.splice(+el.dataset.e, 1);
    if (!w.exercises.length) { S.history.splice(+el.dataset.i, 1); S._editHist = -1; S._openHist = -1; }
    else recomputeEntry(+el.dataset.i);
    save(); render();
  }

  else if (a === 'open-trend') { S._trendEx = el.dataset.id; go('trend'); }
  else if (a === 'open-bw') go('bw');

  else if (a === 'bw-log') {
    const v = parseFloat($('#bw-input').value);
    if (v > 0) { logBodyweight(v); toast('Weight logged.'); render(); }
    else toast('Enter a weight first.');
  }

  else if (a === 'bw-del') {
    const d = el.dataset.date;
    S.bodyLog = (S.bodyLog || []).filter(e => e.date !== d);
    if (S.bodyLog.length) S.profile.bodyweight = S.bodyLog[S.bodyLog.length - 1].w;
    save(); render();
  }

  else if (a === 'ob-start') {
    const name = $('#ob-name').value.trim();
    const bw = parseFloat($('#ob-bw').value);
    S.profile = {
      name,
      level: $('#ob-level .on').dataset.v,
      goal: $('#ob-goal .on').dataset.v,
      sex: $('#ob-sex .on').dataset.v,
      units: $('#ob-units .on').dataset.v,
      bodyweight: bw > 0 ? bw : null,
      bodyfat: null,
    };
    save();
    if (bw > 0) logBodyweight(bw); // seed the bodyweight trend
    go('today');
  }

  else if (a === 'export' || a === 'backup-now') { exportData(); if (a === 'backup-now') { toast('Saved. Choose “Save to Files” to keep it in iCloud.'); render(); } }
  else if (a === 'snooze-backup') { S._snoozeBackup = true; render(); }
  else if (a === 'import') $('#import-file').click();

  else if (a === 'reset') {
    if (confirm('Erase your profile and ALL history on this phone? This cannot be undone.')) {
      localStorage.removeItem(LS_KEY);
      S = defaultState();
      applyTheme();
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
    const i = +el.dataset.i, j = +el.dataset.j;
    const ex = S.active && S.active.ex[i];
    const s = ex && ex.log[j];
    if (s) {
      s[f] = el.value === '' ? null : +el.value;
      if (f === 'w' && s.w != null) autofillWeight(i, j);
      if (f === 'w' && i === firstWeightedIndex()) refreshWarmup(i);
      save();
    }
  } else if (f === 'hw' || f === 'hr') {
    const w = S.history[+el.dataset.i];
    const e = w && w.exercises[+el.dataset.e];
    const s = e && e.sets[+el.dataset.s];
    if (s) {
      if (f === 'hw') s.w = el.value === '' ? 0 : +el.value;
      else s.r = el.value === '' ? null : +el.value;
      save(); // derived totals recompute on Done
    }
  } else if (f === 'name') {
    S.profile.name = el.value.trim(); save();
  } else if (f === 'eq') {
    S.settings.equipment[el.dataset.id] = el.checked; save();
  } else if (f === 'bodyweight') {
    const v = parseFloat(el.value);
    if (v > 0) logBodyweight(v); // keeps profile + today's log entry in sync
    else { S.profile.bodyweight = null; save(); }
  } else if (f === 'bodyfat') {
    const v = parseFloat(el.value);
    S.profile.bodyfat = el.value === '' || !(v >= 0) ? null : v; save();
  } else if (f === 'cycle-enabled') {
    S.cycle.enabled = el.checked; save(); render();
  } else if (f === 'cycle-avg') {
    const v = parseInt(el.value, 10);
    if (v >= 21 && v <= 40) { S.cycle.avgLen = v; save(); }
  } else if (f === 'cycle-period') {
    const v = parseInt(el.value, 10);
    if (v >= 2 && v <= 10) { S.cycle.periodLen = v; save(); }
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
  (S.bodyLog || []).forEach(e => { e.w = conv(e.w); });
  if (S.profile && typeof S.profile.bodyweight === 'number') S.profile.bodyweight = conv(S.profile.bodyweight);
  toast('Weights converted to ' + to + '.');
}

function exportData() {
  S.lastBackupAt = todayISO();
  save();
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const aEl = document.createElement('a');
  aEl.href = url;
  aEl.download = 'spotter-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(aEl); aEl.click(); aEl.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* Sessions finished since the last backup. */
function unsavedSessions() {
  const since = S.lastBackupAt ? new Date(S.lastBackupAt).getTime() : 0;
  return S.history.filter(w => new Date(w.date).getTime() > since).length;
}

/* Show the gentle backup nudge when online with enough new, unsaved sessions. */
function backupDue() {
  if (S._snoozeBackup) return 0;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
  const n = unsavedSessions();
  if (n >= 3) return n;
  if (n >= 1 && S.lastBackupAt && (Date.now() - new Date(S.lastBackupAt).getTime()) > 21 * DAY_MS) return n;
  return 0;
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
      S.lastBackupAt = todayISO(); save();
      applyTheme();
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

/* Re-check the backup nudge when the phone comes back online. */
window.addEventListener('online', () => { if (route === 'today') render(); });

/* ---------------- boot ---------------- */

delete S._snoozeBackup; S._editHist = -1; // transient view state, fresh each launch
applyTheme();
route = S.profile ? (S.active ? 'workout' : 'today') : 'onboard';
render();
if (S.active) acquireWakeLock();
