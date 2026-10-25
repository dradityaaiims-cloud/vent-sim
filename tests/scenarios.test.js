import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../js/engine/engine.js';
import { SCENARIOS, evalGoals, loadScenario } from '../js/scenarios.js';

const prep = (sc) => {
  const sim = new Sim(); sim.rec = false; loadScenario(sc, sim);
  for (const e of sc.events || []) sim.patch(e.patch);
  if (sc.events) sim.settle();
  return sim;
};

for (const sc of SCENARIOS) {
  test(`scenario ${sc.id} "${sc.title}": untouched start fails, correct fix passes`, () => {
    const sim = prep(sc);
    assert.ok(!evalGoals(sc.goals, sim).every(g => g.ok), 'start state must not already satisfy the goals');
    if (sc.solution.set) sim.configure(sc.solution.set);
    for (const id of sc.solution.actions || []) sim.patch(sc.actions.find(a => a.id === id).patch);
    sim.settle();
    const r = evalGoals(sc.goals, sim);
    assert.ok(r.every(g => g.ok), JSON.stringify(r));
  });
  test(`scenario ${sc.id} content: 2+ questions, one correct option each, 3 hints`, () => {
    assert.ok(sc.questions.length >= 2 && sc.hints.length === 3);
    for (const q of sc.questions) { assert.equal(q.options.filter(o => o.ok).length, 1); assert.ok(q.options.every(o => o.why)); }
  });
}

test('wrong fixes do not pass: case 2 (volume change only) and case 5 (VT only, no rate)', () => {
  const s2 = prep(SCENARIOS[1]); s2.configure({ vt: 300 }); s2.settle();
  assert.ok(!evalGoals(SCENARIOS[1].goals, s2).every(g => g.ok));
  const s5 = prep(SCENARIOS[4]); s5.configure({ vt: 340 }); s5.settle();
  assert.ok(!evalGoals(SCENARIOS[4].goals, s5).every(g => g.ok));
});
