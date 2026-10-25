import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../js/engine/engine.js';
import { ASYN } from '../js/asyn.js';

const run = (a, sec = 120) => { const s = new Sim(a.key, a.mods, a.set); s.rec = false; s.run(sec); return s; };
const ex = (id) => ASYN.find((a) => a.id === id);

test('reverse triggering: effort follows the machine breath, volume exceeds set in pressure control', () => {
  const s = run(ex('rev-pc'));
  assert.ok(s.metrics().vte > 600, `vte ${s.metrics().vte}`);          // 12 cmH2O alone would give about 450 mL
  assert.ok(s.breaths.slice(-8).every((b) => !b.trig));                 // all breaths are machine-started
});

test('auto-triggering: cardiac oscillation at sensitive trigger raises total rate above the set rate with no effort', () => {
  const s = run(ex('auto'));
  assert.ok(s.rrTotal() > 20, `rr ${s.rrTotal()}`);
  assert.ok(s.breaths.slice(-8).every((b) => b.trig));
  const insens = new Sim('normal', ex('auto').mods, { ...ex('auto').set, trig: 5 }); insens.rec = false; insens.run(120);
  near(insens.rrTotal(), 10, 1);
});

test('ineffective efforts: auto-PEEP defeats weak efforts, extrinsic PEEP plus bronchodilator restores triggering', () => {
  const a = ex('ineff'), s = run(a);
  assert.ok(s.metrics().ineffPct >= 50, `ineff ${s.metrics().ineffPct}`);
  const f = new Sim(a.key, { ...a.mods, qmax: 0.16 }, { ...a.set, peep: 5 }); // PEEP plus bronchodilator, as in case 7
   f.rec = false; f.run(120);
  assert.ok(f.metrics().ineffPct <= 30, `with PEEP ${f.metrics().ineffPct}`);
});

test('early cycling: inspiration shorter than the effort; late cycling: longer', () => {
  const e = run(ex('early')), l = run(ex('late'));
  const ti = (s) => s.breaths.slice(-6).reduce((a, b) => a + b.tI, 0) / 6;
  assert.ok(ti(e) < e._tn() * 0.6, `early ti ${ti(e)} vs ${e._tn()}`);
  assert.ok(ti(l) > l._tn() * 1.3, `late ti ${ti(l)} vs ${l._tn()}`);
});

test('breath stacking: next breath starts while flow is still outward (auto-PEEP)', () => {
  const s = run(ex('stack'));
  assert.ok(s.metrics().peepi > 8);
});

test('P0.1 reflects effort rise: steeper rise gives larger P0.1', () => {
  const mk = (rise) => { const s = new Sim('normal', { drive: { rate: 16, pmax: 8, rise, hold: 0, decay: 0.4 } }, { mode: 'PSV', ps: 8 }); s.rec = false; s.run(80); return s.metrics().p01; };
  assert.ok(mk(0.2) > mk(0.6) + 1, `${mk(0.2)} vs ${mk(0.6)}`);
});

test('asthma preset: severe obstruction, auto-PEEP and acidemia at modest settings', () => {
  const s = new Sim('asthma', {}, { vt: 400, rr: 12, ti: 0.8, peep: 0, fio2: 0.4 }); s.rec = false; s.settle();
  const m = s.metrics();
  assert.ok(m.gap > 10 && m.peepi > 3 && m.ph < 7.30, JSON.stringify({ gap: m.gap, peepi: m.peepi, ph: m.ph }));
});

function near(a, b, tol) { assert.ok(Math.abs(a - b) <= tol, `got ${a}, want ${b}`); }
