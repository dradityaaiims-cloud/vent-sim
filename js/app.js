import { Sim, DEFAULTS, ETT, pbw } from './engine/engine.js';
import { SCENARIOS, evalGoals, loadScenario } from './scenarios.js';
import { MODEL_HTML } from './model.js';
import { fit, lane, range, col } from './draw.js';
import { drawLung } from './lung.js';
import { renderLearn } from './learn.js';
import { startTour } from './tour.js';
import { ASYN } from './asyn.js';
import { CONFIG, mailto } from './config.js';
import { renderAbout } from './about.js';
import { PRESETS } from './engine/presets.js';

const $ = (s, r = document) => r.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of kids.flat()) e.append(c instanceof Node ? c : document.createTextNode(c));
  return e;
};
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const INSTRUCTOR = new URLSearchParams(location.search).get('instructor') === '1';

// ---------- units ----------
const U = { p: 'cmH2O', g: 'mmHg', t: 'C', ...store.get('vsim-units', {}) };
const kp = () => (U.p === 'kPa' ? 0.0980665 : 1);
const fp = (x, d) => (Number.isFinite(x) ? (x * kp()).toFixed(d ?? (U.p === 'kPa' ? 1 : 0)) : '--');
const fg = (x) => (Number.isFinite(x) ? (U.g === 'kPa' ? (x * 0.133322).toFixed(1) : x.toFixed(0)) : '--');
const ft = (c) => (U.t === 'F' ? ((c * 9) / 5 + 32).toFixed(1) : c.toFixed(1));
const n0 = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '--');

// ---------- state ----------
const FREE = {
  normal: { vt: 450, rr: 14, peep: 5, fio2: 0.4, ti: 1.0 },
  copd: { vt: 430, rr: 15, peep: 0, fio2: 0.3, ti: 0.7 },
  ards: { vt: 340, rr: 24, peep: 10, fio2: 0.6, ti: 0.8 },
  asthma: { vt: 400, rr: 12, peep: 0, fio2: 0.4, ti: 0.8 },
};
const sim = new Sim('normal', {}, { ...FREE.normal });
sim.settle();
let speed = 1, scn = null, wbuf = [], loops = { cur: [], prev: [], ref: [], br: -1 };
let abgHist = [], abgBusy = false, prevAlarms = new Set();
const prog = store.get('vsim-prog', { done: {}, streak: 0 });

// ---------- controls ----------
const CTRL = [
  { k: 'mode', type: 'select', label: 'Mode', opts: [['VC', 'VC-CMV (volume control)'], ['PC', 'PC-CMV (pressure control)'], ['APV', 'APVcmv (adaptive pressure)'], ['PSV', 'SPONT (PSV / CPAP)']] },
  { k: 'vt', label: 'Tidal volume', u: 'mL', min: 100, max: 1000, step: 10, modes: 'VC APV' },
  { k: 'pc', label: 'Pressure above PEEP', kind: 'p', min: 2, max: 40, step: 1, modes: 'PC' },
  { k: 'ps', label: 'Pressure support', kind: 'p', min: 0, max: 30, step: 1, modes: 'PSV' },
  { k: 'rr', label: 'Rate', u: '/min', min: 4, max: 40, step: 1, modes: 'VC PC APV' },
  { k: 'ti', label: 'Inspiratory time', u: 's', min: 0.3, max: 3, step: 0.1, modes: 'VC PC APV' },
  { k: 'flow', type: 'select', label: 'Flow pattern', opts: [['square', 'Square'], ['decel', 'Decelerating']], modes: 'VC' },
  { k: 'peep', label: 'PEEP', kind: 'p', min: 0, max: 24, step: 1 },
  { k: 'fio2', label: 'FiO2', u: '%', min: 21, max: 100, step: 1, scale: 100 },
  { k: 'trig', label: 'Flow trigger', u: 'L/min', min: 1, max: 10, step: 0.5 },
  { k: 'rise', label: 'Rise time', u: 's', min: 0.05, max: 0.5, step: 0.05, modes: 'PC APV PSV' },
  { k: 'cycle', label: 'Cycle off at', u: '% of peak flow', min: 5, max: 60, step: 5, modes: 'PSV' },
  { k: 'holdDur', type: 'select', num: true, label: 'Hold duration', opts: [[0.5, '0.5 s'], [1, '1 s'], [2, '2 s'], [3, '3 s']] },
];
const PT = [
  { k: 'ettMult', label: 'Tube kink / secretions', u: 'x', min: 1, max: 12, step: 0.5 },
  { k: 'drive.rate', label: 'Patient effort rate', u: '/min', min: 0, max: 40, step: 1 },
  { k: 'drive.pmax', label: 'Patient effort strength', kind: 'p', min: 0, max: 25, step: 1 },
  { k: 'drive.rise', label: 'Effort rise time', u: 's', min: 0.1, max: 1, step: 0.05, shape: true },
  { k: 'drive.hold', label: 'Effort hold', u: 's', min: 0, max: 1, step: 0.05, shape: true },
  { k: 'drive.decay', label: 'Effort decay (relaxation)', u: 's', min: 0.1, max: 1.5, step: 0.05, shape: true },
];
const SHAPE_DEF = { rise: 0.3, hold: 0, decay: 0.4 };
const getPt = (k) => (k.startsWith('drive.') ? sim.pt.drive[k.slice(6)] ?? SHAPE_DEF[k.slice(6)] : sim.pt[k]);
const patchPt = (k, v) => {
  if (!k.startsWith('drive.')) return sim.patch({ [k]: v });
  const f = k.slice(6), d = SHAPE_DEF;
  sim.patch({ drive: { ...(SHAPE_DEF[f] !== undefined && sim.pt.drive.rise == null ? d : {}), [f]: v } }); // first touch switches from half-sine to the shaped effort
};

function slider(c, get, set) {
  const sc = c.scale || 1, kk = c.kind === 'p' ? kp() : 1;
  const disp = (v) => (v * sc * kk);
  const out = h('output');
  const input = h('input', { type: 'range', min: c.min * kk, max: c.max * kk, step: c.kind === 'p' && kk !== 1 ? 0.1 : c.step, 'aria-label': c.label });
  const show = () => { input.value = disp(get()); out.textContent = `${c.kind === 'p' && kk !== 1 ? disp(get()).toFixed(1) : +disp(get()).toFixed(2)} ${c.kind === 'p' ? U.p : c.u}`; };
  input.addEventListener('input', () => { set(+input.value / sc / kk); show(); });
  const row = h('div', { class: 'row', 'data-k': c.k, 'data-modes': c.modes || '' }, h('label', {}, c.label), out, input);
  row.refresh = show;
  return row;
}

let ctlRows = [];
const MODE_INFO = {
  VC: ['VC-CMV: volume control', 'You set VT, rate and flow; pressure is the result. Delivered volume is guaranteed, so pressures rise if compliance falls or resistance rises. Time-cycled. Patient triggers add full breaths.'],
  PC: ['PC-CMV: pressure control', 'You set pressure and Ti; volume is the result. Flow decelerates as the lung fills. Falling compliance or rising resistance shows up as a falling VT: watch exhaled volume.'],
  APV: ['APVcmv: adaptive pressure control', 'Pressure control whose pressure is adjusted breath by breath (max 3 cmH2O each) to hit the target VT. It can quietly raise pressure and hide a deterioration: watch the pressure trend. Generic implementation.'],
  PSV: ['SPONT: pressure support / CPAP', 'The patient triggers and sets the rate; each breath gets the set support pressure and ends when flow falls to the cycle-off %. Apnea backup after 20 s. PS 0 = CPAP.'],
};
function buildControls() {
  const dv = $('#d-controls'), dp = $('#d-patient'), dt = $('#d-tools'), dm = $('#d-modes');
  [dv, dp, dt, dm].forEach((d) => d.replaceChildren());
  ctlRows = [];
  $('#patientbar').hidden = !!scn; syncBar();
  if (scn) { $('#tip').hidden = true; setTimeout(layout, 0); } else maybeTip();
  const add = (box, r) => { ctlRows.push(r); box.append(r); };
  if (!scn) {
    dp.append(h('p', { class: 'muted' }, 'Lung type, sex, height, weight and tube size are in the Patient bar at the top. Here you set how the patient breathes and how obstructed the tube is.'));
    for (const c of PT) add(dp, slider(c, () => getPt(c.k), (v) => patchPt(c.k, v)));
  } else dp.append(h('p', { class: 'muted' }, 'Scenario in progress: the patient is fixed. Adjust the ventilator and use the case actions above.'));
  for (const c of CTRL) {
    let r;
    if (c.type === 'select') {
      const s = h('select', { 'aria-label': c.label, onchange: (e) => { sim.configure({ [c.k]: c.num ? +e.target.value : e.target.value }); log(`${c.label} set to ${e.target.value}`); refreshControls(); } },
        ...c.opts.map(([v, t]) => h('option', { value: v }, t)));
      r = h('div', { class: 'row', 'data-k': c.k, 'data-modes': c.modes || '' }, h('label', {}, c.label), h('span'), s);
      r.refresh = () => { s.value = sim.set[c.k]; };
    } else r = slider(c, () => sim.set[c.k], (v) => { sim.configure({ [c.k]: v }); refreshDials(); });
    add(dv, r);
  }
  for (const [k, [t, d]] of Object.entries(MODE_INFO)) {
    dm.append(h('button', { class: 'modebtn', 'data-m': k, onclick: () => { sim.configure({ mode: k }); log(`Mode: ${t}`); refreshControls(); } }, h('b', {}, t), h('div', { class: 'muted' }, d)));
  }
  dt.append(h('div', { class: 'btns', role: 'group', 'aria-label': 'Time speed' }, h('span', { class: 'muted' }, 'Time speed'),
    ...[[0, 'Pause'], [1, '1x'], [5, '5x'], [20, '20x'], [60, '60x']].map(([v, t]) => h('button', { 'data-speed': v, class: v === speed ? 'on' : '', onclick: () => setSpeed(v) }, t)),
    h('button', { onclick: resetAll }, 'Reset')));
  dt.append(h('p', { id: 'clock', class: 'muted' }));
  dt.append(h('h3', {}, 'Share this setup'), h('p', { class: 'muted' }, 'Copies a link that opens the simulator with this patient and these settings. No account or server needed. The learner link hides the patient and example panels.'),
    h('div', { class: 'btns' }, h('button', { onclick: () => copyLink(false) }, 'Copy link'), h('button', { onclick: () => copyLink(true) }, 'Copy learner link'), h('button', { onclick: () => copyLink(true, true) }, 'Learner link, hide pressures')));
  const dx = $('#d-examples'); dx.replaceChildren(h('p', { class: 'muted' }, 'Each example loads a patient and settings that reproduce an asynchrony on the real engine. Turn on Show Pmus above the waveforms to see the patient effort. Triangles mark patient-triggered breaths. Details are in Learn.'));
  for (const a of ASYN) dx.append(h('div', { class: 'ex' }, h('h4', {}, a.title), h('p', {}, a.what), h('div', { class: 'btns' }, h('button', { class: 'primary', onclick: () => { loadCustom(a.key, a.mods, a.set, a.title); $('#w-pmus').checked = true; openDrawer(''); } }, 'Load example'), h('button', { onclick: () => { alert(`What to look for:\n${a.look}\n\nWhat to do:\n${a.fix}`); } }, 'What to look for'))));
  refreshControls();
}
function refreshControls() {
  for (const r of ctlRows) {
    r.refresh();
    const m = r.dataset.modes; r.hidden = !!m && !m.split(' ').includes(sim.set.mode);
  }
  $('#b-ih').disabled = sim.set.mode !== 'VC';
  document.querySelectorAll('.modebtn').forEach((b) => b.classList.toggle('on', b.dataset.m === sim.set.mode));
  $('#r-mode').textContent = MODE_INFO[sim.set.mode][0].split(':')[0];
  $('#modeinfo').innerHTML = `<b>${MODE_INFO[sim.set.mode][0]}</b><br>${MODE_INFO[sim.set.mode][1]}`;
  refreshDials();
}
function refreshDials() {
  const st = sim.set, m = st.mode;
  const d = [m === 'PC' ? ['ΔP', fp(st.pc), U.p] : m === 'PSV' ? ['PS', fp(st.ps), U.p] : [m === 'APV' ? 'Target VT' : 'VT', st.vt, 'mL'], ['PEEP', fp(st.peep), U.p], ['Oxygen', Math.round(st.fio2 * 100), '%']];
  $('#dials').replaceChildren(...d.map(([n, v, u]) => h('button', { class: 'dial', title: `${n}: click to change in Controls`, onclick: () => openDrawer('controls'), 'aria-label': `${n} ${v} ${u}, open controls` }, h('div', {}, h('b', {}, String(v)), h('small', {}, `${n} ${u}`)))));
}
function setSpeed(v) {
  speed = v;
  document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', +b.dataset.speed === v));
  if (v > 5) wbuf = [];
}
const events = [];
function log(msg) { events.unshift({ t: sim.t, msg }); if (events.length > 80) events.pop(); if (curDrawer === 'events') renderEvents(); }
function flash(msg) { const t = h('span', {}, msg); $('#toast').append(t); setTimeout(() => t.remove(), 2800); log(msg); }
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function renderEvents() { $('#d-events').replaceChildren(events.length ? h('table', { class: 'meas' }, ...events.map((e) => h('tr', {}, h('td', {}, mmss(e.t)), h('td', {}, e.msg)))) : h('p', { class: 'muted' }, 'No events yet.')); }

// ---------- drawer / bottom bar ----------
let curDrawer = '';
const DRAWERS = { modes: ['Modes', 'd-modes'], controls: ['Controls', 'd-controls'], patient: ['Patient', 'd-patient'], tools: ['Tools', 'd-tools'], meas: ['Measurements (after holds)', 'd-meas'], examples: ['Examples: patient-ventilator asynchrony', 'd-examples'], events: ['Events', 'd-events'], alarms: ['Alarms', 'd-alarms'] };
function openDrawer(name) {
  curDrawer = name || '';
  $('#drawer').hidden = !name;
  for (const [k, [t, id]] of Object.entries(DRAWERS)) { $('#' + id).hidden = k !== name; if (k === name) $('#dtitle').textContent = t; }
  document.querySelectorAll('.bbar button').forEach((b) => b.classList.toggle('on', b.dataset.d === (name === 'controls' || name === 'modes' || name === 'alarms' ? '' : name)));
  setTimeout(layout, 0);
  if (name === 'events') renderEvents();
}

function loadCustom(key, mods, set, label) {
  scn = null; $('#scbar').hidden = true;
  sim.load(key, mods, { ...DEFAULTS, ...set }); sim.settle(); sim.rec = true; speed = 1;
  clearTraces(); buildControls(); if (label) flash(`Loaded: ${label}`);
}
function loadFree(key) {
  sim.load(key, {}, { ...DEFAULTS, ...FREE[key] }); sim.settle(); sim.rec = true;
  clearTraces(); buildControls();
}
function clearTraces() { wbuf = []; loops = { cur: [], prev: [], ref: loops.ref, br: -1 }; sim.out.length = 0; abgHist = []; }
function resetAll() { if (scn) startScenario(scn.sc); else loadFree(sim.key); }

// ---------- share links ----------
function copyLink(learner, hidep) {
  const mods = {};
  for (const k of Object.keys(sim.pt)) if (k !== 'ven' && JSON.stringify(sim.pt[k]) !== JSON.stringify(PRESETS[sim.key][k])) mods[k] = sim.pt[k];
  const enc = btoa(unescape(encodeURIComponent(JSON.stringify({ k: sim.key, m: mods, s: sim.set }))));
  const url = `${location.origin}${location.pathname}${learner ? '?learner=1' + (hidep ? '&hidep=1' : '') : ''}#s=${enc}`;
  (navigator.clipboard?.writeText(url) ?? Promise.reject()).then(() => flash('Link copied'), () => prompt('Copy this link', url));
}
function loadFromHash() {
  const m = location.hash.match(/^#s=(.+)$/); if (!m) return false;
  try { const o = JSON.parse(decodeURIComponent(escape(atob(m[1])))); if (!PRESETS[o.k]) return false; loadCustom(o.k, o.m || {}, o.s || {}, 'shared setup'); return true; } catch { return false; }
}
function stressIndex() { // fit Paw = a*t^b + c over constant-flow inspiration; b = stress index
  const p = loops.prev.filter((s) => s.ph === 'insp');
  if (sim.set.mode !== 'VC' || sim.set.flow !== 'square' || p.length < 20 || sim.last?.trig) return NaN;
  const t0 = p[0].t, pts = p.slice(3).map((q) => [q.t - t0 + 0.001, q.paw]);
  let best = null;
  for (let b = 0.5; b <= 1.8; b += 0.01) {
    const x = pts.map((q) => q[0] ** b), y = pts.map((q) => q[1]), n = x.length;
    const mx = x.reduce((a, v) => a + v, 0) / n, my = y.reduce((a, v) => a + v, 0) / n;
    let sxx = 0, sxy = 0; for (let i = 0; i < n; i++) { sxx += (x[i] - mx) ** 2; sxy += (x[i] - mx) * (y[i] - my); }
    const k = sxy / sxx; let sse = 0; for (let i = 0; i < n; i++) sse += (y[i] - my - k * (x[i] - mx)) ** 2;
    if (!best || sse < best.sse) best = { b, sse };
  }
  return best.b;
}

// ---------- monitor ----------
function renderMonitor(mon, alarms) {
  const l = sim.last, st = sim.set, m = sim.metrics();
  const TIPS = { Ppeak: 'Peak airway pressure of the last breath. Small numbers: alarm limit and PEEP. High peak with a normal plateau means resistance; both high means stiff lungs.', MinVol: 'Minute ventilation: exhaled volume x rate. Sets CO2 clearance.', VTe: 'Exhaled tidal volume. Small number: the set volume. Compare with ~6-8 mL/kg predicted body weight.', fTotal: 'Total breaths per minute, set plus patient-triggered.', RCexp: 'Measured expiratory time constant (s): how slowly the lung empties. Above ~1 s means breaths may stack.', SpO2: 'Pulse oximeter saturation. Small number: alarm limit.' };
  const num = (set, big, unit, name, al) => h('div', { class: 'num' + (al ? ' alarm' : '') + (name === 'Ppeak' ? ' pk' : ''), title: TIPS[name] || '' }, h('div', { class: 'set' }, ...set.map((x) => h('div', {}, String(x)))), h('div', { class: 'big' }, h('b', {}, big), h('span', {}, `${name} ${unit}`)));
  $('#lcol').replaceChildren(
    num([fp(40), fp(st.peep)], fp(l?.pip), U.p, 'Ppeak', alarms.has('pip')),
    num([], n0(m.mv, 1), 'L/min', 'MinVol'),
    num([st.mode === 'PC' || st.mode === 'PSV' ? '' : st.vt], n0(l ? l.vte * 1000 : NaN), 'mL', 'VTe'),
    num([st.mode === 'PSV' ? '' : st.rr], n0(sim.rrTotal()), '/min', 'fTotal', alarms.has('rr')),
    num([], n0(l?.rcexp, 2), 's', 'RCexp'),
    num([90], n0(mon.spo2), '%', 'SpO2', alarms.has('spo2')),
  );
  const cdyn = l ? (l.vti * 1000) / Math.max(1, l.pip - l.peepTot) : NaN;
  const STIPS = { Pmean: 'Mean airway pressure over the breath. Raises with PEEP and long inspiration; lowers venous return.', Cdyn: 'Dynamic compliance: tidal volume / (peak - PEEP). Includes resistance. Plateau-based static compliance is in Measurements.', PetCO2: 'End-tidal CO2. Lower than PaCO2 by the dead-space gradient.', HR: 'Heart rate.', BP: 'Blood pressure and mean arterial pressure. High auto-PEEP or mean airway pressure lowers it.', Temp: 'Temperature.' };
  const s = (n, v, u, al) => h('div', { class: 's' + (al ? ' alarm' : ''), title: STIPS[n] || '' }, h('b', {}, v), h('span', {}, `${n} ${u}`));
  $('#strip').replaceChildren(
    s('Pmean', fp(l?.pmean, 1), U.p), s('Cdyn', n0(cdyn), 'mL/' + U.p), s('PetCO2', fg(mon.etco2), U.g, alarms.has('co2')),
    s('HR', n0(mon.hr), 'bpm', alarms.has('hr')), s('BP', `${n0(mon.sbp)}/${n0(mon.dbp)}`, `MAP ${n0(mon.map)}`, alarms.has('map')), s('Temp', ft(mon.temp), '°' + U.t));
}
function computeAlarms(mon) {
  const a = new Map(), l = sim.last;
  if (l && l.pip > 40) a.set('pip', `High pressure ${fp(l.pip)} ${U.p}`);
  if (mon.spo2 < 90) a.set('spo2', `Low SpO2 ${n0(mon.spo2)}%`);
  if (mon.map < 60) a.set('map', `Low MAP ${n0(mon.map)}`);
  if (mon.hr > 130) a.set('hr', `High HR ${n0(mon.hr)}`);
  if (mon.rr > 35) a.set('rr', `High rate ${n0(mon.rr)}`);
  if (mon.etco2 > 60) a.set('co2', `High EtCO2 ${fg(mon.etco2)}`);
  if (mon.etco2 < 25 && sim.t > 60) a.set('co2', `Low EtCO2 ${fg(mon.etco2)}`);
  if (sim.t - sim.starts[sim.starts.length - 1] > 20) a.set('apnea', 'Apnea');
  return a;
}

// ---------- measured values ----------
function renderMeasured() {
  const l = sim.last, st = sim.set, hold = sim.hold, eh = sim.ehold, m = sim.metrics();
  const fresh = (x) => x && sim.t - x.t < 120;
  const pplat = fresh(hold) ? hold.pplat : NaN, peepTot = fresh(eh) ? eh.peepTot : NaN;
  const base = Number.isFinite(peepTot) ? peepTot : st.peep;
  const vt = l ? l.vti * 1000 : NaN, si = stressIndex();
  const rows = [
    ['Peak pressure', fp(l?.pip), U.p],
    ['Plateau', fresh(hold) ? fp(pplat) : '--', `${U.p} <small>${fresh(hold) ? `hold ${hold.dur} s` : 'do an inspiratory hold'}</small>`],
    ['Total PEEP', fresh(eh) ? fp(peepTot) : '--', `${U.p} <small>${fresh(eh) ? 'auto-PEEP ' + fp(eh.auto, 1) : 'do an expiratory hold'}</small>`],
    ['Driving pressure', fresh(hold) ? fp(pplat - base) : '--', U.p],
    ['Mean airway pressure', fp(l?.pmean, 1), U.p],
    ['Exhaled VT', n0(l ? l.vte * 1000 : NaN), `mL <small>${n0(m.vtPerKg, 1)} mL/kg PBW</small>`],
    ['Minute ventilation', n0(m.mv, 1), 'L/min'],
    ['Resp. rate', n0(sim.rrTotal(), 0), `/min <small>${sim.recent(5).filter((b) => b.trig).length}/5 triggered</small>`],
    ['I:E', l ? `1:${(l.tE / l.tI).toFixed(1)}` : '--', ''],
    ['Static compliance', fresh(hold) ? n0(vt / (pplat - base)) : '--', 'mL/' + U.p],
    ['Resistance', fresh(hold) && st.mode === 'VC' && l ? n0((l.pip - pplat) / l.peak) : '--', U.p + '/L/s'],
    ['RSBI', n0(m.rsbi), 'f / VT(L)'],
    ['P0.1 (drive)', fp(m.p01, 1), U.p + ' <small>patient-triggered breaths</small>'],
    ['Stress index', Number.isFinite(si) ? n0(si, 2) : '--', `<small>${Number.isFinite(si) ? (si < 0.9 ? 'recruiting' : si > 1.1 ? 'overdistension' : 'linear') : 'VC square flow, passive'}</small>`],
  ];
  $('#meas').innerHTML = rows.map(([a, b, c]) => `<tr><td>${a}</td><td>${b} <small>${c}</small></td></tr>`).join('');
  if ($('#physics').checked) renderPhysics();
  if (INSTRUCTOR) renderTruth();
}
function renderPhysics() {
  const s = sim.s, pt = sim.pt, e = ETT[pt.ett], v = s.vdot;
  const comp = [
    ['Elastic (lung + chest wall)', sim.pel(s.V)], ['Viscoelastic', s.pv],
    ['Airway resistive', pt.k1aw * v + pt.k2aw * v * Math.abs(v)],
    ['ETT resistive', pt.ettMult * (e.k1 * v + e.k2 * v * Math.abs(v))], ['Patient effort (Pmus)', -s.pmus],
  ];
  const mx = Math.max(10, ...comp.map((c) => Math.abs(c[1])));
  $('#phys').innerHTML = `<div>Pao ${fp(s.pao, 1)} ${U.p} | tracheal ${fp(s.ptr, 1)} ${U.p}</div>` +
    comp.map(([n, x]) => `<div>${n}: ${fp(x, 1)}</div><div class="bar"><i style="width:${Math.min(100, (Math.abs(x) / mx) * 100)}%"></i></div>`).join('') +
    `<div>Measured expiratory time constant not shown: expiration is not a single exponential here.</div>`;
}
function renderTruth() {
  const s = sim.s, l = sim.last, dV = 0.005;
  const crs = (2 * dV * 1000) / (sim.pel(s.V + dV) - sim.pel(s.V - dV));
  const m = sim.metrics();
  $('#truth').innerHTML = `<b>Reported vs model truth</b><br>Crs: reported ${n0(m.cstat)} | true ${n0(crs)} mL/${U.p}<br>` +
    `Resistance: true K1 ${sim.k1.toFixed(1)} + K2 ${sim.k2.toFixed(1)}&middot;|flow|<br>Auto-PEEP: reported ${sim.ehold ? fp(sim.ehold.auto, 1) : '--'} | true ${fp(l?.autoPeep, 1)}<br>` +
    `Plateau: reported ${sim.hold ? fp(sim.hold.pplat, 1) : '--'} | instantaneous ${fp(l?.pplat, 1)}`;
}

// ---------- canvases ----------
let frozen = false, frozenBuf = [], winSec = 12, cross = null;
function drawWave() {
  const c = $('#wave'), [g, w, hh] = fit(c), W = winSec;
  $('#ffnote').hidden = speed <= 5;
  const buf = frozen ? frozenBuf : wbuf;
  if (speed > 5 && !frozen || !buf.length) return;
  const lh = [hh * 0.38, hh * 0.38, hh * 0.24];
  const t1 = buf[buf.length - 1].t, X = (t) => ((t - (t1 - W)) / W) * w;
  const vis = buf.filter((s) => s.t > t1 - W);
  const pmax = Math.max(30, Math.ceil((Math.max(...vis.map((s) => s.paw)) + 2) / 10) * 10);
  const fmx = Math.max(60, Math.ceil(Math.max(...vis.map((s) => Math.abs(s.flow * 60))) / 30) * 30);
  const vmx = Math.max(500, Math.ceil(Math.max(...vis.map((s) => s.vol * 1000)) / 250) * 250);
  const peep = sim.set.peep;
  lane(g, 0, 0, w, lh[0], -5, pmax, col('--p'), `Paw (${U.p})`, vis.map((s) => [X(s.t), s.paw]), range(0, pmax, pmax > 60 ? 20 : 10), (t) => fp(t),
    $('#w-pmus').checked ? [{ color: col('--acc'), pts: vis.map((s) => [X(s.t), peep - s.pmus]) }] : []);
  // triangle at the start of every patient-triggered breath
  g.fillStyle = col('--acc');
  vis.forEach((sm, i) => {
    if (!sm.trig || (i && vis[i - 1].br === sm.br)) return;
    const x = X(sm.t), y = lh[0] - 4;
    g.beginPath(); g.moveTo(x, y - 11); g.lineTo(x - 6, y); g.lineTo(x + 6, y); g.closePath(); g.fill();
  });
  lane(g, 0, lh[0], w, lh[1], -fmx, fmx, col('--f'), 'Flow (L/min)', vis.map((s) => [X(s.t), s.flow * 60]), [-fmx / 2, 0, fmx / 2], (t) => t.toFixed(0));
  lane(g, 0, lh[0] + lh[1], w, lh[2], 0, vmx, col('--v'), 'Volume (mL)', vis.map((s) => [X(s.t), Math.max(0, s.vol * 1000)]), [0, vmx / 2], (t) => t.toFixed(0));
  const out = $('#w-cross');
  if (frozen && cross != null) { // crosshair: exact values at one instant across all traces
    const tt = t1 - W + cross * W, sm = vis.reduce((a, q) => (Math.abs(q.t - tt) < Math.abs(a.t - tt) ? q : a), vis[0]);
    g.strokeStyle = '#ffffff99'; g.lineWidth = 1; g.beginPath(); g.moveTo(X(sm.t), 0); g.lineTo(X(sm.t), hh); g.stroke();
    out.textContent = `t ${(sm.t - t1).toFixed(2)} s | Paw ${fp(sm.paw, 1)} ${U.p} | Flow ${(sm.flow * 60).toFixed(1)} L/min | Vol ${(sm.vol * 1000).toFixed(0)} mL${sm.pmus > 0.05 ? ` | Pmus ${fp(sm.pmus, 1)}` : ''}`;
  } else out.textContent = frozen ? 'Click the waveform to place a crosshair' : '';
}
function drawLoop(canvas, kind) {
  const [g, w, hh] = fit(canvas), m = 34;
  const fx = (s) => (kind === 'pv' ? s.paw : s.vol * 1000), fy = (s) => (kind === 'pv' ? s.vol * 1000 : s.flow * 60);
  const all = [...loops.cur, ...loops.prev, ...loops.ref];
  if (!all.length) return;
  let x0 = Math.min(0, ...all.map(fx)), x1 = Math.max(kind === 'pv' ? 30 : 500, ...all.map(fx));
  let y0 = Math.min(0, ...all.map(fy)), y1 = Math.max(kind === 'pv' ? 500 : 30, ...all.map(fy));
  const padx = (x1 - x0) * 0.04, pady = (y1 - y0) * 0.06; x0 -= padx; x1 += padx; y0 -= pady; y1 += pady;
  const X = (v) => m + ((v - x0) / (x1 - x0)) * (w - m - 6), Y = (v) => hh - 22 - ((v - y0) / (y1 - y0)) * (hh - 30);
  g.strokeStyle = '#1b2a3a'; g.fillStyle = '#7d8ea3'; g.font = '11px system-ui';
  g.beginPath(); g.moveTo(X(Math.max(x0, 0)), 0); g.lineTo(X(Math.max(x0, 0)), hh); g.moveTo(0, Y(0)); g.lineTo(w, Y(0)); g.stroke();
  g.fillText(kind === 'pv' ? `Paw (${U.p})` : 'Volume (mL)', w - 90, hh - 6); g.fillText(kind === 'pv' ? 'Volume (mL)' : 'Flow (L/min)', 4, 12);
  const line = (arr, color, dash, lw) => { if (arr.length < 2) return; g.strokeStyle = color; g.lineWidth = lw; g.setLineDash(dash); g.beginPath(); arr.forEach((s, i) => (i ? g.lineTo(X(fx(s)), Y(fy(s))) : g.moveTo(X(fx(s)), Y(fy(s))))); g.stroke(); g.setLineDash([]); };
  line(loops.ref, '#cc79a7', [4, 4], 1.5); line(loops.prev, '#55657a', [], 1.5); line(loops.cur, kind === 'pv' ? col('--p') : col('--f'), [], 2.5);
  if (kind === 'pv' && loops.prev.length > 4) { // dynamic compliance line: start to peak
    const p = loops.prev, pk = p.reduce((a, s) => (s.paw > a.paw ? s : a)), st0 = p[0];
    g.strokeStyle = '#ffffff55'; g.lineWidth = 1; g.beginPath(); g.moveTo(X(st0.paw), Y(0)); g.lineTo(X(pk.paw), Y(pk.vol * 1000)); g.stroke();
  }
}
function feedLoops(out) {
  for (const s of out) {
    if (s.br !== loops.br) { if (loops.cur.length > 5) loops.prev = loops.cur; loops.cur = []; loops.br = s.br; }
    if (loops.cur.length < 1500) loops.cur.push(s);
  }
}

// ---------- ABG ----------
function getABG() {
  if (abgBusy) return;
  abgBusy = true; const b = $('#b-abg'); b.disabled = true; b.textContent = 'Analyzing...';
  const a = sim.abg(); a.hr = sim.monitor().hr;
  setTimeout(() => { abgHist.unshift(a); showABG(); }, 3000);
  setTimeout(() => { abgBusy = false; b.disabled = false; b.textContent = 'Get ABG'; log('ABG sampled'); }, 6000);
}
function showABG() {
  const f = (v, lo, hi, d = 1) => `<td class="${v < lo ? 'lo' : v > hi ? 'hi' : ''}">${v.toFixed(d)}</td>`;
  const rows = [
    ['Sim time', (a) => `<td>${Math.floor(a.t / 60)}:${String(Math.floor(a.t % 60)).padStart(2, '0')}</td>`],
    ['pH', (a) => f(a.ph, 7.35, 7.45, 2)],
    [`PaCO2 (${U.g})`, (a) => (U.g === 'kPa' ? `<td class="${a.paco2 < 35 ? 'lo' : a.paco2 > 45 ? 'hi' : ''}">${fg(a.paco2)}</td>` : f(a.paco2, 35, 45, 0))],
    [`PaO2 (${U.g})`, (a) => (U.g === 'kPa' ? `<td>${fg(a.pao2)}</td>` : f(a.pao2, 80, 1e9, 0))],
    ['HCO3 (mmol/L)', (a) => f(a.hco3, 22, 26)], ['Base excess', (a) => f(a.be, -2, 2)],
    ['SaO2 (%)', (a) => f(a.sao2, 94, 101, 0)], ['Lactate (mmol/L)', (a) => f(a.lactate, 0, 2)],
    ['FiO2', (a) => `<td>${a.fio2.toFixed(2)}</td>`], ['P/F (mmHg)', (a) => f(a.pf, 300, 1e9, 0)],
    [`A-a gradient (${U.g})`, (a) => `<td>${fg(a.aa)}</td>`],
  ];
  $('#abg-body').innerHTML = `<table class="abg"><thead><tr><th></th>${abgHist.map((_, i) => `<th>${i ? '#' + (abgHist.length - i) : 'Latest'}</th>`).join('')}</tr></thead><tbody>` +
    rows.map(([n, fn]) => `<tr><td>${n}</td>${abgHist.map(fn).join('')}</tr>`).join('') + `</tbody></table><p class="muted">Blue = below range, orange = above range. The CO2 store is large: PaCO2 takes many simulated minutes to follow a ventilator change.</p>`;
  $('#abg-dlg').showModal();
}

// ---------- scenarios ----------
const stars = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
function renderScnList() {
  const box = $('#tab-scn'); box.replaceChildren(
    h('p', { class: 'muted' }, `Ten troubleshooting cases. Streak: ${prog.streak}. Draft clinical content: not yet reviewed by a clinician.`),
    h('div', { class: 'cards' }, ...SCENARIOS.map((sc) => h('button', { class: 'card', onclick: () => renderScnDetail(sc) },
      h('h3', {}, `${sc.id}. ${sc.title}`), h('div', { class: 'stars' }, stars(prog.done[sc.id]?.stars || 0)),
      h('div', { class: 'muted' }, `Difficulty ${'●'.repeat(sc.difficulty)}${'○'.repeat(3 - sc.difficulty)}`)))));
}
function hintBlock(sc) {
  const s = scn && scn.sc === sc ? scn : null;
  const box = h('div', { class: 'panel' }, h('h3', {}, 'Hints'));
  const list = h('div'); box.append(list);
  const costs = [5, 10, 15];
  const draw = () => {
    list.replaceChildren(...sc.hints.slice(0, s ? s.hints : 0).map((t, i) => h('p', {}, `Hint ${i + 1}: ${t}`)));
    btn.textContent = !s ? 'Start the simulation to use hints' : s.hints >= 3 ? 'No more hints' : `Reveal hint ${s.hints + 1} (costs ${costs[s.hints]} points)`;
    btn.disabled = !s || s.hints >= 3;
  };
  const btn = h('button', { onclick: () => { s.cost += costs[s.hints]; s.hints++; draw(); renderScbar(); } });
  box.append(btn); draw();
  return box;
}
const pending = {}; // answers given before the simulation is started
const sess = (sc) => (scn && scn.sc === sc ? scn : (pending[sc.id] ??= { answered: {}, wrong: 0 }));
function renderScnDetail(sc) {
  const box = $('#tab-scn');
  const qs = sc.questions.map((q, qi) => {
    const wrap = h('div', { class: 'panel' }, h('b', {}, `Q${qi + 1}. ${q.q}`));
    const whys = h('div');
    q.options.forEach((o) => {
      const b = h('button', { class: 'opt', onclick: () => {
        const ses = sess(sc);
        if (ses.answered[qi] == null) { ses.answered[qi] = o; if (!o.ok) ses.wrong++; }
        b.classList.add(o.ok ? 'right' : 'wrong');
        whys.append(h('p', { class: 'why' }, `${o.ok ? 'Correct. ' : 'Not quite. '}${o.why}`));
        renderScbar();
      } }, o.t);
      wrap.append(b);
    });
    wrap.append(whys); return wrap;
  });
  box.replaceChildren(h('div', { class: 'detail' },
    h('button', { onclick: renderScnList }, '\u2190 All cases'),
    h('h2', {}, `${sc.id}. ${sc.title}`),
    h('div', { class: 'panel' }, h('p', {}, sc.vignette), h('div', { class: 'btns' }, h('button', { class: 'primary', onclick: () => startScenario(sc) }, 'Start simulation'))),
    ...qs, hintBlock(sc),
    h('div', { class: 'panel', id: 'teach' }, h('h3', {}, 'Teaching points'), h('p', { class: 'muted' }, 'Shown after you finish the case.'))));
  if (prog.done[sc.id]) revealTeach(sc);
}
function revealTeach(sc) {
  const t = $('#teach'); if (!t) return;
  t.replaceChildren(h('h3', {}, 'Teaching points'), h('ul', {}, ...sc.teach.map((x) => h('li', {}, x))),
    sc.refs.length ? h('p', { class: 'muted' }, 'References (verify before citing): ' + sc.refs.join(' | ')) : '');
}
const newSession = (sc) => ({ sc, hints: 0, cost: 0, wrong: 0, answered: {}, fired: new Set(), done: false });
function startScenario(sc) {
  const keep = scn && scn.sc === sc ? scn : pending[sc.id];
  scn = newSession(sc);
  if (keep) { scn.answered = keep.answered; scn.wrong = keep.wrong; scn.hints = keep.hints || 0; scn.cost = keep.cost || 0; }
  loadScenario(sc, sim); sim.rec = true; speed = 1; clearTraces();
  showTab('sim'); buildControls(); renderScbar();
}
function renderScbar() {
  const bar = $('#scbar'); bar.hidden = !scn; if (!scn) return;
  const sc = scn.sc, res = evalGoals(sc.goals, sim), ok = res.every((g) => g.ok);
  const unanswered = sc.questions.length - Object.keys(scn.answered).length;
  const costs = [5, 10, 15];
  bar.replaceChildren(
    h('div', {}, h('b', {}, `Case ${sc.id}: ${sc.title}`), ' ', h('span', { class: 'muted' }, sc.vignette)),
    h('div', { class: 'goals', id: 'goals' }, ...res.map((g) => h('span', { class: 'goal ' + (g.ok ? 'ok' : '') }, `${g.ok ? '✓' : '○'} ${g.label}: ${typeof g.val === 'number' ? g.val.toFixed(g.k === 'ph' ? 2 : 1) : g.val}`))),
    h('div', { class: 'btns' },
      ...(sc.actions || []).map((a) => h('button', { onclick: () => { sim.patch(a.patch); flash(a.label + ' done'); } }, a.label)),
      h('button', { disabled: scn.hints >= 3, onclick: () => { scn.cost += costs[scn.hints]; scn.hints++; renderScbar(); } }, scn.hints >= 3 ? 'No more hints' : `Hint (${costs[scn.hints]} pts)`),
      h('button', { class: 'primary', disabled: !ok || scn.done, onclick: finishScenario }, scn.done ? 'Completed' : 'Finish case'),
      h('button', { onclick: () => renderScnDetailTab(sc) }, 'Questions'),
      h('button', { onclick: () => { scn = null; $('#scbar').hidden = true; loadFree(sim.key); } }, 'Leave case')),
    ...sc.hints.slice(0, scn.hints).map((t, i) => h('p', {}, `Hint ${i + 1}: ${t}`)),
    unanswered && !scn.done ? h('p', { class: 'muted' }, `${unanswered} question(s) unanswered (10 points each).`) : '');
}
function renderScnDetailTab(sc) { showTab('scn'); renderScnDetail(sc); }
function finishScenario() {
  const sc = scn.sc, unanswered = sc.questions.length - Object.keys(scn.answered).length;
  const score = Math.max(0, 100 - scn.cost - 10 * scn.wrong - 10 * unanswered);
  const st = score >= 85 ? 3 : score >= 65 ? 2 : 1;
  const prev = prog.done[sc.id];
  prog.done[sc.id] = { stars: Math.max(st, prev?.stars || 0), score: Math.max(score, prev?.score || 0) };
  prog.streak = st >= 2 ? prog.streak + 1 : 0; store.set('vsim-prog', prog);
  scn.done = true; renderScbar();
  $('#scbar').append(h('p', {}, h('b', {}, `Score ${score} ${stars(st)}`), ` | streak ${prog.streak}. Hints cost ${scn.cost}, wrong answers ${scn.wrong}, unanswered ${unanswered}.`));
  showTab('scn'); renderScnDetail(sc); revealTeach(sc);
}
function fireEvents() {
  if (!scn) return;
  (scn.sc.events || []).forEach((e, i) => { if (!scn.fired.has(i) && sim.t >= e.t) { scn.fired.add(i); sim.patch(e.patch); flash(e.say || 'Something changed'); } });
}

// ---------- guided tour ----------
const TOUR = [
  { sel: '#patientbar', pos: 'below', title: 'Start with the patient', text: 'Choose the lung type (normal, COPD, asthma, ARDS), sex, height and weight. Tidal volume is set from <b>predicted body weight</b>, shown here with the usual 6-8 mL/kg range, not from actual weight.' },
  { sel: '#lcol', pos: 'right', title: 'The numbers that matter', text: 'Peak pressure, minute volume, exhaled volume, total rate, expiratory time constant and SpO2. The small numbers are your set values and limits. <b>Hover any number</b> for what it means.' },
  { sel: '.wavewrap', pos: 'below', title: 'Waveforms', text: 'Airway pressure, flow and volume against time. A pink triangle marks each breath the <b>patient</b> triggered. Tick <b>Show Pmus</b> to see the patient\'s own effort. <b>Freeze</b>, then click the trace to read exact values.' },
  { el: () => $('#lung').closest('.pane'), pos: 'above', title: 'The lungs', text: 'Size follows volume (exaggerated), colour follows stress (blue low, red high), the airway narrows with resistance, and the line below is the diaphragm. A collapsed lung shows a pneumothorax.' },
  { el: () => $('#loop-pv').closest('.pane'), pos: 'above', title: 'Loops', text: 'The pressure-volume loop (a flatter loop means stiffer lungs) and the flow-volume loop (flow that does not return to zero means air trapping). <b>Save ref</b> keeps a loop so you can compare after a change.' },
  { sel: '#rcol', pos: 'left', title: 'Ventilator settings', text: '<b>Modes</b> chooses how breaths are given. The round dials show the main settings; click one or press <b>Controls</b> to change everything. Change one thing at a time and watch what moves.' },
  { sel: '.qb', pos: 'left', title: 'Holds and blood gas', text: '<b>Insp hold</b> (volume control) reads plateau pressure. <b>Exp hold</b> reads total PEEP and auto-PEEP. <b>Get ABG</b> samples a blood gas. CO2 takes minutes to change, so use the time speed in Tools.' },
  { sel: '.bbar', pos: 'above', title: 'More tools', text: '<b>Measurements</b>: compliance, resistance and driving pressure after holds. <b>Tools</b>: time speed and share links. <b>Examples</b>: common ventilator problems to learn from. <b>Effort & tube</b>: how the patient breathes.' },
  { sel: 'header nav', pos: 'below', title: 'Learn and practise', text: '<b>Learn</b> explains every setting, the targets and the waveforms. <b>Scenarios</b> has 10 cases with hints and scoring. <b>About</b> has how to cite this tool and how to send feedback.' },
];
function runTour() {
  showTab('sim'); openDrawer('');
  setTimeout(() => startTour(TOUR, () => { try { localStorage.setItem('vsim-tour', '1'); } catch { /* */ } }), 150);
}

// ---------- layout: the simulator fits the window with no page scroll ----------
function layout() {
  const t = $('#tab-sim'); if (t.hidden) return;
  const top = t.getBoundingClientRect().top + window.scrollY;
  t.style.height = Math.max(520, window.innerHeight - top - 8) + 'px';
  const sh = $('.screen').getBoundingClientRect().height; t.style.setProperty('--sh', sh + 'px'); // sizes dials and numbers to the room available
}
window.addEventListener('resize', layout);

// ---------- patient bar and first-run setup ----------
const LUNGS = {
  normal: ['Normal lungs', 'Healthy compliance and resistance. Best for learning the basics.'],
  copd: ['COPD', 'High resistance, air trapping and auto-PEEP if breaths are too fast. Chronic CO2 retention.'],
  asthma: ['Severe asthma', 'Very high resistance and flow limitation. Easy to trap air and drop the blood pressure.'],
  ards: ['ARDS', 'Stiff lungs, shunt and low oxygen. Practise lung protection, PEEP and prone.'],
};
function syncBar() {
  $('#pb-lung').value = sim.key; $('#pb-sex').value = sim.pt.sex; $('#pb-h').value = sim.pt.height; $('#pb-w').value = sim.pt.weight; $('#pb-ett').value = sim.pt.ett;
  $('#pb-pbw').textContent = `PBW ${sim.pbw.toFixed(1)} kg (6-8 mL/kg = ${Math.round(sim.pbw * 6)}-${Math.round(sim.pbw * 8)} mL)`;
}
function bindBar() {
  $('#pb-lung').onchange = (e) => loadFree(e.target.value);
  $('#pb-sex').onchange = (e) => { sim.patch({ sex: e.target.value }); syncBar(); };
  $('#pb-h').onchange = (e) => { sim.patch({ height: Math.min(210, Math.max(130, +e.target.value || 170)) }); syncBar(); };
  $('#pb-w').onchange = (e) => { sim.patch({ weight: Math.min(200, Math.max(30, +e.target.value || 70)) }); syncBar(); };
  $('#pb-ett').onchange = (e) => sim.patch({ ett: +e.target.value });
  $('#pb-new').onclick = () => openSetup();
}
let suLung = 'normal';
function openSetup() {
  const dlg = $('#setup-dlg'), cards = $('#lungcards');
  cards.replaceChildren(...Object.entries(LUNGS).map(([k, [t, d]]) => h('button', { class: 'lungcard', role: 'radio', 'aria-checked': String(k === suLung), 'data-k': k, onclick: () => { suLung = k; cards.querySelectorAll('.lungcard').forEach((c) => c.setAttribute('aria-checked', String(c.dataset.k === k))); suDefaults(); } }, h('b', {}, t), h('span', {}, d))));
  suDefaults(); speed = 0; dlg.showModal();
}
function suDefaults() {
  const d = { normal: ['M', 175, 75], copd: ['M', 165, 65], asthma: ['F', 165, 65], ards: ['F', 165, 70] }[suLung];
  $('#su-sex').value = d[0]; $('#su-h').value = d[1]; $('#su-w').value = d[2];
  $('#su-note').textContent = `Starting settings follow the lung type (VT, rate, PEEP, FiO2). ${LUNGS[suLung][1]}`;
}
function finishSetup(thenLearn) {
  const mods = { sex: $('#su-sex').value, height: Math.min(210, Math.max(130, +$('#su-h').value || 170)), weight: Math.min(200, Math.max(30, +$('#su-w').value || 70)) };
  const pbwNow = (mods.sex === 'F' ? 45.5 : 50) + 0.91 * (mods.height - 152.4);
  const set = { ...FREE[suLung], mode: $('#su-mode').value };
  if (suLung !== 'ards') set.vt = Math.round((pbwNow * 7) / 10) * 10; // about 7 mL/kg predicted body weight
  else set.vt = Math.round((pbwNow * 6) / 10) * 10;
  $('#setup-dlg').close(); loadCustom(suLung, mods, set);
  try { localStorage.setItem('vsim-setup-done', '1'); } catch { /* private mode */ }
  speed = 1; showTab(thenLearn ? 'learn' : 'sim');
  if (!thenLearn) { maybeTip(); let t = false; try { t = localStorage.getItem('vsim-tour') === '1'; } catch { /* */ } if (!t) setTimeout(runTour, 400); }
}
function maybeTip() { let seen = false; try { seen = localStorage.getItem('vsim-tip') === '1'; } catch { /* */ } $('#tip').hidden = seen || document.body.classList.contains('learner'); setTimeout(layout, 0); }

// ---------- tabs ----------
function showTab(t) {
  document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === t));
  for (const id of ['sim', 'scn', 'learn', 'model', 'about']) $('#tab-' + id).hidden = id !== t;
  if (t === 'about' && !$('#tab-about').children.length) renderAbout($('#tab-about'));
  layout();
  if (t === 'scn' && !$('#tab-scn').children.length) renderScnList();
  if (t === 'learn' && !$('#tab-learn').children.length) renderLearn($('#tab-learn'));
}

// ---------- main loop ----------
let last = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(0.5, (now - last) / 1000); last = now; // large cap so slow frames still keep real-time pace
  if (!$('#tab-sim').hidden || scn) {
    if (speed > 0) {
      let rem = dt * speed;
      while (rem > 0) { const c = Math.min(rem, 1); sim.run(c); rem -= c; fireEvents(); }
    }
    const out = sim.out.splice(0);
    feedLoops(out);
    if (speed <= 5) { wbuf.push(...out); const t1 = sim.t; while (wbuf.length && wbuf[0].t < t1 - 32) wbuf.shift(); }
    if (!$('#tab-sim').hidden) { drawWave(); drawLoop($('#loop-pv'), 'pv'); drawLoop($('#loop-fv'), 'fv'); drawLung($('#lung'), sim); }
    acc += dt;
    if (acc > 0.25) { acc = 0; tick(); }
  }
  requestAnimationFrame(frame);
}
function tick() {
  if ($('#tab-sim').hidden) return;
  const mon = sim.monitor(), al = computeAlarms(mon);
  const keys = new Set([...al.keys()]);
  renderMonitor(mon, keys);
  for (const k of keys) if (!prevAlarms.has(k)) log('Alarm: ' + al.get(k));
  prevAlarms = keys;
  $('#alarms').replaceChildren(...[...al.values()].map((msg) => h('span', { class: 'al' }, msg)));
  $('#d-alarms').replaceChildren(al.size ? h('div', { class: 'alarms' }, ...[...al.values()].map((m) => h('span', {}, m))) : h('p', { class: 'muted' }, 'No active alarms.'), h('p', { class: 'muted' }, 'Limits: peak pressure 40, SpO2 90, MAP 60, HR 130, rate 35, EtCO2 25-60. History is in Events.'));
  renderMeasured();
  const c = $('#clock'); if (c) c.textContent = `Simulated time ${mmss(sim.t)}`;
  if (scn) { const el = $('#goals'); if (el) { const res = evalGoals(scn.sc.goals, sim); [...el.children].forEach((n, i) => { const g = res[i]; n.className = 'goal ' + (g.ok ? 'ok' : ''); n.textContent = `${g.ok ? '✓' : '○'} ${g.label}: ${typeof g.val === 'number' ? g.val.toFixed(g.k === 'ph' ? 2 : 1) : g.val}`; }); const fin = [...$('#scbar').querySelectorAll('button')].find((b) => /Finish|Completed/.test(b.textContent)); if (fin && !scn.done) fin.disabled = !res.every((g) => g.ok); } }
}

// ---------- boot ----------
document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
for (const [id, k] of [['u-p', 'p'], ['u-g', 'g'], ['u-t', 't']]) {
  const s = $('#' + id); s.value = U[k];
  s.addEventListener('change', () => { U[k] = s.value; store.set('vsim-units', U); buildControls(); showABGIfOpen(); });
}
const showABGIfOpen = () => { if ($('#abg-dlg').open) showABG(); };
$('#w-freeze').onclick = (e) => { frozen = !frozen; frozenBuf = wbuf.slice(); cross = null; e.target.textContent = frozen ? 'Resume' : 'Freeze'; };
$('#w-win').oninput = (e) => { winSec = +e.target.value; };
$('#w-full').onclick = () => { const el = $('.wavewrap'); if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen?.(); };
$('#wave').addEventListener('click', (e) => { if (frozen) cross = e.offsetX / e.target.clientWidth; });
$('#loop-save').onclick = () => { loops.ref = (loops.prev.length ? loops.prev : loops.cur).slice(); };
$('#loop-clear').onclick = () => { loops.ref = []; };
$('#su-go').onclick = () => finishSetup(false);
$('#su-learn').onclick = () => finishSetup(true);
$('#setup-dlg').addEventListener('cancel', () => { speed = 1; try { localStorage.setItem('vsim-setup-done', '1'); } catch { /* */ } });
$('#tip-x').onclick = () => { $('#tip').hidden = true; try { localStorage.setItem('vsim-tip', '1'); } catch { /* */ } layout(); };
$('#tip-tour').onclick = runTour;
$('#pb-tour').onclick = runTour;
$('#tip-learn').onclick = () => showTab('learn');
bindBar();
$('#r-modes').onclick = () => openDrawer('modes');
$('#r-controls').onclick = () => openDrawer('controls');
$('#r-alarms').onclick = () => openDrawer('alarms');
$('#dclose').onclick = () => openDrawer('');
document.querySelectorAll('.bbar button').forEach((b) => b.addEventListener('click', () => openDrawer(b.dataset.d)));
$('#b-ih').onclick = () => { if (sim.set.mode === 'VC') { sim.s.holdReq = true; flash('Inspiratory hold at the next breath'); } else flash('Inspiratory hold needs volume control'); };
$('#b-eh').onclick = () => { sim.s.ehReq = true; flash('Expiratory hold at the end of the next exhalation'); };
$('#b-abg').onclick = getABG;
$('#physics').onchange = (e) => { $('#phys').hidden = !e.target.checked; if (e.target.checked) renderPhysics(); };
const QS = new URLSearchParams(location.search); const QS_EARLY = QS;
if (QS.get('learner') === '1') document.body.classList.add('learner');
if (QS.get('hidep') === '1') document.body.classList.add('hidep');
if (INSTRUCTOR) { $('#inst-note').hidden = false; $('#truth').hidden = false; }
openDrawer('');
$('#tab-model').innerHTML = MODEL_HTML;
const hf = $('#hdr-fb'); hf.href = CONFIG.feedbackUrl || mailto('Vent Sim feedback / bug report'); if (!CONFIG.feedbackUrl) hf.removeAttribute('target');
if (CONFIG.cfToken) { // Cloudflare Web Analytics: cookieless page-view and unique-visitor counts
  const sc = document.createElement('script'); sc.defer = true; sc.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  sc.dataset.cfBeacon = JSON.stringify({ token: CONFIG.cfToken }); document.head.append(sc);
}
if (location.hash === '#about') showTab('about');
{ // first visit: ask for the patient and settings (skipped for shared links and learner links)
  let done = false; try { done = localStorage.getItem('vsim-setup-done') === '1'; } catch { /* */ }
  const shared = /^#s=/.test(location.hash) || QS_EARLY.get('learner') === '1';
  if (!done && !shared && location.hash !== '#about') openSetup(); else maybeTip();
}
requestAnimationFrame(layout);
sim.rec = true;
buildControls();
requestAnimationFrame(frame);
loadFromHash();
window.addEventListener('hashchange', loadFromHash);
window.__vent = { sim, get scn() { return scn; } }; // handy for debugging in the console
