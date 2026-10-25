import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../js/engine/engine.js';
import { SCENARIOS, loadScenario } from '../js/scenarios.js';
import { nextRule, RULES, GENERAL } from '../js/boba-rules.js';

const ctxOf = (sim, extra = {}) => ({ m: sim.metrics(), set: sim.set, t: sim.t, tab: 'sim', abgCount: 0, hasHold: false, hasEhold: false, hasTriggered: sim.recent(5).some((b) => b.trig), scn: null, ...extra });
const sc = (id) => { const s = new Sim(); s.rec = false; loadScenario(SCENARIOS.find((x) => x.id === id), s); for (const e of SCENARIOS.find((x) => x.id === id).events || []) s.patch(e.patch); return s; };

test('a calm normal patient gets no proactive hint', () => {
  const s = new Sim('normal', {}, { vt: 450, rr: 14 }); s.rec = false; s.settle();
  assert.equal(nextRule(ctxOf(s, { t: 100 }), new Map(), Date.now()), null);
});
test('air trapping triggers the auto-PEEP hint', () => {
  const s = new Sim('copd', { qmax: 0.10 }, { vt: 450, rr: 20, peep: 0, ti: 0.9 }); s.rec = false; s.run(200);
  assert.equal(nextRule(ctxOf(s), new Map(), Date.now())?.id, 'autopeep');
});
test('refractory hypoxemia (case 4) triggers the oxygen hint', () => {
  assert.equal(nextRule(ctxOf(sc(4), { t: 100 }), new Map(), Date.now())?.id, 'hypoxemia');
});
test('oversized tidal volume (case 5) triggers a lung-protection hint', () => {
  assert.ok(['plateau', 'vt-high'].includes(nextRule(ctxOf(sc(5), { t: 100 }), new Map(), Date.now())?.id));
});
test('resistance gap (case 1) triggers the resistance hint', () => {
  assert.equal(nextRule(ctxOf(sc(1), { t: 100 }), new Map(), Date.now())?.id, 'resistance');
});
test('a rule is not repeated inside its cooldown', () => {
  const s = sc(4), now = 1e6, fired = new Map([['hypoxemia', now - 1000]]);
  const r = nextRule(ctxOf(s, { t: 100 }), fired, now);
  assert.notEqual(r?.id, 'hypoxemia');
});
test('stuck scenario offers a hint; goals met says finish', () => {
  const s = sc(1);
  assert.equal(nextRule(ctxOf(s, { scn: { hints: 0, done: false, goalsMet: false, hintCost: 5, secs: 200 } }), new Map([['resistance', Date.now()]]), Date.now())?.id, 'stuck');
  assert.equal(nextRule(ctxOf(s, { scn: { hints: 0, done: false, goalsMet: true, hintCost: 5, secs: 10 } }), new Map(), Date.now())?.id, 'goal');
});
test('every rule has text and a cooldown; general tips are non-empty', () => {
  assert.ok(RULES.every((r) => typeof r.text === 'function' && r.cool > 0) && GENERAL.length >= 8);
});
