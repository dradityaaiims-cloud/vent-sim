import { Sim, DEFAULTS, ETT, pbw } from './engine/engine.js';
import { SCENARIOS, evalGoals, loadScenario } from './scenarios.js';
import { MODEL_HTML } from './model.js';

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
};
const sim = new Sim('normal', {}, { ...FREE.normal });
sim.settle();
let speed = 1, scn = null, wbuf = [], loops = { cur: [], prev: [], ref: [], br: -1 };
let abgHist = [], abgBusy = false;
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
];
const getPt = (k) => (k.startsWith('drive.') ? sim.pt.drive[k.slice(6)] : sim.pt[k]);
const patchPt = (k, v) => sim.patch(k.startsWith('drive.') ? { drive: { [k.slice(6)]: v } } : { [k]: v });

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

function buildControls() {
  const box = $('#controls'); box.replaceChildren();
  const rows = [];
  if (!scn) {
    box.append(h('h2', {}, 'Patient'));
    const sel = h('select', { 'aria-label': 'Lung type', onchange: (e) => loadFree(e.target.value) },
      ...['normal', 'copd', 'ards'].map((k) => h('option', { value: k, selected: k === sim.key }, { normal: 'Normal lungs', copd: 'COPD', ards: 'ARDS (moderate)' }[k])));
    box.append(h('div', { class: 'row' }, h('label', {}, 'Lung type'), h('span'), sel));
    const sex = h('select', { 'aria-label': 'Sex', onchange: (e) => { sim.patch({ sex: e.target.value }); pbwOut(); } }, h('option', { value: 'M', selected: sim.pt.sex === 'M' }, 'Male'), h('option', { value: 'F', selected: sim.pt.sex === 'F' }, 'Female'));
    const ht = h('input', { type: 'number', min: 130, max: 210, value: sim.pt.height, 'aria-label': 'Height cm', onchange: (e) => { sim.patch({ height: +e.target.value }); pbwOut(); } });
    const wt = h('input', { type: 'number', min: 30, max: 200, value: sim.pt.weight, 'aria-label': 'Weight kg', onchange: (e) => sim.patch({ weight: +e.target.value }) });
    const pb = h('output');
    function pbwOut() { pb.textContent = `PBW ${sim.pbw.toFixed(1)} kg`; }
    pbwOut();
    box.append(h('div', { class: 'row' }, h('label', {}, 'Sex / height cm / weight kg'), pb, h('div', { class: 'btns', style: 'grid-column:1/-1;margin:0' }, sex, ht, wt)));
    const ett = h('select', { 'aria-label': 'ETT size', onchange: (e) => sim.patch({ ett: +e.target.value }) }, ...Object.keys(ETT).map((k) => h('option', { value: k, selected: +k === sim.pt.ett }, `ETT ${k} mm`)));
    box.append(h('div', { class: 'row' }, h('label', {}, 'Endotracheal tube'), h('span'), ett));
    for (const c of PT) { const r = slider(c, () => getPt(c.k), (v) => patchPt(c.k, v)); rows.push(r); box.append(r); }
  } else box.append(h('p', { class: 'muted' }, 'Scenario in progress: the patient is fixed. Adjust the ventilator and use the case actions above.'));
  box.append(h('h2', {}, 'Ventilator'));
  for (const c of CTRL) {
    let r;
    if (c.type === 'select') {
      const s = h('select', { 'aria-label': c.label, onchange: (e) => { sim.configure({ [c.k]: c.num ? +e.target.value : e.target.value }); refreshControls(); } },
        ...c.opts.map(([v, t]) => h('option', { value: v }, t)));
      r = h('div', { class: 'row', 'data-k': c.k, 'data-modes': c.modes || '' }, h('label', {}, c.label), h('span'), s);
      r.refresh = () => { s.value = sim.set[c.k]; };
    } else r = slider(c, () => sim.set[c.k], (v) => sim.configure({ [c.k]: v }));
    rows.push(r); box.append(r);
  }
  box.append(h('div', { class: 'btns' },
    h('button', { id: 'b-ih', title: 'Volume control only. Pause at end of inspiration; read plateau.', onclick: () => { if (sim.set.mode === 'VC') { sim.s.holdReq = true; flash('Inspiratory hold at the next breath'); } else flash('Inspiratory hold needs volume control'); } }, 'Insp hold'),
    h('button', { id: 'b-eh', title: 'Closes the circuit at end of expiration to read total PEEP', onclick: () => { sim.s.ehReq = true; flash('Expiratory hold at the end of the next exhalation'); } }, 'Exp hold'),
    h('button', { id: 'b-abg', class: 'primary', onclick: getABG }, 'Get ABG')));
  box.append(h('div', { class: 'btns', role: 'group', 'aria-label': 'Time speed' },
    ...[[0, 'Pause'], [1, '1x'], [5, '5x'], [20, '20x'], [60, '60x']].map(([v, t]) => h('button', { 'data-speed': v, class: v === speed ? 'on' : '', onclick: () => setSpeed(v) }, t)),
    h('button', { onclick: resetAll }, 'Reset')));
  box.append(h('p', { id: 'clock', class: 'muted' }));
  box._rows = rows;
  refreshControls();
}
function refreshControls() {
  for (const r of $('#controls')._rows || []) {
    r.refresh();
    const m = r.dataset.modes; r.hidden = !!m && !m.split(' ').includes(sim.set.mode);
  }
  const ih = $('#b-ih'); if (ih) ih.disabled = sim.set.mode !== 'VC';
}
function setSpeed(v) {
  speed = v;
  document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', +b.dataset.speed === v));
  if (v > 5) wbuf = [];
}
function flash(msg) { const a = $('#alarms'); const t = h('span', { style: 'background:#10304a;border-color:#56b4e9;color:#cfe8ff' }, msg); a.prepend(t); setTimeout(() => t.remove(), 2500); }

function loadFree(key) {
  sim.load(key, {}, { ...DEFAULTS, ...FREE[key] }); sim.settle(); sim.rec = true;
  clearTraces(); buildControls();
}
function clearTraces() { wbuf = []; loops = { cur: [], prev: [], ref: loops.ref, br: -1 }; sim.out.length = 0; abgHist = []; }
function resetAll() { if (scn) startScenario(scn.sc); else loadFree(sim.key); }

// ---------- monitor ----------
function renderMonitor(mon, alarms) {
  const t = (cls, name, val, sub, al) => h('div', { class: `tile ${cls} ${al ? 'alarm' : ''}` }, h('div', { class: 'n' }, name), h('div', { class: 'v' }, val), h('div', { class: 's' }, sub || ' '));
  $('#monitor').replaceChildren(
    t('hr', 'HR', n0(mon.hr), 'bpm', alarms.has('hr')),
    t('bp', 'BP', `${n0(mon.sbp)}/${n0(mon.dbp)}`, `MAP ${n0(mon.map)}`, alarms.has('map')),
    t('sp', 'SpO2', n0(mon.spo2), '%', alarms.has('spo2')),
    t('rr', 'RR', n0(mon.rr), `/min total${sim.set.mode === 'PSV' ? '' : ' (set ' + sim.set.rr + ')'}`, alarms.has('rr')),
    t('co', 'EtCO2', fg(mon.etco2), U.g, alarms.has('co2')),
    t('tp', 'Temp', ft(mon.temp), `°${U.t}`),
  );
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
  const vt = l ? l.vti * 1000 : NaN;
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
const css = getComputedStyle(document.documentElement);
const col = (n) => css.getPropertyValue(n).trim();
function fit(c) {
  const d = window.devicePixelRatio || 1, w = c.clientWidth, hh = c.clientHeight;
  if (c.width !== Math.round(w * d) || c.height !== Math.round(hh * d)) { c.width = Math.round(w * d); c.height = Math.round(hh * d); }
  const g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, hh);
  return [g, w, hh];
}
function lane(g, x0, y0, w, hh, ymin, ymax, color, label, pts, ticks, fmt) {
  g.save(); g.beginPath(); g.rect(x0, y0, w, hh); g.clip();
  g.strokeStyle = '#1b2a3a'; g.fillStyle = '#7d8ea3'; g.font = '11px system-ui'; g.lineWidth = 1;
  const Y = (v) => y0 + hh - ((v - ymin) / (ymax - ymin)) * hh;
  for (const t of ticks) { g.beginPath(); g.moveTo(x0, Y(t)); g.lineTo(x0 + w, Y(t)); g.stroke(); g.fillText(fmt(t), x0 + 4, Y(t) - 2); }
  g.fillStyle = color; g.fillText(label, x0 + 40, y0 + 12);
  g.strokeStyle = color; g.lineWidth = 2; g.beginPath();
  pts.forEach(([x, v], i) => (i ? g.lineTo(x, Y(v)) : g.moveTo(x, Y(v)))); g.stroke(); g.restore();
}
function drawWave() {
  const c = $('#wave'), [g, w, hh] = fit(c), W = 12, laneH = hh / 3;
  $('#ffnote').hidden = speed <= 5;
  if (speed > 5 || !wbuf.length) return;
  const t1 = wbuf[wbuf.length - 1].t, X = (t) => ((t - (t1 - W)) / W) * w;
  const vis = wbuf.filter((s) => s.t > t1 - W);
  const pmax = Math.max(30, Math.ceil((Math.max(...vis.map((s) => s.paw)) + 2) / 10) * 10);
  const fmx = Math.max(60, Math.ceil(Math.max(...vis.map((s) => Math.abs(s.flow * 60))) / 30) * 30);
  const vmx = Math.max(500, Math.ceil(Math.max(...vis.map((s) => s.vol * 1000)) / 250) * 250);
  const step = pmax > 60 ? 20 : 10;
  lane(g, 0, 0, w, laneH, -5, pmax, col('--p'), `Paw (${U.p})`, vis.map((s) => [X(s.t), s.paw]), range(0, pmax, step), (t) => fp(t));
  lane(g, 0, laneH, w, laneH, -fmx, fmx, col('--f'), 'Flow (L/min)', vis.map((s) => [X(s.t), s.flow * 60]), [-fmx / 2, 0, fmx / 2], (t) => t.toFixed(0));
  lane(g, 0, 2 * laneH, w, laneH, 0, vmx, col('--v'), 'Volume (mL)', vis.map((s) => [X(s.t), Math.max(0, s.vol * 1000)]), range(0, vmx, vmx / 2), (t) => t.toFixed(0));
}
const range = (a, b, s) => { const r = []; for (let x = a; x <= b + 1e-9; x += s) r.push(x); return r; };
function drawLoop() {
  const [g, w, hh] = fit($('#loop')), kind = $('#loop-kind').value, m = 34;
  const fx = (s) => (kind === 'pv' ? s.paw : s.vol * 1000), fy = (s) => (kind === 'pv' ? s.vol * 1000 : s.flow * 60);
  const all = [...loops.cur, ...loops.prev, ...loops.ref];
  if (!all.length) return;
  let x0 = Math.min(0, ...all.map(fx)), x1 = Math.max(kind === 'pv' ? 30 : 500, ...all.map(fx));
  let y0 = Math.min(0, ...all.map(fy)), y1 = Math.max(kind === 'pv' ? 500 : 30, ...all.map(fy));
  const padx = (x1 - x0) * 0.04, pady = (y1 - y0) * 0.06; x0 -= padx; x1 += padx; y0 -= pady; y1 += pady;
  const X = (v) => m + ((v - x0) / (x1 - x0)) * (w - m - 6), Y = (v) => hh - 22 - ((v - y0) / (y1 - y0)) * (hh - 30);
  g.strokeStyle = '#1b2a3a'; g.fillStyle = '#7d8ea3'; g.font = '11px system-ui';
  g.beginPath(); g.moveTo(X(Math.max(x0, 0)), 0); g.lineTo(X(Math.max(x0, 0)), hh); g.moveTo(0, Y(0)); g.lineTo(w, Y(0)); g.stroke();
  g.fillText(kind === 'pv' ? `Paw (${U.p})` : 'Volume (mL)', w - 90, hh - 6); g.fillText(kind === 'pv' ? 'mL' : 'L/min', 4, 12);
  const line = (arr, color, dash, lw) => { if (arr.length < 2) return; g.strokeStyle = color; g.lineWidth = lw; g.setLineDash(dash); g.beginPath(); arr.forEach((s, i) => (i ? g.lineTo(X(fx(s)), Y(fy(s))) : g.moveTo(X(fx(s)), Y(fy(s))))); g.stroke(); g.setLineDash([]); };
  line(loops.ref, '#cc79a7', [4, 4], 1.5); line(loops.prev, '#55657a', [], 1.5); line(loops.cur, kind === 'pv' ? col('--p') : col('--f'), [], 2.5);
  if (kind === 'pv' && loops.prev.length > 4) { // dynamic compliance line: end-expiratory point to peak
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
  setTimeout(() => { abgBusy = false; b.disabled = false; b.textContent = 'Get ABG'; }, 6000);
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

// ---------- tabs ----------
function showTab(t) {
  document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === t));
  for (const id of ['sim', 'scn', 'model']) $('#tab-' + id).hidden = id !== t;
  if (t === 'scn' && !$('#tab-scn').children.length) renderScnList();
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
    if (speed <= 5) { wbuf.push(...out); const t1 = sim.t; while (wbuf.length && wbuf[0].t < t1 - 14) wbuf.shift(); }
    if (!$('#tab-sim').hidden) { drawWave(); drawLoop(); }
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
  $('#alarms').querySelectorAll('.al').forEach((n) => n.remove());
  for (const msg of al.values()) $('#alarms').append(h('span', { class: 'al' }, msg));
  renderMeasured();
  const c = $('#clock'); if (c) c.textContent = `Simulated time ${Math.floor(sim.t / 60)}:${String(Math.floor(sim.t % 60)).padStart(2, '0')}`;
  if (scn) { const el = $('#goals'); if (el) { const res = evalGoals(scn.sc.goals, sim); [...el.children].forEach((n, i) => { const g = res[i]; n.className = 'goal ' + (g.ok ? 'ok' : ''); n.textContent = `${g.ok ? '✓' : '○'} ${g.label}: ${typeof g.val === 'number' ? g.val.toFixed(g.k === 'ph' ? 2 : 1) : g.val}`; }); const fin = [...$('#scbar').querySelectorAll('button')].find((b) => /Finish|Completed/.test(b.textContent)); if (fin && !scn.done) fin.disabled = !res.every((g) => g.ok); } }
}

// ---------- boot ----------
document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
for (const [id, k] of [['u-p', 'p'], ['u-g', 'g'], ['u-t', 't']]) {
  const s = $('#' + id); s.value = U[k];
  s.addEventListener('change', () => { U[k] = s.value; store.set('vsim-units', U); buildControls(); showABGIfOpen(); });
}
const showABGIfOpen = () => { if ($('#abg-dlg').open) showABG(); };
$('#loop-save').onclick = () => { loops.ref = (loops.prev.length ? loops.prev : loops.cur).slice(); };
$('#loop-clear').onclick = () => { loops.ref = []; };
$('#physics').onchange = (e) => { $('#phys').hidden = !e.target.checked; if (e.target.checked) renderPhysics(); };
if (INSTRUCTOR) { $('#inst-note').hidden = false; $('#truth').hidden = false; }
$('#tab-model').innerHTML = MODEL_HTML;
sim.rec = true;
buildControls();
requestAnimationFrame(frame);
window.__vent = { sim, get scn() { return scn; } }; // handy for debugging in the console
