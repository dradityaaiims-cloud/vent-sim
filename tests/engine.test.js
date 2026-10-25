import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim, ETT, pbw } from '../js/engine/engine.js';
import { alveolarPO2, phHH, hco3HH, paO2FromShunt, satO2 } from '../js/engine/gas.js';

const quiet = (s) => { s.rec = false; return s; };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} got ${a}, want ${b} +/- ${tol}`);

test('tube drop: 7 mm ETT at 1 L/s is about 8.1 cmH2O (van Diepen Table 3)', () => {
  near(ETT[7].k1 + ETT[7].k2, 8.11, 0.05);
});

test('closed-form Vdot matches a numerical root finder', () => {
  const s = quiet(new Sim('normal'));
  s.s.V = 0.2;
  for (const dP of [-8, -1, 0.5, 3, 12, 40]) {
    const f = s.flowFromDP(dP);
    const drop = (v) => s.k1 * v + s.k2 * v * Math.abs(v);
    let lo = -5, hi = 5;
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (drop(m) < dP) lo = m; else hi = m; }
    near(f, lo, 1e-6, `dP ${dP}`);
  }
});

test('linear limit: expiration is exponential with tau = R*C', () => {
  const s = quiet(new Sim('normal', { ettMult: 0, k2aw: 0, cd: 1e9 }, { peep: 0, mode: 'PSV', apnea: 1e9, rr: 1 }));
  const C = 1 / (1 / s.pt.cl + 1 / s.pt.ccw), R = s.k1, tau = R * C;
  s.s.V = 0.5; s.s.pv = 0; s.s.ph = 'exp'; s.s.tPh = 0; s.s.tBr = 0;
  s.run(tau);
  near(s.s.V, 0.5 * Math.exp(-1), 0.005, 'V(tau)');
});

test('PEEP raises lung volume (PEEP enters through Pao, not as an extra term)', () => {
  const s = new Sim('ards');
  assert.ok(s._eqV(10) > s._eqV(5) + 0.05);
});

test('series chest wall: Crs = 1/(1/CL + 1/Ccw)', () => {
  const s = new Sim('normal');
  near((0.01) / (s.pel(0.01) - s.pel(0)), 1 / (1 / 0.086 + 1 / 0.2), 0.001);
});

test('Henderson-Hasselbalch round trip and reference acid-base', () => {
  near(hco3HH(phHH(24, 40), 40), 24, 1e-9);
  near(phHH(24, 40), 7.39, 0.02);
});

test('alveolar gas equation and shunt equation', () => {
  near(alveolarPO2(0.21, 40), 99.7, 0.5);
  const base = { fio2: 0.21, paco2: 40, ph: 7.4, hb: 14, avdo2: 5 };
  near(paO2FromShunt({ ...base, shunt: 0 }), alveolarPO2(0.21, 40), 0.5);
  assert.ok(paO2FromShunt({ ...base, shunt: 0.3 }) < paO2FromShunt({ ...base, shunt: 0.05 }));
  near(satO2(26.8), 0.5, 0.02); // P50
});

test('reference patient: normal ABG on reasonable settings', () => {
  const s = quiet(new Sim('normal', {}, { vt: 450, rr: 14, peep: 5, fio2: 0.4 })).settle();
  const a = s.abg();
  near(a.ph, 7.40, 0.03); near(a.paco2, 40, 3);
  assert.ok(a.pao2 > 120 && a.pao2 < 260, `PaO2 ${a.pao2}`);
  const air = quiet(new Sim('normal', {}, { fio2: 0.21 })).settle().abg();
  assert.ok(air.pao2 > 70 && air.pao2 < 110, `room air PaO2 ${air.pao2}`);
});

test('PaCO2 equilibrates slowly (minutes), not instantly', () => {
  const s = quiet(new Sim('normal', {}, { vt: 450, rr: 14 })).settle();
  const p0 = s.g.paco2; s.configure({ rr: 7 }); s.run(60);
  const p1 = s.g.paco2; s.run(1800);
  assert.ok(p1 - p0 < 5 && s.g.paco2 - p0 > 15, `p0 ${p0} p1 ${p1} p30 ${s.g.paco2}`);
});

test('plateau depends on hold duration (viscoelastic relaxation)', () => {
  const s = quiet(new Sim('normal', {}, { vt: 500, rr: 12, ti: 0.8, holdDur: 0.5 }));
  s.run(10); s.s.holdReq = true; s.run(8); const p05 = s.hold.pplat;
  s.configure({ holdDur: 3 }); s.s.holdReq = true; s.run(12); const p3 = s.hold.pplat;
  assert.ok(p05 > p3 + 0.2, `0.5s ${p05} vs 3s ${p3}`);
});

test('auto-PEEP emerges in COPD at a high rate, not at a low rate', () => {
  const hi = quiet(new Sim('copd', {}, { vt: 450, rr: 20, peep: 0, ti: 0.9 })); hi.run(200);
  const lo = quiet(new Sim('copd', {}, { vt: 450, rr: 10, peep: 0, ti: 0.9 })); lo.run(200);
  assert.ok(hi.metrics().peepi > lo.metrics().peepi + 4, `${hi.metrics().peepi} vs ${lo.metrics().peepi}`);
});

test('COPD cohort calibration: qmax 0.10 reproduces Annals ICM 2021 means', () => {
  const s = quiet(new Sim('copd', { qmax: 0.10 }, { vt: 430, rr: 15, peep: 0, ti: 0.7 })); s.run(200);
  const m = s.metrics();
  near(m.pip, 35, 4); near(m.pplat, 18, 3); near(m.peepi, 9, 3);
});

test('waterfall: low extrinsic PEEP does not raise total PEEP when flow-limited', () => {
  const t = (peep) => { const s = quiet(new Sim('copd', { qmax: 0.10 }, { vt: 430, rr: 15, peep, ti: 0.7 })); s.run(200); return s.metrics().peepTot; };
  near(t(4), t(0), 1.5);
});

test('APV converges to target VT after a compliance step', () => {
  const s = quiet(new Sim('normal', {}, { mode: 'APV', vt: 450, rr: 14, ti: 1.0 })); s.run(120);
  s.patch({ cMult: 0.5 }); s.run(90);
  near(s.last.vte * 1000, 450, 45);
});

test('PBW', () => { near(pbw('F', 160), 52.4, 0.1); near(pbw('M', 175), 70.6, 0.1); });
